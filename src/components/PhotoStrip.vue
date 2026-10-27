<script setup>
import { ref, watch } from 'vue'
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
  selectedSlot: { type: Number, default: null },        // the slot to highlight
  selectedStickerId: { type: Number, default: null },   // the sticker to outline
})

const emit = defineEmits(['drop-photo', 'slot-click', 'clear-slot', 'crop-slot', 'drop-sticker', 'move-sticker', 'sticker-click', 'strip-click'])

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
// dataTransfer when the drag started (type: 'photo', 'newSticker' or 'moveSticker').
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
  if (props.mode === 'decorate' && parcel.type === 'moveSticker') {
    emit('move-sticker', parcel.stickerId, pos.x, pos.y)
  }
}

// Dragging a sticker that is already on the strip: remember which one is moving
function onStickerDragStart(event, sticker) {
  event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'moveSticker', stickerId: sticker.id }))
  event.dataTransfer.effectAllowed = 'move'
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
  <div
    ref="stripEl"
    class="strip"
    :style="{
      aspectRatio: layout.aspect,
      background: frameStyle.thumbnailUrl ? `url(${frameStyle.thumbnailUrl}) center/cover no-repeat, ${frameStyle.background}` : frameStyle.background,
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
      :class="[frameStyle.shape, { highlight: hoverSlot === index || selectedSlot === index, croppable: canCrop(index), panning: panningIndex === index }]"
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
      :draggable="mode === 'decorate'"
      :style="{
        left: sticker.x + '%',
        top: sticker.y + '%',
        width: sticker.w + '%',
        zIndex: 10 + sticker.z,
        transform: 'translate(-50%, -50%) rotate(' + sticker.rotate + 'deg)',
        pointerEvents: mode === 'decorate' ? 'auto' : 'none'
      }"
      @dragstart="onStickerDragStart($event, sticker)"
      @click.stop="emit('sticker-click', sticker.id)"
    >
      <img :src="sticker.src" alt="" draggable="false" />
      <!-- Who last placed or moved the selected sticker (like "Rae is moving this" in Figma) -->
      <span v-if="sticker.id === selectedStickerId && sticker.by" class="moved-by">{{ sticker.by }}</span>
    </div>

    <p v-if="frameStyle.caption && !frameStyle.thumbnailUrl" class="caption" :style="{ color: frameStyle.captionColor || frameStyle.border }">{{ frameStyle.caption }}</p>
  </div>
</template>

<style scoped>
/* position: relative, so the slots and stickers (position: absolute) are placed inside the strip */
.strip {
  position: relative;
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
  border: 4px solid;
  border-radius: 6px;
  overflow: hidden;   /* cuts off stickers that hang over the edge */
  user-select: none;  /* stops text being highlighted while dragging */
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
}

.sticker img {
  width: 100%;
  display: block;
  pointer-events: none;
}

.sticker.selected {
  outline: 2px solid #2F5BEA;
  outline-offset: 2px;
}

.moved-by {
  position: absolute;
  left: 50%;
  top: -22px;
  transform: translateX(-50%);
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
