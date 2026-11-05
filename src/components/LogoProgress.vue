<script setup>
import { computed } from 'vue'

// A progress bar that is the Blue Studios logo: it starts pale grey, and fills up with its colours from the bottom.
// Usage: <LogoProgress :progress="0.4" />   progress = 0 (empty) to 1 (full)
// The picture is the logo of the top bar, in a bigger size (public/images/logo-mark-large.png, 238 x 336, cut out of
// bluestudios.jpeg). It is drawn twice, one on top of the other: the pale one underneath, and the full colour one on top,
// cut off higher up the less is done.

const props = defineProps({
  progress: { type: Number, default: 0 },
  label: { type: String, default: 'Making the file' }, // what the bar is for (read out by screen readers)
})

// 0 to 100, never outside it
const percent = computed(() => Math.round(Math.min(1, Math.max(0, props.progress || 0)) * 100))
</script>

<template>
  <div class="logo-progress" role="progressbar" :aria-label="label" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100" :style="{ '--fill': percent + '%' }">
    <img class="logo-empty" src="/images/logo-mark-large.png" alt="" width="238" height="336" />
    <img class="logo-full" src="/images/logo-mark-large.png" alt="" width="238" height="336" />
  </div>
</template>

<style scoped>
/* As big as the picture is sharp (238 pixels wide), and smaller on a narrow phone. aspect-ratio keeps its shape. */
.logo-progress {
  position: relative;
  width: min(238px, 70%);
  aspect-ratio: 238 / 336;
  margin: 8px auto 16px;
}

.logo-progress img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

/* The logo before it is filled: pale grey */
.logo-empty {
  filter: grayscale(1) opacity(0.28);
}

/* The logo with its colours, showing from the bottom up to --fill. It glides to each new value (the numbers arrive
   every couple of seconds from the device making the file, so it would jump without this). */
.logo-full {
  clip-path: inset(calc(100% - var(--fill)) 0 0 0);
  transition: clip-path 1.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .logo-full {
    transition: none;
  }
}
</style>
