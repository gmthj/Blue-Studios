<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { FACE_FILTERS } from '../filters/faceFilters.js'
import { useFaceFilter } from '../composables/useFaceFilter.js'
import AppIcon from './AppIcon.vue'

// A row of round filter buttons that scrolls BEHIND the shutter button, like Instagram / TikTok.
// The filter in the middle (under the shutter) is the chosen one: swipe to change it, or tap a filter
// to slide it to the middle. The list of filters is in src/filters/faceFilters.js.
// The camera page puts this on top of the camera, lined up with the shutter (see .filter-carousel-pos).
// Phones held sideways: the shutter is on the right, so the row goes up and down instead.
// Usage: <FaceFilterPicker :disabled="countdown > 0" />

defineProps({
  disabled: { type: Boolean, default: false }, // e.g. while the 3-2-1 countdown runs
})

const { faceFilterId, setFaceFilter } = useFaceFilter()

const scroller = ref(null) // the scrolling row
let scrollTimer = null

// The filter buttons, in the same order as FACE_FILTERS
function getButtons() {
  return scroller.value ? Array.from(scroller.value.querySelectorAll('.filter-btn')) : []
}

// Slide the scrolling row so this filter's button is in the middle (under the shutter)
function scrollToFilter(id, smooth) {
  const index = FACE_FILTERS.findIndex((filter) => filter.id === id)
  const button = getButtons()[index]
  if (!scroller.value || !button) return
  scroller.value.scrollTo({
    left: button.offsetLeft + button.offsetWidth / 2 - scroller.value.clientWidth / 2,
    top: button.offsetTop + button.offsetHeight / 2 - scroller.value.clientHeight / 2,
    behavior: smooth ? 'smooth' : 'instant',
  })
}

// The filter whose button is closest to the middle of the row
function middleFilterId() {
  const box = scroller.value.getBoundingClientRect()
  const middleX = box.left + box.width / 2
  const middleY = box.top + box.height / 2

  let closestId = faceFilterId.value
  let closestDistance = Infinity
  getButtons().forEach((button, index) => {
    const b = button.getBoundingClientRect()
    const distance = Math.hypot(b.left + b.width / 2 - middleX, b.top + b.height / 2 - middleY)
    if (distance < closestDistance) {
      closestDistance = distance
      closestId = FACE_FILTERS[index].id
    }
  })
  return closestId
}

// While swiping, the scroll event fires many times. Wait until it has stopped for a moment,
// then use the filter that ended up in the middle.
function onScroll() {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const id = middleFilterId()
    if (id !== faceFilterId.value) setFaceFilter(id)
  }, 120)
}

// When opened, start with the current filter in the middle
onMounted(async () => {
  await nextTick()
  scrollToFilter(faceFilterId.value, false)
})

// The filter can change from elsewhere too (e.g. back to "No filter" if it failed to load)
watch(faceFilterId, (id) => {
  if (scroller.value && middleFilterId() !== id) scrollToFilter(id, true)
})

onBeforeUnmount(() => clearTimeout(scrollTimer))
</script>

<template>
  <div
    ref="scroller"
    class="filter-carousel"
    :class="{ disabled: disabled }"
    role="radiogroup"
    aria-label="Face filters"
    @scroll="onScroll"
  >
    <!-- Empty space at both ends, so the first and last filters can reach the middle -->
    <div class="carousel-spacer"></div>

    <button
      v-for="filter in FACE_FILTERS"
      :key="filter.id"
      class="filter-btn"
      role="radio"
      :aria-checked="faceFilterId === filter.id"
      :aria-label="filter.name"
      :title="filter.name"
      :disabled="disabled"
      @click="scrollToFilter(filter.id, true)"
    >
      <img v-if="filter.thumbnail" :src="filter.thumbnail" alt="" draggable="false" />
      <AppIcon v-else name="close" :size="20" />
    </button>

    <div class="carousel-spacer"></div>
  </div>
</template>

<style scoped>
/* One row that scrolls sideways and stops with a filter exactly in the middle (scroll-snap) */
.filter-carousel {
  display: flex;
  align-items: center;
  gap: 14px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior: contain; /* swiping to the end does not scroll the page */
  scrollbar-width: none;        /* hide the scrollbar (Firefox) */
  /* The filters fade out towards the edges */
  -webkit-mask-image: linear-gradient(to right, transparent, #000 25%, #000 75%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 25%, #000 75%, transparent);
}

.filter-carousel::-webkit-scrollbar {
  display: none; /* hide the scrollbar (Chrome, Safari) */
}

/* During the countdown the filter cannot change */
.filter-carousel.disabled {
  pointer-events: none;
  opacity: 0.5;
}

/* Half the row minus half a button: the first / last button can then sit in the middle */
.carousel-spacer {
  flex: 0 0 calc(50% - 27px - 14px); /* 27px = half a button, 14px = the gap */
  align-self: stretch;
}

.filter-btn {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  color: #ffffff;
  background: rgba(14, 16, 32, 0.55);
  backdrop-filter: blur(6px);
  scroll-snap-align: center;
  transition: transform 160ms var(--ease-out), border-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.filter-btn img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  pointer-events: none;
}

.filter-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.filter-btn:focus-visible {
  outline: 3px solid var(--brand);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .filter-btn:not(:disabled):hover {
    border-color: #ffffff;
  }
}

/* Phones held sideways: the shutter is on the right edge, so the row goes up and down */
@media (orientation: landscape) and (max-height: 500px) {
  .filter-carousel {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    scroll-snap-type: y mandatory;
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
    mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
  }

  .filter-btn {
    width: 46px;
    height: 46px;
  }

  .filter-btn img {
    width: 30px;
    height: 30px;
  }

  .carousel-spacer {
    flex-basis: calc(50% - 23px - 14px); /* 23px = half a (smaller) button */
  }
}

@media (prefers-reduced-motion: reduce) {
  .filter-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
