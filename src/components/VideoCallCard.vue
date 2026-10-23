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
const MIN_WIDTH = 220 // wide enough for all the title bar buttons on one line
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
    class="call-window"
    :class="{ minimised, dragging: dragging || resizing }"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', width: minimised ? 'auto' : width + 'px' }"
  >
    <!-- Title bar: drag it to move the window. All the buttons live here to save space. -->
    <div
      class="call-titlebar d-flex align-items-center"
      title="Drag to move"
      @pointerdown="startDrag"
      @pointermove="onDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
    >
      <!-- Grip: 6 dots, the usual sign for "you can drag this" -->
      <svg class="grip" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
      </svg>

      <!-- Green dot = the call is live -->
      <span class="people-count me-auto" :title="'In this room: ' + activeMembers.length + ' of ' + MAX_PEOPLE">
        <span class="live-dot" aria-hidden="true"></span>
        {{ activeMembers.length }}<span class="people-max">/{{ MAX_PEOPLE }}</span>
      </span>

      <!-- Mic: red while muted, so it is obvious nobody can hear you -->
      <button
        class="bar-btn"
        :class="{ 'bar-btn-muted': !micOn }"
        :disabled="micBusy"
        :title="micOn ? 'Mute' : 'Unmute'"
        :aria-label="micOn ? 'Mute' : 'Unmute'"
        @click="toggleMic"
      >
        <svg v-if="micOn" class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <path d="M12 19v3" />
        </svg>
        <svg v-else class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 2l20 20" />
          <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
          <path d="M5 10v2a7 7 0 0 0 12 5" />
          <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
          <path d="M12 19v3" />
        </svg>
      </button>

      <template v-if="!minimised">
        <!-- Leave: an "exit" arrow -->
        <button class="bar-btn" title="Leave the room" aria-label="Leave the room" @click="leaveRoom">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
        <!-- Close room: a power button, solid red because it ends the room for everyone -->
        <button
          v-if="canCloseRoom"
          class="bar-btn bar-btn-danger"
          title="Close the room for everyone"
          aria-label="Close the room for everyone"
          @click="closeRoom"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2v10" />
            <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
          </svg>
        </button>
      </template>

      <button
        class="bar-btn"
        :title="minimised ? 'Show the call' : 'Minimise'"
        :aria-label="minimised ? 'Show the call' : 'Minimise'"
        :aria-expanded="!minimised"
        @click="toggleMinimised"
      >
        <!-- Minimised: arrows pointing out (make bigger). Open: a minus (make smaller). -->
        <svg v-if="minimised" class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 3h6v6" /><path d="M9 21H3v-6" />
          <path d="M21 3l-7 7" /><path d="M3 21l7-7" />
        </svg>
        <svg v-else class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>

    <!-- v-show, not v-if: the videos stay on the page while minimised, so they do not have to reconnect -->
    <div v-show="!minimised" class="call-body">
      <p v-if="callError" class="call-error small mb-1">{{ callError }}</p>

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
/* The colours match the dark room screens in the Figma designs (navy background, Blue Studios blue) */
.call-window {
  --call-bg: #161A2E;
  --call-line: rgba(255, 255, 255, 0.08);
  --call-text: #E8EBF5;
  --call-muted-text: #8A90A0;
  --brand: #2F5BEA;
  --danger: #EF4444;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  /* position: fixed = floats over the page and stays put when the page scrolls (left / top are set by the script).
     z-index 1040: above the page (and the shutter button), below Bootstrap modals (1055)
     and the camera countdown (2000+). */
  position: fixed;
  z-index: 1040;
  max-width: calc(100vw - 16px); /* never wider than the screen (the width is set by the script) */
  overflow: hidden;
  color: var(--call-text);
  background: var(--call-bg);
  border: 1px solid var(--call-line);
  border-radius: 14px;
  /* Two shadows: a tight one for the edge, a big soft one so it looks like it floats above the page */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px rgba(10, 12, 30, 0.35);
  /* Only the lift while dragging is animated. Never left / top: the window must follow the pointer exactly. */
  transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
}

/* Picked up: lifts slightly towards you, with a bigger shadow */
.call-window.dragging {
  transform: scale(1.015);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), 0 20px 48px rgba(10, 12, 30, 0.45);
}

/* Minimised it is just one row of buttons, so it becomes a pill */
.call-window.minimised {
  border-radius: 999px;
}

/* The title bar is the drag handle. touch-action: none stops phones scrolling the page while dragging. */
.call-titlebar {
  gap: 4px;
  padding: 5px 6px 5px 4px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.call-window.dragging .call-titlebar {
  cursor: grabbing;
}

.grip {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  fill: var(--call-muted-text);
}

.people-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 4px;
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums; /* the numbers do not wiggle when they change */
  white-space: nowrap;
}

.people-max {
  color: var(--call-muted-text);
  font-weight: 500;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22C55E;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
}

/* Round icon buttons, like the camera controls in the designs */
.bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: var(--call-text);
  background: rgba(255, 255, 255, 0.08);
  -webkit-tap-highlight-color: transparent;
  transition: transform 120ms var(--ease-out), background-color 150ms ease, color 150ms ease;
}

/* Hover only with a mouse: on phones a tap would leave the button stuck in its hover colour */
@media (hover: hover) and (pointer: fine) {
  .bar-btn:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  .bar-btn-muted:hover {
    background: rgba(239, 68, 68, 0.28);
  }

  .bar-btn-danger:hover {
    background: #DC2626;
  }
}

/* Shrinks a little when pressed, so you can feel it was clicked */
.bar-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.bar-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.bar-btn:disabled {
  opacity: 0.5;
}

.bar-btn-muted {
  color: #FCA5A5;
  background: rgba(239, 68, 68, 0.18);
}

.bar-btn-danger {
  color: #ffffff;
  background: var(--danger);
}

.icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Phones and tablets: bigger buttons, easier to tap */
@media (pointer: coarse) {
  .bar-btn {
    width: 32px;
    height: 32px;
  }

  .icon {
    width: 17px;
    height: 17px;
  }
}

/* If there are lots of people, the tiles scroll inside the window instead of going off the screen */
.call-body {
  padding: 0 6px 6px;
  max-height: 60vh;
  max-height: 60dvh;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.call-error {
  color: #FCA5A5;
}

/* As many columns as fit (each tile at least 100px wide), all the same width.
   auto-fit drops the empty columns, so 1 person fills the whole width instead of leaving a gap on the right. */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 6px;
}

/* Resize grip: two short diagonal lines in the bottom-right corner, sitting on top of the tiles.
   touch-action: none stops phones scrolling the page while resizing. */
.resize-grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  touch-action: none;
  opacity: 0.6;
  transition: opacity 150ms ease;
  background: linear-gradient(
    135deg,
    transparent 55%, #ffffff 55%, #ffffff 62%, transparent 62%,
    transparent 75%, #ffffff 75%, #ffffff 82%, transparent 82%
  );
}

.resize-grip:hover,
.call-window.dragging .resize-grip {
  opacity: 1;
}

/* Phones held sideways are short, so the tiles get less of the height */
@media (orientation: landscape) and (max-height: 500px) {
  .call-body {
    max-height: 45vh;
    max-height: 45dvh;
  }
}

/* Reduced motion: no lifting or shrinking, the colours still change */
@media (prefers-reduced-motion: reduce) {
  .call-window,
  .bar-btn {
    transition-property: background-color, color, box-shadow;
  }

  .call-window.dragging,
  .bar-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
