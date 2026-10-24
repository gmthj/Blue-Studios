<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName, getDeviceType } from '../guest.js'
import { getUid } from '../composables/useAuth.js'
import { isRoomFull, MAX_PEOPLE } from '../room.js'
import { useRoom, ROOM_STAGES } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'
import VideoCallCard from '../components/VideoCallCard.vue'
import MessagePage from '../components/MessagePage.vue'

// The parent page for everything inside a room (/room/:code/shoot, /room/:code/pick, /room/:code/decorate).
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

const { room, enterRoom, exitRoom, saveProgress } = useRoom()
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

// "Try again" on the room-full message: load the page again, so it checks for a free place again
function tryAgain() {
  window.location.reload()
}

// Leaving the room (Leave button, closed room, or going to another website page): end the call
onBeforeUnmount(() => {
  endCall()
  exitRoom(false)
})

// Everyone in the room follows the room's "stage", so the whole group moves pages together.
// A stage's page is /room/{code}/{stage}, e.g. /room/4821/pick (ROOM_STAGES in useRoom.js, routes in router.js).
function followStage() {
  if (status.value !== 'ready' || !room.value) return

  if (room.value.closed) {
    router.push('/?closed=' + code)
    return
  }

  saveProgress() // remember how far the room has got (for the stage bar)

  const stage = ROOM_STAGES.find((item) => item.id === room.value.stage)
  if (!stage || !stage.hasPage) return // no page for this stage yet: stay where we are

  const target = '/room/' + code + '/' + stage.id
  if (route.path !== target) {
    router.push(target)
  }
}

// Check again whenever the room document changes, or the URL changes
watch(room, followStage)
watch(() => route.path, followStage)
</script>

<template>
  <!-- Joining, or could not join: a message in the middle of the page (MessagePage.vue) -->
  <MessagePage v-if="status === 'loading'" loading :title="'Joining room ' + code">
    Getting the room and your camera ready...
  </MessagePage>

  <MessagePage v-else-if="status === 'notFound'" icon="search" :title="'Room ' + code + ' doesn\'t exist'">
    Check the code with whoever invited you. Codes are 4 digits.
    <template #actions>
      <router-link to="/" class="btn btn-primary">Enter another code</router-link>
    </template>
  </MessagePage>

  <MessagePage v-else-if="status === 'closed'" icon="lock" :title="'Room ' + code + ' has ended'">
    The host closed this room, so nobody can join it any more.
    <template #actions>
      <router-link to="/" class="btn btn-primary">Start or join another room</router-link>
    </template>
  </MessagePage>

  <MessagePage v-else-if="status === 'full'" icon="users" :title="'Room ' + code + ' is full'">
    A room fits up to {{ MAX_PEOPLE }} people. Try again when someone leaves, or start your own room.
    <template #actions>
      <button class="btn btn-primary" @click="tryAgain">Try again</button>
      <router-link to="/" class="btn btn-outline-secondary">Start my own room</router-link>
    </template>
  </MessagePage>

  <template v-else>
    <!-- The child page: RoomView (camera), StripView (photostrip) or DecorateView -->
    <router-view />

    <!-- The video call window floats over every child page, so it is only here once -->
    <VideoCallCard />
  </template>
</template>
