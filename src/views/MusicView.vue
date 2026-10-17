<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRoom } from '../composables/useRoom.js'

// RoomLayout already joined the room, so we just ask for the room code
const { code } = useRoom()

// ---------- Step 2: slider values (v-model keeps these in sync with the sliders) ----------
const speedA = ref(1)       // 0.5 to 1.5 (1 = normal speed)
const volumeA = ref(80)     // 0 to 100 (%)
const speedB = ref(1)
const volumeB = ref(55)
const crossfade = ref(0.5)  // 0 = only Deck A, 1 = only Deck B

// ---------- Step 4: Jamendo song list ----------
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

        <!-- DECK A (we turn this into a component in step 3) -->
        <div class="col-12 col-md-5">
          <div class="card h-100">
            <div class="card-body">
              <p class="small text-muted mb-0">Deck A</p>
              <div class="d-flex justify-content-between align-items-center">
                <h2 class="h5 mb-0">Mrs. Chillnes</h2>
                <span class="badge rounded-pill text-bg-light border">Medium</span>
              </div>

              <div class="vinyl my-4 mx-auto">
                <div class="vinyl-label bg-deck-a"></div>
              </div>

              <div class="d-flex justify-content-between small">
                <span>Speed</span><span>{{ speedA.toFixed(2) }}×</span>
              </div>
              <input v-model.number="speedA" type="range" class="form-range" min="0.5" max="1.5" step="0.05" />

              <div class="d-flex justify-content-between small">
                <span>Volume</span><span>{{ volumeA }}%</span>
              </div>
              <input v-model.number="volumeA" type="range" class="form-range" min="0" max="100" />

              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-deck-a rounded-circle">▶</button>
                <button class="btn btn-outline-secondary">Cue</button>
              </div>
            </div>
          </div>
        </div>

        <!-- MIXER (crossfader) -->
        <div class="col-12 col-md-2">
          <div class="card h-100">
            <div class="card-body d-flex flex-column justify-content-end text-center">
              <h2 class="h6">Mixer</h2>
              <p class="mixer-label text-muted mt-auto mb-1">CROSSFADER</p>
              <input v-model.number="crossfade" type="range" class="form-range" min="0" max="1" step="0.01" />
              <div class="d-flex justify-content-between small fw-bold">
                <span class="text-deck-a">A</span><span class="text-deck-b">B</span>
              </div>
            </div>
          </div>
        </div>

        <!-- DECK B -->
        <div class="col-12 col-md-5">
          <div class="card h-100">
            <div class="card-body">
              <p class="small text-muted mb-0">Deck B</p>
              <div class="d-flex justify-content-between align-items-center">
                <h2 class="h5 mb-0">Replay</h2>
                <span class="badge rounded-pill text-bg-light border">Medium</span>
              </div>

              <div class="vinyl my-4 mx-auto">
                <div class="vinyl-label bg-deck-b"></div>
              </div>

              <div class="d-flex justify-content-between small">
                <span>Speed</span><span>{{ speedB.toFixed(2) }}×</span>
              </div>
              <input v-model.number="speedB" type="range" class="form-range" min="0.5" max="1.5" step="0.05" />

              <div class="d-flex justify-content-between small">
                <span>Volume</span><span>{{ volumeB }}%</span>
              </div>
              <input v-model.number="volumeB" type="range" class="form-range" min="0" max="100" />

              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-deck-b rounded-circle">▶</button>
                <button class="btn btn-outline-secondary">Cue</button>
              </div>
            </div>
          </div>
        </div>

        <!-- YOUR MIX -->
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <h2 class="h5 mb-0">Your mix</h2>
              <p class="small text-muted">5 s loop · matches your video frame</p>
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
            <button class="btn btn-sm btn-outline-primary">+</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Deck colours from the Figma */
.bg-deck-a { background: #14a39a; }
.bg-deck-b { background: #7c3aed; }
.text-deck-a { color: #14a39a; }
.text-deck-b { color: #7c3aed; }
.btn-deck-a { background: #14a39a; color: white; }
.btn-deck-b { background: #7c3aed; color: white; }

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