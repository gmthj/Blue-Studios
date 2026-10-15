<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestId, getGuestName, getDeviceType } from '../guest.js'
import { isRoomFull, MAX_PEOPLE } from '../room.js'
import { useRoom } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'

// The parent page for everything inside a room (/room/:code and /room/:code/strip).
// It joins the room and starts the video call ONCE. The child pages (RoomView, StripView)
// are shown in <router-view>, so moving between them does not drop the call.
// New room features can be added as more child pages in router.js.

const route = useRoute()
const router = useRouter()

const code = route.params.code
const guestId = getGuestId()
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
  if (await isRoomFull(code, guestId)) {
    status.value = 'full'
    return
  }

  // Join the room (members list, heartbeat, room + photos listeners), then show the child page
  await enterRoom(code, guestId, guestName, getDeviceType())
  status.value = 'ready'
  followStage() // e.g. if the group is already making the photostrip, go straight there

  // Start the video call (not awaited, so the page shows while the call connects)
  startCall(code, guestId)
})

// Leaving the room (Leave button, closed room, or going to another website page): end the call
onBeforeUnmount(() => {
  endCall()
  exitRoom(false)
})

// Everyone in the room follows the room's "stage", so the whole group moves pages together:
//   'camera' = taking photos (RoomView), 'strip' = making the photostrip (StripView)
function followStage() {
  if (status.value !== 'ready' || !room.value) return

  if (room.value.closed) {
    router.push('/?closed=' + code)
    return
  }

  const stage = room.value.stage || 'camera'
  const onStripPage = route.path.endsWith('/strip')
  if (stage === 'strip' && !onStripPage) {
    router.push('/room/' + code + '/strip')
  }
  if (stage === 'camera' && onStripPage) {
    router.push('/room/' + code)
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
