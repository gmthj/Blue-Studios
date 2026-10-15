<script setup>
import { ref, computed } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import VideoCallCard from '../components/VideoCallCard.vue'

// The photostrip page (a child of RoomLayout.vue). Everyone in the room sees the SAME strip:
// the chosen photos are saved in the room document (stripSlots), so a change by anyone shows for everyone.

// Size of the exported JPG, in pixels. Each slot is 4:3 like the camera photos.
const STRIP_WIDTH = 600
const PADDING = 30                            // white border around the photos
const GAP = 20                                // white space between photos
const SLOT_WIDTH = STRIP_WIDTH - PADDING * 2  // 540
const SLOT_HEIGHT = (SLOT_WIDTH * 3) / 4      // 405
const FOOTER_HEIGHT = 100                     // space at the bottom for the text

const { code, room, photos, roomRef } = useRoom()

const activeSlot = ref(0) // which slot MY next chosen photo goes into (each person has their own)
const exporting = ref(false)

// The 4 slots, as photo objects (or null if empty).
// The room document stores only the photo ids: stripSlots: { 0: 'photoId', 1: null, ... }
const slots = computed(() => {
  const saved = room.value.stripSlots || {}
  const result = []
  for (let i = 0; i < 4; i++) {
    const photo = photos.value.find((p) => p.id === saved[i])
    result.push(photo || null)
  }
  return result
})

const filledCount = computed(() => {
  return slots.value.filter((photo) => photo !== null).length
})

// Save one slot in the room document. 'stripSlots.2' means "only the field 2 inside stripSlots",
// so two people changing different slots at the same time do not overwrite each other.
async function saveSlot(index, photoId) {
  const changes = {}
  changes['stripSlots.' + index] = photoId
  await updateDoc(roomRef(), changes)
}

// Put the photo in my active slot, then move to the next empty slot
async function choosePhoto(photo) {
  const index = activeSlot.value
  for (let i = 0; i < 4; i++) {
    if (i !== index && slots.value[i] === null) {
      activeSlot.value = i
      break
    }
  }
  await saveSlot(index, photo.id)
}

async function clearSlot(index) {
  activeSlot.value = index
  await saveSlot(index, null)
}

// Everyone goes back to the camera page together (RoomLayout.vue follows the room's "stage")
async function backToCamera() {
  await updateDoc(roomRef(), { stage: 'camera' })
}

// Used to dim photos that are already on the strip
function isUsed(photo) {
  return slots.value.some((slotPhoto) => slotPhoto !== null && slotPhoto.id === photo.id)
}

// Turn an image URL into an <img> element we can draw on a canvas.
// Loading takes a moment, so we wrap it in a Promise and wait for onload.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Draw an image to fill the box completely, cutting off the edges if the shape is different
// (like CSS "object-fit: cover"). e.g. a tall phone photo in a wide slot loses its top and bottom.
function drawImageCover(ctx, img, x, y, boxWidth, boxHeight) {
  const scale = Math.max(boxWidth / img.width, boxHeight / img.height)
  // The part of the original image that fits in the box, taken from the centre
  const cropWidth = boxWidth / scale
  const cropHeight = boxHeight / scale
  const cropX = (img.width - cropWidth) / 2
  const cropY = (img.height - cropHeight) / 2
  ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, x, y, boxWidth, boxHeight)
}

// Each person can download the strip to their own device
async function exportJpg() {
  exporting.value = true

  const canvas = document.createElement('canvas')
  canvas.width = STRIP_WIDTH
  canvas.height = PADDING + SLOT_HEIGHT * 4 + GAP * 3 + FOOTER_HEIGHT
  const ctx = canvas.getContext('2d')

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw each slot from top to bottom
  for (let i = 0; i < 4; i++) {
    const y = PADDING + i * (SLOT_HEIGHT + GAP)
    if (slots.value[i]) {
      const img = await loadImage(slots.value[i].image)
      drawImageCover(ctx, img, PADDING, y, SLOT_WIDTH, SLOT_HEIGHT)
    } else {
      // Empty slot: light grey box
      ctx.fillStyle = '#eeeeee'
      ctx.fillRect(PADDING, y, SLOT_WIDTH, SLOT_HEIGHT)
    }
  }

  // Footer text
  ctx.fillStyle = '#333333'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Blue Studios', STRIP_WIDTH / 2, canvas.height - FOOTER_HEIGHT / 2 + 10)

  // Download: make a temporary link to the JPG and click it
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/jpeg', 0.92)
  link.download = 'photostrip-' + code.value + '.jpg'
  link.click()

  exporting.value = false
}
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Make your photostrip together</h1>
    <button class="btn btn-outline-secondary btn-sm" @click="backToCamera">&larr; Back to camera</button>
  </div>

  <!-- Everyone in the room, including me: live video, mute, leave, close room -->
  <VideoCallCard class="mb-4" layout="row" />

  <div class="row g-4">
    <!-- LEFT: the strip preview (the same for everyone) -->
    <div class="col-12 col-md-5 col-lg-4 col-xl-3">
      <div class="strip mx-auto">
        <div
          v-for="(photo, index) in slots"
          :key="index"
          class="slot"
          :class="{ active: index === activeSlot }"
          @click="activeSlot = index"
        >
          <img v-if="photo" :src="photo.image" :alt="'Slot ' + (index + 1)" />
          <span v-else class="slot-label">{{ index + 1 }}</span>

          <!-- .stop so clicking the X does not also select the slot -->
          <button v-if="photo" class="btn btn-sm btn-light remove-btn" @click.stop="clearSlot(index)">&times;</button>
        </div>
        <p class="strip-footer">Blue Studios</p>
      </div>

      <button class="btn btn-primary w-100 mt-3" :disabled="filledCount === 0 || exporting" @click="exportJpg">
        {{ exporting ? 'Exporting...' : 'Download JPG' }}
      </button>
      <p class="small text-muted text-center mt-2 mb-0">{{ filledCount }} of 4 slots filled</p>
    </div>

    <!-- RIGHT: all photos from the room to choose from -->
    <div class="col-12 col-md-7 col-lg-8 col-xl-9">
      <p class="text-muted small">
        Tap a slot on the strip, then tap a photo to put it there. Everyone in the room sees the same strip.
      </p>

      <div v-if="photos.length === 0" class="alert alert-info">This room has no photos yet.</div>

      <div class="row g-2">
        <div v-for="photo in photos" :key="photo.id" class="col-4 col-lg-3 col-xl-2">
          <img
            :src="photo.image"
            :alt="'Photo by ' + photo.name"
            class="w-100 rounded pick-photo"
            :class="{ used: isUsed(photo) }"
            @click="choosePhoto(photo)"
          />
          <p class="small text-center text-muted mb-0">Shot {{ photo.shotNumber }} &middot; {{ photo.name }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The preview uses the same proportions as the exported JPG */
.strip {
  max-width: 280px;
  background: #ffffff;
  padding: 14px 14px 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}

/* Bootstrap "xl" (1200px+): a bigger strip preview on big screens */
@media (min-width: 1200px) {
  .strip {
    max-width: 340px;
  }
}

.slot {
  position: relative;
  aspect-ratio: 4 / 3;
  background: #eeeeee;
  margin-bottom: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot.active {
  outline: 3px solid var(--bs-primary);
}

.slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slot-label {
  color: #aaaaaa;
  font-size: 1.5rem;
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  line-height: 1;
}

.strip-footer {
  text-align: center;
  font-weight: bold;
  color: #333333;
  padding: 10px 0 14px;
  margin: 0;
}

.pick-photo {
  cursor: pointer;
}

.pick-photo.used {
  opacity: 0.4;
}
</style>
