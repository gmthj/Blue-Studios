<script setup>
import { updateDoc } from 'firebase/firestore'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import * as Tone from 'tone'   // NEW: not in syllabus (your X-factor)
import { useRoom } from '../composables/useRoom.js'
import { getPeaks, makeWaveform } from '../waveform.js'
import DeckCard from '../components/DeckCard.vue'
import WaveformBars from '../components/WaveformBars.vue'
import StageBar from '../components/StageBar.vue'
import { renderMix } from '../mixRender.js'
import { ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase.js'
import { MAX_EDIT_SECONDS } from '../clips.js'   // the exported video's length (Jun Han's Export page)
import { saveField } from '../stripData.js'   // the same helper Decorate uses to save one room field
import { getFileUrl } from '../studio.js'          // turns a Storage path into a link (team helper)
import { getUid } from '../composables/useAuth.js'  // the current person's id, for their upload folder

// RoomLayout already joined the room, so we just ask for the room code
// goToStage moves the whole room to another page and updates how far the stage bar shows we've got
// room: the live room document (it updates by itself when anyone changes it)
const { code, room, roomRef, goToStage } = useRoom()

// ---------- Decks (what the page shows) ----------
const trackA = ref(null)    // the song loaded in Deck A (null = empty)
const trackB = ref(null)
const speedA = ref(1)       // 0.5 to 1.5 (1 = normal speed)
const volumeA = ref(80)     // 0 to 100 (%)
const speedB = ref(1)
const volumeB = ref(55)
const crossfade = ref(0.5)  // 0 = only Deck A, 1 = only Deck B
// Simple mode = one song (Deck A only). DJ booth = both decks + crossfader. Shared with the room.
const djMode = ref(false)
// What you actually HEAR: in simple mode only Deck A, whatever the crossfader was left at
const soundCrossfade = computed(() => (djMode.value ? crossfade.value : 0))
const startA = ref(0)       // where Deck A's chosen part starts (seconds into the song)
const startB = ref(0)
const playingA = ref(false)
const playingB = ref(false)
const loadingA = ref(false)
const loadingB = ref(false)
const rendering = ref(false)   // true while the mix is being rendered
const previewUrl = ref('')     // a temporary address the <audio> player can play
let mixBlob = null             // the finished WAV file (plain variable, like playerA)
const saving = ref(false)   // true while uploading
const saved = ref(false)    // true after the mix is saved to the room

// ---------- Audio (Tone.js) ----------
// playerA → gainA → crossFade.a ┐
//                               ├→ crossFade → speakers
// playerB → gainB → crossFade.b ┘
const crossFadeNode = new Tone.CrossFade(soundCrossfade.value).toDestination()
const gainA = new Tone.Gain(0.8).connect(crossFadeNode.a)    // Gain 0 to 1 = volume 0% to 100%
const gainB = new Tone.Gain(0.55).connect(crossFadeNode.b)

// Plain variables, NOT ref(): Vue doesn't need to watch Tone objects, and wrapping them can break them
let playerA = null
let playerB = null

// Loop only the chosen part, so what you hear is exactly what goes into the video.
// At a faster speed, 15 s of video uses more of the song, so the loop is a bit longer.
function setLoop(player, start, speed) {
  player.loopStart = start
  player.loopEnd = Math.min(start + MAX_EDIT_SECONDS * speed, player.buffer.duration)
}

// Downloads a song and gets a Tone player ready (connected to that deck's volume)
async function makePlayer(track, gainNode, speed, start) {
  const player = new Tone.Player().connect(gainNode)
  await player.load(track.audio)
  player.loop = true
  player.playbackRate = speed
  setLoop(player, start, speed)
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
    const player = await makePlayer(track, gainA, speedA.value, startA.value)
    // If another song was picked while this one was downloading, throw this one away.
    // Compare ids, not objects: Vue wraps objects in a ref, so the same song is never the "same object".
    if (!trackA.value || trackA.value.id !== track.id) {
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
    playerA.start(undefined, startA.value)   // start at the chosen part (undefined = "right now")
    playingA.value = true
  }
}

// Cue = jump back to the start of the chosen part
function cueA() {
  if (!playerA) return
  playerA.stop()
  if (playingA.value) {
    playerA.start(undefined, startA.value)
  }
}

function setSpeedA(value) {
  speedA.value = value
  if (playerA) {
    playerA.playbackRate = value
    setLoop(playerA, startA.value, value)
  }
}

// Moving the "Start at" slider: loop the new part, and jump there if it's playing
function setStartA(value) {
  startA.value = value
  if (playerA) {
    setLoop(playerA, value, speedA.value)
    if (playingA.value) {
      playerA.stop()
      playerA.start(undefined, value)
    }
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
    const player = await makePlayer(track, gainB, speedB.value, startB.value)
    if (!trackB.value || trackB.value.id !== track.id) {
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
    playerB.start(undefined, startB.value)
    playingB.value = true
  }
}

function cueB() {
  if (!playerB) return
  playerB.stop()
  if (playingB.value) {
    playerB.start(undefined, startB.value)
  }
}

function setSpeedB(value) {
  speedB.value = value
  if (playerB) {
    playerB.playbackRate = value
    setLoop(playerB, startB.value, value)
  }
}

function setStartB(value) {
  startB.value = value
  if (playerB) {
    setLoop(playerB, value, speedB.value)
    if (playingB.value) {
      playerB.stop()
      playerB.start(undefined, value)
    }
  }
}

function setVolumeB(value) {
  volumeB.value = value
  gainB.gain.value = value / 100
}

// ----- Crossfader -----
function setCrossfade(value) {
  crossfade.value = value
  crossFadeNode.fade.value = soundCrossfade.value   // simple mode keeps the sound on Deck A
}

// Switching between simple mode and the DJ booth
function setDjMode(value) {
  djMode.value = value
  crossFadeNode.fade.value = soundCrossfade.value
  // Deck B isn't shown in simple mode, so stop it if it was playing
  if (!value && playerB && playingB.value) {
    playerB.stop()
    playingB.value = false
  }
}

// The button: switch here, and save it so the whole room switches too
function toggleDjMode() {
  setDjMode(!djMode.value)
  saveMixer('djMode', djMode.value)
}

// ----- Your mix -----
// Renders the current mix (songs + speeds + volumes + crossfader) into a 5 second WAV
async function makeMix() {
  if (!playerA && !playerB) {
    errorMessage.value = 'Load a song into a deck first.'
    return
  }
  rendering.value = true

  mixBlob = await renderMix({
    bufferA: playerA ? playerA.buffer : null,
    bufferB: playerB ? playerB.buffer : null,
    speedA: speedA.value,
    speedB: speedB.value,
    volumeA: volumeA.value,
    volumeB: volumeB.value,
    crossfade: soundCrossfade.value,   // what you hear (simple mode = only Deck A)
    startA: startA.value,
    startB: startB.value,
  })

  // URL.createObjectURL gives the file a temporary address that <audio> can play
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)   // free the previous one
  }
  previewUrl.value = URL.createObjectURL(mixBlob)
  rendering.value = false
}

// Saves the mix for the Export page: uploads the WAV to Firebase Storage,
// then writes where it is on the room, so every page in the room can find it.
async function useMix() {
  saved.value = false

  // Always render again, so the saved mix matches the sliders RIGHT NOW
  // (the user may have changed something since pressing Preview)
  await makeMix()
  if (!mixBlob) return   // no songs loaded: makeMix already showed a message

  saving.value = true

  // code is a ref, so inside the script we need code.value (the template does this for us)
  const audioPath = 'music/' + code.value + '/mix.wav'

  try {
    // 1. Upload the file to Firebase Storage
    await uploadBytes(storageRef(storage, audioPath), mixBlob, { contentType: 'audio/wav' })
    // 2. Save its location on the room, for Jun Han's Export page
    await updateDoc(roomRef(), { music: { audioPath: audioPath, duration: MAX_EDIT_SECONDS } })
    saved.value = true
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not save the mix. Please try again.'
  }
  saving.value = false
}

// Leaving the page: stop the music and free everything, otherwise it keeps playing on other pages!
onBeforeUnmount(function () {
  stopAndRemove(playerA)
  stopAndRemove(playerB)
  gainA.dispose()
  gainB.dispose()
  crossFadeNode.dispose()

  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
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
    const a = (peaksA[i] || 0) * (volumeA.value / 100) * (1 - soundCrossfade.value)
    const b = (peaksB[i] || 0) * (volumeB.value / 100) * soundCrossfade.value

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

// Jamendo sends some characters as HTML codes, e.g. Love&#039;s → Love's
function cleanText(text) {
  return text
    .replaceAll('&#039;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
}

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
        durationbetween: '30_240', // 30 s to 4 min: a loaded song is unpacked into memory
                                   // (about 64 MB for 3 min, 169 MB for 8 min), too much for phones
        offset: Math.floor(Math.random() * 50),
      },
    })
    tracks.value = response.data.results
    // Clean every song's name and artist
    for (const track of tracks.value) {
      track.name = cleanText(track.name)
      track.artist_name = cleanText(track.artist_name)
    }
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

// ---------- Your own songs ----------
// Uploaded to Firebase Storage, so everyone in the room can download them too (the mixer is shared).
const MAX_UPLOAD_MB = 15
const uploadedTracks = ref([])   // songs uploaded from this device, shown at the top of the list
const uploading = ref(false)

// The song list: your uploads first, then Jamendo's
const allTracks = computed(() => uploadedTracks.value.concat(tracks.value))

// Reads how long an audio file is (in seconds) without playing it
function readDuration(file) {
  return new Promise(function (resolve, reject) {
    const audio = new Audio()
    audio.onloadedmetadata = function () {
      URL.revokeObjectURL(audio.src)
      resolve(Math.round(audio.duration))
    }
    audio.onerror = function () {
      reject(new Error('Not an audio file'))
    }
    audio.src = URL.createObjectURL(file)
  })
}

async function uploadSong(event) {
  const file = event.target.files[0]   // the file the person picked (Week 3: event.target)
  event.target.value = ''              // so picking the same file again still works
  if (!file) return
  errorMessage.value = ''

  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    errorMessage.value = 'That file is too big. Pick a song under ' + MAX_UPLOAD_MB + ' MB.'
    return
  }

  uploading.value = true
  try {
    const duration = await readDuration(file)
    if (duration > 240) {
      errorMessage.value = 'Pick a song of 4 minutes or less (longer songs can crash phones).'
      return
    }

    // Unpack the song to draw its waveform (Jamendo gives one, but an uploaded file doesn't).
    // This happens AFTER the 4-minute check, so a long file is never unpacked (that's what uses the memory).
    const fileUrl = URL.createObjectURL(file)
    const decoded = await Tone.ToneAudioBuffer.fromUrl(fileUrl)
    URL.revokeObjectURL(fileUrl)
    const waveform = makeWaveform(decoded)

    // Same folder idea as the room's video clips: music/{room}/uploads/{person}/{time}
    const stamp = Date.now()
    const path = 'music/' + code.value + '/uploads/' + getUid() + '/' + stamp
    await uploadBytes(storageRef(storage, path), file, { contentType: file.type || 'audio/mpeg' })
    const url = await getFileUrl(path)

    // The file name without ".mp3"
    let name = file.name
    const dot = name.lastIndexOf('.')
    if (dot > 0) {
      name = name.slice(0, dot)
    }

    // The same shape as a Jamendo song, so the decks, the list and the shared mixer just work
    uploadedTracks.value.unshift({
      id: 'upload-' + stamp,
      name: name,
      artist_name: 'Your upload',
      duration: duration,
      audio: url,
      waveform: waveform,
      musicinfo: { speed: '' },
    })
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not upload that song. Please try another file.'
  } finally {
    uploading.value = false   // finally runs at the end whatever happened (even after return)
  }
}

// ---------- Shared mixer (everyone in the room edits the same one) ----------
// The room keeps the mixer in room.mixer: { trackA, trackB, speedA, speedB, volumeA, volumeB, crossfade }.
// Every screen follows it, so a change by anyone shows up for everyone.
// Play / pause is NOT shared: browsers only allow sound after each person taps on their own device.

// Saves one mixer value on the room, e.g. saveMixer('speedA', 1.2) saves room.mixer.speedA
async function saveMixer(key, value) {
  try {
    await saveField(roomRef(), 'mixer.' + key, value)
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not share that change with the room.'
  }
}

// Only the parts of a Jamendo song the decks need (keeps the room document small).
// Firestore does not accept undefined, so missing values become ''.
function roomTrack(track) {
  return {
    id: track.id,
    name: track.name,
    artist_name: track.artist_name,
    duration: track.duration,
    audio: track.audio,
    waveform: track.waveform || '',
    musicinfo: { speed: track.musicinfo ? track.musicinfo.speed : '' },
  }
}

// Clicking A or B on a song: load it here straight away, and save it on the room for everyone else
// A new song starts at 0:00 for everyone.
function pickTrack(deck, track) {
  const small = roomTrack(track)
  if (deck === 'A') {
    setStartA(0)
    loadDeckA(small)
  } else {
    setStartB(0)
    loadDeckB(small)
  }

  // Save the song AND its start together, so nobody gets the new song with the old start
  const changes = {}
  changes['mixer.track' + deck] = small
  changes['mixer.start' + deck] = 0
  updateDoc(roomRef(), changes).catch(function (error) {
    console.error(error)
    errorMessage.value = 'Could not share that change with the room.'
  })
}

// Copies the room's mixer onto this screen (sliders, sound, and which songs are loaded)
function applyRoomMixer(mixer) {
  if (!mixer) return   // nobody has used the mixer in this room yet: keep the starting values

  if (mixer.speedA !== undefined) setSpeedA(mixer.speedA)
  if (mixer.speedB !== undefined) setSpeedB(mixer.speedB)
  if (mixer.volumeA !== undefined) setVolumeA(mixer.volumeA)
  if (mixer.volumeB !== undefined) setVolumeB(mixer.volumeB)
  if (mixer.crossfade !== undefined) setCrossfade(mixer.crossfade)
  if (mixer.djMode !== undefined) setDjMode(mixer.djMode)
  // Before the songs below: a song that starts downloading uses the start that is set by then
  if (mixer.startA !== undefined) setStartA(mixer.startA)
  if (mixer.startB !== undefined) setStartB(mixer.startB)

  // Only download a song if it is a DIFFERENT one from what this deck already has
  if (mixer.trackA && (!trackA.value || trackA.value.id !== mixer.trackA.id)) {
    loadDeckA(mixer.trackA)
  }
  if (mixer.trackB && (!trackB.value || trackB.value.id !== mixer.trackB.id)) {
    loadDeckB(mixer.trackB)
  }
}

// Whenever the room changes (anyone's edit), apply its mixer here.
// immediate: true = also run once now, so people who join late get the current mix.
// (It sits at the end of the script because it runs straight away and uses everything above.)
watch(() => room.value && room.value.mixer, applyRoomMixer, { immediate: true })

// Load some songs as soon as the page opens
onMounted(loadTracks)
</script>

<template>
  <div class="app-page music-page">
    <StageBar current="music" />
    <div class="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
      <h2 class="h4 mb-0">{{ djMode ? 'DJ booth' : 'Music mixer' }}</h2>
      <div class="d-flex gap-2">
        <!-- Simple mode / DJ booth: shared, so the whole room switches together -->
        <button class="btn btn-outline-secondary btn-sm" @click="toggleDjMode">
          {{ djMode ? 'Simple mode' : 'DJ booth' }}
        </button>
        <button class="btn btn-outline-secondary btn-sm" @click="goToStage('decorate')">&larr; Decorate</button>
      </div>
    </div>
    <p class="small text-muted mb-3">
      {{ djMode ? 'Mix two songs together.' : 'Pick a song and the part you like.' }}
      Everyone in the room shares this. ▶ plays on your own device.
    </p>
    <div class="row g-4">
    <!-- LEFT: decks, mixer and your mix -->
    <div class="col-12 col-lg-9">
      <div class="row g-3">
        <!-- DECK A: each @event calls a function above with the value DeckCard emitted.
             Full width in simple mode, a third of the row in the DJ booth. -->
        <div class="col-12" :class="{ 'col-md-5': djMode }">
          <DeckCard
            label="Deck A"
            :simple="!djMode"
            color="#14a39a"
            :track="trackA"
            :speed="speedA"
            :volume="volumeA"
            :playing="playingA"
            :loading="loadingA"
            @change-speed="setSpeedA"
            @change-volume="setVolumeA"
            @save-speed="saveMixer('speedA', $event)"
            @save-volume="saveMixer('volumeA', $event)"
            :start="startA"
            @change-start="setStartA"
            @save-start="saveMixer('startA', $event)"
            @toggle-play="togglePlayA"
            @cue="cueA"
          />
        </div>
        <!-- MIXER (crossfader): DJ booth only -->
        <div v-if="djMode" class="col-12 col-md-2">
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
                @change="saveMixer('crossfade', Number($event.target.value))"
              />
              <div class="d-flex justify-content-between small fw-bold">
                <span class="text-deck-a">A</span><span class="text-deck-b">B</span>
              </div>
            </div>
          </div>
        </div>
        <!-- DECK B: DJ booth only -->
        <div v-if="djMode" class="col-12 col-md-5">
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
            @save-speed="saveMixer('speedB', $event)"
            @save-volume="saveMixer('volumeB', $event)"
            :start="startB"
            @change-start="setStartB"
            @save-start="saveMixer('startB', $event)"
            @toggle-play="togglePlayB"
            @cue="cueB"
          />
        </div>
        <!-- YOUR MIX -->
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <h2 class="h5 mb-0">Your mix</h2>
              <p class="small text-muted">{{ MAX_EDIT_SECONDS }} s · the same length as your video</p>
              <WaveformBars :bars="mixBars" class="mb-3" />
              <!-- Shows up after Preview has made the mix -->
              <audio v-if="previewUrl" :src="previewUrl" controls class="w-100 mb-3"></audio>
              <div class="d-flex flex-wrap gap-2 justify-content-end">
                <button class="btn btn-outline-secondary" :disabled="rendering" @click="makeMix">
                  {{ rendering ? 'Rendering...' : '▷ Preview' }}
                </button>
                <!-- Blue until the mix is saved, then it steps back so "Export video" becomes the main button
                     (design guide: one main button per area, promote the next step once it makes sense) -->
                <button
                  class="btn"
                  :class="saved ? 'btn-outline-secondary' : 'btn-primary'"
                  :disabled="saving || rendering"
                  @click="useMix"
                >
                  {{ saving ? 'Saving...' : saved ? 'Saved ✓' : 'Use this mix' }}
                </button>
                <!-- Always clickable, so people can export without music too -->
                <button
                  class="btn"
                  :class="saved ? 'btn-primary' : 'btn-outline-secondary'"
                  :disabled="saving || rendering"
                  @click="goToStage('export')"
                >
                  Export video &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- RIGHT on laptops, FIRST on phones (you pick songs before you can mix them).
         order-first moves it to the top on small screens, order-lg-0 puts it back from "lg" (992px) up. -->
    <div class="col-12 col-lg-3 order-first order-lg-0">
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
          <!-- Your own song: uploaded so everyone in the room can play it -->
          <label for="songUpload" class="form-label small fw-bold mb-1">Or use your own song</label>
          <input
            id="songUpload"
            type="file"
            accept="audio/*"
            class="form-control form-control-sm mb-1"
            :disabled="uploading"
            @change="uploadSong"
          />
          <p class="text-muted small mb-3">Only use songs you're allowed to share. Up to 4 min, {{ MAX_UPLOAD_MB }} MB.</p>
          <p v-if="uploading" class="text-muted small" role="status">Uploading your song...</p>
          <p v-if="loading" class="text-muted small">Loading songs...</p>
          <div v-else-if="errorMessage" class="alert alert-warning small">{{ errorMessage }}</div>
          <div
            v-for="track in allTracks"
            :key="track.id"
            class="track border rounded p-2 mb-2 d-flex align-items-center gap-2"
          >
            <!-- flex-shrink-0: long names can't squash the icon. min-width 0 + text-break: long names wrap -->
            <div class="track-icon bg-secondary flex-shrink-0">♫</div>
            <div class="flex-grow-1 text-break" style="min-width: 0">
              <p class="mb-0 fw-semibold small">{{ track.name }}</p>
              <p class="mb-0 text-muted small">{{ track.artist_name }} · {{ formatTime(track.duration) }}</p>
            </div>
            <!-- Clicking A or B loads this song into that deck, for everyone in the room -->
            <!-- Simple mode: one "Use" button. DJ booth: choose Deck A or Deck B -->
            <button v-if="!djMode" class="btn btn-sm btn-deck-a flex-shrink-0" @click="pickTrack('A', track)">Use</button>
            <template v-else>
              <button class="btn btn-sm btn-deck-a flex-shrink-0" @click="pickTrack('A', track)">A</button>
              <button class="btn btn-sm btn-deck-b flex-shrink-0" @click="pickTrack('B', track)">B</button>
            </template>
          </div>
        </div>
      </div>
    </div>
      </div>
  </div>
</template>

<style scoped>
/* Deck colours from the Figma */
.text-deck-a { color: #0D7C75; }   
.text-deck-b { color: #7c3aed; }
.btn-deck-a { background: #0D7C75; color: white; }
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