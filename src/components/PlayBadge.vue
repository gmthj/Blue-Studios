<script setup>
import AppIcon from './AppIcon.vue'

// The round play / pause button on video tiles (drawn icons, not ▶ ❚❚ characters: Windows shows those as emoji).
// Usage:
//   <PlayBadge :playing="playing" button @toggle="toggle" />   a real button (taps on it do not reach the tile)
//   <PlayBadge />                                              just the picture, e.g. a "this is a video" sign
// size: how wide the circle is, in px

const props = defineProps({
  playing: { type: Boolean, default: false },
  button: { type: Boolean, default: false },
  size: { type: Number, default: 28 },
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <button
    v-if="button"
    type="button"
    class="play-badge is-button"
    :style="{ width: size + 'px', height: size + 'px' }"
    :aria-label="playing ? 'Pause video' : 'Play video'"
    :aria-pressed="playing"
    @click.stop="emit('toggle')"
  >
    <AppIcon :name="playing ? 'pause-fill' : 'play-fill'" :size="Math.round(size * 0.5)" :class="{ 'play-shift': !playing }" />
  </button>
  <span v-else class="play-badge" :style="{ width: size + 'px', height: size + 'px' }" aria-hidden="true">
    <AppIcon :name="playing ? 'pause-fill' : 'play-fill'" :size="Math.round(size * 0.5)" :class="{ 'play-shift': !playing }" />
  </span>
</template>

<style scoped>
/* A dark, see-through circle with a thin light ring, so it shows up on bright and dark videos */
.play-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  color: #fff;
  background: rgba(14, 16, 32, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 160ms ease;
}

.play-badge.is-button {
  cursor: pointer;
}

@media (hover: hover) {
  .play-badge.is-button:hover {
    background: rgba(14, 16, 32, 0.75);
    transform: scale(1.06);
  }
}

.play-badge.is-button:active {
  transform: scale(0.94);
}

.play-badge.is-button:focus-visible {
  outline: 2px solid #2F5BEA;
  outline-offset: 2px;
}

/* A triangle looks off-centre to the left when it is centred exactly, so nudge it right a little */
.play-shift {
  margin-left: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .play-badge {
    transition: none;
  }
}
</style>
