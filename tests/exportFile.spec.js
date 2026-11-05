import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildExportFile } from '../src/exportFile.js'
import { createOverallProgress } from '../src/exportProgress.js'

// Integration tests: making a PNG or an MP4 reports to ONE progress bar (exportFile.js + exportProgress.js)
// Recording, FFmpeg and the canvas need a real browser, so they are pretended. The real file maker and the real
// progress bar run, and the tests check what the bar does while the stages go by.

// vi.mock is moved to the top of the file, so what it needs is made with vi.hoisted
const mocks = vi.hoisted(() => ({
  createScene: vi.fn(),
  recordScene: vi.fn(),
  toMp4: vi.fn(),
  getDownloadURL: vi.fn(),
}))

vi.mock('../src/stripRender.js', () => ({ createScene: mocks.createScene, recordScene: mocks.recordScene }))
vi.mock('../src/ffmpeg.js', () => ({ toMp4: mocks.toMp4 }))
vi.mock('firebase/storage', async (importOriginal) => ({
  ...(await importOriginal()),
  ref: (storage, path) => ({ path: path }),
  getDownloadURL: mocks.getDownloadURL,
}))

const strip = {}
const noCancel = () => false

// a progress bar that remembers every value it showed
function makeBar(format, hasMusic) {
  const seen = []
  const bar = createOverallProgress(format, hasMusic, (value) => seen.push(value), { creepEveryMs: 10 })
  return { bar, seen }
}
const goesUp = (seen) => seen.every((value, i) => i === 0 || value > seen[i - 1])
const reached = (seen, target) => seen.some((value) => Math.abs(value - target) < 1e-9)

beforeEach(() => {
  for (const name of Object.keys(mocks)) mocks[name].mockReset()
  mocks.createScene.mockResolvedValue({ aspect: 0.3, draw: vi.fn(), tick: vi.fn(), stop: vi.fn() })
  // recording for 15 seconds, saying how far it is on the way
  mocks.recordScene.mockImplementation(async (scene, options) => {
    options.onProgress(0.5)
    options.onProgress(1)
    return new Blob(['recording'], { type: 'video/webm' })
  })
  // FFmpeg converting: its own count goes from 0 to 1 again
  mocks.toMp4.mockImplementation(async (recording, fps, onProgress) => {
    onProgress(0)
    onProgress(0.5)
    onProgress(1)
    return new Blob(['mp4'], { type: 'video/mp4' })
  })
  mocks.getDownloadURL.mockResolvedValue('https://example.com/mix.wav')
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['wav']) })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({})
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(new Blob(['png'], { type: 'image/png' })))
})

describe('Integration test: an MP4 and its one bar', () => {
  it('Test1: recording and converting fill ONE bar: it goes up the whole way and never starts over', async () => {
    const { bar, seen } = makeBar('mp4', false)
    // FFmpeg is half way: the bar must be half way through ITS share of the bar, not half way through the whole bar
    let halfWayConverting = null
    mocks.toMp4.mockImplementation(async (recording, fps, onProgress) => {
      onProgress(0)
      onProgress(0.5)
      halfWayConverting = bar.value
      onProgress(1)
      return new Blob(['mp4'], { type: 'video/mp4' })
    })
    const statuses = []
    const file = await buildExportFile({ format: 'mp4', strip, onStatus: (text) => statuses.push(text), progress: bar, isCancelled: noCancel })
    bar.stop()

    expect(file).toMatchObject({ ext: 'mp4', mime: 'video/mp4' })
    expect(goesUp(seen)).toBe(true) // every value is higher than the one before: the bar never went back to 0
    expect(reached(seen, bar.windows.record[1])).toBe(true) // the end of recording...
    expect(bar.value).toBeCloseTo(bar.windows.convert[1], 10) // ...and then the end of converting
    expect(bar.value).toBeLessThan(1) // saving the link is still to come
    const [from, to] = bar.windows.convert
    expect(halfWayConverting).toBeCloseTo(from + (to - from) / 2, 5)
  })

  it('Test1b: a recording that ends without saying 100% still counts as finished', async () => {
    mocks.recordScene.mockImplementation(async (scene, options) => {
      options.onProgress(0.5) // it never says 1
      return new Blob(['recording'], { type: 'video/webm' })
    })
    const { bar, seen } = makeBar('mp4', false)
    let beforeConverting = null
    mocks.toMp4.mockImplementation(async (recording, fps, onProgress) => {
      beforeConverting = bar.value
      return new Blob(['mp4'], { type: 'video/mp4' })
    })
    await buildExportFile({ format: 'mp4', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })
    bar.stop()
    expect(beforeConverting).toBeGreaterThanOrEqual(bar.windows.record[1])
    expect(reached(seen, bar.windows.record[1])).toBe(true)
  })

  it('Test2: says what is happening, stage by stage, in order', async () => {
    const { bar } = makeBar('mp4', false)
    const statuses = []
    await buildExportFile({ format: 'mp4', strip, onStatus: (text) => statuses.push(text), progress: bar, isCancelled: noCancel })
    bar.stop()
    expect(statuses).toEqual([
      'Getting your strip ready...',
      'Recording the video... keep this page open',
      'Loading the converter... (the first time takes a while)',
      'Making the MP4...',
    ])
  })

  it('Test3: with music, the music is fetched, put under the video, and has its own share of the bar', async () => {
    const { bar, seen } = makeBar('mp4', true)
    const statuses = []
    await buildExportFile({ format: 'mp4', strip, audioPath: 'music/1234/mix.wav', onStatus: (text) => statuses.push(text), progress: bar, isCancelled: noCancel })
    bar.stop()
    expect(statuses).toContain('Getting your music...')
    expect(fetch).toHaveBeenCalledWith('https://example.com/mix.wav')
    expect(mocks.toMp4.mock.calls[0][3]).toBeInstanceOf(Blob) // the music went to FFmpeg
    expect(reached(seen, bar.windows.music[1])).toBe(true)
    expect(goesUp(seen)).toBe(true)
  })

  it('Test4: without music, FFmpeg gets no music and nothing is fetched', async () => {
    const { bar } = makeBar('mp4', false)
    await buildExportFile({ format: 'mp4', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })
    bar.stop()
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.toMp4.mock.calls[0][3]).toBeNull()
  })

  it('Test5: while the converter is loading (no numbers yet) the bar keeps creeping forward, not frozen', async () => {
    const { bar, seen } = makeBar('mp4', false)
    // converting takes a while before it says anything
    mocks.toMp4.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
      return new Blob(['mp4'], { type: 'video/mp4' })
    })
    await buildExportFile({ format: 'mp4', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })
    bar.stop()
    const duringConverting = seen.filter((value) => value > bar.windows.record[1] && value < bar.windows.convert[1])
    expect(duringConverting.length).toBeGreaterThan(1) // it moved while waiting
    expect(goesUp(seen)).toBe(true)
  })

  it('Test6: a cancelled recording gives nothing back and never starts converting', async () => {
    mocks.recordScene.mockResolvedValue(null)
    const { bar } = makeBar('mp4', false)
    const file = await buildExportFile({ format: 'mp4', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })
    bar.stop()
    expect(file).toBeNull()
    expect(mocks.toMp4).not.toHaveBeenCalled()
  })

  it('Test7: a browser that already records an MP4 (Safari) with no music needs no converting', async () => {
    const mp4Recording = new Blob(['safari'], { type: 'video/mp4' })
    mocks.recordScene.mockResolvedValue(mp4Recording)
    const { bar } = makeBar('mp4', false)
    const file = await buildExportFile({ format: 'mp4', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })
    bar.stop()
    expect(file.blob).toBe(mp4Recording)
    expect(mocks.toMp4).not.toHaveBeenCalled()
  })
})

describe('Integration test: a PNG on the same bar, and the formats that are refused', () => {
  it('Test1: a PNG is made at once, and the bar stops at the end of getting ready', async () => {
    const { bar } = makeBar('png', false)
    const file = await buildExportFile({ format: 'png', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })
    bar.stop()
    expect(file).toMatchObject({ ext: 'png', mime: 'image/png' })
    expect(bar.value).toBeCloseTo(bar.windows.ready[1], 10)
  })

  it('Test2: a GIF is not made any more, it is refused like any other unknown format', async () => {
    const { bar } = makeBar('mp4', false)
    await expect(buildExportFile({ format: 'gif', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })).rejects.toThrow('Unknown format')
    bar.stop()
  })

  it('Test2b: an unknown format is refused', async () => {
    const { bar } = makeBar('png', false)
    await expect(buildExportFile({ format: 'avi', strip, onStatus: () => {}, progress: bar, isCancelled: noCancel })).rejects.toThrow('Unknown format')
    bar.stop()
  })

  it('Test3: can make a file without any bar at all', async () => {
    const file = await buildExportFile({ format: 'png', strip, onStatus: () => {}, isCancelled: noCancel })
    expect(file.ext).toBe('png')
  })
})
