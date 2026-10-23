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
// and drag the grip in its bottom corner to resize it.
// The "–" button (or double-clicking the title bar) minimises it to just the title bar. The call keeps running while minimised.
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
  keepOnScreen()    // ...then make sure it did not grow off the screen
}

// Double-click the title bar (not a button) to minimise / show the call, like a window on a computer
function onTitleDoubleClick(event) {
  if (event.target.closest('button')) return
  toggleMinimised()
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

// ---------- POSITION AND DRAGGING ----------
// The window is "docked" to the corner of the screen it is closest to:
//   dock.right / dock.bottom = which corner (false = left / top)
//   dock.x / dock.y          = the gap in pixels between the window and those two edges of the screen
// So when the window changes size (minimise, resize, someone joins) or the screen changes size
// (phone turned sideways), it stays in its corner and grows / shrinks towards the middle of the screen.
const EDGE = 8  // smallest gap between the window and the edge of the screen
const SNAP = 24 // dragged closer than this to an edge: it sticks to the edge
const windowEl = ref(null)
const dock = ref(loadDock())
const dragging = ref(false)
let dragPointer = null           // the finger / mouse doing the drag or resize (other fingers are ignored)
let grabOffset = { x: 0, y: 0 }  // where on the window the pointer grabbed it

// Where it was last time, or the bottom-right corner the first time
function loadDock() {
  try {
    const saved = JSON.parse(loadSetting('callDock', ''))
    if (typeof saved.x === 'number' && typeof saved.y === 'number') return saved
  } catch {
    // nothing saved yet: use the default below
  }
  return { x: EDGE, y: EDGE, right: true, bottom: true }
}

// left / right and top / bottom for the style, depending on the corner it is docked to
const windowStyle = computed(() => {
  const style = { width: minimised.value ? 'auto' : width.value + 'px' }
  style[dock.value.right ? 'right' : 'left'] = dock.value.x + 'px'
  style[dock.value.bottom ? 'bottom' : 'top'] = dock.value.y + 'px'
  return style
})

// Moves the window back inside the screen (after resizing it, un-minimising, or the screen changing size)
function keepOnScreen() {
  if (!windowEl.value) return
  const maxX = window.innerWidth - windowEl.value.offsetWidth - EDGE
  const maxY = window.innerHeight - windowEl.value.offsetHeight - EDGE
  dock.value = { ...dock.value, x: clamp(dock.value.x, EDGE, maxX), y: clamp(dock.value.y, EDGE, maxY) }
}

function startDrag(event) {
  // Only the title bar starts a drag, not the buttons in it. A second finger is ignored, or the window would jump.
  if (event.target.closest('button') || dragPointer !== null) return
  const box = windowEl.value.getBoundingClientRect()
  grabOffset = { x: event.clientX - box.left, y: event.clientY - box.top }
  dragPointer = event.pointerId
  dragging.value = true
  // Pointer capture: keep getting pointermove events even if the pointer leaves the title bar
  event.currentTarget.setPointerCapture(event.pointerId)
}

function onDrag(event) {
  if (!dragging.value || event.pointerId !== dragPointer) return
  const w = windowEl.value.offsetWidth
  const h = windowEl.value.offsetHeight

  // Where its top-left corner would be, kept on the screen
  const left = clamp(event.clientX - grabOffset.x, EDGE, window.innerWidth - w - EDGE)
  const top = clamp(event.clientY - grabOffset.y, EDGE, window.innerHeight - h - EDGE)

  // Dock to the closest corner: is the middle of the window in the right half / bottom half of the screen?
  const right = left + w / 2 > window.innerWidth / 2
  const bottom = top + h / 2 > window.innerHeight / 2
  let x = right ? window.innerWidth - w - left : left
  let y = bottom ? window.innerHeight - h - top : top

  // Close to an edge: stick to it
  if (x < SNAP) x = EDGE
  if (y < SNAP) y = EDGE
  dock.value = { x, y, right, bottom }
}

function endDrag(event) {
  if (!dragging.value || event.pointerId !== dragPointer) return
  dragging.value = false
  dragPointer = null
  saveSetting('callDock', JSON.stringify(dock.value))
}

// ---------- RESIZING ----------
// Drag the grip in the bottom corner to make the window wider or narrower. The grip is on the side
// facing the middle of the screen (bottom-left when docked on the right), so the window grows away from its edge.
// Only the width is set: the height follows, because every tile keeps its 4:3 shape.
const MIN_WIDTH = 220 // wide enough for all the title bar buttons on one line
const width = ref(Number(loadSetting('callWidth', '')) || defaultWidth())
const resizing = ref(false)
let resizeStart = { x: 0, width: 0 }

// The first time: about a fifth of the screen, but at least 260px (2 tiles side by side) and at most 400px.
// Short screens (phones held sideways) get a wider window, because the tiles have to go 3 across to fit the height.
function defaultWidth() {
  const share = window.innerHeight <= 500 ? 0.4 : 0.22
  return Math.round(clamp(window.innerWidth * share, 260, 400))
}

// Never narrower than MIN_WIDTH, never wider than the screen
function clampWidth(w) {
  return Math.max(MIN_WIDTH, Math.min(w, window.innerWidth - EDGE * 2))
}

function startResize(event) {
  if (dragPointer !== null) return
  resizeStart = { x: event.clientX, width: windowEl.value.offsetWidth }
  dragPointer = event.pointerId
  resizing.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
}

async function onResize(event) {
  if (!resizing.value || event.pointerId !== dragPointer) return
  // Docked on the right, the grip is on the left: dragging it left makes the window wider
  const moved = event.clientX - resizeStart.x
  width.value = clampWidth(resizeStart.width + (dock.value.right ? -moved : moved))
  await nextTick() // wait for the new size...
  keepOnScreen()   // ...then pull it back in if it grew off the screen
}

function endResize(event) {
  if (!resizing.value || event.pointerId !== dragPointer) return
  resizing.value = false
  dragPointer = null
  saveSetting('callWidth', String(width.value))
}

// ---------- TILE LAYOUT ----------
// How many tiles go across. The rows are balanced (4 people: 2 + 2, not 3 + 1), and the tiles never
// make the window taller than the screen allows: a phone held sideways gets more, smaller tiles across
// instead of having to scroll. A shorter last row is centred (see .tiles in the CSS).
const MIN_TILE = 96 // narrowest a tile gets because of the width (in pixels)
const GAP = 6       // space between the tiles, and around them (same as the CSS)
const screenHeight = ref(window.innerHeight)

const columns = computed(() => {
  const count = Math.max(activeMembers.value.length, 1)
  const inner = width.value - GAP * 2 - 2 // minus the padding and the 1px border
  const fitAcross = Math.max(1, Math.floor((inner + GAP) / (MIN_TILE + GAP)))

  // As few rows as possible, then the tiles spread evenly over those rows
  const rows = Math.ceil(count / Math.min(count, fitAcross))
  let across = Math.ceil(count / rows)

  // Too tall? Put more across (smaller tiles) until it fits.
  // The tiles get 60% of the screen height (45% on short screens, like phones held sideways), the same as
  // the max-height of .call-body in the CSS, minus its padding.
  const maxHeight = screenHeight.value * (screenHeight.value <= 500 ? 0.45 : 0.6) - GAP
  while (across < count && tilesHeight(count, across, inner) > maxHeight) {
    across++
  }
  return across
})

// Height of all the rows of tiles, if `across` tiles go in each row
function tilesHeight(count, across, inner) {
  const rows = Math.ceil(count / across)
  const tileWidth = (inner - GAP * (across - 1)) / across
  return rows * tileWidth * 0.75 + GAP * (rows - 1) // tiles are 4:3, so the height is 3/4 of the width
}

// When the screen changes size (browser window resized, phone turned): keep the window narrower than
// the screen, and on the screen
async function onWindowResize() {
  screenHeight.value = window.innerHeight
  width.value = clampWidth(width.value)
  await nextTick()
  keepOnScreen()
}

onMounted(() => {
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
    :style="windowStyle"
  >
    <!-- Title bar: drag it to move the window. All the buttons live here to save space. -->
    <div
      class="call-titlebar d-flex align-items-center"
      title="Drag to move"
      @pointerdown="startDrag"
      @pointermove="onDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @dblclick="onTitleDoubleClick"
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
        <span>{{ activeMembers.length }}<span class="people-max">/{{ MAX_PEOPLE }}</span></span>
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

      <!-- --columns: how many tiles go across (worked out in the script, see TILE LAYOUT) -->
      <div class="tiles" :style="{ '--columns': columns }">
        <VideoTile
          v-for="member in activeMembers"
          :key="member.id"
          :member="member"
          :is-self="member.id === uid"
          :is-host="member.id === room.hostId"
        />
      </div>
    </div>

    <!-- Resize grip: bottom corner, on the side facing the middle of the screen -->
    <div
      v-show="!minimised"
      class="resize-grip"
      :class="dock.right ? 'grip-left' : 'grip-right'"
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

/* --columns tiles across, all the same width (set by the script). Flexbox, not grid,
   so a shorter last row is centred instead of leaving a gap on the right. */
.tiles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.tiles > * {
  flex: 0 0 calc((100% - (var(--columns) - 1) * 6px) / var(--columns));
}

/* Resize grip: two short diagonal lines in a bottom corner, sitting on top of the tiles.
   touch-action: none stops phones scrolling the page while resizing. */
.resize-grip {
  position: absolute;
  bottom: 0;
  width: 18px;
  height: 18px;
  touch-action: none;
  opacity: 0.6;
  transition: opacity 150ms ease;
}

.grip-right {
  right: 0;
  cursor: nwse-resize;
  background: linear-gradient(
    135deg,
    transparent 55%, #ffffff 55%, #ffffff 62%, transparent 62%,
    transparent 75%, #ffffff 75%, #ffffff 82%, transparent 82%
  );
}

.grip-left {
  left: 0;
  cursor: nesw-resize;
  background: linear-gradient(
    225deg,
    transparent 55%, #ffffff 55%, #ffffff 62%, transparent 62%,
    transparent 75%, #ffffff 75%, #ffffff 82%, transparent 82%
  );
}

.resize-grip:hover,
.call-window.dragging .resize-grip {
  opacity: 1;
}

/* Short screens (like phones held sideways): the tiles get less of the height (the script uses the same 500px) */
@media (max-height: 500px) {
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
