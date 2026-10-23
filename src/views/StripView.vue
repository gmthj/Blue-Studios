<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { useAuth } from '../composables/useAuth.js'
import { LAYOUTS, FRAME_STYLES, filterCss, saveFields } from '../stripData.js'
import { listMyItems, getFileUrl, loadTemplateProject } from '../studio.js'
import { loadSavedFramesFromDB } from '../utils/savedFrameEngine.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'

// The "Pick" page (a child of RoomLayout.vue): choose a frame and drag photos into it.
//   Left:   gallery, photos grouped by session (shot)
//   Middle: the strip (PhotoStrip.vue)
//   Right:  saved frames (Default / Mine styles, Cut layouts), Skip video, Next
// Everything is saved in the room document, so everyone in the room sees the same strip.

const { room, photos, roomRef } = useRoom()
const { isAccount } = useAuth()

const selectedPhotoId = ref(null) // phones: the photo tapped (each person has their own)
// const showCall = ref(true)        // the video call can be hidden so it does not cover the strip
// const userTemplates = ref([])
const loadingTemplates = ref(false)
// const exportingPng = ref(false)

// What the room has chosen (the first layout / style if nothing is saved yet)
const layout = computed(() => {
  if (room.value.stripCustomTemplate?.slots?.length) {
    return {
      id: room.value.stripCustomTemplate.id,
      name: room.value.stripCustomTemplate.name,
      aspect: room.value.stripCustomTemplate.aspect || (3 / 10),
      slots: room.value.stripCustomTemplate.slots
    }
  }
  return LAYOUTS.find((l) => l.id === room.value.stripLayoutId) || LAYOUTS[0]
})

const frameStyle = computed(() => {
  if (room.value.stripCustomTemplate) {
    return {
      id: room.value.stripCustomTemplate.id,
      group: 'mine',
      background: room.value.stripCustomTemplate.background || '#FFFFFF',
      border: room.value.stripCustomTemplate.border || '#1A1A2E',
      shape: room.value.stripCustomTemplate.shape || 'square',
      caption: room.value.stripCustomTemplate.caption || '',
      captionColor: room.value.stripCustomTemplate.captionColor || room.value.stripCustomTemplate.border,
      thumbnailUrl: room.value.stripCustomTemplate.thumbnailUrl || null
    }
  }
  return FRAME_STYLES.find((s) => s.id === room.value.stripStyleId) || FRAME_STYLES[0]
})

const slotPhotos = computed(() => room.value.stripSlots || {})
const defaultStyles = FRAME_STYLES.filter((s) => s.group === 'default')
const myStyles = FRAME_STYLES.filter((s) => s.group === 'mine')

onMounted(loadTemplates)
watch(isAccount, loadTemplates)

async function loadTemplates() {
  loadingTemplates.value = true
  const list = []

  // 1. Load local IndexedDB templates
  try {
    const local = await loadSavedFramesFromDB()
    if (local && local.length) {
      for (const f of local) {
        list.push({
          id: f.cloudId || f.id,
          name: f.name,
          thumbnailUrl: f.thumbnail || null,
          projectData: f.projectData,
          shape: (f.projectData?.slotShape || f.projectData?.shape || 'square').toLowerCase(),
          background: f.projectData?.background || '#FFFFFF',
          border: f.projectData?.border || '#1A1A2E'
        })
      }
    }
  } catch (e) {
    console.warn('Could not load local frames:', e)
  }

  // 2. Load cloud templates
  if (isAccount.value) {
    try {
      const cloudItems = await listMyItems('templates')
      for (const item of cloudItems) {
        if (!list.some((existing) => existing.id === item.id)) {
          let thumbUrl = null
          if (item.thumbnailPath) {
            try {
              thumbUrl = await getFileUrl(item.thumbnailPath)
            } catch (err) {
              console.warn('Could not get thumbnail URL:', err)
            }
          }
          list.push({
            id: item.id,
            name: item.name,
            thumbnailUrl: thumbUrl,
            dataPath: item.dataPath,
            thumbnailPath: item.thumbnailPath,
            slotCount: item.slotCount,
            shape: 'square',
            background: '#FFFFFF',
            border: '#1A1A2E'
          })
        }
      }
    } catch (err) {
      console.warn('Could not load cloud templates:', err)
    }
  }

  userTemplates.value = list
  loadingTemplates.value = false
}

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
  if (id === layout.value.id && !room.value.stripCustomTemplate) return
  if (filledCount.value > 0 && !confirm('Changing the cut will clear the photos on the strip. Continue?')) return
  await saveFields(roomRef(), { stripLayoutId: id, stripCustomTemplate: null, stripSlots: {}, stripEdits: {} })
}

// A style only changes the colours and slot shape, so the photos stay
async function chooseStyle(id) {
  await saveFields(roomRef(), { stripStyleId: id, stripCustomTemplate: null })
}

// Choose a saved template from the Template Editor
async function chooseCustomTemplate(tpl) {
  try {
    let project = tpl.projectData
    if (!project && tpl.dataPath) {
      project = await loadTemplateProject(tpl)
    }
    const thumbUrl = tpl.thumbnailUrl || (tpl.thumbnailPath ? await getFileUrl(tpl.thumbnailPath).catch(() => null) : null) || null

    const aspect = project?.aspect || (3 / 10)
    const slots = project?.slots || project?.slotRects || [
      { x: 6, y: 3, w: 88, h: 20 },
      { x: 6, y: 25, w: 88, h: 20 },
      { x: 6, y: 47, w: 88, h: 20 },
      { x: 6, y: 69, w: 88, h: 20 },
    ]
    const shape = (project?.slotShape || project?.shape || 'square').toLowerCase()
    const bg = project?.background || project?.selectedBgColor || (project?.frameBg?.type === 'gradient' ? project.frameBg.value : project?.frameBg?.baseColor) || '#FFFFFF'
    const border = project?.borderColor || project?.border || '#1A1A2E'
    const caption = project?.captionText || project?.caption || tpl.name || ''
    const captionColor = project?.captionColor || border

    if (filledCount.value > 0 && slots.length !== layout.value.slots.length) {
      if (!confirm('Applying this template changes the slot count and will clear photos on the strip. Continue?')) {
        return
      }
    }

    await saveFields(roomRef(), {
      stripStyleId: tpl.id,
      stripLayoutId: project?.stripLayoutId || project?.activeLayout || 'custom',
      stripCustomTemplate: {
        id: tpl.id,
        name: tpl.name || project?.templateName || 'Custom Template',
        aspect,
        slots,
        shape,
        background: bg,
        border,
        caption,
        captionColor,
        thumbnailUrl: thumbUrl
      }
    })
  } catch (err) {
    console.error('Failed to apply custom template:', err)
  }
}

// Helper to load image for canvas export
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Produce and download high-resolution strip PNG
async function producePng() {
  exportingPng.value = true
  try {
    const W = 900
    const H = Math.round(W / layout.value.aspect)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    // Frame background / Template PNG
    if (frameStyle.value.thumbnailUrl) {
      try {
        const bgImg = await loadImage(frameStyle.value.thumbnailUrl)
        ctx.drawImage(bgImg, 0, 0, W, H)
      } catch {
        ctx.fillStyle = frameStyle.value.background || '#FFFFFF'
        ctx.fillRect(0, 0, W, H)
      }
    } else {
      ctx.fillStyle = frameStyle.value.background || '#FFFFFF'
      ctx.fillRect(0, 0, W, H)
    }

    // Photos: % of the strip -> pixels, then crop to fill the slot
    for (let i = 0; i < layout.value.slots.length; i++) {
      const s = layout.value.slots[i]
      const x = (s.x / 100) * W
      const y = (s.y / 100) * H
      const w = (s.w / 100) * W
      const h = (s.h / 100) * H
      const photo = photosById.value[slotPhotos.value[i]]
      if (!photo) continue

      const img = await loadImage(photo.image)
      const scale = Math.max(w / img.width, h / img.height)
      const cropWidth = w / scale
      const cropHeight = h / scale

      ctx.save()
      ctx.beginPath()
      if (frameStyle.value.shape === 'circle') {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      } else if (frameStyle.value.shape === 'rounded') {
        const radius = Math.min(w, h) * 0.08
        ctx.roundRect ? ctx.roundRect(x, y, w, h, radius) : ctx.rect(x, y, w, h)
      } else {
        ctx.rect(x, y, w, h)
      }
      ctx.clip()
      ctx.filter = filterCss(room.value.stripEdits?.[i]) || 'none'
      ctx.drawImage(img, (img.width - cropWidth) / 2, (img.height - cropHeight) / 2, cropWidth, cropHeight, x, y, w, h)
      ctx.restore()
    }

    // Stickers if any
    const stickers = room.value.stripStickers || []
    const ordered = [...stickers].filter((s) => s.visible).sort((a, b) => a.z - b.z)
    for (const st of ordered) {
      const img = await loadImage(st.src)
      const w = (st.w / 100) * W
      const h = w * (img.height / img.width)
      ctx.save()
      ctx.translate((st.x / 100) * W, (st.y / 100) * H)
      ctx.rotate((st.rotate * Math.PI) / 180)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
      ctx.restore()
    }

    // Caption (only if not already baked into custom template PNG)
    if (frameStyle.value.caption && !frameStyle.value.thumbnailUrl) {
      ctx.fillStyle = frameStyle.value.captionColor || frameStyle.value.border || '#1A1A2E'
      ctx.font = 'bold 34px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(frameStyle.value.caption, W / 2, H - H * 0.03)
    }

    // Download PNG
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `photostrip-${room.value.id || 'strip'}.png`
    link.click()
  } catch (err) {
    console.error('Error producing PNG:', err)
  } finally {
    exportingPng.value = false
  }
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

        <h3 class="h6 mt-3 d-flex justify-content-between align-items-center">
          <span>Mine</span>
          <router-link to="/studio" class="small text-muted text-decoration-none" style="font-size: 0.75rem;">View all &rarr;</router-link>
        </h3>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <div
            v-for="tpl in userTemplates"
            :key="tpl.id"
            class="position-relative"
          >
            <button
              class="swatch"
              :class="[tpl.shape || 'square', { active: tpl.id === frameStyle.id }]"
              :style="{
                background: tpl.thumbnailUrl ? `url(${tpl.thumbnailUrl}) center/cover no-repeat` : (tpl.background || '#FFE8A3'),
                borderColor: tpl.id === frameStyle.id ? '#2F5BEA' : (tpl.border || '#E0A100')
              }"
              :title="tpl.name"
              @click="chooseCustomTemplate(tpl)"
            ></button>
          </div>

          <!-- Fallback if no custom templates loaded -->
          <button
            v-if="userTemplates.length === 0"
            v-for="s in myStyles"
            :key="s.id"
            class="swatch"
            :class="[s.shape, { active: s.id === frameStyle.id }]"
            :style="{ background: s.background, borderColor: s.id === frameStyle.id ? '#2F5BEA' : s.border }"
            @click="chooseStyle(s.id)"
          ></button>

          <!-- Add new template button linking to Template Editor -->
          <router-link
            to="/template-editor"
            class="swatch add-swatch text-decoration-none d-flex align-items-center justify-content-center"
            title="Design a new frame in Template Editor"
          >+</router-link>
        </div>

        <!-- Re-edit banner when custom template is active -->
        <div v-if="room.stripCustomTemplate" class="alert alert-light border p-2 mt-2 mb-0 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2 overflow-hidden">
            <img
              v-if="room.stripCustomTemplate.thumbnailUrl"
              :src="room.stripCustomTemplate.thumbnailUrl"
              class="rounded border flex-shrink-0"
              style="width: 24px; height: 32px; object-fit: cover;"
            />
            <div class="text-truncate" style="max-width: 130px;">
              <div class="small fw-semibold text-truncate">{{ room.stripCustomTemplate.name }}</div>
              <div class="text-muted" style="font-size: 0.7rem;">Active Template</div>
            </div>
          </div>
          <router-link
            :to="'/template-editor?template=' + room.stripCustomTemplate.id"
            class="btn btn-sm btn-outline-primary py-0 px-2 text-decoration-none flex-shrink-0"
            title="Re-edit this template in Template Editor (retains full workspace)"
          >
            ✏️ Re-edit
          </router-link>
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

        <button
          class="btn btn-outline-primary w-100 mb-2"
          :disabled="filledCount === 0 || exportingPng"
          @click="producePng"
        >
          {{ exportingPng ? 'Producing PNG...' : '📸 Produce Strip PNG' }}
        </button>

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
