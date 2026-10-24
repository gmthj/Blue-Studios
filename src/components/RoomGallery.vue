<script setup>
import { computed } from 'vue'
import { useRoom } from '../composables/useRoom.js'
import AppIcon from './AppIcon.vue'

// The shared gallery on the camera page: every photo taken in the room, grouped by shot,
// plus the "Make photostrip" button.
// Phones held upright: one sideways-scrolling row. Bigger screens: a column that scrolls up and down.

defineProps({
  // True while a 3-2-1 countdown is running (we do not want to leave the camera page mid-countdown)
  countdownRunning: { type: Boolean, default: false },
})

const { photos, goToStage } = useRoom()

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
  await goToStage('pick')
}
</script>

<template>
  <div class="card gallery-card">
    <div class="card-body d-flex flex-column">
      <div class="gallery-head">
        <h2 class="gallery-title">
          Photos
          <span v-if="photos.length" class="gallery-count">{{ photos.length }}</span>
        </h2>
        <button
          class="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
          :disabled="photos.length === 0 || countdownRunning"
          @click="goToStrip"
        >
          Make photostrip <AppIcon name="arrow-right" :size="14" />
        </button>
      </div>

      <div v-if="shots.length === 0" class="gallery-empty">
        <AppIcon name="image" :size="20" />
        <span>No photos yet. Press the shutter and everyone's camera snaps at the same time.</span>
      </div>

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
.gallery-card .card-body {
  padding: 12px;
}

.gallery-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.gallery-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

/* The number of photos, in a small grey pill */
.gallery-count {
  padding: 0 7px;
  border-radius: 999px;
  color: var(--muted, #6B7080);
  background: #F1F3F8;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 18px;
}

.gallery-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1.5px dashed #D6DAE4;
  border-radius: 12px;
  color: var(--muted, #6B7080);
  font-size: 0.8rem;
}

/* Default (phones held upright, below Bootstrap's "sm" breakpoint): one sideways-scrolling row */
.gallery-scroll {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.shot {
  flex: 0 0 auto;
}

.shot-title {
  margin-bottom: 4px;
  color: var(--muted, #6B7080);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.shot-photos {
  display: flex;
  gap: 4px;
}

/* New photos fade and grow in as they arrive */
.shot-photos img {
  height: 56px;
  border-radius: 8px;
  background: #F1F3F8;
  transition: opacity 300ms ease, transform 300ms cubic-bezier(0.23, 1, 0.32, 1);
}

@starting-style {
  .shot-photos img {
    opacity: 0;
    transform: scale(0.9);
  }
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
    margin-bottom: 12px;
  }

  .shot-photos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .shot-photos img {
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 3;
    object-fit: cover;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shot-photos img {
    transition: none;
  }
}
</style>
