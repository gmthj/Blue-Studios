<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'

// One small "how to" card in a short series of first-time tips, the same look as the GIF tips in the
// Sticker Maker (Rae's): a dark card with a little arrow pointing at the part it explains,
// "1 of 3", Skip, and Next (Got it on the last one).
// The page decides where it sits (put it inside a position: relative box and place it with a class),
// and remembers that the tips were seen (see the Pick page, PickView.vue).
// Usage: <PageTip :title="tip.title" :text="tip.text" :phone="tip.phone" :step="1" :total="3" arrow="up" @next="..." @skip="..." />

const props = defineProps({
  title: { type: String, required: true },
  text: { type: String, required: true },
  step: { type: Number, required: true },   // counted from 1
  total: { type: Number, required: true },
  arrow: { type: String, default: 'up' },   // 'up': the card is under what it explains, 'down': above it
  phone: { type: String, default: '' },     // optional: how to do it on a phone, a smaller line at the bottom
})

const emit = defineEmits(['next', 'skip'])

const card = ref(null)
const nextButton = ref(null)

// Bring the card into view (on phones the panels are stacked, so it can be off screen) and put the
// keyboard on Next, so Enter moves on and Tab reaches Skip
async function showCard() {
  await nextTick()
  if (!card.value) return
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card.value.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
  if (nextButton.value) nextButton.value.focus({ preventScroll: true })
}

onMounted(showCard)
watch(() => props.step, showCard)
</script>

<template>
  <div
    ref="card"
    class="page-tip"
    :class="'arrow-' + arrow"
    role="dialog"
    aria-live="polite"
    :aria-label="title"
    @keydown.esc="emit('skip')"
  >
    <div class="tip-head">
      <span class="tip-title">{{ title }}</span>
      <span class="tip-step">{{ step }} of {{ total }}</span>
    </div>
    <p class="tip-text">{{ text }}</p>
    <p v-if="phone" class="tip-phone"><span class="tip-phone-label">On a phone</span> {{ phone }}</p>
    <div class="tip-actions">
      <button type="button" class="tip-skip" @click="emit('skip')">Skip</button>
      <button ref="nextButton" type="button" class="btn btn-primary btn-sm" @click="emit('next')">
        {{ step === total ? 'Got it' : 'Next' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Dark ink card, like the Sticker Maker's GIF tips, so it stands out from the white panels */
.page-tip {
  position: absolute;
  z-index: 40;
  width: min(300px, calc(100% - 16px));
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: var(--ink, #14172B);
  color: #ffffff;
  box-shadow: 0 16px 40px rgba(20, 23, 43, 0.25);
  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  text-align: left;
  transition: opacity 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

/* Appears with a quick fade and rise */
@starting-style {
  .page-tip {
    opacity: 0;
    transform: translateY(8px);
  }
}

/* The little arrow, pointing at the part the tip is about */
.page-tip::after {
  content: '';
  position: absolute;
  left: 28px;
  width: 12px;
  height: 12px;
  background: var(--ink, #14172B);
  transform: rotate(45deg);
}

.page-tip.arrow-up::after {
  top: -6px;
}

.page-tip.arrow-down::after {
  bottom: -6px;
}

.tip-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.tip-title {
  font-size: 0.95rem;
  font-weight: 700;
  text-wrap: balance;
}

.tip-step {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: #B9BECC;
  font-variant-numeric: tabular-nums;
}

.tip-text {
  margin: 6px 0 10px;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--line, #E3E6EE);
  text-wrap: pretty;
}

.tip-text:has(+ .tip-phone) {
  margin-bottom: 8px;
}

/* How to do it on a phone: under a thin line, a little smaller */
.tip-phone {
  margin: 0 0 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 0.8rem;
  line-height: 1.45;
  color: #B9BECC;
  text-wrap: pretty;
}

.tip-phone-label {
  margin-right: 2px;
  font-weight: 700;
  color: #ffffff;
}

.tip-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.tip-skip {
  padding: 4px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #B9BECC;
  font-size: 0.85rem;
  font-weight: 600;
  transition: color 150ms ease;
}

.tip-skip:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .tip-skip:hover {
    color: #ffffff;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-tip {
    transition: none;
  }
}
</style>
