<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import * as Tone from 'tone'   // NEW: not in syllabus (your X-factor)
import { useRoom } from '../composables/useRoom.js'
import { getPeaks } from '../waveform.js'
import DeckCard from '../components/DeckCard.vue'
import WaveformBars from '../components/WaveformBars.vue'

// RoomLayout already joined the room, so we just ask for the room code
const { code } = useRoom()

// ---------- Decks (what the page shows) ----------
const trackA = ref(null)    // the song loaded in Deck A (null = empty)
const trackB = ref(null)
const speedA = ref(1)       // 0.5 to 1.5 (1 = normal speed)
const volumeA = ref(80)     // 0 to 100 (%)
const speedB = ref(1)
const volumeB = ref(55)
const crossfade = ref(0.5)  // 0 = only Deck A, 1 = only Deck B
const playingA = ref(false)
const playingB = ref(false)
const loadingA = ref(false)
const loadingB = ref(false)

// ---------- Audio (Tone.js) ----------
// playerA → gainA → crossFade.a ┐
//                               ├→ crossFade → speakers
// playerB → gainB → crossFade.b ┘
const crossFadeNode = new Tone.CrossFade(0.5).toDestination()
const gainA = new Tone.Gain(0.8).connect(crossFadeNode.a)    // Gain 0 to 1 = volume 0% to 100%
const gainB = new Tone.Gain(0.55).connect(crossFadeNode.b)

// Plain variables, NOT ref(): Vue doesn't need to watch Tone objects, and wrapping them can break them
let playerA = null
let playerB = null

// Downloads a song and gets a Tone player ready (connected to that deck's volume)
async function makePlayer(track, gainNode, speed) {
  const player = new Tone.Player().connect(gainNode)
  await player.load(track.audio)
  player.loop = true
  player.playbackRate = speed
  return player
}

// Stops a player and frees its memory
function stopAndRemove(player) {
  if (player) {
    player.stop()
    player.dispose()
  }
}

// ----- Deck A -----
async function loadDeckA(track) {
  stopAndRemove(playerA)
  playerA = null
  playingA.value = false
  trackA.value = track
  loadingA.value = true

  try {
    const player = await makePlayer(track, gainA, speedA.value)
    // If another song was picked while this one was downloading, throw this one away
    if (trackA.value !== track) {
      player.dispose()
      return
    }
    playerA = player
  } catch (error) {
    console.error(error)
    trackA.value = null
    errorMessage.value = 'Could not load that song, please pick another.'
  }
  loadingA.value = false
}

async function togglePlayA() {
  await Tone.start()   // browsers only allow sound after a click
  if (!playerA) return
  if (playingA.value) {
    playerA.stop()
    playingA.value = false
  } else {
    playerA.start()
    playingA.value = true
  }
}

// Cue = jump back to the start of the song
function cueA() {
  if (!playerA) return
  playerA.stop()
  if (playingA.value) {
    playerA.start()
  }
}

function setSpeedA(value) {
  speedA.value = value
  if (playerA) {
    playerA.playbackRate = value
  }
}

function setVolumeA(value) {
  volumeA.value = value
  gainA.gain.value = value / 100
}

// ----- Deck B (same as Deck A) -----
async function loadDeckB(track) {
  stopAndRemove(playerB)
  playerB = null
  playingB.value = false
  trackB.value = track
  loadingB.value = true

  try {
    const player = await makePlayer(track, gainB, speedB.value)
    if (trackB.value !== track) {
      player.dispose()
      return
    }
    playerB = player
  } catch (error) {
    console.error(error)
    trackB.value = null
    errorMessage.value = 'Could not load that song, please pick another.'
  }
  loadingB.value = false
}

async function togglePlayB() {
  await Tone.start()
  if (!playerB) return
  if (playingB.value) {
    playerB.stop()
    playingB.value = false
  } else {
    playerB.start()
    playingB.value = true
  }
}

function cueB() {
  if (!playerB) return
  playerB.stop()
  if (playingB.value) {
    playerB.start()
  }
}

function setSpeedB(value) {
  speedB.value = value
  if (playerB) {
    playerB.playbackRate = value
  }
}

function setVolumeB(value) {
  volumeB.value = value
  gainB.gain.value = value / 100
}

// ----- Crossfader -----
function setCrossfade(value) {
  crossfade.value = value
  crossFadeNode.fade.value = value
}

// Leaving the page: stop the music and free everything, otherwise it keeps playing on other pages!
onBeforeUnmount(function () {
  stopAndRemove(playerA)
  stopAndRemove(playerB)
  gainA.dispose()
  gainB.dispose()
  crossFadeNode.dispose()
})

// ---------- "Your mix" waveform ----------
// Blends Deck A and Deck B using the volume and crossfader sliders.
// Each bar is coloured by whichever deck is louder at that moment.
const mixBars = computed(function () {
  if (!trackA.value && !trackB.value) {
    return []
  }

  const peaksA = getPeaks(trackA.value, 80)
  const peaksB = getPeaks(trackB.value, 80)
  const result = []

  for (let i = 0; i < 80; i++) {
    // || 0 means "use 0 if that deck has no song"
    const a = (peaksA[i] || 0) * (volumeA.value / 100) * (1 - crossfade.value)
    const b = (peaksB[i] || 0) * (volumeB.value / 100) * crossfade.value

    let color = '#7c3aed'   // purple = Deck B is louder
    if (a >= b) {
      color = '#14a39a'     // teal = Deck A is louder
    }
    result.push({ height: a + b, color: color })
  }
  return result
})

// ---------- Jamendo song list ----------
const CLIENT_ID = import.meta.env.VITE_JAMENDO_CLIENT_ID

const genre = ref('chillout')   // linked to the dropdown with v-model
const tracks = ref([])          // the songs from Jamendo
const loading = ref(false)
const errorMessage = ref('')

async function loadTracks() {
  loading.value = true
  errorMessage.value = ''
  tracks.value = []

  // Jamendo sometimes returns 0 songs by mistake, so try up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await axios.get('https://api.jamendo.com/v3.0/tracks/', {
      params: {
        client_id: CLIENT_ID,
        format: 'json',
        limit: 10,
        tags: genre.value,
        include: 'musicinfo',   // adds musicinfo.speed (low / medium / high) for the deck badge
        offset: Math.floor(Math.random() * 50),
      },
    })
    tracks.value = response.data.results
    if (tracks.value.length > 0) {
      break
    }
  }

  if (tracks.value.length === 0) {
    errorMessage.value = 'No songs found, please try again.'
  }
  loading.value = false
}

// Turns 403 seconds into "6:43"
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (secs < 10) {
    return mins + ':0' + secs
  }
  return mins + ':' + secs
}

// Load some songs as soon as the page opens
onMounted(loadTracks)
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Music mixer</h1>
    <router-link :to="'/room/' + code" class="btn btn-outline-secondary btn-sm">Back to room</router-link>
  </div>

  <div class="row g-4">
    <!-- LEFT: decks, mixer and your mix -->
    <div class="col-12 col-lg-9">
      <div class="row g-3">

        <!-- DECK A: each @event calls a function above with the value DeckCard emitted -->
        <div class="col-12 col-md-5">
          <DeckCard
            label="Deck A"
            color="#14a39a"
            :track="trackA"
            :speed="speedA"
            :volume="volumeA"
            :playing="playingA"
            :loading="loadingA"
            @change-speed="setSpeedA"
            @change-volume="setVolumeA"
            @toggle-play="togglePlayA"
            @cue="cueA"
          />
        </div>

        <!-- MIXER (crossfader) -->
        <div class="col-12 col-md-2">
          <div class="card h-100">
            <div class="card-body d-flex flex-column justify-content-end text-center">
              <h2 class="h6">Mixer</h2>
              <p class="mixer-label text-muted mt-auto mb-1">CROSSFADER</p>
              <input
                :value="crossfade"
                type="range"
                class="form-range"
                min="0"
                max="1"
                step="0.01"
                @input="setCrossfade(Number($event.target.value))"
              />
              <div class="d-flex justify-content-between small fw-bold">
                <span class="text-deck-a">A</span><span class="text-deck-b">B</span>
              </div>
            </div>
          </div>
        </div>

        <!-- DECK B -->
        <div class="col-12 col-md-5">
          <DeckCard
            label="Deck B"
            color="#7c3aed"
            :track="trackB"
            :speed="speedB"
            :volume="volumeB"
            :playing="playingB"
            :loading="loadingB"
            @change-speed="setSpeedB"
            @change-volume="setVolumeB"
            @toggle-play="togglePlayB"
            @cue="cueB"
          />
        </div>

        <!-- YOUR MIX -->
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <h2 class="h5 mb-0">Your mix</h2>
              <p class="small text-muted">5 s loop · matches your video frame</p>
              <WaveformBars :bars="mixBars" class="mb-3" />
              <div class="d-flex flex-wrap gap-2 justify-content-end">
                <button class="btn btn-outline-secondary">▷ Preview</button>
                <button class="btn btn-primary">Use this mix</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- RIGHT: browse Jamendo -->
    <div class="col-12 col-lg-3">
      <div class="card h-100">
        <div class="card-body">
          <h2 class="h5">Browse Jamendo</h2>

          <!-- @change runs loadTracks every time a new genre is picked -->
          <select v-model="genre" class="form-select mb-3" @change="loadTracks">
            <option value="chillout">Chill</option>
            <option value="lounge">Lounge</option>
            <option value="pop">Pop</option>
            <option value="rock">Rock</option>
            <option value="jazz">Jazz</option>
            <option value="hiphop">Hip hop</option>
            <option value="electronic">Electronic</option>
            <option value="classical">Classical</option>
            <option value="acoustic">Acoustic</option>
            <option value="funk">Funk</option>
          </select>

          <p v-if="loading" class="text-muted small">Loading songs...</p>
          <div v-else-if="errorMessage" class="alert alert-warning small">{{ errorMessage }}</div>

          <div
            v-for="track in tracks"
            :key="track.id"
            class="track border rounded p-2 mb-2 d-flex align-items-center gap-2"
          >
            <div class="track-icon bg-secondary">♫</div>
            <div class="flex-grow-1">
              <p class="mb-0 fw-semibold small">{{ track.name }}</p>
              <p class="mb-0 text-muted small">{{ track.artist_name }} · {{ formatTime(track.duration) }}</p>
            </div>
            <!-- Clicking A or B downloads this song into that deck -->
            <button class="btn btn-sm btn-deck-a" @click="loadDeckA(track)">A</button>
            <button class="btn btn-sm btn-deck-b" @click="loadDeckB(track)">B</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Deck colours from the Figma */
.text-deck-a { color: #14a39a; }
.text-deck-b { color: #7c3aed; }
.btn-deck-a { background: #14a39a; color: white; }
.btn-deck-b { background: #7c3aed; color: white; }

.track-icon {
  width: 36px;
  height: 36px;
  border-radius: 0.375rem;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Smaller text so "CROSSFADER" fits in the narrow mixer column */
.mixer-label {
  font-size: 0.65rem;
  letter-spacing: 0.05em;
}
</style>