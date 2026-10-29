<script setup>
import { computed } from 'vue'
import { getPeaks } from '../waveform.js'
import WaveformBars from './WaveformBars.vue'

// Data passed IN from MusicView
const props = defineProps({
  label: String,      // 'Deck A' or 'Deck B'
  color: String,      // '#14a39a' (teal) or '#7c3aed' (purple)
  track: Object,      // the Jamendo song, or null if no song is loaded
  speed: Number,      // 0.5 to 1.5
  volume: Number,     // 0 to 100
  playing: Boolean,   // NEW: is this deck playing right now?
  loading: Boolean,   // NEW: is the song still downloading?
})

// Messages sent OUT to MusicView (a component must not change its own props)
const emit = defineEmits(['change-speed', 'change-volume', 'toggle-play', 'cue'])

// event.target is the slider that moved (Week 3 DOM). Its value is text, so turn it into a number.
function onSpeedInput(event) {
  emit('change-speed', Number(event.target.value))
}

function onVolumeInput(event) {
  emit('change-volume', Number(event.target.value))
}

// 60 bars in this deck's colour. computed = re-runs automatically when a new track is loaded.
const bars = computed(function () {
  const peaks = getPeaks(props.track, 60)
  const result = []
  for (let i = 0; i < peaks.length; i++) {
    result.push({ height: peaks[i], color: props.color })
  }
  return result
})
</script>

<template>
  <div class="card h-100">
    <div class="card-body">
      <p class="small text-muted mb-0">{{ label }}</p>
      <div class="d-flex justify-content-between align-items-center">
        <h2 class="h5 mb-0">{{ track ? track.name : 'No song yet' }}</h2>
        <!-- musicinfo.speed is Jamendo's rough speed: low / medium / high -->
        <span v-if="track && track.musicinfo" class="badge rounded-pill text-bg-light border text-capitalize">
          {{ track.musicinfo.speed }}
        </span>
      </div>
      <p v-if="loading" class="small text-muted mb-0">Loading song...</p>
      <p v-else-if="track" class="small text-muted mb-0">{{ track.artist_name }}</p>
      <p v-else class="small text-muted mb-0">Press {{ label.slice(-1) }} on a song to load it here.</p>

      <div class="vinyl my-4 mx-auto">
        <div class="vinyl-label" :style="{ background: color }"></div>
      </div>

      <WaveformBars :bars="bars" class="mb-3" />

      <div class="d-flex justify-content-between small">
        <span>Speed</span><span>{{ speed.toFixed(2) }}×</span>
      </div>
      <input :value="speed" type="range" class="form-range" min="0.5" max="1.5" step="0.05" @input="onSpeedInput" />

      <div class="d-flex justify-content-between small">
        <span>Volume</span><span>{{ volume }}%</span>
      </div>
      <input :value="volume" type="range" class="form-range" min="0" max="100" @input="onVolumeInput" />

      <div class="d-flex gap-2 mt-2">
        <!-- Shows ❚❚ (pause) while playing, ▶ (play) when stopped.
             aria-label: screen readers say "Play Deck A" instead of reading out the ▶ symbol.
             aria-pressed: tells them whether the deck is playing right now. -->
        <button
          class="btn rounded-circle text-white"
          :style="{ background: color }"
          :disabled="!track || loading"
          :aria-label="(playing ? 'Pause ' : 'Play ') + label"
          :aria-pressed="playing"
          @click="emit('toggle-play')"
        >
          {{ playing ? '❚❚' : '▶' }}
        </button>
        <button class="btn btn-outline-secondary" :disabled="!track || loading" @click="emit('cue')">Cue</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The black record: a square with border-radius 50% becomes a circle */
.vinyl {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: #1e1e2e;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* The coloured middle of the record */
.vinyl-label {
  width: 70px;
  height: 70px;
  border-radius: 50%;
}
</style>