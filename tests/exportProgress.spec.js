import { describe, it, expect, vi, afterEach } from 'vitest'
import { phaseWindows, createOverallProgress, NO_PROGRESS } from '../src/exportProgress.js'

// Unit tests: the one progress bar for making a file (PNG or MP4)

afterEach(() => vi.useRealTimers())

describe('TestSuite: phaseWindows', () => {
  it('Test1: every format fills the whole bar, from 0 to 1, one stage after another with no gaps', () => {
    for (const [format, hasMusic] of [['png', false], ['mp4', false], ['mp4', true]]) {
      const windows = Object.values(phaseWindows(format, hasMusic))
      expect(windows[0][0]).toBe(0)
      expect(windows[windows.length - 1][1]).toBe(1)
      for (let i = 1; i < windows.length; i++) {
        expect(windows[i][0]).toBeCloseTo(windows[i - 1][1], 10) // each stage starts where the one before ended
        expect(windows[i][1]).toBeGreaterThan(windows[i][0]) // and has some room
      }
    }
  })

  it('Test2: an MP4 has recording and converting as two stages of the same bar', () => {
    const windows = phaseWindows('mp4', false)
    expect(Object.keys(windows)).toEqual(['ready', 'record', 'convert', 'save'])
    expect(windows.convert[0]).toBeGreaterThanOrEqual(windows.record[1]) // converting starts after recording ends
  })

  it('Test3: only an MP4 with music has a stage for getting the music', () => {
    expect(Object.keys(phaseWindows('mp4', true))).toContain('music')
    expect(Object.keys(phaseWindows('mp4', false))).not.toContain('music')
    expect(Object.keys(phaseWindows('png', true))).not.toContain('music')
  })

  it('Test4: a PNG has only the stages of getting ready and saving, no recording or converting', () => {
    expect(Object.keys(phaseWindows('png', false))).toEqual(['ready', 'save'])
  })

  it('Test5: recording gets the biggest share of an MP4, because it takes the longest', () => {
    const windows = phaseWindows('mp4', true)
    const width = (name) => windows[name][1] - windows[name][0]
    for (const other of ['ready', 'music', 'convert', 'save']) expect(width('record')).toBeGreaterThan(width(other))
  })
})

describe('TestSuite: createOverallProgress', () => {
  // keeps every value the bar was told about, in order
  function makeBar(format, hasMusic) {
    const seen = []
    const bar = createOverallProgress(format, hasMusic, (value) => seen.push(value), { creepEveryMs: 100 })
    return { bar, seen }
  }

  it('Test1: a stage that is half done moves the bar to the middle of its own share', () => {
    const { bar, seen } = makeBar('mp4', false)
    const [from, to] = bar.windows.record
    bar.report('record', 0.5)
    expect(seen.at(-1)).toBeCloseTo(from + (to - from) / 2, 10)
  })

  it('Test2: the bar never goes backwards, even when a stage reports a lower number than the bar has reached', () => {
    vi.useFakeTimers()
    const { bar, seen } = makeBar('mp4', false)
    bar.creep('convert') // the converter is loading: no numbers yet, so the bar creeps on
    vi.advanceTimersByTime(3000)
    const creptTo = bar.value
    expect(creptTo).toBeGreaterThan(bar.windows.convert[0])
    bar.report('convert', 0) // then FFmpeg starts counting from 0 of ITS OWN progress
    expect(bar.value).toBe(creptTo) // the bar stays where it was
    expect(seen).toEqual([...seen].sort((a, b) => a - b)) // every value was higher than the one before
    bar.stop()
  })

  it('Test2b: a stage that reports late does not pull the bar back from a later stage', () => {
    const { bar } = makeBar('mp4', false)
    bar.report('convert', 0.5)
    const valueNow = bar.value
    bar.report('record', 1) // a slow, late message from an earlier stage
    expect(bar.value).toBe(valueNow)
  })

  it('Test3: a whole MP4 with music goes up in order and ends at exactly 100%', () => {
    const { bar, seen } = makeBar('mp4', true)
    bar.report('ready', 1)
    for (let p = 0; p <= 1; p += 0.1) bar.report('record', p)
    bar.report('record', 1)
    bar.report('music', 1)
    bar.report('convert', 0) // each stage restarts its own count, the bar does not
    for (let p = 0; p <= 1; p += 0.1) bar.report('convert', p)
    bar.report('convert', 1)
    bar.report('save', 1)
    bar.finish()
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(seen.at(-1)).toBe(1)
    expect(new Set(seen).size).toBe(seen.length) // and it only tells about a change, not the same value again
  })

  it('Test4: a stage that does not exist for this format is ignored', () => {
    const { bar, seen } = makeBar('png', false)
    bar.report('record', 0.5)
    bar.report('convert', 0.5)
    bar.creep('music')
    expect(seen).toEqual([])
  })

  it('Test5: an out of range number is kept inside its stage', () => {
    const { bar } = makeBar('mp4', false)
    bar.report('record', 7)
    expect(bar.value).toBeCloseTo(bar.windows.record[1], 10)
    bar.report('ready', -3) // below the start of its stage: the bar does not go down
    expect(bar.value).toBeCloseTo(bar.windows.record[1], 10)
  })

  it('Test6: finish() fills the bar completely', () => {
    const { bar } = makeBar('mp4', false)
    bar.report('record', 0.3)
    bar.finish()
    expect(bar.value).toBe(1)
  })

  it('Test7: a stage that cannot say how far it is moves the bar slowly, and never reaches the end of its share', () => {
    vi.useFakeTimers()
    const { bar } = makeBar('mp4', false)
    const [from, to] = bar.windows.convert
    bar.creep('convert')
    expect(bar.value).toBeCloseTo(from, 10) // jumps to the start of the stage
    vi.advanceTimersByTime(2000)
    const afterTwoSeconds = bar.value
    expect(afterTwoSeconds).toBeGreaterThan(from)
    vi.advanceTimersByTime(600000) // ten minutes
    expect(bar.value).toBeLessThanOrEqual(to - (to - from) * 0.05 + 1e-9) // it stops 5% short of the end of its share
    expect(bar.value).toBeLessThan(to) // only the stage finishing can fill the rest
    expect(bar.value).toBeGreaterThan(afterTwoSeconds)
    bar.stop()
  })

  it('Test8: real progress takes over from the slow creeping', () => {
    vi.useFakeTimers()
    const { bar, seen } = makeBar('mp4', false)
    bar.creep('convert')
    vi.advanceTimersByTime(500)
    bar.report('convert', 0.5)
    const valueNow = bar.value
    vi.advanceTimersByTime(5000)
    expect(bar.value).toBe(valueNow) // no more creeping
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
  })

  it('Test9: stop() ends the creeping (so nothing keeps running after the job)', () => {
    vi.useFakeTimers()
    const { bar } = makeBar('mp4', false)
    bar.creep('save')
    bar.stop()
    const valueNow = bar.value
    vi.advanceTimersByTime(5000)
    expect(bar.value).toBe(valueNow)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('Test10: entering a stage later jumps over the stages that were skipped (e.g. a Safari MP4 needs no converting)', () => {
    vi.useFakeTimers()
    const { bar } = makeBar('mp4', false)
    bar.report('record', 1)
    bar.creep('save') // straight to saving
    expect(bar.value).toBeCloseTo(bar.windows.save[0], 10)
    bar.stop()
  })

  it('Test11: NO_PROGRESS accepts every call and does nothing, for a file made without a bar', () => {
    expect(() => {
      NO_PROGRESS.report('record', 0.5)
      NO_PROGRESS.creep('convert')
      NO_PROGRESS.finish()
      NO_PROGRESS.stop()
    }).not.toThrow()
  })
})
