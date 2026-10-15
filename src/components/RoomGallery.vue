<script setup>
import { computed } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'

// The shared gallery on the camera page: every photo taken in the room, grouped by shot,
// plus the "Make photostrip" button.
// Phones held upright: one sideways-scrolling row. Bigger screens: a column that scrolls up and down.

defineProps({
  // True while a 3-2-1 countdown is running (we do not want to leave the camera page mid-countdown)
  countdownRunning: { type: Boolean, default: false },
})

const { photos, roomRef } = useRoom()

// Group photos by shot number, so photos taken in the same countdown appear together.
// Result looks like: [ { shotNumber: 2, photos: [...] }, { shotNumber: 1, photos: [...] } ]
const shots = computed(() => {
  const groups = []
  for (const photo of photos.value) {
    let group = groups.find((g) => g.shotNumber === photo.shotNumber)
    if (!group) {
      group = { shotNumber: photo.shotNumber, photos: [] }
      groups.push(group)
    }
    group.photos.push(photo)
  }
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
        <button class="btn btn-success btn-sm" :disabled="photos.length === 0 || countdownRunning" @click="goToStrip">
          Make photostrip &rarr;
        </button>
      </div>

      <p v-if="shots.length === 0" class="small text-muted mb-0">
        No photos yet. Press the shutter and everyone's camera snaps at the same time.
      </p>

      <div class="gallery-scroll">
        <div v-for="shot in shots" :key="shot.shotNumber" class="shot">
          <p class="shot-title">Shot {{ shot.shotNumber }}</p>
          <div class="shot-photos">
            <img v-for="photo in shot.photos" :key="photo.id" :src="photo.image" :alt="'Photo by ' + photo.name" :title="photo.name" />
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

.shot-photos img {
  height: 56px;
  border-radius: 4px;
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
}
</style>
