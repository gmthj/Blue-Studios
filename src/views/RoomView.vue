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
import RoomGallery from '../components/RoomGallery.vue'
import StageBar from '../components/StageBar.vue'
import AppIcon from '../components/AppIcon.vue'
import { showNotice } from '../composables/useDialog.js'

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
    showNotice({ title: 'Video not saved', message: 'Could not save your video clip. Please try again.' })
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
    showNotice({ title: 'Copy this link', message: 'Send it to your friends so they can join this room.', copyText: joinLink, icon: 'duplicate' })
  }
}
</script>

<template>
  <!-- The page fills the screen below the navbar: the stage bar, then the room (see .camera-page) -->
  <div class="app-page camera-page">
    <StageBar current="shoot" />

    <!-- Full-screen flash and countdown (position: fixed, so they cover the whole screen) -->
    <!-- The flash is always here but invisible (opacity 0) until it fades in, see flashStyle -->
    <div class="flash-overlay" :style="flashStyle"></div>
    <div v-if="countdown > 0" class="countdown-overlay" :class="{ 'on-flash': flash }">
      <!-- :key: a new number is a new element, so its pop-in animation plays every second -->
      <div :key="countdown" class="countdown-number">{{ countdown }}</div>
      <div class="countdown-by">{{ room.shotStartedBy }} pressed the shutter</div>
    </div>

    <!--
      PAGE LAYOUT with Bootstrap's grid. The page is exactly one screen tall, so the join card
      and camera are always visible. Only the gallery scrolls. (The video call floats over the page, see RoomLayout.vue)

      xs  (phone upright):            one column: join (room code only), camera, gallery (sideways)
      sm / md / lg (phone sideways,   two columns: [join, gallery] | camera
                    tablet, laptop):
      xl  (1200px+, big screens):     three columns: join | camera | gallery
    -->
    <div class="room-page">
      <div class="row g-2 g-md-3 h-100 flex-column flex-sm-row flex-nowrap">
        <!-- LEFT: join card (+ gallery below xl) -->
        <div class="col-12 col-sm-5 col-md-4 col-xl-3 side-col d-flex flex-column gap-2 gap-md-3">
          <div class="card join-card">
            <!-- Phones upright: just the room code, to leave room for the camera -->
            <div class="card-body join-small d-sm-none">
              <span class="join-label">Room code</span>
              <strong class="room-code">{{ code }}</strong>
              <button class="btn btn-sm btn-outline-secondary ms-auto d-inline-flex align-items-center gap-1" @click="copyJoinLink">
                <AppIcon :name="copied ? 'check' : 'duplicate'" :size="14" /> {{ copied ? 'Copied' : 'Invite' }}
              </button>
            </div>

            <!-- Bigger screens: QR code, join address and copy link button -->
            <div class="card-body join-big d-none d-sm-flex">
              <img :src="qrCodeUrl" alt="QR code to join this room" class="join-qr" />
              <div class="min-w-0">
                <span class="join-label">Invite friends</span>
                <strong class="room-code d-block">{{ code }}</strong>
                <p class="join-text">Scan, or go to <strong>{{ siteAddress }}</strong> and enter the code.</p>
                <button class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" @click="copyJoinLink">
                  <AppIcon :name="copied ? 'check' : 'duplicate'" :size="14" /> {{ copied ? 'Link copied!' : 'Copy link' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Gallery here on sm / md / lg. Hidden on xs (it goes below the camera) and on xl (its own column).
               d-sm-flex, not d-sm-block, because the gallery card is a flex column. -->
          <RoomGallery class="side-gallery d-none d-sm-flex d-xl-none" :countdown-running="capturing" />
        </div>

        <!-- MIDDLE: my camera (flex-grow-1 makes it fill the rest of the screen on phones) -->
        <div class="col-12 col-sm-7 col-md-8 col-xl-6 flex-grow-1 camera-col d-flex">
          <div class="camera-area flex-grow-1">
            <!-- :mirrored flips only the front camera, so the back camera is not flipped -->
            <StreamVideo ref="mainVideo" :stream="localStream" :mirrored="mirrored" />

            <!-- No camera (yet): a dark box with a camera icon instead of plain black -->
            <div v-if="!localStream && !cameraError" class="camera-waiting">
              <AppIcon name="camera" :size="32" />
              <span>Starting your camera...</span>
            </div>

            <!-- Photo / Video: the same for everyone in the room -->
            <div class="mode-toggle" role="group" aria-label="Photo or video">
              <button :class="{ active: captureMode === 'photo' }" :disabled="capturing" @click="setMode('photo')">Photo</button>
              <button :class="{ active: captureMode === 'video' }" :disabled="capturing" @click="setMode('video')">Video</button>
            </div>

            <div v-if="recording" class="rec-badge recording">● REC</div>
            <div v-else-if="savingClip" class="rec-badge">Saving clip...</div>

            <!-- Only shown if the device has more than one camera (e.g. phones with front + back) -->
            <button
              v-if="cameras.length > 1"
              class="glass-btn switch-camera-btn"
              :disabled="capturing || switchingCamera"
              :title="'Switch camera (' + (cameraIndex + 1) + '/' + cameras.length + ')'"
              @click="switchCamera"
            >
              <AppIcon name="refresh" :size="16" />
              <span class="d-none d-md-inline">Switch camera</span>
            </button>

            <div v-if="cameraError" class="camera-error">
              <AppIcon name="camera" :size="28" />
              <p class="mb-0">{{ cameraError }}</p>
            </div>

            <!-- Shutter button: anyone can press it. It sits on the camera view, bottom middle. -->
            <button
              class="shutter-btn"
              :class="{ video: captureMode === 'video' }"
              :disabled="capturing"
              :aria-label="captureMode === 'video' ? 'Record a video' : 'Take a photo'"
              @click="pressShutter"
            >
              <span class="shutter-inner"></span>
            </button>
          </div>
        </div>

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
  </div>
</template>

<style scoped>
/* ---------- PAGE HEIGHT ----------
   The page is exactly one screen tall below the navbar (57px tall + 24px space under it) and the
   page's bottom space (16px): the stage bar takes what it needs and the room fills the rest
   (the Bootstrap columns use h-100). */
.camera-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 81px - 16px);  /* for older browsers */
  height: calc(100dvh - 81px - 16px); /* 100dvh = the visible screen height */
  padding-bottom: 0;
}

.room-page {
  flex: 1 1 auto;
  min-height: 0;
}

/* min-height: 0 lets a column be shorter than its content, so the content scrolls inside it */
.side-col,
.camera-col {
  min-height: 0;
}

/* Bootstrap "sm" and up (576px+): the left column is full height, the gallery takes the rest of it.
   (The video call is not in this column: it floats over the page, see VideoCallCard.vue) */
@media (min-width: 576px) {
  .side-col {
    height: 100%;
  }

  .side-gallery {
    flex: 1 1 0;
    min-height: 120px;
  }
}

/* Phones held sideways: the screen is too short, so the page keeps its natural height and scrolls,
   and the left column scrolls on its own. */
@media (orientation: landscape) and (max-height: 500px) {
  .camera-page {
    height: auto;
  }

  .room-page {
    height: calc(100dvh - 32px);
  }

  .side-col {
    overflow-y: auto;
  }

  .side-gallery {
    flex: 0 0 auto;
    overflow-y: visible;
  }
}

/* ---------- JOIN CARD ---------- */
.join-small {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.join-big {
  align-items: center;
  gap: 14px;
  padding: 12px;
}

.join-qr {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #ffffff;
}

.join-label {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* The room code: big, spaced-out digits */
.room-code {
  color: var(--ink);
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  line-height: 1.2;
}

.join-text {
  margin: 2px 0 8px;
  color: var(--muted);
  font-size: 0.8rem;
  overflow-wrap: anywhere; /* long website addresses wrap instead of overflowing */
}

.min-w-0 {
  min-width: 0;
}

/* Bootstrap "xl" and up (1200px+): a bigger QR code */
@media (min-width: 1200px) {
  .join-qr {
    width: 104px;
    height: 104px;
  }

  .room-code {
    font-size: 1.8rem;
  }
}

/* ---------- CAMERA ---------- */
.camera-area {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border-radius: 20px;
  background: #0E1020;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.1), 0 12px 32px rgba(20, 23, 43, 0.12);
}

/* Shown until the camera starts */
.camera-waiting,
.camera-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
  text-align: center;
}

.camera-error {
  color: #FCA5A5;
}

/* A see-through dark button that floats on the video */
.glass-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  background: rgba(14, 16, 32, 0.55);
  backdrop-filter: blur(8px);
  font-size: 0.85rem;
  font-weight: 600;
  transition: background-color 150ms ease, transform 160ms var(--ease-out);
}

.glass-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.glass-btn:disabled {
  opacity: 0.5;
}

@media (hover: hover) and (pointer: fine) {
  .glass-btn:not(:disabled):hover {
    background: rgba(14, 16, 32, 0.75);
  }
}

.switch-camera-btn {
  position: absolute;
  top: 12px;
  right: 12px;
}

/* Photo / Video switch: top left of the camera (the switch camera button is top right) */
.mode-toggle {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: rgba(14, 16, 32, 0.55);
  backdrop-filter: blur(8px);
}

.mode-toggle button {
  padding: 5px 12px;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  background: transparent;
  font-size: 0.85rem;
  font-weight: 600;
  transition: background-color 150ms ease, color 150ms ease;
}

.mode-toggle button.active {
  color: #0E1020;
  background: #ffffff;
}

.mode-toggle button:disabled {
  opacity: 0.5;
}

/* "REC" / "Saving clip..." under the Photo / Video switch */
.rec-badge {
  position: absolute;
  top: 56px;
  left: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  color: #ffffff;
  background: rgba(14, 16, 32, 0.55);
  font-size: 0.8rem;
  font-weight: 700;
}

.rec-badge.recording {
  background: #dc3545;
}

/* ---------- SHUTTER BUTTON ----------
   On top of the camera view (position: absolute inside .camera-area).
   Default: bottom middle of the camera (computers, tablets, phones upright).
   A white ring with a blue button inside, like a camera app. */
.shutter-btn {
  position: absolute;
  z-index: 10;
  left: 50%;
  bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 76px;
  padding: 0;
  border: 4px solid #ffffff;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  box-shadow: 0 6px 20px rgba(14, 16, 32, 0.35);
  backdrop-filter: blur(6px);
  transform: translateX(-50%);
  -webkit-tap-highlight-color: transparent;
}

.shutter-inner {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--brand);
  transition: transform 160ms var(--ease-out), background-color 150ms ease;
}

/* Pressed: the inner button shrinks, like pushing a real shutter */
.shutter-btn:active:not(:disabled) .shutter-inner {
  transform: scale(0.88);
}

.shutter-btn:focus-visible {
  outline: 3px solid var(--brand);
  outline-offset: 3px;
}

.shutter-btn.video .shutter-inner {
  background: #dc3545; /* red in video mode, so it is clear the shutter records */
}

.shutter-btn:disabled {
  opacity: 0.5;
}

@media (hover: hover) and (pointer: fine) {
  .shutter-btn:not(:disabled):hover .shutter-inner {
    background: var(--brand-dark);
  }
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
    width: 62px;
    height: 62px;
  }

  .shutter-inner {
    width: 44px;
    height: 44px;
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
  gap: 12px;
  color: #ffffff;
  background: radial-gradient(circle, rgba(14, 16, 32, 0.35), rgba(14, 16, 32, 0) 60%);
  text-shadow: 0 0 40px rgba(14, 16, 32, 0.6);
  pointer-events: none; /* clicks go through to the page underneath */
}

/* While the flash is on, show the countdown in light grey so the screen stays bright */
.countdown-overlay.on-flash {
  color: #C9CEDB;
  background: none;
  text-shadow: none;
}

/* Each number pops in: a little big and see-through, to normal size */
.countdown-number {
  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  font-size: 40vmin; /* 40% of the shorter side of the screen */
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  animation: count-pop 450ms var(--ease-out);
}

@keyframes count-pop {
  from {
    opacity: 0;
    transform: scale(1.25);
  }
}

/* "Gabriel pressed the shutter" on a dark pill */
.countdown-by {
  padding: 6px 16px;
  border-radius: 999px;
  color: #ffffff;
  background: rgba(14, 16, 32, 0.55);
  backdrop-filter: blur(8px);
  font-size: 1rem;
  font-weight: 600;
  text-shadow: none;
}

.countdown-overlay.on-flash .countdown-by {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .countdown-number {
    animation: none;
  }

  .shutter-btn:active:not(:disabled) .shutter-inner,
  .glass-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
