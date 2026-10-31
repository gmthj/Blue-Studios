<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useBehindLayer } from '../composables/useBehindLayer.js'

// HOST ONLY, Virtual Friends in MANUAL mode: a see-through layer over the host's camera preview.
//   Drag a person to move them (they come to the front).
//   Pinch (two fingers) or scroll the mouse wheel to make them bigger or smaller.
// The box around the chosen person is only on this page: it is not drawn into the camera picture,
// so it never shows in photos or to the others. See MANUAL MODE in useBehindLayer.js.
// Usage: <ManualArrange :video="mainVideoElement" :mirrored="mirrored" :disabled="capturing" />

const props = defineProps({
  video: { default: null },                     // the preview <video> (to know where the picture is on screen)
  mirrored: { type: Boolean, default: false },  // the preview is flipped like a mirror
  disabled: { type: Boolean, default: false },  // e.g. during the countdown
})

const { personAt, personBox, movePerson, resizePerson } = useBehindLayer()

const layer = ref(null)
const selected = ref(null)  // the chosen person's id
const boxStyle = ref(null)  // where the box around them is on screen (null = no box)
const overPerson = ref(false) // the mouse is over someone (shows a "grab" cursor)
const grabbing = ref(false)   // someone is being dragged (shows a "grabbing" cursor)

const SCROLL_SPEED = 0.0015 // how much one scroll step resizes

// Where the picture is inside the preview: the video is shown whole (object-fit: contain), with
// black bars if its shape is different. Returns { left, top, width, height } in page pixels, or null.
function shownPicture() {
  const video = props.video
  if (!layer.value || !video || !video.videoWidth) return null
  const area = layer.value.getBoundingClientRect()
  const scale = Math.min(area.width / video.videoWidth, area.height / video.videoHeight)
  const width = video.videoWidth * scale
  const height = video.videoHeight * scale
  return {
    left: area.left + (area.width - width) / 2,
    top: area.top + (area.height - height) / 2,
    width: width,
    height: height,
    areaLeft: area.left,
    areaTop: area.top,
  }
}

// A point on the screen -> a place on the picture (parts of its width / height, not mirrored)
function toPicture(clientX, clientY) {
  const shown = shownPicture()
  if (!shown) return null
  const x = (clientX - shown.left) / shown.width
  return { x: props.mirrored ? 1 - x : x, y: (clientY - shown.top) / shown.height }
}

// ---------- Pointers (mouse, finger, pen) ----------
const pointers = new Map() // pointerId -> the last place on the picture
let dragging = null        // the id of the person being dragged
let pinchDistance = 0      // the distance between two fingers last time (for pinching)

function onPointerDown(event) {
  if (props.disabled) return
  const point = toPicture(event.clientX, event.clientY)
  if (!point) return
  layer.value.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, point)

  if (pointers.size === 1) {
    // One finger: pick whoever is under it (or nobody: the box goes away)
    dragging = personAt(point.x, point.y)
    selected.value = dragging
    grabbing.value = dragging !== null
  } else if (pointers.size === 2) {
    // A second finger: pinch the chosen person
    dragging = null
    pinchDistance = distanceBetweenFingers()
  }
}

function onPointerMove(event) {
  const point = toPicture(event.clientX, event.clientY)
  if (!point) return

  // Just hovering with a mouse: show a grab cursor over people
  if (!pointers.has(event.pointerId)) {
    overPerson.value = personAt(point.x, point.y) !== null
    return
  }

  const last = pointers.get(event.pointerId)
  pointers.set(event.pointerId, point)
  if (props.disabled) return

  if (pointers.size === 1 && dragging) {
    movePerson(dragging, point.x - last.x, point.y - last.y)
  } else if (pointers.size === 2 && selected.value) {
    const distance = distanceBetweenFingers()
    if (pinchDistance > 0) {
      const middle = middleOfFingers()
      resizePerson(selected.value, distance / pinchDistance, middle.x, middle.y)
    }
    pinchDistance = distance
  }
}

function onPointerUp(event) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchDistance = 0
  if (pointers.size === 0) {
    dragging = null
    grabbing.value = false
  }
}

function distanceBetweenFingers() {
  const [a, b] = [...pointers.values()]
  // Measured in page pixels' shape: the picture's width and height are not the same length
  const shown = shownPicture()
  return Math.hypot((a.x - b.x) * shown.width, (a.y - b.y) * shown.height)
}

function middleOfFingers() {
  const [a, b] = [...pointers.values()]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Mouse wheel: resize the person under the mouse (or the chosen one), around the mouse
function onWheel(event) {
  if (props.disabled) return
  const point = toPicture(event.clientX, event.clientY)
  if (!point) return
  const id = personAt(point.x, point.y) || selected.value
  if (!id) return
  event.preventDefault() // do not scroll the page
  selected.value = id
  resizePerson(id, Math.exp(-event.deltaY * SCROLL_SPEED), point.x, point.y)
}

// ---------- The box around the chosen person (follows them every frame) ----------
let frame = 0

function updateBox() {
  frame = requestAnimationFrame(updateBox)
  const box = selected.value ? personBox(selected.value) : null
  const shown = shownPicture()
  if (!box || !shown) {
    boxStyle.value = null
    return
  }
  // Mirrored preview: left and right swap
  const left = props.mirrored ? 1 - box.right : box.left
  const right = props.mirrored ? 1 - box.left : box.right
  // Only the part of the box that is on the picture
  const x1 = Math.max(left, 0)
  const x2 = Math.min(right, 1)
  const y1 = Math.max(box.top, 0)
  const y2 = Math.min(box.bottom, 1)
  if (x2 <= x1 || y2 <= y1) {
    boxStyle.value = null
    return
  }
  boxStyle.value = {
    left: shown.left - shown.areaLeft + x1 * shown.width + 'px',
    top: shown.top - shown.areaTop + y1 * shown.height + 'px',
    width: (x2 - x1) * shown.width + 'px',
    height: (y2 - y1) * shown.height + 'px',
  }
}

onMounted(() => {
  frame = requestAnimationFrame(updateBox)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div
    ref="layer"
    class="manual-arrange"
    :class="{ grab: overPerson, dragging: grabbing }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="overPerson = false"
    @wheel="onWheel"
  >
    <div v-if="boxStyle && !disabled" class="person-box" :style="boxStyle"></div>
  </div>
</template>

<style scoped>
/* Covers the whole camera preview. The camera buttons come later on the page, so they stay on top. */
.manual-arrange {
  position: absolute;
  inset: 0;
  touch-action: none; /* fingers drag and pinch people, instead of scrolling or zooming the page */
  user-select: none;
  -webkit-user-select: none;
}

.manual-arrange.grab {
  cursor: grab;
}

.manual-arrange.dragging {
  cursor: grabbing;
}

/* The chosen person: a dashed white box with a soft shadow, so it shows on light and dark backgrounds */
.person-box {
  position: absolute;
  border: 2px dashed rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(14, 16, 32, 0.35);
  pointer-events: none;
}
</style>
