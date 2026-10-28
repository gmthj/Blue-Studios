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