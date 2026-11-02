import { ref } from 'vue'

// Little sound effects for the app (countdown beeps, the camera shutter, pops, chimes...).
// They are made by the browser's Web Audio API, so there are no sound files to download.
//
// Usage:
//   import { playSound } from '../sounds.js'
//   playSound('shutter')
//
// Sounds: 'tick' (3, 2, 1), 'shutter' (photo taken), 'recStart' / 'recStop' (video clip),
//         'pop' (something placed), 'remove' (something taken off), 'stageForward' / 'stageBack'
//         (the room moved to a later / earlier step), 'join' / 'leave' (someone joined / left
//         the room), 'success' (the strip is ready / something saved), 'copy' (copied a link),
//         'open' (a popup opened), 'warn' (an "are you sure?" popup), 'lift' (started dragging),
//         'page' (went to another page), 'filterTick' / 'filter' (the filter wheel turning / a filter chosen)
//
// Plus, for EVERYTHING else (startUiSounds, called once in main.js):
//   every button, link, tab or menu item: a soft 'click'
//   every checkbox, radio button or switch: a 'toggle'
//   every slider: little 'slide' ticks that go up in pitch as the slider goes up
// A button can choose its own sound with data-sound, e.g. <button data-sound="pop">,
// or have none with data-sound="none". Anything else that can be tapped (a photo tile...)
// gets a sound by adding data-sound too, e.g. <img data-sound="click" @click="...">.
//
// Everyone can turn the sounds off with the speaker button in the stage bar (soundOn).
// The choice is remembered on this device (localStorage).

const STORAGE_KEY = 'blueStudiosSoundOn'
const MASTER_VOLUME = 0.35 // 0 = silent, 1 = full volume. Keep it gentle.

function loadSoundOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false' // on unless turned off before
  } catch (error) {
    return true
  }
}

export const soundOn = ref(loadSoundOn())

export function toggleSound() {
  soundOn.value = !soundOn.value
  try {
    localStorage.setItem(STORAGE_KEY, String(soundOn.value))
  } catch (error) {
    // private window or storage blocked: the choice just is not remembered
  }
  if (soundOn.value) playSound('pop') // so you hear that it is back on
}

// One AudioContext for the whole app, made the first time a sound plays
let audio = null

function getAudio() {
  if (audio) return audio
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null // very old browser, or tests (jsdom): no sounds
  audio = new AudioCtx()
  return audio
}

// Browsers only allow sound after the user has clicked or tapped the page once.
// On the first tap, wake the audio up, so a countdown started by SOMEONE ELSE can still beep here.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getAudio()
    if (ctx && ctx.state === 'suspended') ctx.resume()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

// One note: a wave at `freq` Hz that starts `at` seconds from now and fades out over `length` seconds.
// toFreq: slide to this pitch by the end (for "whoop" sounds)
function tone(ctx, { freq, at = 0, length = 0.15, type = 'sine', volume = 1, toFreq = null }) {
  const start = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, start + length)
  // A very short fade in (no click), then fade out
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume * MASTER_VOLUME, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.05)
}

// A short burst of noise, like the "click" of a camera shutter.
// pitch: only the noise around this pitch is kept (lower = less hissy, more "clunk")
function noise(ctx, { at = 0, length = 0.08, volume = 1, pitch = 1000 }) {
  const start = ctx.currentTime + at
  const samples = Math.floor(ctx.sampleRate * length)
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < samples; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, 4) // random, dying away fast
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = pitch
  filter.Q.value = 1.5
  const gain = ctx.createGain()
  gain.gain.value = volume * MASTER_VOLUME
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(start)
}

// How each sound is made
const SOUNDS = {
  // The soft tap for every button (quiet and short, because it plays a lot)
  click: (ctx) => tone(ctx, { freq: 1800, toFreq: 1200, length: 0.035, type: 'triangle', volume: 0.25 }),
  toggle: (ctx) => {
    tone(ctx, { freq: 900, length: 0.04, type: 'triangle', volume: 0.3 })
    tone(ctx, { freq: 1350, at: 0.04, length: 0.05, type: 'triangle', volume: 0.3 })
  },
  // A tiny tick for sliders. amount: 0 (slider at the left) to 1 (at the right) sets the pitch
  slide: (ctx, amount = 0.5) => tone(ctx, { freq: 500 + amount * 900, length: 0.03, type: 'triangle', volume: 0.18 }),
  copy: (ctx) => {
    tone(ctx, { freq: 1200, length: 0.06, type: 'triangle', volume: 0.4 })
    tone(ctx, { freq: 1600, at: 0.06, length: 0.1, type: 'triangle', volume: 0.4 })
  },
  open: (ctx) => tone(ctx, { freq: 500, toFreq: 1000, length: 0.12, type: 'sine', volume: 0.35 }),
  warn: (ctx) => {
    tone(ctx, { freq: 440, length: 0.1, type: 'square', volume: 0.12 })
    tone(ctx, { freq: 349, at: 0.12, length: 0.16, type: 'square', volume: 0.12 })
  },
  // Filters: a sharp "tk" as each one passes the middle of the wheel (like a ratchet)...
  filterTick: (ctx) => {
    noise(ctx, { length: 0.012, volume: 1.4, pitch: 3200 })
    tone(ctx, { freq: 2600, length: 0.015, type: 'square', volume: 0.08 })
  },
  // ...and a crisp "click-clack" when a filter is chosen
  filter: (ctx) => {
    noise(ctx, { length: 0.015, volume: 1.6, pitch: 3400 })
    tone(ctx, { freq: 1900, length: 0.02, type: 'square', volume: 0.1 })
    noise(ctx, { at: 0.04, length: 0.02, volume: 1.4, pitch: 2200 })
    tone(ctx, { freq: 1300, at: 0.04, length: 0.025, type: 'square', volume: 0.1 })
  },
  lift: (ctx) => tone(ctx, { freq: 300, toFreq: 600, length: 0.07, type: 'sine', volume: 0.35 }),
  page: (ctx) => tone(ctx, { freq: 400, toFreq: 1400, length: 0.14, type: 'sine', volume: 0.12 }),
  tick: (ctx) => tone(ctx, { freq: 880, length: 0.12, volume: 0.6 }),
  // A cartoon camera: a bouncy "ka-CHIK!" and a little sparkle, like a toy camera in a cartoon
  shutter: (ctx) => {
    noise(ctx, { length: 0.02, volume: 1.2, pitch: 2500 })                                  // tiny click
    tone(ctx, { freq: 1100, toFreq: 450, length: 0.07, type: 'square', volume: 0.22 })      // "ka-"
    tone(ctx, { freq: 700, toFreq: 1800, at: 0.07, length: 0.08, type: 'square', volume: 0.22 }) // "-CHIK" bouncing up
    noise(ctx, { at: 0.07, length: 0.03, volume: 1, pitch: 1800 })
    tone(ctx, { freq: 2093, at: 0.15, length: 0.18, type: 'sine', volume: 0.3 })            // sparkle (high C)
    tone(ctx, { freq: 3136, at: 0.2, length: 0.22, type: 'sine', volume: 0.2 })             // sparkle (high G)
  },
  recStart: (ctx) => {
    tone(ctx, { freq: 660, length: 0.12, volume: 0.6 })
    tone(ctx, { freq: 990, at: 0.12, length: 0.18, volume: 0.6 })
  },
  recStop: (ctx) => {
    tone(ctx, { freq: 990, length: 0.12, volume: 0.6 })
    tone(ctx, { freq: 660, at: 0.12, length: 0.18, volume: 0.6 })
  },
  pop: (ctx) => tone(ctx, { freq: 400, toFreq: 900, length: 0.09, volume: 0.5 }),
  remove: (ctx) => tone(ctx, { freq: 600, toFreq: 250, length: 0.12, volume: 0.4 }),
  // Moving on: three notes going up, with a little "whoosh" up
  stageForward: (ctx) => {
    tone(ctx, { freq: 300, toFreq: 1200, length: 0.25, volume: 0.15 })
    tone(ctx, { freq: 523, length: 0.12, type: 'triangle', volume: 0.6 })           // C
    tone(ctx, { freq: 659, at: 0.08, length: 0.12, type: 'triangle', volume: 0.6 }) // E
    tone(ctx, { freq: 784, at: 0.16, length: 0.22, type: 'triangle', volume: 0.6 }) // G
  },
  // Going back: the same notes going down, with a "whoosh" down
  stageBack: (ctx) => {
    tone(ctx, { freq: 1200, toFreq: 300, length: 0.25, volume: 0.15 })
    tone(ctx, { freq: 784, length: 0.12, type: 'triangle', volume: 0.6 })           // G
    tone(ctx, { freq: 659, at: 0.08, length: 0.12, type: 'triangle', volume: 0.6 }) // E
    tone(ctx, { freq: 523, at: 0.16, length: 0.22, type: 'triangle', volume: 0.6 }) // C
  },
  // Someone joined: a bright "ding-ding" going up
  join: (ctx) => {
    tone(ctx, { freq: 659, length: 0.12, type: 'sine', volume: 0.55 })          // E
    tone(ctx, { freq: 988, at: 0.1, length: 0.25, type: 'sine', volume: 0.55 }) // high B
  },
  // Someone left: a softer, lower "dong-dong" going down
  leave: (ctx) => {
    tone(ctx, { freq: 494, length: 0.14, type: 'sine', volume: 0.45 })          // B
    tone(ctx, { freq: 330, at: 0.12, length: 0.28, type: 'sine', volume: 0.45 }) // E
  },
  success: (ctx) => {
    tone(ctx, { freq: 523, length: 0.15, type: 'triangle', volume: 0.6 })           // C
    tone(ctx, { freq: 659, at: 0.1, length: 0.15, type: 'triangle', volume: 0.6 })  // E
    tone(ctx, { freq: 784, at: 0.2, length: 0.15, type: 'triangle', volume: 0.6 })  // G
    tone(ctx, { freq: 1047, at: 0.3, length: 0.35, type: 'triangle', volume: 0.6 }) // high C
  },
}

let lastSoundAt = 0 // when the last sound played (so a button's own sound can replace the click)

// extra: passed on to the sound (only 'slide' uses it)
export function playSound(name, extra) {
  if (!soundOn.value || !SOUNDS[name]) return
  lastSoundAt = performance.now()
  try {
    const ctx = getAudio()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume()
    SOUNDS[name](ctx, extra)
  } catch (error) {
    console.error(error) // a sound must never break the page
  }
}

// ---------- SOUNDS FOR EVERY BUTTON, SWITCH AND SLIDER ----------
// One listener on the whole page catches every click, so no page has to add anything.
const CLICKABLE = '[data-sound], button, a[href], [role="button"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], summary, label, select, .btn'

export function startUiSounds() {
  if (typeof document === 'undefined') return

  // "capture" (true): we hear the click BEFORE the button's own code runs
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const el = target.closest('input[type="checkbox"], input[type="radio"], ' + CLICKABLE)
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return

    // A label's click is passed on to its checkbox, which then clicks too: let the checkbox make the sound
    if (el.tagName === 'LABEL' && el.control) return

    const chosen = el.closest('[data-sound]')
    const name = chosen ? chosen.dataset.sound : el.matches('input, [role="switch"]') ? 'toggle' : 'click'
    if (name === 'none') return

    // Wait a moment: if the button's own code plays a sound (a pop, the shutter...), skip the click,
    // so the two sounds do not play on top of each other
    const clickedAt = performance.now()
    setTimeout(() => {
      if (lastSoundAt < clickedAt) playSound(name)
    }, 0)
  }, true)

  // Sliders: a tick each time the value changes (at most every 40ms, so dragging fast is not a buzz)
  let lastSlideAt = 0
  document.addEventListener('input', (event) => {
    const el = event.target
    if (!(el instanceof HTMLInputElement) || el.type !== 'range') return
    const now = performance.now()
    if (now - lastSlideAt < 40) return
    lastSlideAt = now
    const min = Number(el.min || 0)
    const max = Number(el.max || 100)
    const amount = max > min ? (Number(el.value) - min) / (max - min) : 0.5
    playSound('slide', amount)
  }, true)

  // Picking something up to drag it (photos, stickers, tray items)
  document.addEventListener('dragstart', () => playSound('lift'), true)
}
