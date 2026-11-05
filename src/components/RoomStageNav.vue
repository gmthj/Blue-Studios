<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoom } from '../composables/useRoom.js'
import AppIcon from './AppIcon.vue'

// The one place to move the room between steps: a bar docked to the bottom of every room page.
// Back is on the left, the main way forward on the right, and shortcuts that jump over steps (quick export,
// edit video...) are the small links between them. The pages' own Next / Back buttons are gone.
// Shown once by RoomLayout.vue. It leaves room for itself: RoomLayout.vue pads the page by its height
// (the CSS variable --stage-nav-h, set below) and ShootView.vue takes it off the camera page's height.
//
// Per step (kind: back = left, skip = a link in the middle, next = the blue button on the right):
//   Shoot    > Make photostrip
//   Pick     > Shoot | Quick export, Edit video (only with 2 or more videos in the gallery) | Decorate
//   Video    > Back to Pick
//   Decorate > Pick | Export without music | Add music
//   Music    > Decorate | Export
//   Export   > back to the step we came from
//   Share    > Back to Export
// Moving goes through goToStage, so "every frame must be filled" is still checked before Decorate and later.
// Export has no way forward here: the Export page's own "Share and download" button makes the file.

const { room, photos, clips, goToStage } = useRoom()

const stage = computed(() => (room.value && room.value.stage) || 'shoot')
const hasMedia = computed(() => photos.value.length > 0 || clips.value.length > 0)

const LABELS = { shoot: 'Shoot', pick: 'Pick', video: 'Video', decorate: 'Decorate', music: 'Music', export: 'Export', share: 'Share' }

// "Back to wherever": the step the room was on before it got to Export. Every device sees every step change,
// so each one can keep track by itself. A device that joins on Export has no history: it goes back to Decorate.
const cameFrom = ref('')
watch(stage, (now, before) => {
  if (before && before !== now) cameFrom.value = before
})
const exportBack = computed(() => (['pick', 'video', 'decorate', 'music'].includes(cameFrom.value) ? cameFrom.value : 'decorate'))

// The places to go from here
const options = computed(() => {
  switch (stage.value) {
    case 'shoot':
      return [{ to: 'pick', label: 'Make photostrip', kind: 'next', disabled: !hasMedia.value }]
    case 'pick':
      return [
        { to: 'shoot', label: 'Shoot', kind: 'back' },
        { to: 'export', label: 'Quick export', kind: 'skip' },
        ...(clips.value.length >= 2 ? [{ to: 'video', label: 'Edit video', kind: 'skip' }] : []),
        { to: 'decorate', label: 'Decorate', kind: 'next' },
      ]
    case 'video':
      return [{ to: 'pick', label: 'Back to Pick', kind: 'back' }]
    case 'decorate':
      return [
        { to: 'pick', label: 'Pick', kind: 'back' },
        { to: 'export', label: 'Export without music', kind: 'skip' },
        { to: 'music', label: 'Add music', kind: 'next' },
      ]
    case 'music':
      return [
        { to: 'decorate', label: 'Decorate', kind: 'back' },
        { to: 'export', label: 'Export', kind: 'next' },
      ]
    case 'export':
      return [{ to: exportBack.value, label: 'Back to ' + LABELS[exportBack.value], kind: 'back' }]
    case 'share':
      return [{ to: 'export', label: 'Back to Export', kind: 'back' }]
    default:
      return []
  }
})

const backOption = computed(() => options.value.find((option) => option.kind === 'back'))
const skipOptions = computed(() => options.value.filter((option) => option.kind === 'skip'))
const nextOption = computed(() => options.value.find((option) => option.kind === 'next'))

const moving = ref(false) // a move is being saved: ignore more clicks until it is done

async function go(option) {
  if (moving.value || option.disabled) return
  moving.value = true
  try {
    await goToStage(option.to)
  } catch (error) {
    console.error(error)
  }
  moving.value = false
}

// The bar's height, as the CSS variable --stage-nav-h (taller on phones when it has shortcuts), so the
// page can leave that much room at the bottom
const root = ref(null)
let sizeWatcher = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  sizeWatcher = new ResizeObserver(() => {
    const height = root.value ? root.value.offsetHeight : 0
    document.documentElement.style.setProperty('--stage-nav-h', height + 'px')
  })
  watch(
    root,
    (el, old) => {
      if (old) sizeWatcher.unobserve(old)
      if (el) sizeWatcher.observe(el)
    },
    { immediate: true }
  )
})
onBeforeUnmount(() => {
  if (sizeWatcher) sizeWatcher.disconnect()
  document.documentElement.style.removeProperty('--stage-nav-h')
})
</script>

<template>
  <nav v-if="options.length > 0" ref="root" class="stage-nav" aria-label="Move to another step">
    <div class="sn-inner">
      <!-- Back: on the left. On phones it is just the arrow when there is a forward button next to it. -->
      <button
        v-if="backOption"
        type="button"
        class="sn-btn sn-back"
        :class="{ 'has-next': nextOption }"
        data-test="stage-back"
        :aria-label="backOption.label"
        :disabled="moving"
        @click="go(backOption)"
      >
        <AppIcon name="arrow-left" :size="16" />
        <span class="sn-label">{{ backOption.label }}</span>
      </button>

      <!-- Shortcuts that jump over steps. On phones they are a row of their own above the buttons. -->
      <div v-if="skipOptions.length > 0" class="sn-mid">
        <button
          v-for="option in skipOptions"
          :key="option.to"
          type="button"
          class="sn-link"
          :data-test="'stage-skip-' + option.to"
          :disabled="moving"
          @click="go(option)"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- The main way forward -->
      <button
        v-if="nextOption"
        type="button"
        class="sn-btn sn-next"
        data-test="stage-next"
        :disabled="moving || nextOption.disabled"
        @click="go(nextOption)"
      >
        <span>{{ nextOption.label }}</span>
        <AppIcon name="arrow-right" :size="16" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* Its own colours (the same as the rest of the app), so it looks the same on every room page */
.stage-nav {
  --brand: #2F5BEA;
  --brand-dark: #2449C4;
  --brand-tint: #E8EEFF;
  --ink: #14172B;
  --muted: #6B7080;
  --line: #E3E6EE;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  /* Docked to the bottom of the screen, the full width. z-index 1035: above the page, below the video call
     window (1040), modals (1055) and the camera countdown (2000+). */
  position: fixed;
  z-index: 1035;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  color: var(--ink);
}

/* Back, shortcuts, forward: one row */
.sn-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 38px;
}

.sn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  color: var(--ink);
  background: transparent;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms ease, color 150ms ease, transform 160ms var(--ease-out), opacity 150ms ease;
}

.sn-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.sn-btn:focus-visible,
.sn-link:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

.sn-btn:disabled,
.sn-link:disabled {
  opacity: 0.5;
}

.sn-back {
  flex: 0 0 auto;
  padding: 0 14px 0 10px;
  color: var(--muted);
}

/* The main way forward, always on the right */
.sn-next {
  flex: 0 0 auto;
  margin-left: auto;
  color: #ffffff;
  background: var(--brand);
}

/* Shortcuts: small text links in the middle */
.sn-mid {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2px 8px;
  min-width: 0;
}

.sn-link {
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  background: transparent;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms ease, color 150ms ease;
}

/* Hover only with a mouse: on phones a tap would leave it stuck in its hover colour */
@media (hover: hover) and (pointer: fine) {
  .sn-back:hover:not(:disabled),
  .sn-link:hover:not(:disabled) {
    color: var(--brand);
    background: var(--brand-tint);
  }

  .sn-next:hover:not(:disabled) {
    background: var(--brand-dark);
  }
}

/* Phones: the shortcuts get a row of their own above Back and forward; Back is just its arrow when a
   forward button sits next to it, so the forward button gets the width */
@media (max-width: 575.98px) {
  .stage-nav {
    padding-top: 4px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  }

  .sn-inner {
    flex-wrap: wrap;
    gap: 0 8px;
  }

  .sn-mid {
    order: -1;
    flex-basis: 100%;
  }

  /* Tighter links, so there is little space above and below the shortcuts */
  .sn-link {
    height: 24px;
  }

  .sn-mid + .sn-next,
  .sn-back {
    margin-top: 2px;
  }

  .sn-back.has-next {
    width: 38px;
    padding: 0;
  }

  .sn-back.has-next .sn-label {
    display: none;
  }

  .sn-next {
    flex: 1 1 auto;
    margin-left: 0;
  }
}

/* Phones held sideways (short screens): one compact row */
@media (max-height: 500px) and (orientation: landscape) {
  .stage-nav {
    padding-top: 5px;
    padding-bottom: calc(5px + env(safe-area-inset-bottom, 0px));
  }

  .sn-inner {
    flex-wrap: nowrap;
    min-height: 32px;
  }

  .sn-mid {
    order: 0;
    flex-basis: auto;
  }

  .sn-btn {
    height: 32px;
  }

  .sn-next {
    flex: 0 0 auto;
    margin-left: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sn-btn,
  .sn-link {
    transition: none;
  }

  .sn-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
