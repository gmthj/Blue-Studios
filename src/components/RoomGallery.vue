<script setup>
import { computed } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import ClipThumb from './ClipThumb.vue'

// The shared gallery on the camera page: every photo and video clip taken in the room, grouped by shot,
// plus the "Make photostrip" button.
// Phones held upright: one sideways-scrolling row. Bigger screens: a column that scrolls up and down.

defineProps({
  // True while a 3-2-1 countdown is running (we do not want to leave the camera page mid-countdown)
  countdownRunning: { type: Boolean, default: false },
})

const { photos, clips, roomRef } = useRoom()

// Group photos and clips by shot number, so everything taken in the same countdown appears together.
// Result looks like: [ { shotNumber: 2, photos: [...], clips: [...] }, { shotNumber: 1, photos: [...], clips: [...] } ]
const shots = computed(() => {
  const groups = []
  function groupFor(shotNumber) {
    let group = groups.find((g) => g.shotNumber === shotNumber)
    if (!group) {
      group = { shotNumber: shotNumber, photos: [], clips: [] }
      groups.push(group)
    }
    return group
  }
  for (const photo of photos.value) {
    groupFor(photo.shotNumber).photos.push(photo)
  }
  for (const clip of clips.value) {
    groupFor(clip.shotNumber).clips.push(clip)
  }
  groups.sort((a, b) => a.shotNumber - b.shotNumber)
  return groups.reverse() // newest shot first
})

// Everyone moves to the strip page together (RoomLayout.vue follows the room's "stage")
async function goToStrip() {
  await updateDoc(roomRef(), { stage: 'strip' })
}
</script>

<template>
  <div class="card gallery-card">
    <div class="card-body d-flex flex-column p-2">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="h6 mb-0">Gallery</h2>
        <button class="btn btn-success btn-sm" :disabled="(photos.length === 0 && clips.length === 0) || countdownRunning" @click="goToStrip">
          Make photostrip &rarr;
        </button>
      </div>

      <p v-if="shots.length === 0" class="small text-muted mb-0">
        Nothing yet. Press the shutter and everyone's camera snaps (or records) at the same time.
      </p>

      <div class="gallery-scroll">
        <div v-for="shot in shots" :key="shot.shotNumber" class="shot">
          <p class="shot-title">Shot {{ shot.shotNumber }}</p>
          <div class="shot-photos">
            <img v-for="photo in shot.photos" :key="photo.id" :src="photo.image" :alt="'Photo by ' + photo.name" :title="photo.name" />
            <ClipThumb v-for="clip in shot.clips" :key="clip.id" :clip="clip" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Default (phones held upright, below Bootstrap's "sm" breakpoint): one sideways-scrolling row */
.gallery-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
}

.shot {
  flex: 0 0 auto;
}

.shot-title {
  font-size: 0.75rem;
  color: #6c757d;
  margin-bottom: 2px;
}

.shot-photos {
  display: flex;
  gap: 4px;
}

.shot-photos img,
.shot-photos .clip {
  height: 56px;
  border-radius: 4px;
}

.shot-photos .clip {
  aspect-ratio: 4 / 3; /* a clip has no size of its own until it loads, so it gets the shape of a photo */
}

/* Bootstrap "sm" and up (576px+): the gallery fills its space and scrolls up and down, 2 photos per row */
@media (min-width: 576px) {
  .gallery-card .card-body {
    min-height: 0; /* lets the card be shorter than its photos, so the photos scroll inside it */
  }

  .gallery-scroll {
    display: block;
    flex: 1;
    min-height: 0;
    overflow-x: visible;
    overflow-y: auto;
  }

  .shot {
    margin-bottom: 10px;
  }

  .shot-photos {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .shot-photos img {
    width: 100%;
    height: auto;
  }

  .shot-photos .clip {
    width: 100%;
    height: auto;
  }
}
</style>
