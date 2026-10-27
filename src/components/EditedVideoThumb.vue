<script setup>
import { ref } from 'vue'
import ClipSequencePlayer from './ClipSequencePlayer.vue'

// One edited video in the Pick gallery: it shows the first frame, and the "▶ play" label in the top-right
// corner plays the whole edit right here (once, no loop). Tapping the rest of the tile does nothing here,
// because the Pick page uses the tile to choose the video for a slot (like ClipThumb with badge-plays).
// Usage: <EditedVideoThumb :edited="edited" />   edited = { name, entries, ... } (see resolveEditedVideos in clips.js)

defineProps({
  edited: { type: Object, required: true },
})

const player = ref(null)   // the ClipSequencePlayer inside, so the label can start and stop it
const playing = ref(false) // true while it plays (so the label can say pause)

function toggle() {
  if (!player.value) return
  if (playing.value) {
    player.value.stop()
  } else {
    player.value.play()
  }
}
</script>

<template>
  <div class="tile" :title="edited.name + ' (' + edited.entries.length + ' clips)'">
    <!-- bare: just the picture, filling the tile. No autoplay: it only plays when the label is pressed. -->
    <ClipSequencePlayer ref="player" bare :entries="edited.entries" @playing="(value) => (playing = value)" />
    <button class="badge text-bg-dark play-badge" @click.stop="toggle">{{ playing ? '❚❚ pause' : '▶ play' }}</button>
  </div>
</template>

<style scoped>
/* The tile: a black box that cuts off anything sticking out. position: relative so the label can sit inside it. */
.tile {
  position: relative;
  background: #000;
  overflow: hidden;
  aspect-ratio: 4 / 5;
}

/* The video inside ignores the mouse, so the whole tile is dragged */
.tile :deep(video) {
  pointer-events: none;
}

/* The label is in the top-right corner, away from the name tag in the bottom-left */
.play-badge {
  position: absolute;
  right: 3px;
  top: 3px;
  font-size: 0.6rem;
  border: none;
  cursor: pointer;
}
</style>
