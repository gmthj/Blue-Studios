import { describe, it, expect } from 'vitest'
import { getPeaks, makeWaveform } from '../src/waveform.js'

// Unit tests (Week 10a): the waveform functions used by the Music page

describe('TestSuite: getPeaks', () => {
  // a fake song whose 960 peaks are 0, 1, 2, ... 959
  const peaks = []
  for (let i = 0; i < 960; i++) {
    peaks.push(i)
  }
  const song = { waveform: JSON.stringify({ peaks: peaks }) }

  it('Test1: gives back an empty list when there is no song', () => {
    expect(getPeaks(null, 60)).toEqual([])
  })

  it('Test2: gives back exactly the number of bars asked for', () => {
    expect(getPeaks(song, 60)).toHaveLength(60)
  })

  it('Test3: picks evenly spaced peaks (every 16th for 60 bars)', () => {
    const result = getPeaks(song, 60)
    expect(result[0]).toBe(0)
    expect(result[1]).toBe(16)
  })
})

describe('TestSuite: makeWaveform (uploaded songs)', () => {
  // a fake decoded song: only getChannelData is needed
  function fakeSong(samples) {
    return { getChannelData: () => samples }
  }

  it('Test1: makes 960 peaks, in the same format as Jamendo', () => {
    const samples = new Array(1920).fill(0.2)
    const result = JSON.parse(makeWaveform(fakeSong(samples)))
    expect(result.peaks).toHaveLength(960)
  })

  it('Test2: the loudest moment becomes 100 (a negative value counts as loud too)', () => {
    const samples = new Array(1920).fill(0.2)
    samples[500] = -0.8
    const result = JSON.parse(makeWaveform(fakeSong(samples)))
    expect(result.peaks).toContain(100)
  })

  it('Test3: a silent song gives all zeros (no dividing by zero)', () => {
    const samples = new Array(1920).fill(0)
    const result = JSON.parse(makeWaveform(fakeSong(samples)))
    expect(result.peaks).not.toContain(100)
    expect(result.peaks[0]).toBe(0)
  })
})
