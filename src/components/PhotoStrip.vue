<script setup>
import { ref, computed, watch } from 'vue'
import { filterCss, cropOf, cropPositionCss, cropZoomCss, MAX_ZOOM } from '../stripData.js'
import ClipSequencePlayer from './ClipSequencePlayer.vue'
import { CLIP_SECONDS } from '../clips.js'

// One photostrip, drawn from data in layers: frame background -> photo slots -> stickers.
// Used by both photostrip pages:
//   mode="pick"     (StripView.vue)    a gallery photo can be dropped into a slot, then held and dragged
//                                       inside it to move it (and scrolled to zoom), like cropping
//   mode="decorate" (DecorateView.vue) stickers can be dropped anywhere and dragged to move
//
// This component does not save anything. It only tells the page what happened (emits),
// the page saves it in the room document, and the strip updates for everyone.
// Each slot holds ONE photo id, so dropping a new photo replaces the old one (it never stacks on top).

const props = defineProps({
  layout: { type: Object, required: true },             // the cut: { aspect, slots: [{ x, y, w, h }] }
  frameStyle: { type: Object, required: true },         // { background, border, shape, caption }
  photosById: { type: Object, required: true },         // { photoId: photo }, to find a slot's photo quickly
  slotPhotos: { type: Object, default: () => ({}) },    // { 0: photoId, 1: null, ... }
  edits: { type: Object, default: () => ({}) },         // { 0: { filter, brightness, ... } }
  crops: { type: Object, default: () => ({}) },         // { 0: { x, y, zoom } } where each photo / video sits in its slot (see stripData.js)
  stickers: { type: Array, default: () => [] },         // [{ id, src, x, y, w, rotate, z, visible, by }]
  mode: { type: String, default: 'pick' },              // 'pick' or 'decorate' (anything else: just show the strip, no editing)
  clips: { type: Array, default: () => [] },            // every clip recorded in the room: a slot can hold one (see clips.js)
  editedVideos: { type: Object, default: () => ({}) },  // the saved edited videos: { editId: { name, entries } } (see resolveEditedVideos in clips.js)
  selectedSlot: { type: Number, default: null },
  flashEmpty: { type: Boolean, default: false },         // Pick page: briefly mark the empty slots red (tried to move on too early)        // the slot to highlight
  selectedStickerId: { type: Number, default: null },   // the sticker to outline
})

const emit = defineEmits(['drop-photo', 'slot-click', 'clear-slot', 'crop-slot', 'drop-sticker', 'move-sticker', 'sticker-click', 'sticker-dblclick', 'delete-sticker', 'update-sticker', 'strip-click'])

const stripEl = ref(null)   // the strip <div>, measured to work out where things are dropped
const hoverSlot = ref(null) // the slot under a dragged photo (highlighted)

// ---------- MOVING A PHOTO OR VIDEO INSIDE ITS SLOT (Pick page) ----------
// Hold and drag inside a slot to move what is in it. Zoom: pinch with two fingers (phones), scroll the mouse
// wheel, or use the zoom slider on the page.
// While someone drags, the new position is only shown on their screen (liveCrop).
// It is saved once, when they let go, so Firestore is not written on every mouse movement.
const liveCrop = ref(null)       // { index, crop } while something is being moved or zoomed, otherwise null
const panningIndex = ref(null)   // the slot being dragged right now (shows the grid), or null
const hintOffIndex = ref(null)   // the slot just moved or zoomed: its hint stays hidden until the mouse leaves it
const mouseOverIndex = ref(null) // the slot the MOUSE is over (not a finger), to show the hint
let pan = null                   // the drag in progress: { index, startX, startY, startCrop, moved }
let skipNextClick = false        // a drag also ends with a "click", which should not count as a tap
let wheelTimer = null            // zooming with the mouse wheel is saved a moment after the scrolling stops

// The crop to show for a slot: the live one while it is being moved, otherwise the saved one
function cropFor(index) {
  if (liveCrop.value && liveCrop.value.index === index) return liveCrop.value.crop
  return cropOf(props.crops, index)
}

// Any slot with something in it (photo, clip or edited video) can be adjusted, on the Pick page only
function canCrop(index) {
  return props.mode === 'pick' && !!(photoIn(index) || clipIn(index) || editedIn(index))
}

// Pointer events work for both the mouse and fingers, so this also works on phones.
// One finger (or the mouse) drags to move. Two fingers pinch to zoom (and move together to move).
const pointers = new Map() // every finger / mouse pressed on a slot right now: pointerId -> { x, y }

// The crop after moving dx, dy screen pixels from a starting crop, at a given zoom.
// slotEl is the slot <div>: its size, and the picture inside it, are measured to know how far it can slide.
function movedCrop(slotEl, startCrop, dx, dy, zoom) {
  const crop = { ...startCrop, zoom: zoom }

  // The picture's own size: naturalWidth for a photo, videoWidth for a video (0 until it has loaded)
  const media = slotEl.querySelector('img, video')
  const mediaWidth = media ? media.naturalWidth || media.videoWidth : 0
  const mediaHeight = media ? media.naturalHeight || media.videoHeight : 0
  if (!mediaWidth || !mediaHeight) return crop

  // How much bigger the shown picture is than the slot. That extra is the distance it can slide.
  const slotBox = slotEl.getBoundingClientRect()
  const scale = Math.max(slotBox.width / mediaWidth, slotBox.height / mediaHeight) // object-fit: cover
  const extraX = mediaWidth * scale * zoom - slotBox.width
  const extraY = mediaHeight * scale * zoom - slotBox.height

  // Dragging right shows more of the picture's left side, so x goes DOWN (hence the minus).
  // If the picture is not bigger than the slot in a direction (extra is 0), it cannot move that way.
  if (extraX > 0.5) crop.x = Math.min(100, Math.max(0, startCrop.x - (dx / extraX) * 100))
  if (extraY > 0.5) crop.y = Math.min(100, Math.max(0, startCrop.y - (dy / extraY) * 100))
  return crop
}

// The distance between two fingers, and the point halfway between them
function pinchInfo() {
  const [a, b] = [...pointers.values()]
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 }
}

function onPanStart(event, index) {
  if (!canCrop(index) || event.button !== 0) return // only the main mouse button (or a finger)
  if (event.target.closest('button')) return         // the × button is not a drag
  event.currentTarget.setPointerCapture(event.pointerId) // keep getting moves even if the pointer leaves the slot
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pointers.size === 1) {
    // First finger (or the mouse): start a drag
    pan = { index: index, startX: event.clientX, startY: event.clientY, startCrop: cropFor(index), moved: false, pinch: null }
  } else if (pointers.size === 2 && pan && pan.index === index) {
    // Second finger on the same slot: start a pinch from where the picture is now
    const info = pinchInfo()
    pan.pinch = { startDist: info.dist, startMidX: info.midX, startMidY: info.midY, startCrop: cropFor(index) }
    pan.moved = true
    panningIndex.value = index
    hintOffIndex.value = index
  }
}

function onPanMove(event) {
  if (!pan || !pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  const slotEl = event.currentTarget

  // Two fingers: zoom by how much further apart they are, and move with the point between them
  if (pan.pinch && pointers.size >= 2) {
    const info = pinchInfo()
    const p = pan.pinch
    const zoom = Math.min(MAX_ZOOM, Math.max(1, p.startCrop.zoom * (info.dist / p.startDist)))
    const crop = movedCrop(slotEl, p.startCrop, info.midX - p.startMidX, info.midY - p.startMidY, zoom)
    liveCrop.value = { index: pan.index, crop: crop }
    return
  }

  // One finger or the mouse: move
  const dx = event.clientX - pan.startX // how far the pointer has moved since the drag started, in screen pixels
  const dy = event.clientY - pan.startY
  if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 4) return // a tiny wobble is still a tap, not a drag
  pan.moved = true
  panningIndex.value = pan.index
  hintOffIndex.value = pan.index // hide the hint while moving, and after (until the mouse leaves the slot)
  liveCrop.value = { index: pan.index, crop: movedCrop(slotEl, pan.startCrop, dx, dy, pan.startCrop.zoom) }
}

function onPanEnd(event) {
  pointers.delete(event.pointerId)
  if (!pan) return

  // One finger lifted during a pinch: carry on as a one-finger drag from where the picture is now (no jump)
  if (pan.pinch && pointers.size === 1) {
    const [rest] = [...pointers.values()]
    pan.pinch = null
    pan.startX = rest.x
    pan.startY = rest.y
    pan.startCrop = cropFor(pan.index)
    return
  }
  if (pointers.size > 0) return // other fingers are still down

  if (pan.moved && liveCrop.value) {
    emit('crop-slot', pan.index, roundCrop(liveCrop.value.crop)) // the page saves it for everyone
    skipNextClick = true
  }
  pan = null
  panningIndex.value = null
}

// Scrolling the mouse wheel over a slot zooms in or out (the page's own scrolling is stopped by preventDefault)
function onWheel(event, index) {
  if (!canCrop(index)) return
  event.preventDefault()
  const crop = { ...cropFor(index) }
  crop.zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom - event.deltaY * 0.002)) // wheel down = zoom out
  liveCrop.value = { index: index, crop: crop }
  hintOffIndex.value = index // zooming also hides the hint
  clearTimeout(wheelTimer)
  wheelTimer = setTimeout(() => emit('crop-slot', index, roundCrop(crop)), 400)
}

// The mouse came over a slot. pointerType tells a mouse from a finger: fingers have no hover,
// so the hint is only for the mouse.
function onSlotEnter(event, index) {
  if (event.pointerType === 'mouse') mouseOverIndex.value = index
}

// When the mouse leaves a slot, its hint can show again next time the mouse is over it
function onSlotLeave(index) {
  if (mouseOverIndex.value === index) mouseOverIndex.value = null
  if (hintOffIndex.value === index && panningIndex.value !== index) hintOffIndex.value = null
}

// Show the hint: the mouse is over this slot, it is not being dragged, and it was not just moved
function showHint(index) {
  return mouseOverIndex.value === index && panningIndex.value !== index && hintOffIndex.value !== index
}

// Double-click (or double-tap) a slot to put the picture back in the centre
function onDoubleClick(index) {
  if (!canCrop(index)) return
  liveCrop.value = null
  emit('crop-slot', index, null)
}

// Keep the saved numbers short (x, y to 1 decimal place, zoom to 2)
function roundCrop(crop) {
  return { x: Math.round(crop.x * 10) / 10, y: Math.round(crop.y * 10) / 10, zoom: Math.round(crop.zoom * 100) / 100 }
}

// A click on a slot: ignored if it was really the end of a drag, otherwise sent to the page as before
function onSlotClick(index) {
  if (skipNextClick) {
    skipNextClick = false
    return
  }
  emit('slot-click', index)
}

// ---------- RESIZE AND ROTATE A STICKER (Decorate page) ----------
// The selected sticker gets a box with handles, like the Template Editor:
//   corner circles and side pills: drag away from the middle to make it bigger, towards it to make it smaller
//   the round ↻ handle under it: drag around to rotate (the angle shows next to it)
// The box is drawn OUTSIDE the strip (handlesLayer), so handles near the edge are not cut off.
// While dragging, only this screen updates (liveSticker); the new size / angle is saved once, on letting go.
const handlesLayer = ref(null) // the layer over the strip that holds the box
const liveSticker = ref(null)  // { id, w, rotate } while a handle is being dragged
const ratios = ref({})         // each sticker picture's height / width, to draw the box the right height
let transform = null           // the handle drag in progress
const rotating = ref(false)    // the ↻ handle is being dragged (shows the angle)
const overRotate = ref(false)  // the mouse is over the ↻ handle (shows the angle)

// A sticker with the live size / angle applied while its handle is dragged
function shown(sticker) {
  if (liveSticker.value && liveSticker.value.id === sticker.id) return { ...sticker, ...liveSticker.value }
  return sticker
}

// The selected sticker (as shown), for the box. Only on the Decorate page.
const boxSticker = computed(() => {
  if (props.mode !== 'decorate' || props.selectedStickerId === null) return null
  const sticker = props.stickers.find((s) => s.id === props.selectedStickerId)
  return sticker && sticker.visible ? shown(sticker) : null
})

// Remember each sticker picture's shape when it loads
function onStickerLoad(event, id) {
  const img = event.target
  if (img.naturalWidth) ratios.value = { ...ratios.value, [id]: img.naturalHeight / img.naturalWidth }
}

// Where the box goes: the sticker's centre and width in % of the strip. Its height in % of the strip is
// width × (picture height / width) × (strip width / height).
function boxStyle(sticker) {
  const ratio = ratios.value[sticker.id] || 1
  return {
    left: sticker.x + '%',
    top: sticker.y + '%',
    width: sticker.w + '%',
    height: sticker.w * ratio * props.layout.aspect + '%',
    transform: 'translate(-50%, -50%) rotate(' + sticker.rotate + 'deg)',
  }
}

// The sticker's centre on the screen, in pixels
function centreOnScreen(sticker) {
  const box = handlesLayer.value.getBoundingClientRect()
  return { x: box.left + (sticker.x / 100) * box.width, y: box.top + (sticker.y / 100) * box.height }
}

function onHandleDown(event, kind) {
  const sticker = boxSticker.value
  if (!sticker) return
  event.currentTarget.setPointerCapture(event.pointerId) // keep getting moves outside the handle
  const c = centreOnScreen(sticker)
  transform = {
    kind: kind, // 'resize' or 'rotate'
    id: sticker.id,
    centre: c,
    startW: sticker.w,
    startRotate: sticker.rotate,
    startDist: Math.hypot(event.clientX - c.x, event.clientY - c.y) || 1,
    startAngle: Math.atan2(event.clientY - c.y, event.clientX - c.x),
  }
  liveSticker.value = { id: sticker.id, w: sticker.w, rotate: sticker.rotate }
  rotating.value = kind === 'rotate'
}

function onHandleMove(event) {
  if (!transform) return
  const t = transform
  if (t.kind === 'resize') {
    // Size follows the distance from the middle: twice as far = twice as big (5% to 100% of the strip's width)
    const dist = Math.hypot(event.clientX - t.centre.x, event.clientY - t.centre.y)
    const w = Math.min(100, Math.max(5, t.startW * (dist / t.startDist)))
    liveSticker.value = { ...liveSticker.value, w: Math.round(w * 10) / 10 }
  } else {
    // Angle = how far around the middle the pointer has turned, added to the starting angle
    const angle = Math.atan2(event.clientY - t.centre.y, event.clientX - t.centre.x)
    let deg = t.startRotate + ((angle - t.startAngle) * 180) / Math.PI
    deg = ((((deg + 180) % 360) + 360) % 360) - 180 // keep it between -180 and 180
    for (const snap of [-180, -90, 0, 90, 180]) {
      if (Math.abs(deg - snap) < 4) deg = snap // straight up / sideways is easy to hit
    }
    liveSticker.value = { ...liveSticker.value, rotate: Math.round(deg) }
  }
}

function onHandleUp() {
  if (!transform) return
  const changes = { w: liveSticker.value.w, rotate: liveSticker.value.rotate }
  emit('update-sticker', transform.id, changes) // the page saves it for everyone
  transform = null
  rotating.value = false // the angle tag goes away when done
}

// When the saved sticker comes back from Firestore, stop showing the live copy
watch(() => props.stickers, () => {
  if (!transform && !fingerMove) liveSticker.value = null
}, { deep: true })

// When the saved crop arrives back from Firestore, stop showing the live copy
watch(() => props.crops, () => {
  if (!pan) liveCrop.value = null
}, { deep: true })

// The photo in a slot, or null if the slot is empty
function photoIn(index) {
  const id = props.slotPhotos[index]
  return id ? props.photosById[id] || null : null
}

// The clip (an unedited video) in a slot, or null if the slot does not hold one
function clipIn(index) {
  const id = props.slotPhotos[index]
  return id ? props.clips.find((c) => c.id === id) || null : null
}

// A clip played as it is: the whole clip, from 0 to its full length (same shape as the edited video's entries)
function rawEntries(index) {
  return [{ clip: clipIn(index), start: 0, end: CLIP_SECONDS }]
}

// The edited video in a slot, or null if the slot does not hold one (or the edit has no clips left)
function editedIn(index) {
  const edit = props.editedVideos[props.slotPhotos[index]]
  return edit && edit.entries.length > 0 ? edit : null
}

// Turn the mouse position into a position inside the strip, in % (0-100).
// getBoundingClientRect() gives the strip's position and size on the screen.
function positionInStrip(event) {
  const box = stripEl.value.getBoundingClientRect()
  const x = ((event.clientX - box.left) / box.width) * 100
  const y = ((event.clientY - box.top) / box.height) * 100
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) }
}

// Which slot contains this % position (-1 if none). Uses the layout numbers instead of the
// element under the mouse, so a sticker on top of a slot does not block the drop.
function slotAt(x, y) {
  return props.layout.slots.findIndex((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h)
}

// While a photo is dragged over the strip, highlight the slot underneath
function onDragOver(event) {
  if (props.mode !== 'pick') return
  const pos = positionInStrip(event)
  const index = slotAt(pos.x, pos.y)
  hoverSlot.value = index === -1 ? null : index
}

// Everything dropped on the strip comes here. The dragged item put a small JSON "parcel" in
// dataTransfer when the drag started (type: 'photo' or 'newSticker'). Stickers already on the strip
// are moved with pointer events instead (see MOVING A STICKER).
function onDrop(event) {
  hoverSlot.value = null

  let parcel
  try {
    parcel = JSON.parse(event.dataTransfer.getData('text/plain'))
  } catch {
    return // not one of ours (e.g. a file dragged from the desktop)
  }
  const pos = positionInStrip(event)

  if (props.mode === 'pick' && parcel.type === 'photo') {
    const index = slotAt(pos.x, pos.y)
    if (index !== -1) emit('drop-photo', index, parcel.photoId)
  }
  if (props.mode === 'decorate' && parcel.type === 'newSticker') {
    emit('drop-sticker', parcel.src, pos.x, pos.y)
  }
}

// ---------- MOVING A STICKER (finger or mouse) ----------
// A drag on a sticker moves it with pointer events, saved once when the finger or button lifts.
// WHY the mouse too (it used HTML drag and drop before): drag and drop only shows a ghost picture
// until the drop, so the sticker could not snap or show alignment lines while it moved.
let fingerMove = null // { id, startX, startY, startStickerX, startStickerY, moved }

// Alignment guides: while a sticker moves near the middle of the strip (across or down), it snaps
// onto the middle and a red line shows it, like Canva or PowerPoint.
const SNAP_PX = 6
const guides = ref({ x: false, y: false })

// Two quick taps on the same sticker = a double-tap (phones send no dblclick), used to edit
// a text sticker's words right on the strip.
let lastStickerTap = { id: null, time: 0 }

function onStickerPointerDown(event, sticker) {
  if (props.mode !== 'decorate' || event.button > 0) return
  event.currentTarget.setPointerCapture(event.pointerId)
  fingerMove = { id: sticker.id, startX: event.clientX, startY: event.clientY, startStickerX: sticker.x, startStickerY: sticker.y, moved: false }
}

function onStickerPointerMove(event) {
  if (!fingerMove) return
  const dx = event.clientX - fingerMove.startX
  const dy = event.clientY - fingerMove.startY
  if (!fingerMove.moved && Math.abs(dx) + Math.abs(dy) < 6) return // a small wobble is still a tap
  fingerMove.moved = true
  const box = stripEl.value.getBoundingClientRect()
  let x = Math.min(100, Math.max(0, fingerMove.startStickerX + (dx / box.width) * 100)) // pixels -> % of the strip
  let y = Math.min(100, Math.max(0, fingerMove.startStickerY + (dy / box.height) * 100))
  // Snap to the middle when within a few pixels of it
  const nearX = Math.abs(x - 50) * box.width / 100 < SNAP_PX
  const nearY = Math.abs(y - 50) * box.height / 100 < SNAP_PX
  if (nearX) x = 50
  if (nearY) y = 50
  guides.value = { x: nearX, y: nearY }
  liveSticker.value = { ...(liveSticker.value && liveSticker.value.id === fingerMove.id ? liveSticker.value : {}), id: fingerMove.id, x: x, y: y }
}

function onStickerPointerUp() {
  if (!fingerMove) return
  guides.value = { x: false, y: false }
  if (fingerMove.moved && liveSticker.value) {
    emit('move-sticker', fingerMove.id, liveSticker.value.x, liveSticker.value.y)
  } else {
    emit('sticker-click', fingerMove.id) // just a tap: select it
    const now = Date.now()
    if (lastStickerTap.id === fingerMove.id && now - lastStickerTap.time < 400) {
      emit('sticker-dblclick', fingerMove.id)
      lastStickerTap = { id: null, time: 0 }
    } else {
      lastStickerTap = { id: fingerMove.id, time: now }
    }
  }
  fingerMove = null
}

// Phones do not support drag and drop, so a tap on the strip sends its position instead
function onStripClick(event) {
  const pos = positionInStrip(event)
  emit('strip-click', pos.x, pos.y)
}
</script>

<template>
  <!-- dragover.prevent: browsers do not allow dropping by default, cancelling dragover allows it -->
  <!-- drop.prevent: stops some browsers opening the dropped image as a new page -->
  <!-- strip-wrap: the strip, plus the sticker handles drawn over it (not cut off at the strip's edge) -->
  <div class="strip-wrap" :style="{ '--strip-aspect': layout.aspect }">
  <div
    ref="stripEl"
    class="strip"
    :class="{ templated: !!frameStyle.thumbnailUrl }"
    :style="{
      aspectRatio: layout.aspect,
      '--strip-aspect': layout.aspect,
      background: frameStyle.thumbnailUrl ? `url(${frameStyle.thumbnailUrl}) center/cover no-repeat` : frameStyle.background,
      borderColor: frameStyle.border
    }"
    @dragover.prevent="onDragOver"
    @dragleave="hoverSlot = null"
    @drop.prevent="onDrop"
    @click="onStripClick"
  >
    <!-- Photo slots, placed with the layout's percentages. .stop so the strip's click does not also run -->
    <div
      v-for="(slot, index) in layout.slots"
      :key="index"
      class="slot"
      :data-test="'slot-' + index"
      :class="[frameStyle.shape, { highlight: hoverSlot === index || selectedSlot === index, croppable: canCrop(index), 'flash-empty': flashEmpty && !(photoIn(index) || clipIn(index) || editedIn(index)), panning: panningIndex === index }]"
      :style="{ left: slot.x + '%', top: slot.y + '%', width: slot.w + '%', height: slot.h + '%' }"
      @click.stop="onSlotClick(index)"
      @pointerdown="onPanStart($event, index)"
      @pointermove="onPanMove"
      @pointerup="onPanEnd"
      @pointercancel="onPanEnd"
      @wheel="onWheel($event, index)"
      @dblclick="onDoubleClick(index)"
      @pointerenter="onSlotEnter($event, index)"
      @pointerleave="onSlotLeave(index)"
    >
      <!-- pointerdown / move / up: hold and drag inside the slot to move the picture. wheel: zoom. dblclick: re-centre -->
      <!-- The picture, inside a box that does the zoom (cropZoomCss). The picture itself gets the position. -->
      <div v-if="photoIn(index) || clipIn(index) || editedIn(index)" class="crop-box" :style="cropZoomCss(cropFor(index))">
        <!-- An edited video plays (and repeats) in its slot -->
        <ClipSequencePlayer
          v-if="editedIn(index)"
          bare
          autoplay
          loop
          :entries="editedIn(index).entries"
          :position="cropFor(index)"
          :style="{ filter: filterCss(edits[index]) }"
        />
        <!-- An unedited clip also plays and repeats in its slot -->
        <ClipSequencePlayer
          v-else-if="clipIn(index)"
          bare
          autoplay
          loop
          :entries="rawEntries(index)"
          :position="cropFor(index)"
          :style="{ filter: filterCss(edits[index]) }"
        />
        <img
          v-else
          :src="photoIn(index).image"
          alt=""
          draggable="false"
          :style="{ filter: filterCss(edits[index]), ...cropPositionCss(cropFor(index)) }"
        />
      </div>
      <span v-else-if="mode === 'pick'" class="slot-empty">Drop here</span>

      <!-- Reposition helpers (Pick page): a rule-of-thirds grid while dragging, otherwise a hint that shows on hover
           (hidden after the picture is moved or zoomed, until the mouse leaves the slot) -->
      <template v-if="canCrop(index)">
        <div v-if="panningIndex === index" class="crop-grid"></div>
        <span class="crop-hint" :class="{ show: showHint(index) }">✥ Hold &amp; drag to reposition</span>
      </template>

      <button
        v-if="mode === 'pick' && (photoIn(index) || editedIn(index) || clipIn(index))"
        class="btn btn-sm btn-light remove-btn"
        title="Remove photo"
        @click.stop="emit('clear-slot', index)"
      >&times;</button>

      <span v-if="mode === 'pick' && editedIn(index)" class="media-badge edited">✂ {{ editedIn(index).name }}</span>
      <span v-else-if="mode === 'pick' && clipIn(index)" class="media-badge">▶ video</span>
    </div>

    <!-- Stickers, always above the slots (z-index 10 + z, so a bigger z is in front).
         x, y is the sticker's centre; translate(-50%, -50%) puts the middle of the image on that point.
         On the Pick page they ignore the mouse (pointer-events: none), so they never block a photo drop. -->
    <div
      v-for="sticker in stickers"
      v-show="sticker.visible"
      :key="sticker.id"
      class="sticker"
      :class="{ selected: sticker.id === selectedStickerId }"
      :style="{
        left: shown(sticker).x + '%',
        top: shown(sticker).y + '%',
        width: shown(sticker).w + '%',
        zIndex: 10 + sticker.z,
        transform: 'translate(-50%, -50%) rotate(' + shown(sticker).rotate + 'deg)',
        pointerEvents: mode === 'decorate' ? 'auto' : 'none'
      }"
      @pointerdown="onStickerPointerDown($event, sticker)"
      @pointermove="onStickerPointerMove"
      @pointerup="onStickerPointerUp"
      @pointercancel="onStickerPointerUp"
      @click.stop="emit('sticker-click', sticker.id)"
    >
      <img :src="sticker.src" alt="" draggable="false" @load="onStickerLoad($event, sticker.id)" />
    </div>

    <!-- Alignment guides: a red line down / across the middle while a sticker sits on it -->
    <div v-if="guides.x" class="align-guide vertical" aria-hidden="true"></div>
    <div v-if="guides.y" class="align-guide horizontal" aria-hidden="true"></div>

    <p v-if="frameStyle.caption && !frameStyle.thumbnailUrl" class="caption" :style="{ color: frameStyle.captionColor || frameStyle.border }">{{ frameStyle.caption }}</p>
  </div>

  <!-- The selected sticker's box with handles (Decorate page) -->
  <div ref="handlesLayer" class="handles-layer" :class="{ templated: !!frameStyle.thumbnailUrl }">
    <div v-if="boxSticker" class="sticker-box" :style="boxStyle(boxSticker)">
      <!-- Corners and sides: resize (the sticker keeps its shape) -->
      <span
        v-for="spot in ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r']"
        :key="spot"
        class="handle"
        :class="[spot, spot.length === 2 ? 'corner' : 'side']"
        @pointerdown.stop.prevent="onHandleDown($event, 'resize')"
        @pointermove="onHandleMove"
        @pointerup="onHandleUp"
        @pointercancel="onHandleUp"
      ></span>

      <!-- Rotate: the round handle under the box, with the angle next to it -->
      <span
        class="rotate-handle"
        title="Drag to rotate"
        @pointerenter="overRotate = $event.pointerType === 'mouse'"
        @pointerleave="overRotate = false"
        @pointerdown.stop.prevent="onHandleDown($event, 'rotate')"
        @pointermove="onHandleMove"
        @pointerup="onHandleUp"
        @pointercancel="onHandleUp"
      >&#x21bb;</span>
      <span v-if="rotating || overRotate" class="angle-tag" :style="{ transform: 'translateX(-50%) rotate(' + -boxSticker.rotate + 'deg)' }">{{ boxSticker.rotate }}°</span>

      <!-- Who last placed or moved it (like "Rae is moving this" in Figma), kept upright -->
      <span v-if="boxSticker.by" class="moved-by" :style="{ transform: 'rotate(' + -boxSticker.rotate + 'deg)' }">{{ boxSticker.by }}</span>

      <!-- Delete -->
      <button
        type="button"
        class="sticker-delete"
        aria-label="Delete sticker"
        title="Delete sticker"
        @pointerdown.stop
        @click.stop="emit('delete-sticker', boxSticker.id)"
      >&times;</button>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* position: relative, so the slots and stickers (position: absolute) are placed inside the strip */
.strip-wrap {
  position: relative;
  width: 100%;
  /* At most 300px wide, and never taller than the page's stage (--stage-h, set by the page around the strip;
     82% of the screen height if the page sets none). width = height × aspect, so every frame, default or saved,
     fits in the same space whatever its shape. */
  max-width: min(300px, calc(var(--stage-h, 82vh) * var(--strip-aspect, 0.3)));
  margin: 0 auto;
}

.strip {
  position: relative;
  width: 100%;
  border: 4px solid;
  border-radius: 6px;
  overflow: hidden;   /* cuts off stickers that hang over the edge */
  user-select: none;  /* stops text being highlighted while dragging */
}

/* A saved template is a picture that already has its own (rounded) border, so the strip adds none */
.strip.templated {
  border: none;
  border-radius: 0;
}

.slot {
  position: absolute;
  overflow: hidden;   /* hides the parts of the photo outside the slot's shape */
  background: rgba(47, 91, 234, 0.06);
  border: 2px dashed rgba(47, 91, 234, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* object-fit: cover crops any photo to fill its slot exactly, without stretching */
.slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.slot.square {
  border-radius: 0;
}

.slot.rounded {
  border-radius: 12px;
}

.slot.circle {
  border-radius: 50%;
}

.slot.highlight {
  border: 3px solid #2F5BEA;
  background: rgba(47, 91, 234, 0.15);
}

/* An empty slot after trying to move on: red, with a small shake */
.slot.flash-empty {
  border: 3px solid #E5484D;
  background: rgba(229, 72, 77, 0.12);
  animation: slot-shake 0.4s ease 2;
}

.slot.flash-empty .slot-empty {
  color: #C9353A;
}

@keyframes slot-shake {
  0%, 100% { translate: 0 0; }
  25% { translate: -3px 0; }
  75% { translate: 3px 0; }
}

.slot-empty {
  font-size: 0.8rem;
  color: #2F5BEA;
  font-weight: 500;
}

/* The box that zooms: the same size as the slot */
.crop-box {
  width: 100%;
  height: 100%;
}

/* A slot whose picture can be moved: a "grab" hand, and touch-action: none so dragging on a phone
   moves the picture instead of scrolling the page */
.slot.croppable {
  cursor: grab;
  touch-action: none;
}

.slot.croppable.panning {
  cursor: grabbing;
  border: 3px solid #2F5BEA;
}

/* "Hold & drag to reposition": hidden until showHint() adds the "show" class (see the script) */
.crop-hint {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(20, 23, 43, 0.72);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
  pointer-events: none; /* the slot underneath still gets the drag */
  opacity: 0;
  transition: opacity 0.15s ease;
}

/* Fades in and out (the transition on .crop-hint) */
.crop-hint.show {
  opacity: 1;
}

/* Rule-of-thirds lines while dragging, like a camera's grid, to help line the picture up */
.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(to right, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.75) calc(33.33% - 0.5px), rgba(255, 255, 255, 0.75) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgba(255, 255, 255, 0.75) calc(66.66% - 0.5px), rgba(255, 255, 255, 0.75) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px)),
    linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.75) calc(33.33% - 0.5px), rgba(255, 255, 255, 0.75) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), rgba(255, 255, 255, 0.75) calc(66.66% - 0.5px), rgba(255, 255, 255, 0.75) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px));
}

/* A small label on the Pick page that says what kind of video the slot holds (not part of the exported strip) */
.media-badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  background: #1A1A2E;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  pointer-events: none;
}

.media-badge.edited {
  background: #7B61FF; /* the same purple as the edited video in the gallery */
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  line-height: 1;
  padding: 0 6px;
}

.sticker {
  position: absolute;
  cursor: grab;
  touch-action: none; /* a finger on a sticker moves it instead of scrolling the page */
}

.sticker:active {
  cursor: grabbing;
}

/* The red alignment line through the middle of the strip, above every sticker */
.align-guide {
  position: absolute;
  z-index: 9999;
  background: #F04438;
  pointer-events: none;
}

.align-guide.vertical {
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
}

.align-guide.horizontal {
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
}

.sticker img {
  width: 100%;
  display: block;
  pointer-events: none;
}

.sticker.selected {
  outline: none; /* the box with handles marks it instead */
}

/* ---------- The selected sticker's box (like the Template Editor) ---------- */
/* Lies exactly over the inside of the strip (inside its 4px border), so % positions match the stickers */
.handles-layer {
  position: absolute;
  inset: 4px;
  pointer-events: none; /* only the handles catch the mouse; dragging the sticker itself still works */
  z-index: 40;
}

.handles-layer.templated {
  inset: 0; /* a saved template has no strip border */
}

.sticker-box {
  position: absolute;
  border: 2px solid #7C4DFF;
  border-radius: 2px;
}

/* White handles with a grey outline */
.handle {
  position: absolute;
  background: #fff;
  border: 1.5px solid #9AA0B4;
  box-shadow: 0 1px 3px rgba(20, 23, 43, 0.2);
  pointer-events: auto;
  touch-action: none; /* a finger drags the handle instead of scrolling the page */
}

.handle.corner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.handle.side {
  border-radius: 999px;
}

.handle.t,
.handle.b {
  width: 22px;
  height: 9px;
  left: 50%;
  margin-left: -11px;
}

.handle.l,
.handle.r {
  width: 9px;
  height: 22px;
  top: 50%;
  margin-top: -11px;
}

.handle.tl { left: -8px; top: -8px; cursor: nwse-resize; }
.handle.br { right: -8px; bottom: -8px; cursor: nwse-resize; }
.handle.tr { right: -8px; top: -8px; cursor: nesw-resize; }
.handle.bl { left: -8px; bottom: -8px; cursor: nesw-resize; }
.handle.t { top: -5px; cursor: ns-resize; }
.handle.b { bottom: -5px; cursor: ns-resize; }
.handle.l { left: -5px; cursor: ew-resize; }
.handle.r { right: -5px; cursor: ew-resize; }

/* The round rotate handle below the box */
.rotate-handle {
  position: absolute;
  left: 50%;
  bottom: -38px;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  border-radius: 50%;
  background: #fff;
  border: 1.5px solid #9AA0B4;
  box-shadow: 0 1px 4px rgba(20, 23, 43, 0.25);
  color: #14172B;
  font-size: 0.95rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}

.rotate-handle:active {
  cursor: grabbing;
}

/* The angle, under the rotate handle (kept upright) */
.angle-tag {
  position: absolute;
  left: 50%;
  bottom: -60px;
  background: #7C4DFF;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  white-space: nowrap;
  pointer-events: none;
}

/* The round × to delete, just outside the top-right corner */
.sticker-delete {
  position: absolute;
  top: -30px;
  right: -30px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #fff;
  background: #E5484D;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(20, 23, 43, 0.25);
  cursor: pointer;
  pointer-events: auto;
}

.sticker-delete:hover {
  background: #C9353A;
}

.moved-by {
  position: absolute;
  left: -2px;
  top: -26px;
  background: #F2711C;
  color: #fff;
  font-size: 0.65rem;
  padding: 1px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.caption {
  position: absolute;
  bottom: 1.5%;
  width: 100%;
  text-align: center;
  font-weight: 600;
  font-size: 0.85rem;
  margin: 0;
}
</style>
