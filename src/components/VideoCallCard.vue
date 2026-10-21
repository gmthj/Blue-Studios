<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'
import { getUid } from '../composables/useAuth.js'
import { MAX_PEOPLE } from '../room.js'
import VideoTile from './VideoTile.vue'

// The video call window: everyone in the room (live video, name, device, mute icon),
// plus the mute/unmute, leave and close room buttons, all in a small title bar to save space.
// It floats over the page (position: fixed). Drag the title bar to put it anywhere on the screen,
// and drag the grip in the bottom-right corner to resize it.
// The "–" button minimises it to just the title bar. The call keeps running while minimised.
// It is shown once by RoomLayout.vue, so it is on every page inside a room.

const router = useRouter()
const uid = getUid()
const { room, activeMembers, roomRef, exitRoom } = useRoom()
const { micOn, micBusy, toggleMic, callError } = useVideoCall()

// The position and minimised state are remembered on this device (localStorage), so they stay the same
// when moving between pages. try/catch because some browsers block localStorage (e.g. private mode).
function loadSetting(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not saved: it just goes back to the default next time
  }
}

// Phones (narrower than Bootstrap "sm", 576px) start minimised, so the call does not cover the page
const minimised = ref(loadSetting('callMinimised', window.innerWidth < 576 ? 'yes' : 'no') === 'yes')

async function toggleMinimised() {
  minimised.value = !minimised.value
  saveSetting('callMinimised', minimised.value ? 'yes' : 'no')
  await nextTick()  // wait for the new size...
  keepOnScreen()    // ...then make sure it did not grow off the bottom / right of the screen
}

// ---------- POSITION AND DRAGGING ----------
// pos = the window's top-left corner, in pixels from the top-left of the screen
const EDGE = 8 // gap kept between the window and the edge of the screen
const windowEl = ref(null)
const pos = ref({ x: 0, y: 0 })
const dragging = ref(false)
let grabOffset = { x: 0, y: 0 } // where on the window the pointer grabbed it

// Moves the window back inside the screen (after dragging, resizing the browser, or un-minimising)
function keepOnScreen() {
  if (!windowEl.value) return
  const maxX = window.innerWidth - windowEl.value.offsetWidth - EDGE
  const maxY = window.innerHeight - windowEl.value.offsetHeight - EDGE
  pos.value = {
    x: Math.max(EDGE, Math.min(pos.value.x, maxX)),
    y: Math.max(EDGE, Math.min(pos.value.y, maxY)),
  }
}

function startDrag(event) {
  // Only the title bar starts a drag, not the buttons in it
  if (event.target.closest('button')) return
  grabOffset = { x: event.clientX - pos.value.x, y: event.clientY - pos.value.y }
  dragging.value = true
  // Pointer capture: keep getting pointermove events even if the pointer leaves the title bar
  event.currentTarget.setPointerCapture(event.pointerId)
}

function onDrag(event) {
  if (!dragging.value) return
  pos.value = { x: event.clientX - grabOffset.x, y: event.clientY - grabOffset.y }
  keepOnScreen()
}

function endDrag() {
  if (!dragging.value) return
  dragging.value = false
  saveSetting('callPos', JSON.stringify(pos.value))
}

// ---------- RESIZING ----------
// Drag the grip in the bottom-right corner to make the window wider or narrower.
// Only the width is set: the height follows, because every tile keeps its 4:3 shape.
const MIN_WIDTH = 160
const width = ref(Number(loadSetting('callWidth', '300')) || 300)
const resizing = ref(false)
let resizeStart = { x: 0, width: 0 }

// Never narrower than MIN_WIDTH, never wider than the screen
function clampWidth(w) {
  return Math.max(MIN_WIDTH, Math.min(w, window.innerWidth - EDGE * 2))
}

function startResize(event) {
  resizeStart = { x: event.clientX, width: windowEl.value.offsetWidth }
  resizing.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
}

async function onResize(event) {
  if (!resizing.value) return
  width.value = clampWidth(resizeStart.width + event.clientX - resizeStart.x)
  await nextTick() // wait for the new size...
  keepOnScreen()   // ...then pull it back in if it grew off the right / bottom of the screen
}

function endResize() {
  if (!resizing.value) return
  resizing.value = false
  saveSetting('callWidth', String(width.value))
}

// When the browser window changes size: keep the window narrower than the screen, and on the screen
async function onWindowResize() {
  width.value = clampWidth(width.value)
  await nextTick()
  keepOnScreen()
}

onMounted(() => {
  // Start where it was last time, or in the bottom-right corner the first time
  try {
    pos.value = JSON.parse(loadSetting('callPos', ''))
  } catch {
    pos.value = { x: window.innerWidth, y: window.innerHeight } // keepOnScreen pulls it into the corner
  }
  onWindowResize()
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
})

// ---------- CALL BUTTONS ----------
// The host can always close the room. If the host has left, anyone can (so the room is not stuck open).
const canCloseRoom = computed(() => {
  const hostIsHere = activeMembers.value.some((member) => member.id === room.value.hostId)
  return room.value.hostId === uid || !hostIsHere
})

async function leaveRoom() {
  await exitRoom(true) // true: remove me from the members list straight away
  router.push('/')     // RoomLayout.vue then ends the video call
}

// Closing the room ends the video call for everyone (saves Agora minutes) and stops new people joining.
// Every device sees closed: true in the room document and goes back to the home page (see RoomLayout.vue).
async function closeRoom() {
  if (!confirm('Close this room for everyone? The video call will end.')) return
  await updateDoc(roomRef(), { closed: true })
}
</script>

<template>
  <div
    ref="windowEl"
    class="call-window card shadow"
    :class="{ minimised, dragging: dragging || resizing }"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', width: minimised ? 'auto' : width + 'px' }"
  >
    <!-- Title bar: drag it to move the window. All the buttons live here to save space. -->
    <div
      class="call-titlebar d-flex align-items-center gap-1"
      title="Drag to move"
      @pointerdown="startDrag"
      @pointermove="onDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
    >
      <span class="drag-dots" aria-hidden="true">⠿</span>
      <span class="small fw-semibold me-auto" :title="'In this room: ' + activeMembers.length + ' of ' + MAX_PEOPLE">
        👥 {{ activeMembers.length }}/{{ MAX_PEOPLE }}
      </span>

      <button
        class="btn btn-sm bar-btn"
        :class="micOn ? 'btn-success' : 'btn-outline-secondary'"
        :disabled="micBusy"
        :title="micOn ? 'Mute' : 'Unmute'"
        :aria-label="micOn ? 'Mute' : 'Unmute'"
        @click="toggleMic"
      >
        {{ micOn ? '🎤' : '🔇' }}
      </button>
      <template v-if="!minimised">
        <button class="btn btn-sm btn-outline-secondary bar-btn" @click="leaveRoom">Leave</button>
        <button v-if="canCloseRoom" class="btn btn-sm btn-outline-danger bar-btn" @click="closeRoom">Close</button>
      </template>
      <button
        class="btn btn-sm btn-outline-secondary bar-btn"
        :title="minimised ? 'Show the call' : 'Minimise'"
        :aria-label="minimised ? 'Show the call' : 'Minimise'"
        @click="toggleMinimised"
      >
        {{ minimised ? '▢' : '–' }}
      </button>
    </div>

    <!-- v-show, not v-if: the videos stay on the page while minimised, so they do not have to reconnect -->
    <div v-show="!minimised" class="call-body">
      <p v-if="callError" class="text-danger small mb-1">{{ callError }}</p>

      <div class="tiles">
        <VideoTile
          v-for="member in activeMembers"
          :key="member.id"
          :member="member"
          :is-self="member.id === uid"
          :is-host="member.id === room.hostId"
        />
      </div>
    </div>

    <!-- Resize grip (bottom-right corner) -->
    <div
      v-show="!minimised"
      class="resize-grip"
      title="Drag to resize"
      @pointerdown="startResize"
      @pointermove="onResize"
      @pointerup="endResize"
      @pointercancel="endResize"
    ></div>
  </div>
</template>

<style scoped>
/* position: fixed = floats over the page and stays put when the page scrolls (left / top are set by the script).
   z-index 1040: above the page (and the shutter button), below Bootstrap modals (1055)
   and the camera countdown (2000+). */
.call-window {
  position: fixed;
  z-index: 1040;
  max-width: calc(100vw - 16px); /* never wider than the screen (the width is set by the script) */
  overflow: hidden;
}

.call-window.dragging {
  opacity: 0.85;
}

/* The title bar is the drag handle. touch-action: none stops phones scrolling the page while dragging. */
.call-titlebar {
  padding: 3px 4px;
  background: var(--bs-tertiary-bg);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.call-window.dragging .call-titlebar {
  cursor: grabbing;
}

.drag-dots {
  color: #8A90A0;
  padding: 0 2px;
}

/* Small buttons, so they all fit on one line */
.bar-btn {
  padding: 0 6px;
  font-size: 0.75rem;
  line-height: 1.6;
}

/* If there are lots of people, the tiles scroll inside the window instead of going off the screen */
.call-body {
  padding: 4px;
  max-height: 60vh;
  max-height: 60dvh;
  overflow-y: auto;
}

/* As many columns as fit (each tile at least 110px wide), all the same width.
   auto-fit drops the empty columns, so 1 person fills the whole width instead of leaving a gap on the right. */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 4px;
}

/* Resize grip: a small triangle in the bottom-right corner, sitting on top of the tiles.
   touch-action: none stops phones scrolling the page while resizing. */
.resize-grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  touch-action: none;
  background: linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.8) 50%);
}

/* Phones held sideways are short, so the tiles get less of the height */
@media (orientation: landscape) and (max-height: 500px) {
  .call-body {
    max-height: 45vh;
    max-height: 45dvh;
  }
}
</style>
