<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName, getDeviceType } from '../guest.js'
import { getUid } from '../composables/useAuth.js'
import { isRoomFull, MAX_PEOPLE } from '../room.js'
import { getItem } from '../marketplace.js'
import { templateFrameFields } from '../studio.js'
import { saveFields } from '../stripData.js'
import { showNotice } from '../composables/useDialog.js'
import { useRoom, ROOM_STAGES } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'
import { useFullscreen } from '../composables/useFullscreen.js'
import VideoCallCard from '../components/VideoCallCard.vue'
import MessagePage from '../components/MessagePage.vue'

// The parent page for everything inside a room (/room/:code/shoot, /room/:code/pick, /room/:code/video, /decorate, /music, /export).
// It joins the room and starts the video call ONCE. The child pages (RoomView, StripView)
// are shown in <router-view>, so moving between them does not drop the call.
// New room features can be added as more child pages in router.js.

const route = useRoute()
const router = useRouter()

const code = route.params.code
const uid = getUid()
const guestName = getGuestName()

// "Use template" (marketplace / My Studio) makes the room with /room/4821/shoot?template={id}:
// that template becomes the room's photostrip frame (see applyStartTemplate below)
const startTemplateId = typeof route.query.template === 'string' ? route.query.template : ''

// 'loading' | 'ready' | 'notFound' | 'full' | 'closed'
const status = ref('loading')

const { room, roomRef, enterRoom, exitRoom, saveProgress } = useRoom()
const { startCall, endCall } = useVideoCall()
const { exitFullscreen } = useFullscreen()

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
  applyStartTemplate(roomSnap.data())

  // Start the video call (not awaited, so the page shows while the call connects)
  startCall(code, uid)
})

// The host's new room starts with the template from "Use template", already chosen on the Pick page.
// Only if the room has no frame yet (so opening the same link again later changes nothing).
// The template does not need to be saved to My Studio: public ones can be read by anyone.
async function applyStartTemplate(roomData) {
  if (!startTemplateId) return
  // Take ?template= off the URL, so a refresh doesn't try again
  const query = { ...route.query }
  delete query.template
  router.replace({ path: route.path, query: query })

  if (roomData.hostId !== uid || roomData.stripStyleId || roomData.stripCustomTemplate) return
  try {
    const template = await getItem('templates', startTemplateId)
    if (!template) {
      showNotice({
        title: "That template isn't available",
        message: 'It may have been made private or removed, so the room starts with the default frame.',
        icon: 'layout',
      })
      return
    }
    const { fields } = await templateFrameFields(template)
    // startTemplateId: so the Pick page can list it, even for people who don't own it
    await saveFields(roomRef(), { ...fields, startTemplateId: startTemplateId })
  } catch (error) {
    console.error(error)
    showNotice({
      title: "Couldn't load the template",
      message: 'The room starts with the default frame. You can still choose a frame on the Pick page.',
      icon: 'layout',
    })
  }
}

// "Try again" on the room-full message: load the page again, so it checks for a free place again
function tryAgain() {
  window.location.reload()
}

// Leaving the room (Leave button, closed room, or going to another website page): end the call,
// and leave fullscreen so the rest of the website has its header back
onBeforeUnmount(() => {
  endCall()
  exitRoom(false)
  exitFullscreen()
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
    <!-- The child page: RoomView (camera), StripView (photostrip) or DecorateView.
         Moving to another step: the old page fades out, the new one drops in from above.
         Not in syllabus: v-slot="{ Component }" gives us the page, <component :is> shows it.
         The <div> is there because <Transition> can only animate ONE element, and most step pages
         have two at the top (the StageBar and the page). :key = a new div for each step, so it animates.
         Only the page under the StageBar moves (see the styles), so :duration tells Vue how long to wait:
         100ms for the old page to fade out, 450ms for the new one to drop in.
         appear = the first page after "Joining room..." drops in too (not in syllabus). -->
    <router-view v-slot="{ Component }">
      <Transition name="step" mode="out-in" appear :duration="{ enter: 450, leave: 100 }">
        <div :key="route.path">
          <component :is="Component" />
        </div>
      </Transition>
    </router-view>

    <!-- The video call window floats over every child page, so it is only here once -->
    <VideoCallCard />
  </template>
</template>

<style scoped>
/* Next step: the stage bar stays still. Everything under it (.stage-bar ~ * = whatever comes after the bar)
   fades out quickly; the new page appears (150ms), then gently drops down from above (450ms).
   :deep() = these elements are inside the step pages, not in this file (scoped styles need it to reach them).
   cubic-bezier(0.23, 1, 0.32, 1) = the team's --ease-out (that variable is only set inside .app-page) */
.step-enter-active :deep(.stage-bar ~ *) {
  transition: opacity 150ms ease, transform 450ms cubic-bezier(0.23, 1, 0.32, 1);
}

.step-leave-active :deep(.stage-bar ~ *) {
  transition: opacity 100ms ease;
}

.step-enter-from :deep(.stage-bar ~ *) {
  opacity: 0;
  transform: translateY(-12px);
}

.step-leave-to :deep(.stage-bar ~ *) {
  opacity: 0;
}

/* People who turned on "Reduce motion" on their device: the step changes without moving */
@media (prefers-reduced-motion: reduce) {
  .step-enter-active :deep(.stage-bar ~ *),
  .step-leave-active :deep(.stage-bar ~ *) {
    transition: none;
  }

  .step-enter-from :deep(.stage-bar ~ *) {
    transform: none;
  }
}
</style>
