<script setup>
import { ref } from 'vue'
import { filterCss } from '../stripData.js'

// One photostrip, drawn from data in layers: frame background -> photo slots -> stickers.
// Used by both photostrip pages:
//   mode="pick"     (StripView.vue)    a gallery photo can be dropped into a slot
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
  stickers: { type: Array, default: () => [] },         // [{ id, src, x, y, w, rotate, z, visible, by }]
  mode: { type: String, default: 'pick' },              // 'pick' or 'decorate'
  selectedSlot: { type: Number, default: null },        // the slot to highlight
  selectedStickerId: { type: Number, default: null },   // the sticker to outline
})

const emit = defineEmits(['drop-photo', 'slot-click', 'clear-slot', 'drop-sticker', 'move-sticker', 'sticker-click', 'strip-click'])

const stripEl = ref(null)   // the strip <div>, measured to work out where things are dropped
const hoverSlot = ref(null) // the slot under a dragged photo (highlighted)

// The photo in a slot, or null if the slot is empty
function photoIn(index) {
  const id = props.slotPhotos[index]
  return id ? props.photosById[id] || null : null
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
    :style="{ aspectRatio: layout.aspect, background: frameStyle.background, borderColor: frameStyle.border }"
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
      :class="[frameStyle.shape, { highlight: hoverSlot === index || selectedSlot === index }]"
      :style="{ left: slot.x + '%', top: slot.y + '%', width: slot.w + '%', height: slot.h + '%' }"
      @click.stop="emit('slot-click', index)"
    >
      <img
        v-if="photoIn(index)"
        :src="photoIn(index).image"
        alt=""
        draggable="false"
        :style="{ filter: filterCss(edits[index]) }"
      />
      <span v-else-if="mode === 'pick'" class="slot-empty">Drop here</span>

      <button
        v-if="mode === 'pick' && photoIn(index)"
        class="btn btn-sm btn-light remove-btn"
        title="Remove photo"
        @click.stop="emit('clear-slot', index)"
      >&times;</button>
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

    <p class="caption" :style="{ color: frameStyle.border }">{{ frameStyle.caption }}</p>
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
