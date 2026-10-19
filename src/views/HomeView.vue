<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName, saveGuestName } from '../guest.js'
import { getUid, useAuth } from '../composables/useAuth.js'
import { isRoomFull, MAX_PEOPLE } from '../room.js'

const route = useRoute()
const router = useRouter()

const { user, isAccount } = useAuth()

// The name shown in the room: the one typed last time, or an account's name (rooms allow up to 20 characters)
const name = ref(getGuestName() || user.value.displayName.slice(0, 20))
// If the user scanned the QR code, the link is /?code=1234, so we pre-fill the code
const joinCode = ref(route.query.code || '')
const errorMessage = ref('')
const loading = ref(false)

// Shown after a room is closed (RoomLayout.vue sends everyone to /?closed=1234)
const closedCode = route.query.closed || ''

// True when exactly 4 digits are typed. /^[0-9]{4}$/ means: start, 4 digits (0-9), end.
const codeComplete = computed(() => {
  return /^[0-9]{4}$/.test(joinCode.value.trim())
})

// Returns true if a name was typed, otherwise shows an error
function checkName() {
  if (name.value.trim() === '') {
    errorMessage.value = 'Please enter your name first.'
    return false
  }
  saveGuestName(name.value.trim())
  return true
}

async function createRoom() {
  errorMessage.value = ''
  if (!checkName()) return
  loading.value = true

  try {
    // Keep picking a random code from 0000 to 9999 until we find one that is not already used.
    // padStart(4, '0') adds zeros in front, e.g. 42 -> '0042'
    let code = ''
    let roomSnap = null
    do {
      code = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      roomSnap = await getDoc(doc(db, 'rooms', code))
    } while (roomSnap.exists())

    // Create the room document. The room code is used as the document id.
    await setDoc(doc(db, 'rooms', code), {
      hostId: getUid(),
      hostName: name.value.trim(),
      shotNumber: 0,   // goes up by 1 every time someone presses the shutter
      stage: 'camera', // 'camera' or 'strip': which page the whole room is on
      stripSlots: {},  // the photostrip everyone is making: { 0: photoId, 1: photoId, ... }
      closed: false,
      createdAt: Date.now(),
    })

    router.push('/room/' + code)
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not create room. Check your internet connection.'
  }
  loading.value = false
}

async function joinRoom() {
  errorMessage.value = ''
  if (!checkName()) return
  if (!codeComplete.value) return

  const code = joinCode.value.trim()
  loading.value = true
  try {
    const roomSnap = await getDoc(doc(db, 'rooms', code))
    if (!roomSnap.exists()) {
      errorMessage.value = 'Room ' + code + ' does not exist.'
    } else if (roomSnap.data().closed) {
      errorMessage.value = 'Room ' + code + ' has been closed.'
    } else if (await isRoomFull(code, getUid())) {
      errorMessage.value = 'Room ' + code + ' is full (' + MAX_PEOPLE + ' people max).'
    } else {
      router.push('/room/' + code)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not join room. Check your internet connection.'
  }
  loading.value = false
}
</script>

<template>
  <!-- Landing page: what Blue Studios is, plus creating or joining a room straight away -->
  <div class="row g-4 align-items-center mb-5">
    <div class="col-12 col-lg-6">
      <span class="badge rounded-pill text-bg-light border mb-3">Free &middot; no booth needed</span>
      <h1 class="display-5 fw-bold mb-3">Take a photostrip together, from anywhere.</h1>
      <p class="lead text-muted mb-4">
        Create a room, share a 4-digit code and shoot on one synchronised countdown, with friends on their own
        phones and laptops.
      </p>
      <div class="d-flex flex-wrap gap-2">
        <router-link v-if="isAccount" to="/studio" class="btn btn-primary btn-lg">Go to My Studio</router-link>
        <router-link v-else to="/login?mode=signup" class="btn btn-primary btn-lg">Get started</router-link>
        <a href="#how-it-works" class="btn btn-outline-secondary btn-lg">How it works</a>
      </div>
    </div>

    <div class="col-12 col-lg-6">
      <div v-if="closedCode" class="alert alert-info">Room {{ closedCode }} was closed.</div>

      <div class="card shadow-sm">
        <div class="card-body">
          <label for="nameInput" class="form-label fw-semibold">Your name</label>
          <input id="nameInput" v-model="name" type="text" class="form-control mb-4" placeholder="e.g. Gabriel" maxlength="20" />

          <h2 class="h6">Got a room code?</h2>
          <p class="text-muted small mb-2">Join your friends' room, no account needed.</p>
          <div class="input-group mb-4">
            <input
              v-model="joinCode"
              type="text"
              inputmode="numeric"
              class="form-control"
              placeholder="4-digit code"
              maxlength="4"
              @keyup.enter="joinRoom"
            />
            <!-- When a full code is typed, Join becomes the main (filled) button -->
            <button
              class="btn"
              :class="codeComplete ? 'btn-primary' : 'btn-outline-primary'"
              :disabled="!codeComplete || loading"
              @click="joinRoom"
            >
              Join
            </button>
          </div>

          <h2 class="h6">Or start a new room</h2>
          <p class="text-muted small mb-2">You will be the host and get a code to share. Up to {{ MAX_PEOPLE }} people per room.</p>
          <button
            class="btn w-100"
            :class="codeComplete ? 'btn-outline-primary' : 'btn-primary'"
            :disabled="loading"
            @click="createRoom"
          >
            Create room
          </button>

          <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0">{{ errorMessage }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Features -->
  <div id="how-it-works" class="row g-3 mb-4">
    <div class="col-12 col-md-4">
      <div class="card h-100">
        <div class="card-body">
          <h2 class="h6">Shoot together on any device</h2>
          <p class="text-muted small mb-0">Everyone joins from their own phone or laptop with a code or QR, and the countdown starts on every screen at once.</p>
        </div>
      </div>
    </div>
    <div class="col-12 col-md-4">
      <div class="card h-100">
        <div class="card-body">
          <h2 class="h6">Design your own strip</h2>
          <p class="text-muted small mb-0">Drag-and-drop frames and layouts, then fill them with the room's photos together.</p>
        </div>
      </div>
    </div>
    <div class="col-12 col-md-4">
      <div class="card h-100">
        <div class="card-body">
          <h2 class="h6">Stickers, video and music</h2>
          <p class="text-muted small mb-0">Make stickers, cut a video strip, mix a track, and share templates in the marketplace.</p>
        </div>
      </div>
    </div>
  </div>
</template>
