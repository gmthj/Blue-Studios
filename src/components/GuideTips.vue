<script setup>
// Beginner tips: a small card that points at one part of the page at a time, with
// Next / Skip, the same idea as the Sticker Maker's GIF tips. Used by the Sticker Maker and
// the Frame Editor instead of grey instruction text everywhere.
//
//   <GuideTips ref="guide" :steps="TIPS" storage-key="sm-guide-seen" />
//   guide.value.start()   // show them again (the "?" button)
//
// steps: [{ target: '.css-selector', title, text }]. A step whose part is not on the screen
// (a closed panel on a phone) is shown in the middle instead.
// The first visit shows them by itself; after Skip or the last step they only come back
// from the "?" button. localStorage can be blocked, so every use is wrapped.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  steps: { type: Array, required: true },
  storageKey: { type: String, required: true },
})

const index = ref(-1)
const box = ref(null) // where the card goes: { top, left, placement } or null for the middle
const step = computed(() => (index.value >= 0 ? props.steps[index.value] : null))
let marked = null

function seen() {
  try {
    return localStorage.getItem(props.storageKey) === '1'
  } catch {
    return false
  }
}

function remember() {
  try {
    localStorage.setItem(props.storageKey, '1')
  } catch {
    // blocked: the tips may show again next time, which is fine
  }
}

function unmark() {
  if (marked) marked.classList.remove('guide-tips-target')
  marked = null
}

// Find the part this step is about, outline it and put the card beside it
function place() {
  unmark()
  box.value = null
  if (!step.value) return
  const el = document.querySelector(step.value.target)
  const rect = el && el.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) return // not on screen: card in the middle
  el.classList.add('guide-tips-target')
  marked = el
  const cardWidth = Math.min(300, window.innerWidth - 24)
  const cardHeight = 170
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - cardWidth / 2, window.innerWidth - cardWidth - 12))
  // Below the part if there is room, otherwise above, otherwise beside it
  if (rect.bottom + 12 + cardHeight < window.innerHeight) {
    box.value = { top: rect.bottom + 12, left, placement: 'below' }
  } else if (rect.top - 12 - cardHeight > 0) {
    box.value = { top: rect.top - 12 - cardHeight, left, placement: 'above' }
  } else {
    const side = rect.right + 12 + cardWidth < window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - 12 - cardWidth)
    box.value = { top: Math.max(12, Math.min(rect.top, window.innerHeight - cardHeight - 12)), left: side, placement: 'beside' }
  }
}

async function start() {
  index.value = 0
  await nextTick()
  place()
}

async function next() {
  if (index.value >= props.steps.length - 1) {
    close()
    return
  }
  index.value++
  await nextTick()
  place()
}

function close() {
  remember()
  unmark()
  index.value = -1
}

function onKey(event) {
  if (event.key === 'Escape' && index.value >= 0) close()
}

let startTimer = null
onMounted(() => {
  window.addEventListener('resize', place)
  window.addEventListener('keydown', onKey)
  // First visit: start after the page has settled
  if (!seen()) startTimer = setTimeout(start, 900)
})

onBeforeUnmount(() => {
  clearTimeout(startTimer)
  window.removeEventListener('resize', place)
  window.removeEventListener('keydown', onKey)
  unmark()
})

defineExpose({ start })
</script>

<template>
  <Teleport to="body">
    <div v-if="step" class="guide-tips-layer" @click.self="close">
      <div
        class="guide-tips-card"
        :class="box ? 'is-' + box.placement : 'is-middle'"
        :style="box ? { top: box.top + 'px', left: box.left + 'px' } : null"
        role="dialog"
        aria-live="polite"
        :aria-label="step.title"
      >
        <div class="guide-tips-head">
          <span class="guide-tips-title">{{ step.title }}</span>
          <span class="guide-tips-count">{{ index + 1 }} of {{ steps.length }}</span>
        </div>
        <p class="guide-tips-text">{{ step.text }}</p>
        <div class="guide-tips-actions">
          <button type="button" class="guide-tips-skip" @click="close">Skip</button>
          <button type="button" class="guide-tips-next" @click="next">
            {{ index === steps.length - 1 ? 'Got it' : 'Next' }}
            <AppIcon v-if="index < steps.length - 1" name="arrow-right" :size="14" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Not scoped: the outline goes on a part of the page, outside this component */
.guide-tips-target {
  /* No position change: the part may be fixed (a phone tool bar) and must stay where it is */
  outline: 3px solid rgba(47, 91, 234, 0.55) !important;
  outline-offset: 3px;
  animation: guide-tips-pulse 1.6s ease-in-out infinite;
}
@keyframes guide-tips-pulse {
  50% { outline-color: rgba(47, 91, 234, 0.2); }
}
@media (prefers-reduced-motion: reduce) {
  .guide-tips-target { animation: none; }
}
</style>

<style scoped>
.guide-tips-layer { position: fixed; inset: 0; z-index: 1060; background: rgba(20, 23, 43, 0.18); }
.guide-tips-card {
  position: fixed;
  width: min(300px, calc(100vw - 24px));
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: #14172B;
  color: #ffffff;
  box-shadow: 0 16px 40px rgba(20, 23, 43, 0.3);
  font-family: 'Plus Jakarta Sans', sans-serif;
  animation: guide-tips-in 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.guide-tips-card.is-middle { top: 50%; left: 50%; transform: translate(-50%, -50%); }
@keyframes guide-tips-in { from { opacity: 0; } }
.guide-tips-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.guide-tips-title { font-size: 0.95rem; font-weight: 700; }
.guide-tips-count { font-size: 0.72rem; color: rgba(255, 255, 255, 0.6); font-variant-numeric: tabular-nums; }
.guide-tips-text { margin: 0 0 12px; font-size: 0.85rem; line-height: 1.5; color: rgba(255, 255, 255, 0.85); text-wrap: pretty; }
.guide-tips-actions { display: flex; align-items: center; justify-content: space-between; }
.guide-tips-skip { border: 0; background: transparent; color: rgba(255, 255, 255, 0.7); font-size: 0.85rem; font-weight: 600; padding: 6px 4px; }
.guide-tips-next {
  display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 14px;
  border: 0; border-radius: 999px;
  background: #2F5BEA; color: #ffffff;
  font-size: 0.85rem; font-weight: 700;
}
.guide-tips-skip:focus-visible, .guide-tips-next:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .guide-tips-skip:hover { color: #ffffff; }
  .guide-tips-next:hover { background: #2449C4; }
}
@media (prefers-reduced-motion: reduce) {
  .guide-tips-card { animation: none; }
}
</style>
