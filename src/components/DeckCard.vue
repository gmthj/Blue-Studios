<script setup>
import { computed } from 'vue'
import { getPeaks } from '../waveform.js'
import WaveformBars from './WaveformBars.vue'
import { MAX_EDIT_SECONDS } from '../clips.js'   // the part of the song that gets used (15 s)

// Data passed IN from MusicView
const props = defineProps({
  label: String,      // 'Deck A' or 'Deck B'
  color: String,      // '#14a39a' (teal) or '#7c3aed' (purple)
  track: Object,      // the Jamendo song, or null if no song is loaded
  speed: Number,      // 0.5 to 1.5
  volume: Number,     // 0 to 100
  playing: Boolean,   // NEW: is this deck playing right now?
  loading: Boolean,   // NEW: is the song still downloading?
  start: Number,      // NEW: where the chosen part of the song starts, in seconds
  simple: Boolean,    // NEW: simple mode = one song, no speed or Cue
})

// Messages sent OUT to MusicView (a component must not change its own props)
const emit = defineEmits([
  'change-speed', 'change-volume', 'change-start',
  'save-speed', 'save-volume', 'save-start',
  'toggle-play', 'cue',
])

// event.target is the slider that moved (Week 3 DOM). Its value is text, so turn it into a number.
function onSpeedInput(event) {
  emit('change-speed', Number(event.target.value))
}

function onVolumeInput(event) {
  emit('change-volume', Number(event.target.value))
}

// Let go of a slider: save it on the room so everyone gets it (once, not on every tiny movement)
function onSpeedChange(event) {
  emit('save-speed', Number(event.target.value))
}

function onVolumeChange(event) {
  emit('save-volume', Number(event.target.value))
}

// "Start at" slider: while dragging (jump there and hear it), and on letting go (save for the room)
function onStartInput(event) {
  emit('change-start', Number(event.target.value))
}

function onStartChange(event) {
  emit('save-start', Number(event.target.value))
}

// The latest start that still leaves a full 15 s of song
const maxStart = computed(function () {
  if (!props.track) return 0
  return Math.max(0, Math.floor(props.track.duration - MAX_EDIT_SECONDS))
})

// 65 → "1:05"
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (secs < 10) {
    return mins + ':0' + secs
  }
  return mins + ':' + secs
}

// 60 bars: the chosen 15 s in this deck's colour, the rest grey, so you can SEE which part you picked.
// computed = re-runs automatically when the song or the start changes.
const bars = computed(function () {
  const peaks = getPeaks(props.track, 60)
  const duration = props.track ? props.track.duration : 0
  const result = []
  for (let i = 0; i < peaks.length; i++) {
    const second = (i / peaks.length) * duration   // where in the song this bar is
    const inPart = second >= props.start && second < props.start + MAX_EDIT_SECONDS
    result.push({ height: peaks[i], color: inPart ? props.color : 'var(--line)' })
  }
  return result
})
</script>

<template>
  <div class="card h-100">
    <div class="card-body">
      <p class="small text-muted mb-0">{{ simple ? 'Your song' : label }}</p>
      <div class="d-flex justify-content-between align-items-center">
        <h2 class="h5 mb-0">{{ track ? track.name : 'No song yet' }}</h2>
        <!-- musicinfo.speed is Jamendo's rough speed: low / medium / high -->
        <span v-if="track && track.musicinfo" class="badge rounded-pill text-bg-light border text-capitalize">
          {{ track.musicinfo.speed }}
        </span>
      </div>
      <p v-if="loading" class="small text-muted mb-0">Loading song...</p>
      <p v-else-if="track" class="small text-muted mb-0">{{ track.artist_name }}</p>
      <p v-else class="small text-muted mb-0">Press {{ simple ? 'Use' : label.slice(-1) }} on a song to load it here.</p>

      <!-- The record spins while this deck is playing (the "spinning" class turns the animation on) -->
      <div class="vinyl my-4 mx-auto" :class="{ spinning: playing }" aria-hidden="true">
        <div class="vinyl-label" :style="{ background: color }">
          <div class="vinyl-hole"></div>
        </div>
      </div>

      <WaveformBars :bars="bars" class="mb-3" />

      <!-- Which 15 s of the song to use: it loops while you listen and goes into the video -->
      <div class="d-flex justify-content-between small">
        <label :for="'start-' + label.slice(-1)">Start at</label>
        <span class="time">{{ formatTime(start) }} – {{ formatTime(start + MAX_EDIT_SECONDS) }}</span>
      </div>
      <input
        :id="'start-' + label.slice(-1)"
        :value="start"
        type="range"
        class="form-range"
        min="0"
        :max="maxStart"
        step="1"
        :disabled="!track"
        @input="onStartInput"
        @change="onStartChange"
      />

      <!-- Speed is a DJ booth control: hidden in simple mode (<template> groups without adding a box) -->
      <template v-if="!simple">
        <div class="d-flex justify-content-between small">
          <span>Speed</span><span>{{ speed.toFixed(2) }}×</span>
        </div>
        <input :value="speed" type="range" class="form-range" min="0.5" max="1.5" step="0.05" @input="onSpeedInput" @change="onSpeedChange" />
      </template>

      <div class="d-flex justify-content-between small">
        <span>Volume</span><span>{{ volume }}%</span>
      </div>
      <input :value="volume" type="range" class="form-range" min="0" max="100" @input="onVolumeInput" @change="onVolumeChange" />

      <div class="d-flex gap-2 mt-2">
        <!-- Shows a pause icon while playing, a play icon when stopped.
             aria-label: screen readers say "Play Deck A" instead of describing the icon.
             aria-pressed: tells them whether the deck is playing right now. -->
        <button
          class="btn rounded-circle text-white play-btn"
          :style="{ background: color }"
          :disabled="!track || loading"
          :aria-label="(playing ? 'Pause ' : 'Play ') + label"
          :aria-pressed="playing"
          @click="emit('toggle-play')"
        >
          <!-- Drawn icons, not ▶ ❚❚ characters: Windows shows those as coloured emoji -->
          <svg v-if="playing" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="4" height="12" fill="currentColor" />
            <rect x="9" y="2" width="4" height="12" fill="currentColor" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <polygon points="4,2 14,8 4,14" fill="currentColor" />
          </svg>
        </button>
        <button v-if="!simple" class="btn btn-outline-secondary" :disabled="!track || loading" @click="emit('cue')">Cue</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The black record: a square with border-radius 50% becomes a circle.
   Not in syllabus: the gradients draw the grooves (thin rings) and the shine (two light wedges). */
.vinyl {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background:
    conic-gradient(from 30deg, transparent 0deg, rgba(255, 255, 255, 0.14) 25deg, transparent 50deg,
      transparent 180deg, rgba(255, 255, 255, 0.14) 205deg, transparent 230deg),
    repeating-radial-gradient(circle, #1e1e2e 0px, #1e1e2e 3px, #2b2b3d 4px, #1e1e2e 5px);
  box-shadow: 0 4px 12px rgba(22, 26, 46, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Spin while playing: one full turn every 2 seconds, forever */
.vinyl.spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* People who turned on "reduce motion" on their device: no spinning */
@media (prefers-reduced-motion: reduce) {
  .vinyl.spinning {
    animation: none;
  }
}

/* Fixed size, so rounded-circle is always a circle (not an oval). 44px = the minimum comfortable tap size. */
.play-btn {
  width: 44px;
  height: 44px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Numbers that change while dragging: every digit the same width, so the text does not wiggle */
.time {
  font-variant-numeric: tabular-nums;
}

/* The coloured middle of the record */
.vinyl-label {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* The small hole in the middle */
.vinyl-hole {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: white;
}
</style>