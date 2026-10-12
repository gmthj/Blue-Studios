<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Make your photostrip</h1>
    <router-link :to="'/room/' + code" class="btn btn-outline-secondary btn-sm">Back to room</router-link>
  </div>

  <div class="row g-4">
    <!-- LEFT: the strip preview -->
    <div class="col-12 col-md-5">
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
    <div class="col-12 col-md-7">
      <p class="text-muted small">Tap a slot on the strip, then tap a photo to put it there.</p>

      <p v-if="loading" class="text-muted">Loading photos...</p>
      <div v-else-if="photos.length === 0" class="alert alert-info">
        This room has no photos yet. <router-link :to="'/room/' + code">Go back and take some!</router-link>
      </div>

      <div class="row g-2">
        <div v-for="photo in photos" :key="photo.id" class="col-4 col-lg-3">
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

<script>
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase.js'

// Size of the exported JPG, in pixels. Each slot is 4:3 like the camera photos.
const STRIP_WIDTH = 600
const PADDING = 30                            // white border around the photos
const GAP = 20                                // white space between photos
const SLOT_WIDTH = STRIP_WIDTH - PADDING * 2  // 540
const SLOT_HEIGHT = (SLOT_WIDTH * 3) / 4      // 405
const FOOTER_HEIGHT = 100                     // space at the bottom for the text

export default {
  data() {
    return {
      code: this.$route.params.code,
      photos: [],                    // all photos taken in this room
      slots: [null, null, null, null], // the photo in each of the 4 slots (null = empty)
      activeSlot: 0,                 // which slot the next chosen photo goes into
      loading: true,
      exporting: false,
    }
  },

  computed: {
    filledCount() {
      return this.slots.filter((photo) => photo !== null).length
    },
  },

  async mounted() {
    // Load the room's photos once (oldest first)
    const photosQuery = query(collection(db, 'rooms', this.code, 'photos'), orderBy('createdAt'))
    const snapshot = await getDocs(photosQuery)
    const list = []
    snapshot.forEach((photoDoc) => {
      list.push({ id: photoDoc.id, ...photoDoc.data() })
    })
    this.photos = list
    this.loading = false
  },

  methods: {
    // Put the photo in the active slot, then move to the next empty slot
    choosePhoto(photo) {
      this.slots[this.activeSlot] = photo

      const nextEmpty = this.slots.indexOf(null)
      if (nextEmpty !== -1) {
        this.activeSlot = nextEmpty
      }
    },

    clearSlot(index) {
      this.slots[index] = null
      this.activeSlot = index
    },

    // Used to dim photos that are already on the strip
    isUsed(photo) {
      return this.slots.some((slotPhoto) => slotPhoto !== null && slotPhoto.id === photo.id)
    },

    // Turn an image URL into an <img> element we can draw on a canvas.
    // Loading takes a moment, so we wrap it in a Promise and wait for onload.
    loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      })
    },

    // Draw an image to fill the box completely, cutting off the edges if the shape is different
    // (like CSS "object-fit: cover"). e.g. a tall phone photo in a wide slot loses its top and bottom.
    drawImageCover(ctx, img, x, y, boxWidth, boxHeight) {
      const scale = Math.max(boxWidth / img.width, boxHeight / img.height)
      // The part of the original image that fits in the box, taken from the centre
      const cropWidth = boxWidth / scale
      const cropHeight = boxHeight / scale
      const cropX = (img.width - cropWidth) / 2
      const cropY = (img.height - cropHeight) / 2
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, x, y, boxWidth, boxHeight)
    },

    async exportJpg() {
      this.exporting = true

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
        if (this.slots[i]) {
          const img = await this.loadImage(this.slots[i].image)
          this.drawImageCover(ctx, img, PADDING, y, SLOT_WIDTH, SLOT_HEIGHT)
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
      link.download = 'photostrip-' + this.code + '.jpg'
      link.click()

      this.exporting = false
    },
  },
}
</script>

<style scoped>
/* The preview uses the same proportions as the exported JPG */
.strip {
  max-width: 280px;
  background: #ffffff;
  padding: 14px 14px 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
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
