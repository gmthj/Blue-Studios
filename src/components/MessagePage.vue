<script setup>
import AppIcon from './AppIcon.vue'

// A whole-page message in the middle of the screen: an icon, a title, a few words and buttons.
// Used for "this room is full", "page not found" and so on.
//   <MessagePage icon="search" title="Page not found">
//     Some text...
//     <template #actions><router-link to="/" class="btn btn-primary">Home</router-link></template>
//   </MessagePage>
// loading: shows a spinner instead of the icon.

defineProps({
  icon: { type: String, default: 'sparkle' },
  title: { type: String, required: true },
  loading: { type: Boolean, default: false },
})
</script>

<template>
  <div class="app-page message-page">
    <div class="message-box" :role="loading ? 'status' : undefined">
      <div class="message-icon" :class="{ loading }">
        <span v-if="loading" class="spinner-border" aria-hidden="true"></span>
        <AppIcon v-else :name="icon" :size="28" />
      </div>
      <h1 class="message-title">{{ title }}</h1>
      <p v-if="$slots.default" class="message-text"><slot /></p>
      <div v-if="$slots.actions" class="message-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fills most of the screen under the navbar, with the message in the middle */
.message-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 160px);
  min-height: calc(100dvh - 160px);
  padding: 24px 0;
}

/* Fades and rises in, so a quick change of page does not feel like a jump */
.message-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 440px;
  text-align: center;
  animation: message-in 400ms var(--ease-out) backwards;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.message-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 20px;
  border-radius: 20px;
  color: var(--brand);
  background: var(--brand-tint);
  transform: rotate(-4deg);
}

.message-icon.loading {
  transform: none;
}

.message-icon .spinner-border {
  width: 26px;
  height: 26px;
  border-width: 3px;
}

.message-title {
  margin-bottom: 8px;
  font-size: clamp(1.4rem, 1.2rem + 1vw, 1.9rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.message-text {
  margin-bottom: 0;
  color: var(--muted);
  font-size: 1rem;
  text-wrap: pretty;
}

/* The buttons: side by side, stacked on narrow phones */
.message-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 24px;
}

@media (max-width: 400px) {
  .message-actions {
    flex-direction: column;
    align-self: stretch;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-box {
    animation: none;
  }
}
</style>
