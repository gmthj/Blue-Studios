<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName, saveGuestName } from '../guest.js'
import { getUid } from '../composables/useAuth.js'
import { isRoomFull, MAX_PEOPLE } from '../room.js'

const route = useRoute()
const router = useRouter()

const name = ref(getGuestName())
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
  <div class="row justify-content-center">
    <div class="col-12 col-md-8 col-lg-6">
      <h1 class="h3 text-center mb-4">Take a photostrip together, from anywhere</h1>

      <div v-if="closedCode" class="alert alert-info">Room {{ closedCode }} was closed.</div>

      <div class="card mb-3">
        <div class="card-body">
          <label for="nameInput" class="form-label">Your name</label>
          <input id="nameInput" v-model="name" type="text" class="form-control" placeholder="e.g. Gabriel" maxlength="20" />
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <h2 class="h5">Start a new room</h2>
          <p class="text-muted small">You will be the host and get a 4-digit code to share. Up to {{ MAX_PEOPLE }} people per room.</p>
          <button
            class="btn w-100"
            :class="codeComplete ? 'btn-outline-primary' : 'btn-primary'"
            :disabled="loading"
            @click="createRoom"
          >
            Create room
          </button>
        </div>
      </div>

      <!-- When a full code is typed, Join becomes the main (filled) button and Create becomes the outline one -->
      <div class="card mb-3">
        <div class="card-body">
          <h2 class="h5">Join a friend's room</h2>
          <input
            v-model="joinCode"
            type="text"
            inputmode="numeric"
            class="form-control mb-2"
            placeholder="4-digit code"
            maxlength="4"
          />
          <button
            class="btn w-100"
            :class="codeComplete ? 'btn-primary' : 'btn-outline-primary'"
            :disabled="!codeComplete || loading"
            @click="joinRoom"
          >
            Join room
          </button>
        </div>
      </div>

      <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
    </div>
  </div>
</template>
