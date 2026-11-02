<script setup>
import { ref } from 'vue'

// One frame in "Saved frames" on the Pick page: its picture, and under it which cut it is ("4-cut", "2x2").
// With a mouse, resting on it shows a bigger preview next to it, so the frame is easy to see before choosing.
// Usage: <FrameTile :frame="tpl" :cut="'4-cut'" :active="tpl.id === frameStyle.id" @choose="chooseCustomTemplate(tpl)" />

const props = defineProps({
  frame: { type: Object, required: true },   // { name, thumbnailUrl, background, border, shape, saved }
  cut: { type: String, default: '' },        // '4-cut', '3-cut', '2x2'... ('' while it is being worked out)
  active: { type: Boolean, default: false }, // the frame the room is using
})

const emit = defineEmits(['choose'])

// ---------- The bigger preview ----------
// It is drawn on <body> (Teleport), not inside the panel, so a scrolling list cannot cut it off.
// It sits to the left of the tile (towards the strip), or to the right if there is no room on the left.
const PREVIEW_WIDTH = 150
const preview = ref(null) // { left, top } while it shows, otherwise null

// Only for a real mouse: on phones a tap chooses the frame, and a preview would get stuck on screen
function showPreview(event) {
  if (event.pointerType && event.pointerType !== 'mouse') return
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  const tile = event.currentTarget.getBoundingClientRect()
  const gap = 12
  let left = tile.left - gap - PREVIEW_WIDTH
  if (left < 8) left = tile.right + gap // no room on the left
  // Centred on the tile, but kept inside the window (the preview is about 260px tall)
  const half = 130
  const top = Math.min(window.innerHeight - 8 - half, Math.max(8 + half, tile.top + tile.height / 2))
  preview.value = { left: left, top: top }
}

function hidePreview() {
  preview.value = null
}

function choose() {
  hidePreview()
  emit('choose')
}
</script>

<template>
  <div class="frame-tile-wrap">
    <button
      type="button"
      class="frame-tile"
      :class="{ active: active, picture: !!frame.thumbnailUrl, [frame.shape || 'square']: !frame.thumbnailUrl }"
      :aria-pressed="active"
      :aria-label="frame.name + (cut ? ', ' + cut : '')"
      @click="choose"
      @pointerenter="showPreview"
      @pointerleave="hidePreview"
    >
      <!-- A saved frame is its own picture. A built-in frame is just its colours. -->
      <span class="frame-pic">
        <img v-if="frame.thumbnailUrl" :src="frame.thumbnailUrl" alt="" draggable="false" />
        <span v-else class="colour-frame" :style="{ background: frame.background, borderColor: frame.border }"></span>
      </span>
      <span class="frame-cut">{{ cut || '\u00a0' }}</span>
      <span v-if="frame.saved" class="saved-star" title="Saved from the marketplace" aria-hidden="true">★</span>
    </button>

    <!-- The bigger preview (mouse only) -->
    <Teleport to="body">
      <div
        v-if="preview"
        class="frame-preview"
        :style="{ left: preview.left + 'px', top: preview.top + 'px', width: PREVIEW_WIDTH + 'px' }"
        aria-hidden="true"
      >
        <img v-if="frame.thumbnailUrl" :src="frame.thumbnailUrl" alt="" />
        <span v-else class="colour-frame big" :style="{ background: frame.background, borderColor: frame.border }"></span>
        <div class="preview-name">{{ frame.name }}</div>
        <div v-if="cut" class="preview-cut">{{ cut }}</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Every tile is the same card, whatever the size of the frame picture: at most 72px wide,
   smaller only if the panel is narrow (the grid in StripView.vue sets the columns) */
.frame-tile-wrap {
  width: 100%;
  max-width: 72px;
  min-width: 0;
}

/* The card: the frame on top, its cut label under it */
.frame-tile {
  position: relative;
  width: 100%;
  padding: 5px 5px 4px;
  border: 1px solid var(--line, #E3E6EE);
  border-radius: 10px;
  background: var(--soft, #F4F6FA);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

/* A fixed portrait box, like a photostrip. The picture fits inside without being cut or stretched,
   and a tall picture cannot make the box bigger (it sits on top of the box, outside its flow). */
.frame-pic {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
}

.frame-pic img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain; /* the whole frame, with its own rounded border */
  pointer-events: none;
}

/* The frame in use: a blue ring */
.frame-tile.active {
  border-color: var(--brand, #2F5BEA);
  box-shadow: 0 0 0 2px var(--brand, #2F5BEA);
}

.frame-tile:active {
  transform: scale(0.97);
}

.frame-tile:focus-visible {
  outline: 2px solid var(--brand, #2F5BEA);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .frame-tile:hover {
    border-color: var(--brand, #2F5BEA);
  }
}

/* A built-in frame: a little strip in its colours */
.colour-frame {
  display: block;
  width: 62%;
  height: 92%;
  border: 3px solid;
  border-radius: 4px;
}

.frame-tile.circle .colour-frame,
.frame-tile.rounded .colour-frame {
  border-radius: 8px;
}

/* ★ on a frame saved from the marketplace */
.saved-star {
  position: absolute;
  top: -7px;
  right: -5px;
  font-size: 0.75rem;
  color: #E0A100;
  text-shadow: 0 0 2px #fff, 0 0 2px #fff;
}

/* "4-cut" under the frame, inside the card */
.frame-cut {
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--muted, #6B7080);
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

/* ---------- The bigger preview ---------- */
.frame-preview {
  position: fixed;
  z-index: 1080; /* above the page, below popups */
  transform: translateY(-50%);
  padding: 10px;
  background: #fff;
  border: 1px solid var(--line, #E3E6EE);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04), 0 12px 32px rgba(20, 23, 43, 0.06);
  pointer-events: none;
  text-align: center;
  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* Appears with a quick fade and grow */
@starting-style {
  .frame-preview {
    opacity: 0;
    transform: translateY(-50%) scale(0.96);
  }
}

.frame-preview img {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: contain;
}

.colour-frame.big {
  width: 60%;
  height: 180px;
  margin: 0 auto;
}

.preview-name {
  margin-top: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink, #14172B);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-cut {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted, #6B7080);
}

@media (prefers-reduced-motion: reduce) {
  .frame-tile,
  .frame-preview {
    transition: none;
  }

  .frame-tile:active {
    transform: none;
  }
}
</style>
