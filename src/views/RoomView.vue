<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { collection, addDoc, runTransaction, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName } from '../guest.js'
import { getUid } from '../composables/useAuth.js'
import { CLIP_SECONDS, recordStream, uploadClip } from '../clips.js'
import { useRoom } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'
import StreamVideo from '../components/StreamVideo.vue'
import VideoCallCard from '../components/VideoCallCard.vue'
import RoomGallery from '../components/RoomGallery.vue'

// The camera page (a child of RoomLayout.vue, which has already joined the room and the call)
// Photo mode: everyone's camera takes a photo when the countdown ends.
// Video mode: everyone's camera records a short clip (CLIP_SECONDS) instead. Both are saved in the room gallery.
// The mode is saved in the room document (captureMode), so everyone in the room is in the same mode.

const uid = getUid()
const guestName = getGuestName()

const { code, room, roomRef } = useRoom()
const { localStream, mirrored, cameras, cameraIndex, cameraError, switchingCamera, switchCamera } = useVideoCall()

const mainVideo = ref(null) // the big camera preview (a StreamVideo component)
const recording = ref(false)    // true while my camera is recording a clip
const savingClip = ref(false)   // true while my clip is uploading
const copied = ref(false)   // shows "Link copied!" for a moment after copying

// ---------- FLASH SETTINGS: change these numbers to test and adjust the flash ----------
const FLASH_BEFORE_MS = 700 // the flash starts fading in this long BEFORE the photo (e.g. 750, 1100)
const FLASH_AFTER_MS = 500  // the flash starts fading out this long AFTER the photo (e.g. 750, 1100)
const FLASH_FADE_MS = 350    // how long the fade in and the fade out each take
const FLASH_OPACITY = 0.95    // how white the screen gets: 0 = invisible, 1 = fully white

const COUNTDOWN_SECONDS = 3
const countdown = ref(0)    // 3, 2, 1 shown on screen. 0 means no countdown running
const flash = ref(false)    // true = flash on (fading in / fully on), false = off (fading out / gone)
let countdownTimer = null
let flashOnTimer = null
let flashOffTimer = null

// The flash overlay's style. It is always on the page; only its opacity changes.
// The CSS "transition" makes the opacity change smoothly over FLASH_FADE_MS (a fade).
const flashStyle = computed(() => {
  return {
    opacity: flash.value ? FLASH_OPACITY : 0,
    transition: 'opacity ' + FLASH_FADE_MS + 'ms ease',
  }
})
let lastShotNumber = room.value.shotNumber // the last shot this device has already handled

// 'photo' or 'video'. Rooms made before this feature have no captureMode, so they are in photo mode.
const captureMode = computed(() => room.value.captureMode || 'photo')

// True while this device is busy taking the shot (the countdown, recording, or uploading the clip)
const capturing = computed(() => countdown.value > 0 || recording.value || savingClip.value)

// Join card: the website address without "https://", the join link, and its QR code (goqr.me API)
const siteAddress = window.location.host
const joinLink = window.location.origin + '/?code=' + code.value
const qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(joinLink)

// When anyone presses the shutter, shotNumber goes up, so every device starts its own 3-2-1 now
watch(
  () => room.value.shotNumber,
  (shotNumber) => {
    if (shotNumber > lastShotNumber) {
      lastShotNumber = shotNumber
      startCountdown()
    }
  }
)

onBeforeUnmount(() => {
  clearInterval(countdownTimer)
  clearTimeout(flashOnTimer)
  clearTimeout(flashOffTimer)
})

// Anyone can switch between photo and video, but not in the middle of a shot.
// The mode is saved in the room, so every device switches too.
async function setMode(mode) {
  if (capturing.value || mode === captureMode.value) return
  await updateDoc(roomRef(), { captureMode: mode })
}

// Anyone can press the shutter. If two people press at the same moment, only one countdown must start.
// A Firestore TRANSACTION reads and writes the room as one step: it only adds 1 to shotNumber
// if shotNumber is still the number I saw. If someone else got there first, it has already
// changed, so my press is ignored (their countdown is already starting on every device).
async function pressShutter() {
  if (capturing.value) return
  const seenShotNumber = room.value.shotNumber

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef())
      if (snapshot.data().shotNumber !== seenShotNumber) {
        throw new Error('Someone else already started the countdown')
      }
      transaction.update(roomRef(), {
        shotNumber: seenShotNumber + 1,
        shotStartedBy: guestName,
      })
    })
  } catch (error) {
    console.log(error.message)
  }
}

// 3 -> 2 -> 1 -> photo. The flash turns on FLASH_BEFORE_MS before the photo and turns off
// FLASH_AFTER_MS after it. The devices are not perfectly in sync (each one hears about the
// shutter a little later than the others), so a long flash makes sure every screen is still
// lit up when every device takes its photo.
function startCountdown() {
  const videoMode = captureMode.value === 'video' // decided now, so a late mode change does not matter
  countdown.value = COUNTDOWN_SECONDS
  const photoInMs = COUNTDOWN_SECONDS * 1000 // the photo is taken when the countdown reaches 0

  // Flash on, FLASH_BEFORE_MS before the photo (Math.max: never less than 0 ms from now)
  // (No flash in video mode: a white screen would cover the camera while it records)
  clearTimeout(flashOffTimer)
  if (!videoMode) {
    flashOnTimer = setTimeout(() => {
      flash.value = true
    }, Math.max(photoInMs - FLASH_BEFORE_MS, 0))
  }

  countdownTimer = setInterval(() => {
    countdown.value = countdown.value - 1

    if (countdown.value === 0) {
      clearInterval(countdownTimer)
      if (videoMode) {
        takeClip()
      } else {
        takePhoto()
      }

      // Flash off, FLASH_AFTER_MS after the photo
      flashOffTimer = setTimeout(() => {
        flash.value = false
      }, FLASH_AFTER_MS)
    }
  }, 1000)
}

async function takePhoto() {
  if (!localStream.value) return // no camera, nothing to take

  // Draw the current video frame onto a canvas, at most 640px wide to keep the file small
  const video = mainVideo.value.videoElem
  const width = 640
  const height = Math.round((video.videoHeight / video.videoWidth) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // Flip horizontally so the photo matches the mirrored preview (like a selfie)
  if (mirrored.value) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, 0, 0, width, height)

  // Turn the canvas into a JPEG image stored as text (a "data URL", about 50KB)
  const image = canvas.toDataURL('image/jpeg', 0.7)

  await addDoc(collection(db, 'rooms', code.value, 'photos'), {
    ownerId: uid, // my Firebase user id: who took this photo
    name: guestName,
    shotNumber: lastShotNumber,
    image: image,
    createdAt: Date.now(),
  })
}

// Record my camera for CLIP_SECONDS, then upload the clip. Like a photo, it belongs to this shot number.
async function takeClip() {
  if (!localStream.value) return // no camera, nothing to record

  const shotNumber = lastShotNumber
  const isMirrored = mirrored.value // the clip is flipped when shown, so it matches the mirrored preview
  recording.value = true
  try {
    const blob = await recordStream(localStream.value, CLIP_SECONDS)
    recording.value = false
    savingClip.value = true
    await uploadClip(code.value, blob, { name: guestName, shotNumber: shotNumber, mirrored: isMirrored })
  } catch (error) {
    console.error(error)
    alert('Could not save your video clip. Please try again.')
  }
  recording.value = false
  savingClip.value = false
}

async function copyJoinLink() {
  try {
    await navigator.clipboard.writeText(joinLink)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    // Some browsers block the clipboard, so show the link for the user to copy themselves
    console.error(error)
    alert('Copy this link: ' + joinLink)
  }
}
</script>

<template>
  <!-- Full-screen flash and countdown (position: fixed, so they cover the whole screen) -->
  <!-- The flash is always here but invisible (opacity 0) until it fades in, see flashStyle -->
  <div class="flash-overlay" :style="flashStyle"></div>
  <div v-if="countdown > 0" class="countdown-overlay" :class="{ 'on-flash': flash }">
    <div class="countdown-number">{{ countdown }}</div>
    <div class="countdown-by">{{ room.shotStartedBy }} pressed the shutter</div>
  </div>

  <!--
    PAGE LAYOUT with Bootstrap's grid. The page is exactly one screen tall, so the join card,
    camera and video call are always visible. Only the gallery (and the call tiles, if needed) scroll.

    xs  (phone upright):            one column: join (room code only), call, camera, gallery (sideways)
    sm / md / lg (phone sideways,   two columns: [join, call, gallery] | camera
                  tablet, laptop):
    xl  (1200px+, big screens):     three columns: [join, call] | camera | gallery
  -->
  <div class="room-page">
    <div class="row g-2 h-100 flex-column flex-sm-row flex-nowrap">
      <!-- LEFT: join card + video call (+ gallery below xl) -->
      <div class="col-12 col-sm-5 col-md-4 col-xl-3 side-col d-flex flex-column gap-2">
        <div class="card">
          <!-- Phones upright: just the room code, to leave room for the camera -->
          <div class="card-body p-2 d-sm-none">
            Room: <strong class="room-code">{{ code }}</strong>
          </div>

          <!-- Bigger screens: QR code, join address and copy link button -->
          <div class="card-body d-none d-sm-flex align-items-center gap-3 p-2">
            <img :src="qrCodeUrl" alt="QR code to join this room" class="join-qr" />
            <div>
              <p class="join-text mb-1">
                Join at <strong>{{ siteAddress }}</strong> with code
                <strong class="room-code">{{ code }}</strong>
              </p>
              <button class="btn btn-outline-primary btn-sm" @click="copyJoinLink">
                {{ copied ? 'Link copied!' : 'Copy link' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Everyone in the room: live video, mute, leave, close room -->
        <VideoCallCard class="side-call" layout="sidebar" />

        <!-- Gallery here on sm / md / lg. Hidden on xs (it goes below the camera) and on xl (its own column).
             d-sm-flex, not d-sm-block, because the gallery card is a flex column. -->
        <RoomGallery class="side-gallery d-none d-sm-flex d-xl-none" :countdown-running="capturing" />
      </div>

      <!-- MIDDLE: my camera (flex-grow-1 makes it fill the rest of the screen on phones) -->
      <div class="col-12 col-sm-7 col-md-8 col-xl-6 flex-grow-1 camera-col d-flex">
        <div class="camera-area flex-grow-1">
          <!-- :mirrored flips only the front camera, so the back camera is not flipped -->
          <StreamVideo ref="mainVideo" :stream="localStream" :mirrored="mirrored" />

          <!-- Photo / Video: the same for everyone in the room -->
          <div class="btn-group btn-group-sm mode-toggle" role="group" aria-label="Photo or video">
            <button class="btn" :class="captureMode === 'photo' ? 'btn-light' : 'btn-outline-light'" :disabled="capturing" @click="setMode('photo')">Photo</button>
            <button class="btn" :class="captureMode === 'video' ? 'btn-light' : 'btn-outline-light'" :disabled="capturing" @click="setMode('video')">Video</button>
          </div>

          <div v-if="recording" class="badge text-bg-danger rec-badge">● REC</div>
          <div v-else-if="savingClip" class="badge text-bg-secondary rec-badge">Saving clip...</div>

          <!-- Only shown if the device has more than one camera (e.g. phones with front + back) -->
          <button
            v-if="cameras.length > 1"
            class="btn btn-light btn-sm switch-camera-btn"
            :disabled="capturing || switchingCamera"
            @click="switchCamera"
          >
            Switch camera ({{ cameraIndex + 1 }}/{{ cameras.length }})
          </button>

          <div v-if="cameraError" class="alert alert-danger camera-error m-2">{{ cameraError }}</div>

        </div>
      </div>
      
      <!-- Shutter button: anyone can press it. It sits on top of the camera view. -->
      <button
        class="shutter-btn"
        :class="{ video: captureMode === 'video' }"
        :disabled="capturing"
        :aria-label="captureMode === 'video' ? 'Record a video' : 'Take a photo'"
        @click="pressShutter"
      ></button>
      <!-- BOTTOM (xs only): the gallery as a sideways row below the camera -->
      <div class="col-12 d-sm-none">
        <RoomGallery :countdown-running="capturing" />
      </div>

      <!-- RIGHT (xl only): the gallery in its own column. d-none d-xl-block = hidden until xl. -->
      <div class="d-none d-xl-block col-xl-3 h-100">
        <RoomGallery class="h-100" :countdown-running="capturing" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- PAGE HEIGHT ----------
   The page is exactly one screen tall (the Bootstrap columns inside use h-100 to fill it) */
.room-page {
  height: calc(100vh - 100px);  /* for older browsers */
  height: calc(100dvh - 100px); /* 100dvh = the visible screen height. 100px = navbar + spacing */
}

/* min-height: 0 lets a column be shorter than its content, so the content scrolls inside it */
.side-col,
.camera-col {
  min-height: 0;
}

/* Bootstrap "sm" and up (576px+): the left column is full height.
   The call card takes the space it needs (scrolls if too tall), the gallery takes the rest. */
@media (min-width: 576px) {
  .side-col {
    height: 100%;
  }

  .side-call {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .side-gallery {
    flex: 1 1 0;
    min-height: 120px;
  }
}

/* Phones held sideways: the screen is too short to fit the join card, call and gallery,
   so the call got squashed to almost nothing by the gallery. Instead, everything keeps its
   natural height and the whole left column scrolls. */
@media (orientation: landscape) and (max-height: 500px) {
  .side-col {
    overflow-y: auto;
  }

  .side-call,
  .side-gallery {
    flex: 0 0 auto;
    overflow-y: visible;
  }
}

/* ---------- JOIN CARD ---------- */
.join-qr {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}

.join-text {
  font-size: 0.9rem;
  overflow-wrap: anywhere; /* long website addresses wrap instead of overflowing */
}

.room-code {
  letter-spacing: 0.15em;
  font-size: 1.3rem;
}

/* Bootstrap "xl" and up (1200px+): bigger QR code and text */
@media (min-width: 1200px) {
  .join-qr {
    width: 110px;
    height: 110px;
  }

  .join-text {
    font-size: 1.1rem;
  }
}

/* ---------- CAMERA ---------- */
.camera-area {
  position: relative;
  min-height: 0;
  background: #000;
  border-radius: 0.375rem;
  overflow: hidden;
}

.switch-camera-btn {
  position: absolute;
  top: 10px;
  right: 10px;
}

.mode-toggle {
  position: absolute;
  top: 10px;
  left: 10px;
}

.rec-badge {
  position: absolute;
  top: 50px;
  left: 10px;
  font-size: 0.85rem;
}

.camera-error {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
}

/* ---------- SHUTTER BUTTON ----------
   Placed on top of the camera view. The page never scrolls, so it always stays in the same place.
   Default: bottom middle of the camera (computers, tablets, phones upright). */
.shutter-btn {
  position: fixed;
  /* position: absolute; */
  z-index: 10;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 6px solid #ffffff;
  background: var(--bs-primary);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.25), 0 4px 12px rgba(0, 0, 0, 0.3);
}

.shutter-btn.video {
  background: #dc3545; /* red in video mode, so it is clear the shutter records */
}

.shutter-btn:disabled {
  opacity: 0.5;
}

/* Phones held sideways: on the right edge, in the middle (like a camera app).
   Bootstrap's breakpoints only look at the screen WIDTH, so this one uses orientation + height. */
@media (orientation: landscape) and (max-height: 500px) {
  .shutter-btn {
    left: auto;
    right: 12px;
    bottom: auto;
    top: 50%;
    transform: translateY(-50%);
    width: 60px;
    height: 60px;
  }
}

/* ---------- FULL-SCREEN FLASH AND COUNTDOWN ----------
   position: fixed + inset: 0 covers the whole screen, z-index puts it above everything else */
.flash-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: #ffffff;
  pointer-events: none; /* it is always on the page, so clicks must go through it */
}

.countdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 2001; /* above the flash, so the "1" still shows on the white screen */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  text-shadow: 0 0 30px rgba(0, 0, 0, 0.7);
  pointer-events: none; /* clicks go through to the page underneath */
}

/* While the flash is on, show the countdown in light grey so the screen stays bright */
.countdown-overlay.on-flash {
  color: #cccccc;
  text-shadow: none;
}

.countdown-number {
  font-size: 40vmin; /* 40% of the shorter side of the screen */
  font-weight: bold;
  line-height: 1;
}

.countdown-by {
  font-size: 1.25rem;
}
</style>
