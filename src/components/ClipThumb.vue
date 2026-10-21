<script setup>
// ref: a value Vue watches (the page updates when it changes). onMounted: run code once the tile is on screen.
import { ref, onMounted } from 'vue'
// getFileUrl(path) turns a Storage path into a link we can play
import { getFileUrl } from '../studio.js'

// One recorded clip in the gallery. It shows the first frame; tap it to play, tap again to pause.
// Usage: <ClipThumb :clip="clip" />
// badge-plays: only the "▶ play" label plays and pauses it, and tapping the rest of the tile does nothing here
// (the Pick page uses the tile to choose the clip for a slot, so a tap must not also play it).
// Usage: <ClipThumb :clip="clip" badge-plays />

// The one thing the parent gives us: the clip's document
const props = defineProps({
  clip: { type: Object, required: true }, // { path, name, mirrored, ... } (see clips.js)
  badgePlays: { type: Boolean, default: false },
})

const src = ref('')        // the video's link (empty until it has been fetched)
const failed = ref(false)  // true if the link could not be fetched
const video = ref(null)    // the <video> element itself (filled in by ref="video" in the template)
const playing = ref(false) // true while the clip is playing (so the label can say pause)

// When the tile appears, ask Storage for the clip's link
onMounted(async () => {
  try {
    // #t=0.1 makes phones show a frame instead of a black box
    src.value = (await getFileUrl(props.clip.path)) + '#t=0.1'
  } catch (error) {
    console.error(error)
    failed.value = true // the template then shows "Could not load"
  }
})

// Tapping the tile (or the label, with badge-plays): play if paused, pause if playing
function toggle() {
  if (!video.value) return // the video is not there yet
  if (video.value.paused) {
    video.value.play()
  } else {
    video.value.pause()
  }
}
</script>

<template>
  <!-- The tile. :title is the hover text. Clicking anywhere on it runs toggle(). -->
  <div class="clip" :title="'Video by ' + clip.name" @click="badgePlays || toggle()">
    <!-- v-if="src": only draw the video once we have its link.
         muted: browsers only allow playing without sound by itself. loop: it repeats.
         playsinline: iPhones play it in the page, not full screen.
         preload="metadata": download just enough to show the first frame.
         The "mirrored" class flips it if the clip came from a mirrored (selfie) camera. -->
    <video
      v-if="src"
      ref="video"
      :src="src"
      muted
      loop
      playsinline
      preload="metadata"
      :class="{ mirrored: clip.mirrored }"
      @play="playing = true"
      @pause="playing = false"
    ></video>
    <!-- While there is no link yet: "..." , or "Could not load" if it failed -->
    <span v-else class="small text-muted">{{ failed ? 'Could not load' : '...' }}</span>
    <!-- A small label so it is clear this tile is a video, not a photo -->
    <!-- With badge-plays the label is a button of its own (.stop: the tap does not also choose the tile) -->
    <button v-if="badgePlays" class="badge text-bg-dark clip-badge clip-badge-btn" @click.stop="toggle">{{ playing ? '❚❚ pause' : '▶ play' }}</button>
    <span v-else class="badge text-bg-dark clip-badge">▶ video</span>
  </div>
</template>

<style scoped>
/* The tile: a black box that clips anything sticking out, with the content centred */
.clip {
  position: relative; /* so the badge can be placed inside it */
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  min-width: 56px;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* The video fills the tile, cropped in the middle (like a photo) */
video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Mirror the picture like the photos are (the selfie camera is a mirror) */
video.mirrored {
  transform: scaleX(-1);
}

/* The "▶ video" label sits in the bottom-left corner and does not block taps */
.clip-badge {
  position: absolute;
  left: 3px;
  bottom: 3px;
  font-size: 0.6rem;
  pointer-events: none;
}

/* The label as a button: it must take taps, and it has no button border.
   It sits in the top-right corner, because the name tag of the person who recorded it is in the bottom-left. */
.clip-badge-btn {
  left: auto;
  bottom: auto;
  right: 3px;
  top: 3px;
  pointer-events: auto;
  border: none;
  cursor: pointer;
}
</style>
