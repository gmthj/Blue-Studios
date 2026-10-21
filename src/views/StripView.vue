<script setup>
import { ref, computed } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { LAYOUTS, FRAME_STYLES, saveFields } from '../stripData.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import VideoCallCard from '../components/VideoCallCard.vue'

// The "Pick" page (a child of RoomLayout.vue): choose a frame and drag photos into it.
//   Left:   gallery, photos grouped by session (shot)
//   Middle: the strip (PhotoStrip.vue), with the video call floating on big screens
//   Right:  saved frames (Default / Mine styles, Cut layouts), Skip video, Next
// Everything is saved in the room document, so everyone in the room sees the same strip.

const { room, photos, roomRef } = useRoom()

const selectedPhotoId = ref(null) // phones: the photo tapped (each person has their own)
const showCall = ref(true)        // the video call can be hidden so it does not cover the strip

// What the room has chosen (the first layout / style if nothing is saved yet)
const layout = computed(() => LAYOUTS.find((l) => l.id === room.value.stripLayoutId) || LAYOUTS[0])
const frameStyle = computed(() => FRAME_STYLES.find((s) => s.id === room.value.stripStyleId) || FRAME_STYLES[0])
const slotPhotos = computed(() => room.value.stripSlots || {})
const defaultStyles = FRAME_STYLES.filter((s) => s.group === 'default')
const myStyles = FRAME_STYLES.filter((s) => s.group === 'mine') // PLACEHOLDER (Joash): the user's own saved frames

// The photos as { id: photo }, so a slot can find its photo quickly
const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// Group photos by session (shot number), Session 1 first. Each session has one photo per person.
// Result looks like: [ { shotNumber: 1, photos: [...] }, { shotNumber: 2, photos: [...] } ]
const sessions = computed(() => {
  const groups = []
  for (const photo of photos.value) {
    let group = groups.find((g) => g.shotNumber === photo.shotNumber)
    if (!group) {
      group = { shotNumber: photo.shotNumber, photos: [] }
      groups.push(group)
    }
    group.photos.push(photo)
  }
  return groups.sort((a, b) => a.shotNumber - b.shotNumber)
})

// How many slots of the current layout have a photo
const filledCount = computed(() => {
  let count = 0
  for (let i = 0; i < layout.value.slots.length; i++) {
    if (slotPhotos.value[i] && photosById.value[slotPhotos.value[i]]) {
      count = count + 1
    }
  }
  return count
})

// Used to show a tick on photos that are already on the strip
function isUsed(photoId) {
  return Object.values(slotPhotos.value).includes(photoId)
}

// "Gabriel Tan" -> "GT", for the name tag on each photo
function initials(name) {
  return name.split(' ').map((word) => word.charAt(0).toUpperCase()).join('').slice(0, 2)
}

// ---------- DRAG AND DROP ----------

// When a gallery photo starts being dragged, put a small "parcel" in dataTransfer.
// It can only hold text, so the object is turned into JSON. PhotoStrip.vue reads it on drop.
function onPhotoDragStart(event, photo) {
  event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'photo', photoId: photo.id }))
  event.dataTransfer.effectAllowed = 'copy' // the photo stays in the gallery
}

// Put a photo in a slot (dropped, or tapped on a phone).
// The slot's photo id is overwritten, so the old photo is replaced, not stacked.
// If the photo was already in another slot, the two slots swap.
async function placePhoto(index, photoId) {
  const changes = {}
  changes['stripSlots.' + index] = photoId
  for (const key of Object.keys(slotPhotos.value)) {
    if (slotPhotos.value[key] === photoId && Number(key) !== index) {
      changes['stripSlots.' + key] = slotPhotos.value[index] || null
    }
  }
  selectedPhotoId.value = null
  await updateDoc(roomRef(), changes)
}

// Empty a slot, and remove its filter (that photo is no longer there)
async function clearSlot(index) {
  const changes = {}
  changes['stripSlots.' + index] = null
  changes['stripEdits.' + index] = null
  await updateDoc(roomRef(), changes)
}

// Phones do not support drag and drop: tap a photo, then tap a slot
function selectPhoto(photoId) {
  selectedPhotoId.value = selectedPhotoId.value === photoId ? null : photoId // tap again to unselect
}

function onSlotClick(index) {
  if (selectedPhotoId.value) {
    placePhoto(index, selectedPhotoId.value)
  }
}

// ---------- FRAMES ----------

// A different cut has different slots, so the slots are emptied (ask first if photos would be lost)
async function chooseLayout(id) {
  if (id === layout.value.id) return
  if (filledCount.value > 0 && !confirm('Changing the cut will clear the photos on the strip. Continue?')) return
  await saveFields(roomRef(), { stripLayoutId: id, stripSlots: {}, stripEdits: {} })
}

// A style only changes the colours and slot shape, so the photos stay
async function chooseStyle(id) {
  await saveFields(roomRef(), { stripStyleId: id })
}

// Everyone moves to another page together (RoomLayout.vue follows the room's "stage")
async function goToStage(stage) {
  await updateDoc(roomRef(), { stage: stage })
}
</script>

<template>
  <StageBar current="pick" />

  <!-- 3 columns from Bootstrap "lg" (992px) up. On phones: strip first, then gallery, then frames -->
  <div class="row g-3">
    <!-- LEFT: gallery -->
    <div class="col-12 col-lg-3 order-2 order-lg-1">
      <div class="panel">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <h2 class="h5 fw-bold mb-0">Gallery</h2>
          <button class="btn btn-link btn-sm p-0" @click="goToStage('camera')">&larr; Camera</button>
        </div>
        <p class="small text-muted mb-2">Drag a photo into a slot. On a phone: tap a photo, then tap a slot.</p>

        <p v-if="sessions.length === 0" class="small text-muted">No photos yet.</p>

        <!-- Scrolls up and down through the sessions; 3 photos per row in each session (col-4) -->
        <div class="gallery-scroll">
          <section v-for="session in sessions" :key="session.shotNumber" class="mb-3">
            <h3 class="h6 mb-2">Session {{ session.shotNumber }}</h3>
            <div class="row g-2 session-box">
              <div v-for="photo in session.photos" :key="photo.id" class="col-4">
                <div class="thumb" :class="{ selected: photo.id === selectedPhotoId }">
                  <img
                    :src="photo.image"
                    :alt="'Photo by ' + photo.name"
                    draggable="true"
                    @dragstart="onPhotoDragStart($event, photo)"
                    @click="selectPhoto(photo.id)"
                  />
                  <span class="name-tag">{{ initials(photo.name) }} · #{{ session.shotNumber }}</span>
                  <span v-if="isUsed(photo.id)" class="used-tick">✓</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- MIDDLE: the strip (the same for everyone) -->
    <div class="col-12 col-lg-6 order-1 order-lg-2">
      <div class="panel canvas-area position-relative">
        <PhotoStrip
          mode="pick"
          :layout="layout"
          :frame-style="frameStyle"
          :photos-by-id="photosById"
          :slot-photos="slotPhotos"
          :edits="room.stripEdits || {}"
          :stickers="room.stripStickers || []"
          @drop-photo="placePhoto"
          @slot-click="onSlotClick"
          @clear-slot="clearSlot"
        />

        <!-- Video call: below the strip on smaller screens, floating top-right from "xl" (1200px) up -->
        <div class="call-float">
          <button class="btn btn-sm btn-dark mb-1" @click="showCall = !showCall">
            {{ showCall ? 'Hide call' : 'Show call' }}
          </button>
          <VideoCallCard v-show="showCall" layout="row" />
        </div>
      </div>
    </div>

    <!-- RIGHT: saved frames -->
    <div class="col-12 col-lg-3 order-3">
      <div class="panel d-flex flex-column">
        <h2 class="h5 fw-bold">Saved frames</h2>

        <h3 class="h6 mt-2">Default</h3>
        <div class="d-flex flex-wrap gap-2">
          <button
            v-for="s in defaultStyles"
            :key="s.id"
            class="swatch"
            :class="[s.shape, { active: s.id === frameStyle.id }]"
            :style="{ background: s.background, borderColor: s.id === frameStyle.id ? '#2F5BEA' : s.border }"
            :title="s.caption"
            @click="chooseStyle(s.id)"
          ></button>
        </div>

        <h3 class="h6 mt-3">Mine</h3>
        <div class="d-flex flex-wrap gap-2">
          <button
            v-for="s in myStyles"
            :key="s.id"
            class="swatch"
            :class="[s.shape, { active: s.id === frameStyle.id }]"
            :style="{ background: s.background, borderColor: s.id === frameStyle.id ? '#2F5BEA' : s.border }"
            @click="chooseStyle(s.id)"
          ></button>
          <!-- PLACEHOLDER (Joash): when the Template Editor is on main, change this <span> to
               <router-link to="/template-editor" class="swatch add-swatch">+</router-link> -->
          <span class="swatch add-swatch" title="Template Editor coming soon">+</span>
        </div>

        <h3 class="h6 mt-3">Cut</h3>
        <div class="d-flex flex-column gap-2 cut-list">
          <button
            v-for="l in LAYOUTS"
            :key="l.id"
            class="cut-item text-start"
            :class="{ active: l.id === layout.id }"
            @click="chooseLayout(l.id)"
          >
            <span class="d-block fw-semibold">{{ l.name }}</span>
            <span class="small text-muted">{{ l.slots.length }} slots</span>
            <span v-if="l.id === layout.id" class="check">✓</span>
          </button>
        </div>

        <p class="small text-muted mt-3 mb-2">
          {{ filledCount }} of {{ layout.slots.length }} slots filled · Slots: photo or clip
        </p>

        <button class="btn btn-outline-secondary w-100 mb-2" :disabled="filledCount === 0" @click="goToStage('decorate')">
          Skip video (photos only)
        </button>
        <!-- PLACEHOLDER (Saw Jun Han): when the Video page exists, change 'decorate' to 'video' -->
        <button class="btn btn-primary w-100" :disabled="filledCount === 0" @click="goToStage('decorate')">
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  height: 100%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.canvas-area {
  background: #EEF0F6;
  min-height: 420px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* Gallery */
.gallery-scroll {
  max-height: 70vh; /* a fixed height, so the sessions scroll inside the card */
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.session-box {
  border: 1px solid #E3E6EE;
  border-radius: 10px;
  padding: 6px;
  margin: 0;
}

.thumb {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 3px solid transparent;
}

.thumb.selected {
  border-color: #2F5BEA;
}

.thumb img {
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  display: block;
  cursor: grab;
}

.name-tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  background: #fff;
  border-radius: 999px;
  font-size: 0.6rem;
  padding: 0 6px;
  font-weight: 600;
}

.used-tick {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2F5BEA;
  color: #fff;
  font-size: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Video call: below the strip by default */
.call-float {
  margin-top: 12px;
  width: 100%;
}

/* Bootstrap "xl" (1200px+): the video call floats over the top-right of the canvas */
@media (min-width: 1200px) {
  .call-float {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 300px;
    margin-top: 0;
    z-index: 50;
    text-align: right;
  }
}

/* Saved frames */
.swatch {
  width: 48px;
  height: 48px;
  border: 2px solid;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.swatch.circle {
  border-radius: 50%;
}

.swatch.active {
  border-width: 3px;
  box-shadow: 0 0 0 2px #E8EEFF;
}

.add-swatch {
  border: 2px dashed #B8BECC;
  color: #8A90A0;
  font-size: 1.3rem;
  background: #F4F5F9;
}

.cut-list {
  max-height: 220px;
  overflow-y: auto;
}

.cut-item {
  position: relative;
  background: #fff;
  border: 1px solid #E3E6EE;
  border-radius: 10px;
  padding: 8px 12px;
}

.cut-item.active {
  border-color: #2F5BEA;
  background: #F2F5FF;
}

.check {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2F5BEA;
  color: #fff;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
