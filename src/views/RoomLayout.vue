<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName, getDeviceType } from '../guest.js'
import { getUid } from '../composables/useAuth.js'
import { isRoomFull, MAX_PEOPLE } from '../room.js'
import { useRoom } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'

// The parent page for everything inside a room (/room/:code, /room/:code/strip, /room/:code/decorate).
// It joins the room and starts the video call ONCE. The child pages (RoomView, StripView)
// are shown in <router-view>, so moving between them does not drop the call.
// New room features can be added as more child pages in router.js.

const route = useRoute()
const router = useRouter()

const code = route.params.code
const uid = getUid()
const guestName = getGuestName()

// 'loading' | 'ready' | 'notFound' | 'full' | 'closed'
const status = ref('loading')

const { room, enterRoom, exitRoom } = useRoom()
const { startCall, endCall } = useVideoCall()

onMounted(async () => {
  // People who open a room link without a name are sent to the home page to type one
  if (guestName === '') {
    router.push('/?code=' + code)
    return
  }

  const roomSnap = await getDoc(doc(db, 'rooms', code))
  if (!roomSnap.exists()) {
    status.value = 'notFound'
    return
  }
  if (roomSnap.data().closed) {
    status.value = 'closed'
    return
  }
  if (await isRoomFull(code, uid)) {
    status.value = 'full'
    return
  }

  // Join the room (members list, heartbeat, room + photos listeners), then show the child page
  await enterRoom(code, uid, guestName, getDeviceType())
  status.value = 'ready'
  followStage() // e.g. if the group is already making the photostrip, go straight there

  // Start the video call (not awaited, so the page shows while the call connects)
  startCall(code, uid)
})

// Leaving the room (Leave button, closed room, or going to another website page): end the call
onBeforeUnmount(() => {
  endCall()
  exitRoom(false)
})

// Everyone in the room follows the room's "stage", so the whole group moves pages together.
// Each stage is the end of its page's URL (see router.js). To add a new page, add one line here.
const STAGE_PATHS = {
  camera: '',            // /room/4821          taking photos (RoomView)
  strip: '/strip',       // /room/4821/strip    choosing photos for the strip (StripView)
  decorate: '/decorate', // /room/4821/decorate filters and stickers (DecorateView)
  // PLACEHOLDER: add these when the pages are on main
  // video: '/video',    // Saw Jun Han
  // music: '/music',    // Shannon (music-mixer branch)
}

function followStage() {
  if (status.value !== 'ready' || !room.value) return

  if (room.value.closed) {
    router.push('/?closed=' + code)
    return
  }

  const stage = room.value.stage || 'camera'
  const ending = STAGE_PATHS[stage]
  if (ending === undefined) return // no page for this stage yet: stay where we are

  const target = '/room/' + code + ending
  if (route.path !== target) {
    router.push(target)
  }
}

// Check again whenever the room document changes, or the URL changes
watch(room, followStage)
watch(() => route.path, followStage)
</script>

<template>
  <p v-if="status === 'loading'" class="text-muted">Joining room {{ code }}...</p>

  <div v-else-if="status === 'notFound'" class="alert alert-warning">
    Room {{ code }} does not exist. <router-link to="/">Go back</router-link>
  </div>

  <div v-else-if="status === 'closed'" class="alert alert-warning">
    Room {{ code }} has been closed. <router-link to="/">Go back</router-link>
  </div>

  <div v-else-if="status === 'full'" class="alert alert-warning">
    Room {{ code }} is full ({{ MAX_PEOPLE }} people max). <router-link to="/">Go back</router-link>
  </div>

  <!-- The child page: RoomView (camera) or StripView (photostrip) -->
  <router-view v-else />
</template>
