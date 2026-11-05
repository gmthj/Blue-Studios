<script setup>
import { updateDoc } from 'firebase/firestore'
import { playSound, useLoudAudioSession } from '../sounds.js'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import axios from 'axios'
import * as Tone from 'tone'   // NEW: not in syllabus (your X-factor)
import { useRoom } from '../composables/useRoom.js'
import { getPeaks, makeWaveform } from '../waveform.js'
import DeckCard from '../components/DeckCard.vue'
import WaveformBars from '../components/WaveformBars.vue'
import StageBar from '../components/StageBar.vue'
import AppIcon from '../components/AppIcon.vue'
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
const { code, room, roomRef } = useRoom()

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
const previewEl = ref(null)    // the preview <audio> element (ref="previewEl" in the template)
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
// autoPlay: start playing as soon as it has downloaded (only for the person who picked it)
async function loadDeckA(track, autoPlay = false) {
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
    if (autoPlay) {
      player.start(undefined, startA.value)
      playingA.value = true
    }
  } catch (error) {
    console.error(error)
    trackA.value = null
    errorMessage.value = 'Could not load that song, please pick another.'
  }
  loadingA.value = false
}

async function togglePlayA() {
  useLoudAudioSession()   // iPhones: play even with the silent switch on (see sounds.js)
  await Tone.start()   // browsers only allow sound after a click
  if (!playerA) return
  if (playingA.value) {
    playerA.stop()
    playingA.value = false
  } else {
    pausePreview()   // one thing at a time: the deck or the mix preview
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
async function loadDeckB(track, autoPlay = false) {
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
    if (autoPlay) {
      player.start(undefined, startB.value)
      playingB.value = true
    }
  } catch (error) {
    console.error(error)
    trackB.value = null
    errorMessage.value = 'Could not load that song, please pick another.'
  }
  loadingB.value = false
}

async function togglePlayB() {
  useLoudAudioSession()
  await Tone.start()
  if (!playerB) return
  if (playingB.value) {
    playerB.stop()
    playingB.value = false
  } else {
    pausePreview()
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

// Stop both decks (the songs the mix is made from), e.g. when the mix preview starts playing
function stopDecks() {
  if (playerA && playingA.value) playerA.stop()
  if (playerB && playingB.value) playerB.stop()
  playingA.value = false
  playingB.value = false
}

function pausePreview() {
  if (previewEl.value && !previewEl.value.paused) previewEl.value.pause()
}

// The Preview button: stop the decks, make the mix, and play it
async function previewMix() {
  stopDecks()
  // iPhones only let an <audio> play from a tap. Calling play() now, inside the tap, allows it to play
  // later when the mix is ready (the error from having no song yet is expected, so it's ignored).
  // pause() straight after: an old preview must not play while the new one is made.
  if (previewEl.value) {
    previewEl.value.play().catch(() => {})
    previewEl.value.pause()
  }
  await makeMix()
  await nextTick()   // wait for the <audio> to get the new mix
  if (previewEl.value && previewUrl.value) {
    previewEl.value.currentTime = 0
    previewEl.value.play().catch((error) => console.error(error))   // blocked? the player's own play button still works
  }
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
    playSound('success')
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not save the mix. Please try again.'
  }
  saving.value = false
}

// ----- Keep the preview up to date -----
// After Preview has been pressed once, any change to the mix makes a new preview by itself.
// setTimeout (Week 3) waits until you've stopped moving a slider for 0.5 s,
// so it doesn't render 30 times while you drag.
let refreshTimer = null

watch(
  // loadingA/loadingB instead of trackA/trackB: a new song is only ready once it has finished downloading
  [loadingA, loadingB, speedA, speedB, volumeA, volumeB, soundCrossfade, startA, startB],
  function () {
    if (!previewUrl.value) return                  // no preview yet: nothing to update
    if (loadingA.value || loadingB.value) return   // wait for the song to finish downloading
    clearTimeout(refreshTimer)                     // still moving: cancel the last countdown
    refreshTimer = setTimeout(makeMix, 500)
  }
)

// Leaving the page: stop the music and free everything, otherwise it keeps playing on other pages!
onBeforeUnmount(function () {
  clearTimeout(refreshTimer)   // a preview update that hasn't started yet won't run after you leave
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

    let color = '#F76B15'   // orange = Deck B is louder
    if (a >= b) {
      color = '#2F5BEA'     // blue = Deck A is louder (design.md --brand)
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

// Is this song downloading into that deck right now? (for the spinners in the song list)
function isLoadingOn(deck, track) {
  const loading = deck === 'A' ? loadingA.value : loadingB.value
  const onDeck = deck === 'A' ? trackA.value : trackB.value
  return loading && !!onDeck && onDeck.id === track.id
}

function isLoadingTrack(track) {
  return isLoadingOn('A', track) || isLoadingOn('B', track)
}

// Clicking A or B on a song: load it here straight away, and save it on the room for everyone else
// A new song starts at 0:00 for everyone, and starts playing straight away for the person who picked it
// (only them: play / pause is not shared, see below).
function pickTrack(deck, track) {
  // Wake the sound up now, while we are still inside the tap (iPhones only allow it there)
  useLoudAudioSession()
  Tone.start()
  const small = roomTrack(track)
  if (deck === 'A') {
    setStartA(0)
    loadDeckA(small, true)
  } else {
    setStartB(0)
    loadDeckB(small, true)
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
      <h2 class="section-title mb-0">{{ djMode ? 'DJ booth' : 'Music mixer' }}</h2>
      <!-- Simple mode / DJ booth: shared, so the whole room switches together.
           Both choices are always visible (a segmented switch), so it's clear there are two modes. -->
      <div class="mode-switch" role="radiogroup" aria-label="Music mode">
        <button
          type="button"
          role="radio"
          class="mode-option"
          :class="{ active: !djMode }"
          :aria-checked="!djMode"
          @click="djMode && toggleDjMode()"
        >
          <AppIcon name="music" :size="16" />
          Simple
        </button>
        <button
          type="button"
          role="radio"
          class="mode-option"
          :class="{ active: djMode }"
          :aria-checked="djMode"
          @click="!djMode && toggleDjMode()"
        >
          <AppIcon name="sparkle" :size="16" />
          DJ booth
        </button>
      </div>
    </div>
    <p class="small text-muted mb-3">
      {{ djMode ? 'Mix two songs together.' : 'Pick a song and the part you like.' }}
      Everyone in the room shares this. The play button plays on your own device only.
    </p>
    <div class="row g-4">
    <!-- LEFT: decks, mixer and your mix -->
    <div class="col-12 col-lg-9">
      <div class="row g-3">
        <!-- DECK A: each @event calls a function above with the value DeckCard emitted.
             Full width in simple mode, 5 of 12 columns in the DJ booth (also on a sideways phone: see .deck-col). -->
        <div class="col-12 deck-col" :class="{ 'col-md-5': djMode }">
          <DeckCard
            label="Deck A"
            :simple="!djMode"
            color="#2F5BEA"
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
        <!-- MIXER (crossfader): DJ booth only. <Transition> slides it in and fades it out (see .deck-* styles) -->
        <Transition name="deck">
        <div v-if="djMode" class="col-12 col-md-2 mixer-col">
          <div class="card h-100">
            <div class="card-body d-flex flex-column justify-content-end text-center">
              <h2 class="section-title">Mixer</h2>
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
        </Transition>
        <!-- DECK B: DJ booth only -->
        <Transition name="deck">
        <div v-if="djMode" class="col-12 col-md-5 deck-col">
          <DeckCard
            label="Deck B"
            color="#F76B15"
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
        </Transition>
        <!-- YOUR MIX -->
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <h2 class="section-title mb-0">Your mix</h2>
              <p class="small text-muted">{{ MAX_EDIT_SECONDS }} s · the same length as your video</p>
              <WaveformBars :bars="mixBars" class="mb-3" />
              <!-- Shows up after Preview has made the mix. After that it updates by itself when the mix changes. -->
              <!-- v-show, not v-if: the element is always there, so Preview can start it from the tap (iPhones need that).
                   Playing it (Preview, or its own play button) stops the decks. -->
              <audio
                v-show="previewUrl"
                ref="previewEl"
                :src="previewUrl || undefined"
                controls
                class="w-100 mb-1"
                @play="stopDecks"
              ></audio>
              <p v-if="previewUrl" class="small text-muted mb-3">
                {{ rendering ? 'Updating preview...' : 'Preview matches your sliders' }}
              </p>
              <div class="d-flex flex-wrap gap-2 justify-content-end">
                <button class="btn btn-outline-secondary" :disabled="rendering" @click="previewMix">
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
                <!-- Going on to Export (with or without music) is the Next button in RoomStageNav.vue -->
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
          <h2 class="section-title">Browse Jamendo</h2>
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
            :class="{ 'track-loading': isLoadingTrack(track) }"
          >
            <!-- flex-shrink-0: long names can't squash the icon. min-width 0 + text-break: long names wrap -->
            <div class="track-icon bg-secondary flex-shrink-0">♫</div>
            <div class="flex-grow-1 text-break" style="min-width: 0">
              <p class="mb-0 fw-semibold small">{{ track.name }}</p>
              <p class="mb-0 text-muted small">{{ track.artist_name }} · {{ formatTime(track.duration) }}</p>
            </div>
            <!-- Clicking A or B loads this song into that deck, for everyone in the room -->
            <!-- Simple mode: one "Use" button. DJ booth: choose Deck A or Deck B -->
            <!-- While that song downloads, its button shows a spinner -->
            <button v-if="!djMode" type="button" class="btn btn-sm btn-primary btn-use flex-shrink-0" @click="pickTrack('A', track)">
              <span v-if="isLoadingOn('A', track)" class="spinner-border spinner-border-sm btn-spinner" aria-hidden="true"></span>
              <AppIcon v-else name="plus" :size="14" :stroke-width="2.5" />
              {{ isLoadingOn('A', track) ? 'Loading' : 'Use' }}
            </button>
            <template v-else>
              <button class="btn btn-sm btn-deck-a flex-shrink-0" :aria-label="isLoadingOn('A', track) ? 'Loading on Deck A' : 'Load on Deck A'" @click="pickTrack('A', track)">
                <span v-if="isLoadingOn('A', track)" class="spinner-border spinner-border-sm btn-spinner" aria-hidden="true"></span>
                <template v-else>A</template>
              </button>
              <button class="btn btn-sm btn-deck-b flex-shrink-0" :aria-label="isLoadingOn('B', track) ? 'Loading on Deck B' : 'Load on Deck B'" @click="pickTrack('B', track)">
                <span v-if="isLoadingOn('B', track)" class="spinner-border spinner-border-sm btn-spinner" aria-hidden="true"></span>
                <template v-else>B</template>
              </button>
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
/* Deck A is the brand blue and deck B is orange: opposite colours, so the two are easy to tell apart.
   (Orange, not ink: a near-black label disappears on the black record.) */
.text-deck-a { color: var(--brand); }   
.text-deck-b { color: #F76B15; }
.btn-deck-a {
  --bs-btn-color: #fff;
  --bs-btn-bg: var(--brand);
  --bs-btn-border-color: var(--brand);
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: var(--brand-dark);
  --bs-btn-hover-border-color: var(--brand-dark);
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: var(--brand-dark);
  --bs-btn-active-border-color: var(--brand-dark);
}
.btn-deck-b {
  --bs-btn-color: #fff;
  --bs-btn-bg: #F76B15;
  --bs-btn-border-color: #F76B15;
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: #D85A0C;
  --bs-btn-hover-border-color: #D85A0C;
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: #D85A0C;
  --bs-btn-active-border-color: #D85A0C;
}

/* Simple / DJ booth: a two-option switch, the picked one filled blue */
.mode-switch {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  border-radius: 999px;
  background: var(--brand-tint, #E8EEFF);
}

.mode-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  color: var(--brand, #2F5BEA);
  background: transparent;
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-out);
}

.mode-option.active {
  color: #fff;
  background: var(--brand, #2F5BEA);
  box-shadow: 0 2px 6px rgba(47, 91, 234, 0.3);
}

.mode-option:active {
  transform: scale(0.97);
}

.mode-option:focus-visible {
  outline: 2px solid var(--brand, #2F5BEA);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .mode-option:not(.active):hover {
    background: rgba(47, 91, 234, 0.12);
  }
}

/* The song being downloaded: a blue outline on its row */
.track.track-loading {
  border-color: var(--brand, #2F5BEA) !important;
  background-color: var(--brand-tint, #E8EEFF);
}

.btn-spinner {
  width: 12px;
  height: 12px;
  border-width: 2px;
}

/* The song's "Use" button: filled, so it reads as the thing to tap */
.btn-use {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  font-weight: 700;
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

/* Song rows lift a little on hover, so you can tell they can be picked */
.track {
  transition: background-color 150ms ease, transform 160ms var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .track:hover {
    background-color: var(--soft);
    transform: translateY(-1px);
  }
}

/* Not in syllabus: Vue's <Transition> adds these classes while the DJ booth columns appear (enter) or disappear (leave) */
.deck-enter-active {
  transition: opacity 250ms ease, transform 250ms var(--ease-out);
}

.deck-leave-active {
  transition: opacity 150ms ease;   /* leaving is quicker, so it doesn't get in the way */
}

.deck-enter-from {
  opacity: 0;
  transform: translateX(16px);      /* starts a little to the right, then slides into place */
}

.deck-leave-to {
  opacity: 0;
}

/* People who turned on "Reduce motion" on their device: no movement */
@media (prefers-reduced-motion: reduce) {
  .track,
  .mode-option,
  .deck-enter-active,
  .deck-leave-active {
    transition: none;
  }

  .track:hover {
    transform: none;
  }
}

/* A phone turned sideways (short and wide). Safari leaves out the Dynamic Island, so the page is about
   750px wide: under Bootstrap's md (768px), so col-md-5 would not apply and the decks would stack.
   Put the DJ booth side by side anyway, like a laptop: Deck A 5 | mixer 2 | Deck B 5 (of 12 columns).
   .deck-col.col-md-5 = only in the DJ booth (in simple mode Deck A has no col-md-5, so it stays full width). */
@media (max-height: 500px) and (orientation: landscape) {
  .deck-col.col-md-5 {
    width: 41.66666667%; /* the same numbers Bootstrap uses (41.67% + 16.67% + 41.67% is over 100%, so Deck B wrapped) */
  }

  .mixer-col {
    width: 16.66666667%;
  }

  /* The mixer is only about 125px wide here: no extra space between letters, so "CROSSFADER" fits on one line */
  .mixer-label {
    letter-spacing: 0;
  }
}
</style>