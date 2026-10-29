// Jamendo gives each track a "waveform": a TEXT string like '{"peaks":[0,12,95,...]}'
// with 960 numbers from 0 (silent) to 100 (loudest).
// This picks `count` evenly spaced numbers so we draw a reasonable number of bars.
export function getPeaks(track, count) {
  if (!track || !track.waveform) {
    return []
  }

  const allPeaks = JSON.parse(track.waveform).peaks   // text → object → array
  const step = Math.floor(allPeaks.length / count)    // e.g. 960 / 60 = every 16th number

  const result = []
  for (let i = 0; i < count; i++) {
    result.push(allPeaks[i * step])
  }
  return result
}

// Works out a waveform for an uploaded song, in the SAME format as Jamendo's:
// text like '{"peaks":[0,12,95,...]}' with 960 numbers from 0 (silent) to 100 (loudest).
// audioBuffer = the unpacked sound (a long list of numbers between -1 and 1)
export function makeWaveform(audioBuffer) {
  const samples = audioBuffer.getChannelData(0)   // channel 0 = the left speaker is enough for a picture
  const count = 960
  const step = Math.floor(samples.length / count) // how many sound numbers go into one bar

  const peaks = []
  let loudest = 0
  for (let i = 0; i < count; i++) {
    // The loudest moment inside this chunk (Math.abs: -0.8 is as loud as 0.8)
    let max = 0
    for (let j = i * step; j < (i + 1) * step; j++) {
      const value = Math.abs(samples[j])
      if (value > max) {
        max = value
      }
    }
    peaks.push(max)
    if (max > loudest) {
      loudest = max
    }
  }

  // Scale so the loudest moment is 100, like Jamendo's waveforms
  for (let i = 0; i < count; i++) {
    if (loudest > 0) {
      peaks[i] = Math.round((peaks[i] / loudest) * 100)
    } else {
      peaks[i] = 0
    }
  }

  return JSON.stringify({ peaks: peaks })   // object → text, the opposite of JSON.parse in getPeaks
}