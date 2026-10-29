<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoom } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'
import { getUid } from '../composables/useAuth.js'
import { MAX_PEOPLE } from '../room.js'
import VideoTile from './VideoTile.vue'

// The video call window: everyone in the room (live video, name, device, mute icon),
// plus the mute/unmute button, in a small title bar to save space.
// (Leave and close room are in the stage bar at the top of the page, StageBar.vue.)
// It floats over the page (position: fixed). Drag the title bar to put it anywhere on the screen,
// and drag any edge or corner to resize it, like a window on a computer.
// The "–" button (or double-clicking the title bar) minimises it to just the title bar. The call keeps running while minimised.
// It is shown once by RoomLayout.vue, so it is on every page inside a room.

const uid = getUid()
const { room, activeMembers } = useRoom()
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

// Phones (narrower than Bootstrap "sm", 576px) start minimised, so the call does not cover the page.
// localStorage only stores text, so true / false are saved as 'true' / 'false'.
const savedMinimised = loadSetting('callMinimised', '')
const minimised = ref(savedMinimised ? savedMinimised === 'true' : window.innerWidth < 576)

async function toggleMinimised() {
  minimised.value = !minimised.value
  saveSetting('callMinimised', String(minimised.value))
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
  if (!minimised.value && height.value) style.height = height.value + 'px'
  style[dock.value.right ? 'right' : 'left'] = dock.value.x + 'px'
  style[dock.value.bottom ? 'bottom' : 'top'] = dock.value.y + 'px'
  return style
})

// Moves the window back inside the screen (after resizing it, un-minimising, or the screen changing size)
function keepOnScreen() {
  if (!windowEl.value) return
  if (height.value) height.value = clampHeight(height.value)
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

  const { x, y, right, bottom } = closestDock(left, top, w, h)

  // Close to an edge: stick to it
  dock.value = { x: x < SNAP ? EDGE : x, y: y < SNAP ? EDGE : y, right, bottom }
}

// Dock to the closest corner: is the middle of the window in the right half / bottom half of the screen?
function closestDock(left, top, w, h) {
  const right = left + w / 2 > window.innerWidth / 2
  const bottom = top + h / 2 > window.innerHeight / 2
  return {
    x: right ? window.innerWidth - w - left : left,
    y: bottom ? window.innerHeight - h - top : top,
    right,
    bottom,
  }
}

function endDrag(event) {
  if (!dragging.value || event.pointerId !== dragPointer) return
  dragging.value = false
  dragPointer = null
  saveSetting('callDock', JSON.stringify(dock.value))
}

// ---------- RESIZING ----------
// Drag any edge or corner to resize the window, like a window on a computer. The edge on the other side
// stays where it is while resizing.
// Until someone drags the top or bottom edge (or a corner), the height follows the width, because every
// tile keeps its 4:3 shape. After that the height is kept too, and the tiles shrink to fit inside it.
const MIN_WIDTH = 140  // wide enough for 2 tiles side by side
const MIN_HEIGHT = 140 // the title bar and one row of small tiles
const width = ref(Number(loadSetting('callWidth', '')) || defaultWidth())
const height = ref(Number(loadSetting('callHeight', '')) || null) // null = follows the width
const resizing = ref(false)
let resizeEdges = '' // which edges are being dragged: 'n', 'se', 'w', ...
let resizeStart = { x: 0, y: 0, left: 0, top: 0, w: 0, h: 0 }

// The 8 handles: 4 edges and 4 corners (n = top, s = bottom, e = right, w = left)
const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

// The first time: about a fifth of the screen, but at least 260px (2 tiles side by side) and at most 400px.
// Short screens (phones held sideways) get a wider window, because the tiles have to go 3 across to fit the height.
function defaultWidth() {
  const share = window.innerHeight <= 500 ? 0.4 : 0.22
  return Math.round(clamp(window.innerWidth * share, 260, 400))
}

// Never smaller than the minimum, never bigger than the screen
function clampWidth(w) {
  return Math.max(MIN_WIDTH, Math.min(w, window.innerWidth - EDGE * 2))
}

function clampHeight(h) {
  return Math.max(MIN_HEIGHT, Math.min(h, window.innerHeight - EDGE * 2))
}

function startResize(event, edges) {
  if (dragPointer !== null) return
  const w = windowEl.value.offsetWidth
  const h = windowEl.value.offsetHeight
  resizeStart = {
    x: event.clientX,
    y: event.clientY,
    left: dock.value.right ? window.innerWidth - w - dock.value.x : dock.value.x,
    top: dock.value.bottom ? window.innerHeight - h - dock.value.y : dock.value.y,
    w,
    h,
  }
  resizeEdges = edges
  dragPointer = event.pointerId
  resizing.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
}

function onResize(event) {
  if (!resizing.value || event.pointerId !== dragPointer) return
  const start = resizeStart
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  const right = start.left + start.w // where the right edge started
  const bottom = start.top + start.h // where the bottom edge started
  const next = { ...dock.value }

  // Left or right edge: the other side stays put (the window is docked to it while resizing)
  if (resizeEdges.includes('w')) {
    width.value = clamp(start.w - dx, MIN_WIDTH, right - EDGE)
    next.right = true
    next.x = window.innerWidth - right
  } else if (resizeEdges.includes('e')) {
    width.value = clamp(start.w + dx, MIN_WIDTH, window.innerWidth - EDGE - start.left)
    next.right = false
    next.x = start.left
  }

  // Top or bottom edge: from now on the height is kept
  if (resizeEdges.includes('n')) {
    height.value = clamp(start.h - dy, MIN_HEIGHT, bottom - EDGE)
    next.bottom = true
    next.y = window.innerHeight - bottom
  } else if (resizeEdges.includes('s')) {
    height.value = clamp(start.h + dy, MIN_HEIGHT, window.innerHeight - EDGE - start.top)
    next.bottom = false
    next.y = start.top
  }

  dock.value = next
}

function endResize(event) {
  if (!resizing.value || event.pointerId !== dragPointer) return
  resizing.value = false
  dragPointer = null

  // Dock to the closest corner again, so it grows towards the middle of the screen when people join
  const w = windowEl.value.offsetWidth
  const h = windowEl.value.offsetHeight
  const left = dock.value.right ? window.innerWidth - w - dock.value.x : dock.value.x
  const top = dock.value.bottom ? window.innerHeight - h - dock.value.y : dock.value.y
  dock.value = closestDock(left, top, w, h)

  saveSetting('callWidth', String(width.value))
  if (height.value) saveSetting('callHeight', String(height.value))
  saveSetting('callDock', JSON.stringify(dock.value))
}

// ---------- TILE LAYOUT ----------
// How many tiles go across, and how wide each one is.
// Height follows the width: the rows are balanced (4 people: 2 + 2, not 3 + 1), and the tiles never
// make the window taller than the screen allows: a phone held sideways gets more, smaller tiles across
// instead of having to scroll.
// Height kept (someone dragged the top or bottom edge): whichever number across gives the biggest tiles
// that still fit inside the window.
// A shorter last row is centred (see .tiles in the CSS).
const MIN_TILE = 96 // narrowest a tile gets because of the width (in pixels)
const GAP = 6       // space between the tiles, and around them (same as the CSS)
const screenHeight = ref(window.innerHeight)
const titlebarEl = ref(null)
const titlebarHeight = ref(38) // measured when the window appears (it is taller on phones)

const layout = computed(() => {
  const count = Math.max(activeMembers.value.length, 1)
  const inner = width.value - GAP * 2 - 2 // minus the padding and the 1px border

  if (height.value) {
    const innerHeight = height.value - titlebarHeight.value - GAP - 2 // minus the bottom padding and the border
    let best = { across: 1, tileWidth: 0 }
    for (let across = 1; across <= count; across++) {
      const rows = Math.ceil(count / across)
      const fitWidth = (inner - GAP * (across - 1)) / across
      const fitHeight = (innerHeight - GAP * (rows - 1)) / rows / 0.75 // tiles are 4:3
      const tileWidth = Math.min(fitWidth, fitHeight)
      if (tileWidth > best.tileWidth) best = { across, tileWidth }
    }
    return { across: best.across, tileWidth: Math.max(Math.floor(best.tileWidth), 40) }
  }

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
  return { across, tileWidth: Math.floor((inner - GAP * (across - 1)) / across) }
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
  if (height.value) height.value = clampHeight(height.value)
  await nextTick()
  keepOnScreen()
}

onMounted(() => {
  titlebarHeight.value = titlebarEl.value.offsetHeight
  onWindowResize()
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div
    ref="windowEl"
    class="call-window"
    :class="{ minimised, dragging: dragging || resizing, 'fixed-height': height && !minimised }"
    :style="windowStyle"
  >
    <!-- Title bar: drag it to move the window. All the buttons live here to save space. -->
    <div
      ref="titlebarEl"
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

      <!-- --tile-width: how wide each tile is (worked out in the script, see TILE LAYOUT) -->
      <div class="tiles" :style="{ '--tile-width': layout.tileWidth + 'px' }">
        <VideoTile
          v-for="member in activeMembers"
          :key="member.id"
          :member="member"
          :is-self="member.id === uid"
          :is-host="member.id === room.hostId"
        />
      </div>
    </div>

    <!-- Resize handles: the 4 edges and 4 corners. The bottom corner facing the middle of the screen
         also shows a grip, so people can see the window can be resized. -->
    <template v-if="!minimised">
      <div
        v-for="edges in RESIZE_HANDLES"
        :key="edges"
        class="call-resize"
        :class="'call-resize-' + edges"
        @pointerdown="startResize($event, edges)"
        @pointermove="onResize"
        @pointerup="endResize"
        @pointercancel="endResize"
      >
        <!-- The grip: two short diagonal lines, tucked inside the rounded corner -->
        <svg v-if="edges === (dock.right ? 'sw' : 'se')" class="call-resize-grip" viewBox="0 0 10 10" aria-hidden="true">
          <path v-if="edges === 'se'" d="M9 3 3 9M9 6.5 6.5 9" />
          <path v-else d="M1 3l6 6M1 6.5 3.5 9" />
        </svg>
      </div>
    </template>
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
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  /* position: fixed = floats over the page and stays put when the page scrolls (left / top are set by the script).
     z-index 1040: above the page (and the shutter button), below Bootstrap modals (1055)
     and the camera countdown (2000+). */
  position: fixed;
  z-index: 1040;
  max-width: calc(100vw - 16px); /* never bigger than the screen (the width and height are set by the script) */
  max-height: calc(100vh - 16px);
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

/* Every tile is --tile-width wide (set by the script). Flexbox, not grid,
   so a shorter last row is centred instead of leaving a gap on the right. */
.tiles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.tiles > * {
  flex: 0 0 var(--tile-width);
}

/* Height kept (someone dragged the top or bottom edge): the tiles fill the space under the title bar,
   in the middle of it */
.call-window.fixed-height {
  display: flex;
  flex-direction: column;
}

.call-window.fixed-height .call-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
  max-height: none;
}

/* Resize handles: invisible strips along the 4 edges and squares in the 4 corners, on top of the tiles.
   touch-action: none stops phones scrolling the page while resizing. */
.call-resize {
  position: absolute;
  z-index: 2;
  touch-action: none;
}

.call-resize-n,
.call-resize-s {
  left: 12px;
  right: 12px;
  height: 6px;
  cursor: ns-resize;
}

.call-resize-e,
.call-resize-w {
  top: 12px;
  bottom: 12px;
  width: 6px;
  cursor: ew-resize;
}

.call-resize-n { top: 0; }
.call-resize-s { bottom: 0; }
.call-resize-e { right: 0; }
.call-resize-w { left: 0; }

.call-resize-ne,
.call-resize-nw,
.call-resize-se,
.call-resize-sw {
  width: 16px;
  height: 16px;
}

.call-resize-ne { top: 0; right: 0; cursor: nesw-resize; }
.call-resize-sw { bottom: 0; left: 0; cursor: nesw-resize; }
.call-resize-nw { top: 0; left: 0; cursor: nwse-resize; }
.call-resize-se { bottom: 0; right: 0; cursor: nwse-resize; }

/* Fingers are bigger than a mouse pointer: bigger handles */
@media (pointer: coarse) {
  .call-resize-n,
  .call-resize-s {
    height: 12px;
  }

  .call-resize-e,
  .call-resize-w {
    width: 12px;
  }

  .call-resize-ne,
  .call-resize-nw,
  .call-resize-se,
  .call-resize-sw {
    width: 24px;
    height: 24px;
  }
}

/* The grip: two short diagonal lines in the bottom corner facing the middle of the screen,
   inset so the rounded corner of the window does not cut them off */
.call-resize-grip {
  position: absolute;
  bottom: 4px;
  width: 10px;
  height: 10px;
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.4;
  stroke-linecap: round;
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 150ms ease;
}

.call-resize-se .call-resize-grip {
  right: 4px;
}

.call-resize-sw .call-resize-grip {
  left: 4px;
}

.call-window:hover .call-resize-grip,
.call-window.dragging .call-resize-grip {
  opacity: 0.9;
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
