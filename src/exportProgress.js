// One progress bar for the whole job of making a file (see ShareView.vue and exportFile.js).
// Making an MP4 has several stages that each know their own 0 to 100%: recording, then converting. If each one
// filled the bar, it would fill, jump back to the start and fill again. Instead every stage gets its own share of
// ONE bar, from 0 to 1, and the bar never goes backwards.

// The stages of each format and how much of the bar each one gets (only the proportions matter).
//   ready    getting the photos, videos and stickers
//   record   the strip playing in real time (always 15 seconds)
//   music    getting the mix (MP4 with music only)
//   convert  FFmpeg turning the recording into an MP4
//   save     uploading the file and making the link
const WEIGHTS = {
  png: [['ready', 70], ['save', 30]],
  mp4: [['ready', 5], ['record', 45], ['music', 5], ['convert', 35], ['save', 10]],
}

// Where each stage starts and ends on the bar: { record: [0.05, 0.5], ... }
export function phaseWindows(format, hasMusic) {
  let list = WEIGHTS[format] || WEIGHTS.mp4
  if (!hasMusic) list = list.filter(([name]) => name !== 'music') // no music, no stage for it
  const total = list.reduce((sum, [, weight]) => sum + weight, 0)
  const windows = {}
  let from = 0
  list.forEach(([name, weight], i) => {
    const to = i === list.length - 1 ? 1 : from + weight / total // the last one ends exactly at 1
    windows[name] = [from, to]
    from = to
  })
  return windows
}

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0))

// onChange(value) gets the overall progress (0 to 1) every time it goes up.
// Gives back an object with:
//   report(stage, p)  a stage says how far it is (p from 0 to 1): the bar moves to that place inside the stage's share
//   creep(stage)      a stage that cannot say how far it is (e.g. downloading the converter): the bar moves to the start
//                     of its share and then slowly closer to the end of it, but never reaches the end by itself
//   finish()          the job is done: 100%
//   stop()            stop the slow creeping (call this when the job ends or fails)
export function createOverallProgress(format, hasMusic, onChange, { creepEveryMs = 300 } = {}) {
  const windows = phaseWindows(format, hasMusic)
  let value = 0
  let timer = null

  // The bar only goes up
  function set(next) {
    const higher = Math.min(1, Math.max(value, next))
    if (higher !== value) {
      value = higher
      onChange(value)
    }
  }

  function stopCreeping() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    windows: windows,
    get value() {
      return value
    },
    report(stage, p) {
      const window = windows[stage]
      if (!window) return // this format has no such stage (e.g. no music)
      stopCreeping()
      set(window[0] + (window[1] - window[0]) * clamp(p))
    },
    creep(stage) {
      const window = windows[stage]
      if (!window) return
      stopCreeping()
      set(window[0]) // a skipped stage before this one does not leave the bar behind
      const limit = window[1] - (window[1] - window[0]) * 0.05 // stays a little short of the end
      timer = setInterval(() => set(value + (limit - value) * 0.05), creepEveryMs)
    },
    finish() {
      stopCreeping()
      set(1)
    },
    stop: stopCreeping,
  }
}

// For anything that makes a file without a bar to show
export const NO_PROGRESS = { report() {}, creep() {}, finish() {}, stop() {} }
