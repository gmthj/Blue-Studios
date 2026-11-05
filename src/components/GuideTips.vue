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

const props = defineProps({
  steps: { type: Array, required: true },
  storageKey: { type: String, required: true },
})

const index = ref(-1)
const box = ref(null) // where the card goes: { top or bottom, left, placement, arrowX or arrowY } or null for the middle
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

// Keep a number between two others
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// Find the part this step is about, outline it and put the card beside it, with the little arrow
// (the same as the Pick page's and the GIF tips') pointing at the middle of the part
function place() {
  unmark()
  box.value = null
  if (!step.value) return
  const el = document.querySelector(step.value.target)
  const rect = el && el.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) return // not on screen: card in the middle
  el.classList.add('guide-tips-target')
  marked = el
  const gap = 14 // room for the arrow
  const cardWidth = Math.min(300, window.innerWidth - 24)
  const cardHeight = 170
  const middleX = rect.left + rect.width / 2
  const middleY = rect.top + rect.height / 2
  const left = clamp(middleX - cardWidth / 2, 12, window.innerWidth - cardWidth - 12)
  const arrowX = clamp(middleX - left, 22, cardWidth - 22)
  // Below the part if there is room, otherwise above, otherwise beside it
  if (rect.bottom + gap + cardHeight < window.innerHeight) {
    box.value = { top: rect.bottom + gap, left, placement: 'below', arrowX }
  } else if (rect.top - gap - cardHeight > 0) {
    // Placed by its bottom edge, so the arrow touches the part whatever the card's height
    box.value = { bottom: window.innerHeight - rect.top + gap, left, placement: 'above', arrowX }
  } else {
    const onRight = rect.right + gap + cardWidth < window.innerWidth
    const sideLeft = onRight ? rect.right + gap : Math.max(12, rect.left - gap - cardWidth)
    // Next to a tall part (a side panel): level with its middle, as far as the screen allows
    const top = clamp(middleY - cardHeight / 2, 12, window.innerHeight - cardHeight - 12)
    box.value = { top, left: sideLeft, placement: onRight ? 'right' : 'left', arrowY: clamp(middleY - top, 22, cardHeight - 22) }
  }
}

// Where the card and its arrow go, as inline styles
const cardStyle = computed(() => {
  const b = box.value
  if (!b) return null
  const style = { left: b.left + 'px' }
  if (b.bottom !== undefined) style.bottom = b.bottom + 'px'
  else style.top = b.top + 'px'
  if (b.arrowX !== undefined) style['--arrow-x'] = b.arrowX + 'px'
  if (b.arrowY !== undefined) style['--arrow-y'] = b.arrowY + 'px'
  return style
})

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
        :style="cardStyle"
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
          <button type="button" class="btn btn-primary btn-sm" @click="next">
            {{ index === steps.length - 1 ? 'Got it' : 'Next' }}
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
/* The little arrow, pointing at the part the tip is about (the same as PageTip.vue and the GIF tips) */
.guide-tips-card:not(.is-middle)::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: #14172B;
  transform: rotate(45deg);
}
.guide-tips-card.is-below::after { top: -6px; left: calc(var(--arrow-x, 28px) - 6px); }
.guide-tips-card.is-above::after { bottom: -6px; left: calc(var(--arrow-x, 28px) - 6px); }
.guide-tips-card.is-right::after { left: -6px; top: calc(var(--arrow-y, 28px) - 6px); }
.guide-tips-card.is-left::after { right: -6px; top: calc(var(--arrow-y, 28px) - 6px); }
@keyframes guide-tips-in { from { opacity: 0; } }
/* The same title, text and buttons as the Pick page's tips (PageTip.vue) */
.guide-tips-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.guide-tips-title { font-size: 0.95rem; font-weight: 700; text-wrap: balance; }
.guide-tips-count { flex-shrink: 0; font-size: 0.75rem; color: #B9BECC; font-variant-numeric: tabular-nums; }
.guide-tips-text { margin: 6px 0 10px; font-size: 0.85rem; line-height: 1.5; color: #E3E6EE; text-wrap: pretty; }
.guide-tips-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.guide-tips-skip {
  padding: 4px 8px; border: 0; border-radius: 8px;
  background: transparent; color: #B9BECC;
  font-size: 0.85rem; font-weight: 600;
  transition: color 150ms ease;
}
.guide-tips-skip:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }
/* The card is moved to <body>, outside .app-page, so Next gets the app's blue button here (pages.css) */
.guide-tips-card .btn {
  --bs-btn-font-weight: 600;
  --bs-btn-border-radius: 8px;
  --bs-btn-bg: #2F5BEA;
  --bs-btn-border-color: #2F5BEA;
  --bs-btn-hover-bg: #2449C4;
  --bs-btn-hover-border-color: #2449C4;
  --bs-btn-active-bg: #2449C4;
  --bs-btn-active-border-color: #2449C4;
  --bs-btn-focus-box-shadow: 0 0 0 4px rgba(47, 91, 234, 0.2);
  transition: background-color 150ms ease, border-color 150ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.guide-tips-card .btn:active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) {
  .guide-tips-card .btn:active { transform: none; }
}
@media (hover: hover) and (pointer: fine) {
  .guide-tips-skip:hover { color: #ffffff; }
}
@media (prefers-reduced-motion: reduce) {
  .guide-tips-card { animation: none; }
}
</style>
