<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { useAuth } from '../composables/useAuth.js'
import { LAYOUTS, FRAME_STYLES, filterCss, saveFields, saveField, cropOf, cropSource, MAX_ZOOM } from '../stripData.js'
import { listMyItems, getFileUrl, templateFrameFields } from '../studio.js'
import { getItem, listMySaved } from '../marketplace.js'
import { loadSavedFramesFromDB } from '../utils/savedFrameEngine.js'
import { resolveEditedVideos, editedVideoList } from '../clips.js'
import EditedVideoThumb from '../components/EditedVideoThumb.vue'
import ClipThumb from '../components/ClipThumb.vue'
import StageBar from '../components/StageBar.vue'
import { askConfirm } from '../composables/useDialog.js'
import PhotoStrip from '../components/PhotoStrip.vue'

// The "Pick" page (a child of RoomLayout.vue): choose a frame and drag photos into it.
//   Left:   gallery, photos grouped by session (shot)
//   Middle: the strip (PhotoStrip.vue)
//   Right:  saved frames (Default / Mine / Saved from the marketplace, Cut layouts), Skip video, Next
// Everything is saved in the room document, so everyone in the room sees the same strip.

const { room, photos, clips, roomRef } = useRoom()
const { isAccount } = useAuth()

const selectedPhotoId = ref(null) // phones: the photo tapped (each person has their own)
const cropSlot = ref(null)        // the slot being repositioned (moved / zoomed), or null
const draftZoom = ref(null)       // the zoom slider's value while it is being dragged (only on this screen), or null
// const showCall = ref(true)        // the video call can be hidden so it does not cover the strip
const userTemplates = ref([])
const savedTemplates = ref([]) // templates I saved from the marketplace (shown under "Saved")
const loadingTemplates = ref(false)
const exportingPng = ref(false)

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
// The edited videos made on the Video page: as { id: edit } (to find a slot's video) and as a list (for the gallery)
const editedVideos = computed(() => resolveEditedVideos(room.value.editedVideos, clips.value))
const editedList = computed(() => editedVideoList(room.value.editedVideos, clips.value))
const defaultStyles = FRAME_STYLES.filter((s) => s.group === 'default')
const myStyles = FRAME_STYLES.filter((s) => s.group === 'mine')

onMounted(loadTemplates)
watch(isAccount, loadTemplates)

// The template the room was made with ("Use template" in the marketplace or My Studio, see RoomLayout.vue).
// Listed first under "Mine", even if it isn't mine or saved, so the room can go back to it.
const startTemplate = ref(null)

watch(() => room.value.startTemplateId, async (id) => {
  startTemplate.value = null
  if (!id) return
  try {
    const item = await getItem('templates', id)
    if (!item || item.id !== room.value.startTemplateId) return
    startTemplate.value = await templateSwatch(item)
  } catch (err) {
    console.warn("Could not load the room's template:", err) // e.g. someone else's private template
  }
}, { immediate: true })

const mineTemplates = computed(() => {
  const start = startTemplate.value
  const listed = [...userTemplates.value, ...savedTemplates.value]
  if (!start || listed.some((tpl) => tpl.id === start.id)) return userTemplates.value
  return [start, ...userTemplates.value]
})

// Mine shows 2 rows of 4 frames. With more than 8, the rows scroll sideways until "View all" is opened.
const MINE_VISIBLE = 8
const showAllMine = ref(false)

// A templates/{id} document (mine or saved from the marketplace) as a swatch in the list
async function templateSwatch(item) {
  let thumbUrl = null
  if (item.thumbnailPath) {
    try {
      thumbUrl = await getFileUrl(item.thumbnailPath)
    } catch (err) {
      console.warn('Could not get thumbnail URL:', err)
    }
  }
  return {
    id: item.id,
    name: item.name,
    thumbnailUrl: thumbUrl,
    dataPath: item.dataPath,
    thumbnailPath: item.thumbnailPath,
    slotCount: item.slotCount,
    shape: 'square',
    background: '#FFFFFF',
    border: '#1A1A2E'
  }
}

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

  // 2. Load cloud templates: my own, and the ones I saved from the marketplace (both together)
  let saved = []
  if (isAccount.value) {
    try {
      const results = await Promise.all([listMyItems('templates'), listMySaved()])
      const mine = results[0].filter((item) => !list.some((existing) => existing.id === item.id))
      list.push(...(await Promise.all(mine.map(templateSwatch))))
      // Saved ones that are still available (null = the maker made it private or removed it)
      const savedItems = results[1]
        .filter((entry) => entry.type === 'templates' && entry.item && !list.some((existing) => existing.id === entry.id))
        .map((entry) => entry.item)
      saved = await Promise.all(savedItems.map(templateSwatch))
    } catch (err) {
      console.warn('Could not load cloud templates:', err)
    }
  }

  savedTemplates.value = saved
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

// The clips (unedited videos) as { id: clip }, like the photos above
const clipsById = computed(() => {
  const map = {}
  for (const c of clips.value) {
    map[c.id] = c
  }
  return map
})

// Group photos and clips by session (shot number), Session 1 first. Each session has one photo and one clip per person.
// Result looks like: [ { shotNumber: 1, photos: [...], clips: [...] }, { shotNumber: 2, photos: [...], clips: [...] } ]
const sessions = computed(() => {
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
  return groups.sort((a, b) => a.shotNumber - b.shotNumber)
})

// How many slots of the current layout have a photo
const filledCount = computed(() => {
  let count = 0
  for (let i = 0; i < layout.value.slots.length; i++) {
    const id = slotPhotos.value[i]
    // a slot is filled by a photo, a clip, or an edited video (that still has clips)
    if (id && (photosById.value[id] || clipsById.value[id] || (editedVideos.value[id] && editedVideos.value[id].entries.length > 0))) {
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
  changes['stripCrops.' + index] = null // a new photo starts centred again
  for (const key of Object.keys(slotPhotos.value)) {
    if (slotPhotos.value[key] === photoId && Number(key) !== index) {
      changes['stripSlots.' + key] = slotPhotos.value[index] || null
      changes['stripCrops.' + key] = null // the swapped photo starts centred too
    }
  }
  selectedPhotoId.value = null
  cropSlot.value = index // show the reposition bar for what was just placed
  await updateDoc(roomRef(), changes)
}

// Empty a slot, and remove its filter (that photo is no longer there)
async function clearSlot(index) {
  const changes = {}
  changes['stripSlots.' + index] = null
  changes['stripEdits.' + index] = null
  changes['stripCrops.' + index] = null
  if (cropSlot.value === index) cropSlot.value = null
  await updateDoc(roomRef(), changes)
}

// Phones do not support drag and drop: tap a photo, then tap a slot
function selectPhoto(photoId) {
  selectedPhotoId.value = selectedPhotoId.value === photoId ? null : photoId // tap again to unselect
}

function onSlotClick(index) {
  if (selectedPhotoId.value) {
    placePhoto(index, selectedPhotoId.value)
  } else if (slotHasMedia(index)) {
    cropSlot.value = cropSlot.value === index ? null : index // tap a photo or video on the strip to reposition it (tap again to close)
  }
}

// ---------- REPOSITIONING A PHOTO OR VIDEO IN ITS SLOT ("crop") ----------
// Moving is done by holding and dragging inside the slot (PhotoStrip.vue). This page saves the result,
// and the reposition bar under the strip has the zoom controls, Reset and Done.

// Whether a slot has a photo, a clip or an edited video in it
function slotHasMedia(index) {
  const id = slotPhotos.value[index]
  return !!(id && (photosById.value[id] || clipsById.value[id] || (editedVideos.value[id] && editedVideos.value[id].entries.length > 0)))
}

// "Photo 2" or "Video 2", for the reposition bar's title
const cropLabel = computed(() => {
  const id = slotPhotos.value[cropSlot.value]
  return (photosById.value[id] ? 'Photo ' : 'Video ') + (cropSlot.value + 1)
})

// The saved crop of the slot being repositioned
const currentCrop = computed(() => cropOf(room.value.stripCrops, cropSlot.value))

// The zoom to show: the slider's value while it moves, otherwise the saved one
const shownZoom = computed(() => (draftZoom.value !== null ? draftZoom.value : currentCrop.value.zoom))

// The crops given to the strip. While the zoom slider moves, the strip shows it straight away on this screen.
const shownCrops = computed(() => {
  const crops = { ...(room.value.stripCrops || {}) }
  if (cropSlot.value !== null && draftZoom.value !== null) {
    crops[cropSlot.value] = { ...currentCrop.value, zoom: draftZoom.value }
  }
  return crops
})

// Save one slot's crop. 'stripCrops.2' only changes slot 2, so people repositioning different slots do not clash.
async function saveCrop(index, crop) {
  cropSlot.value = index
  await saveField(roomRef(), 'stripCrops.' + index, crop)
}

// The zoom slider: shown live while it moves (@input), saved for everyone when it is let go (@change)
function previewZoom(event) {
  draftZoom.value = Number(event.target.value)
}

async function commitZoom(event) {
  const zoom = Number(event.target.value)
  await saveCrop(cropSlot.value, { ...currentCrop.value, zoom: zoom })
  draftZoom.value = null
}

// The − and + buttons: a quarter step at a time, between 1x and MAX_ZOOM
function stepZoom(step) {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Math.round((currentCrop.value.zoom + step) * 100) / 100))
  saveCrop(cropSlot.value, { ...currentCrop.value, zoom: zoom })
}

// Phone or laptop, for the tip in the reposition bar ("pinch to zoom" or "scroll to zoom").
// To start with: a device with no precise pointer (no mouse or trackpad) is a phone or tablet.
// After that, whatever the person actually uses wins: a finger tap switches to the phone tip,
// a mouse or trackpad click switches to the laptop tip (useful for laptops with a touchscreen).
const usesTouch = ref(!window.matchMedia('(any-pointer: fine)').matches)

function onAnyPointerDown(event) {
  usesTouch.value = event.pointerType === 'touch'
}

onMounted(() => window.addEventListener('pointerdown', onAnyPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onAnyPointerDown)) // stop listening when leaving the page

// Back to the centred picture
function resetCrop() {
  saveCrop(cropSlot.value, null)
}

// ---------- FRAMES ----------

// A different cut has different slots, so the slots are emptied (ask first if photos would be lost)
async function chooseLayout(id) {
  if (id === layout.value.id) return
  if (filledCount.value > 0) {
    const sure = await askConfirm({
      title: 'Change the cut?',
      message: 'This clears the photos on the strip for everyone.',
      confirmLabel: 'Change cut',
      danger: true,
      icon: 'layout',
    })
    if (!sure) return
  }
  await saveFields(roomRef(), { stripLayoutId: id, stripCustomTemplate: null, stripSlots: {}, stripEdits: {}, stripCrops: {} })
}

// A style only changes the colours and slot shape, so the photos stay
async function chooseStyle(id) {
  await saveFields(roomRef(), { stripStyleId: id, stripCustomTemplate: null })
}

// Choose a saved template from the Template Editor
async function chooseCustomTemplate(tpl) {
  try {
    const { fields, slotCount } = await templateFrameFields(tpl)

    if (filledCount.value > 0 && slotCount !== layout.value.slots.length) {
      const sure = await askConfirm({
        title: 'Use this template?',
        message: 'It has a different number of photo slots, so the photos on the strip are cleared for everyone.',
        confirmLabel: 'Use template',
        danger: true,
        icon: 'layout',
      })
      if (!sure) return
    }

    await saveFields(roomRef(), fields)
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
      const r = cropSource(img.width, img.height, w, h, cropOf(room.value.stripCrops, i)) // the part of the photo that shows

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
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, x, y, w, h)
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

// Change a saved edited video: it is loaded into the Video page's timeline, and everyone moves there
async function editSaved(edit) {
  await updateDoc(roomRef(), { videoTimeline: edit.timeline, videoEditing: edit.id, stage: 'video' })
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
    <div class="col-12 col-md-6 col-lg-3 order-2 order-lg-1">
      <div class="panel">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <h2 class="h5 fw-bold mb-0">Gallery</h2>
          <button class="btn btn-link btn-sm p-0" @click="goToStage('shoot')">&larr; Camera</button>
        </div>
        <p class="small text-muted mb-2">Drag a photo or video into a slot. On a phone: tap it, then tap a slot.</p>

        <p v-if="sessions.length === 0" class="small text-muted">No photos or videos yet.</p>

        <!-- The videos made on the Video page, to drag into a slot like a photo. Each one is purple. -->
        <section v-if="editedList.length > 0" class="mb-3">
          <h3 class="h6 mb-2"><span class="badge edited-badge">✂ Edited videos</span></h3>
          <div class="row g-2 session-box edited-box">
            <div v-for="edit in editedList" :key="edit.id" class="col-4">
              <div
                class="thumb video-thumb edited"
                :class="{ selected: edit.id === selectedPhotoId }"
                draggable="true"
                @dragstart="onPhotoDragStart($event, edit)"
                @click="selectPhoto(edit.id)"
              >
                <EditedVideoThumb :edited="edit" />
                <span class="name-tag edited-tag">✂ {{ edit.name }}</span>
                <span v-if="isUsed(edit.id)" class="used-tick used-left">✓</span>
              </div>
              <!-- How long it is, and a shortcut to change it on the Video page -->
              <div class="small text-muted d-flex justify-content-between">
                <span>{{ edit.entries.length }} clip(s) · {{ edit.seconds.toFixed(1) }}s</span>
                <button class="btn btn-link btn-sm p-0 align-baseline" @click="editSaved(edit)">Edit</button>
              </div>
            </div>
          </div>
        </section>

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

              <!-- The session's unedited clips: drag or tap like a photo. The "▶ play" label plays it right here. -->
              <div v-for="clip in session.clips" :key="clip.id" class="col-4">
                <div
                  class="thumb clip-thumb"
                  :class="{ selected: clip.id === selectedPhotoId }"
                  draggable="true"
                  @dragstart="onPhotoDragStart($event, clip)"
                  @click="selectPhoto(clip.id)"
                >
                  <ClipThumb :clip="clip" badge-plays />
                  <span class="name-tag">{{ initials(clip.name) }} · #{{ session.shotNumber }}</span>
                  <span v-if="isUsed(clip.id)" class="used-tick">✓</span>
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
          :clips="clips"
          :edited-videos="editedVideos"
          :edits="room.stripEdits || {}"
          :crops="shownCrops"
          :stickers="room.stripStickers || []"
          :selected-slot="cropSlot"
          @drop-photo="placePhoto"
          @slot-click="onSlotClick"
          @clear-slot="clearSlot"
          @crop-slot="saveCrop"
        />

        <!-- The reposition bar: shown after something is dropped in a slot, or a filled slot is tapped -->
        <div v-if="cropSlot !== null && slotHasMedia(cropSlot)" class="reposition-bar mt-3" role="group" :aria-label="'Reposition ' + cropLabel">
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="reposition-icon" aria-hidden="true">✥</span>
            <div class="flex-grow-1 lh-sm">
              <div class="fw-semibold small">Reposition {{ cropLabel }}</div>
              <div class="reposition-tip">Drag inside the frame to move · {{ usesTouch ? 'pinch' : 'scroll' }} to zoom</div>
            </div>
          </div>

          <!-- Zoom: − / slider / + . Zooming in gives the picture room to move. -->
          <div class="d-flex align-items-center gap-2">
            <button class="zoom-btn" :disabled="shownZoom <= 1" aria-label="Zoom out" @click="stepZoom(-0.25)">−</button>
            <input
              type="range"
              class="form-range flex-grow-1"
              min="1"
              :max="MAX_ZOOM"
              step="0.05"
              :value="shownZoom"
              aria-label="Zoom"
              @input="previewZoom"
              @change="commitZoom"
            />
            <button class="zoom-btn" :disabled="shownZoom >= MAX_ZOOM" aria-label="Zoom in" @click="stepZoom(0.25)">+</button>
            <span class="zoom-value">{{ shownZoom.toFixed(1) }}×</span>
          </div>

          <div class="d-flex gap-2 mt-2">
            <button class="btn btn-light btn-sm flex-fill" @click="resetCrop">Reset</button>
            <button class="btn btn-primary btn-sm flex-fill" @click="cropSlot = null">Done</button>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: saved frames -->
    <div class="col-12 col-md-6 col-lg-3 order-3">
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
          <!-- View all: only when there are more than 8 (the 2 rows of 4 that fit). It opens the full list. -->
          <button
            v-if="mineTemplates.length > MINE_VISIBLE"
            type="button"
            class="view-all-btn"
            :aria-expanded="showAllMine"
            @click="showAllMine = !showAllMine"
          >{{ showAllMine ? 'Show less' : 'View all \u2192' }}</button>
        </h3>
        <!-- 8 or fewer: wrap as before. More than 8: 2 rows that scroll sideways (scroll bar at the bottom),
             with the next column peeking in at the right, until View all opens the full list. -->
        <div
          class="d-flex flex-wrap gap-2 align-items-center"
          :class="{ 'mine-scroll': mineTemplates.length > MINE_VISIBLE && !showAllMine }"
        >
          <div
            v-for="tpl in mineTemplates"
            :key="tpl.id"
            class="position-relative"
          >
            <button
              class="swatch"
              :class="[tpl.shape || 'square', { active: tpl.id === frameStyle.id, 'picture-swatch': !!tpl.thumbnailUrl }]"
              :style="{
                background: tpl.thumbnailUrl ? `url(${tpl.thumbnailUrl}) center/contain no-repeat` : (tpl.background || '#FFE8A3'),
                borderColor: tpl.id === frameStyle.id ? '#2F5BEA' : (tpl.border || '#E0A100')
              }"
              :title="tpl.name"
              @click="chooseCustomTemplate(tpl)"
            ></button>
          </div>

          <!-- Fallback if no custom templates loaded -->
          <button
            v-if="mineTemplates.length === 0"
            v-for="s in myStyles"
            :key="s.id"
            class="swatch"
            :class="[s.shape, { active: s.id === frameStyle.id }]"
            :style="{ background: s.background, borderColor: s.id === frameStyle.id ? '#2F5BEA' : s.border }"
            @click="chooseStyle(s.id)"
          ></button>

        </div>

        <!-- Templates saved from the marketplace (in My Studio) -->
        <template v-if="savedTemplates.length">
          <h3 class="h6 mt-3">Saved</h3>
          <div class="d-flex flex-wrap gap-2 align-items-center">
            <button
              v-for="tpl in savedTemplates"
              :key="tpl.id"
              class="swatch"
              :class="[tpl.shape, { active: tpl.id === frameStyle.id, 'picture-swatch': !!tpl.thumbnailUrl }]"
              :style="{
                background: tpl.thumbnailUrl ? `url(${tpl.thumbnailUrl}) center/contain no-repeat` : tpl.background,
                borderColor: tpl.id === frameStyle.id ? '#2F5BEA' : tpl.border
              }"
              :title="tpl.name"
              @click="chooseCustomTemplate(tpl)"
            ></button>
          </div>
        </template>

        <!-- The template in use -->
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
        </div>

        <!-- The cut is only for the default designs: a template already has its own slots -->
        <template v-if="!room.stripCustomTemplate">
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
        </template>

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

        <!-- Opens the Video page, even before any photo is on the strip, as long as the room has photos or clips.
             The edited video then appears in the gallery on the left, to drag into a slot. -->
        <button class="btn btn-outline-secondary w-100 mb-2" :disabled="filledCount === 0 && clips.length === 0" @click="goToStage('video')">
          Edit video
        </button>
        <button class="btn btn-primary w-100" :disabled="filledCount === 0" @click="goToStage('decorate')">
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The reposition bar under the strip: a white card like the other panels, in the brand blue.
   position: sticky + bottom keeps it on screen at the bottom of the window while the strip is in view,
   so on a long strip (or a phone) the zoom slider can be used without scrolling down to it. */
.reposition-bar {
  position: sticky;
  bottom: 12px;
  z-index: 30;
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #E3E6EE;
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 4px 14px rgba(20, 23, 43, 0.08);
}

.reposition-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #E8EEFF;
  color: #2F5BEA;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}

.reposition-tip {
  font-size: 0.7rem;
  color: #6B7080;
}

/* Round − and + buttons */
.zoom-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #E3E6EE;
  background: #F4F6FA;
  color: #14172B;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
}

.zoom-btn:hover:not(:disabled) {
  background: #E8EEFF;
  color: #2F5BEA;
  border-color: #2F5BEA;
}

.zoom-btn:disabled {
  opacity: 0.4;
}

.zoom-value {
  min-width: 34px;
  text-align: right;
  font-size: 0.75rem;
  font-weight: 600;
  color: #2F5BEA;
}

/* The slider's thumb and filled part in the brand blue */
.reposition-bar .form-range::-webkit-slider-thumb {
  background: #2F5BEA;
}

.reposition-bar .form-range::-moz-range-thumb {
  background: #2F5BEA;
}

.panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  height: 100%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.canvas-area {
  /* The same space for every frame: the strip is never taller than --stage-h (see PhotoStrip.vue),
     and the area is always at least that tall, so it does not grow or shrink when a different frame is chosen */
  --stage-h: min(72vh, 680px);
  background: #EEF0F6;
  min-height: calc(var(--stage-h) + 32px); /* + the panel's padding */
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

.video-thumb {
  aspect-ratio: 4 / 5;
  background: #000;
  cursor: grab;
}

/* The edited video is purple, so it is easy to tell from a normal photo or clip */
.edited-badge,
.edited-tag {
  background: #7B61FF;
  color: #fff;
}

.edited-box {
  border-color: #7B61FF;
}

.thumb.edited {
  border-color: #7B61FF;
}

.used-left {
  left: 4px;
  right: auto;
}

.thumb.edited.selected {
  border-color: #2F5BEA;
}

/* An unedited clip is the same shape as a photo. The video inside ignores the mouse, so the whole tile is dragged. */
.clip-thumb :deep(.clip) {
  aspect-ratio: 4 / 5;
  border-radius: 0;
  cursor: grab;
}

.clip-thumb :deep(video) {
  pointer-events: none;
}

/* The play button is in the top-right corner of a clip, so its "used" tick moves to the top-left */
.clip-thumb .used-tick {
  left: 4px;
  right: auto;
}

.video-thumb video {
  pointer-events: none; /* so the whole tile is dragged, not the video inside it */
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

/* A saved template shown as its own picture: the picture already has its rounded border, so the swatch adds
   no border or corner of its own. The chosen one is marked with a blue ring around it instead. */
.swatch.picture-swatch {
  border: none;
  border-radius: 0;
  background-color: transparent;
}

.swatch.picture-swatch.active {
  box-shadow: none;
  outline: 2px solid #2F5BEA;
  outline-offset: 3px;
  border-radius: 6px;
}


/* "View all" next to the Mine title */
.view-all-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.75rem;
  color: #6B7080;
}

.view-all-btn:hover {
  color: #2F5BEA;
}

/* More than 8 frames under Mine: 2 rows of the same 48px swatches, running sideways.
   The box is a bit wider than 4 columns, so the 5th column peeks in at the right edge. */
.mine-scroll {
  display: grid !important;
  grid-template-rows: repeat(2, 48px);
  grid-auto-flow: column;
  grid-auto-columns: 48px;
  max-width: calc(4 * 48px + 4 * 8px + 22px);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 3px 3px 10px; /* room for the blue outline, and the scroll bar under the frames */
  scrollbar-width: thin;
  scrollbar-color: #B8C6F5 transparent;
}

.mine-scroll::-webkit-scrollbar {
  height: 6px;
}

.mine-scroll::-webkit-scrollbar-track {
  background: #F1F2F6;
  border-radius: 999px;
}

.mine-scroll::-webkit-scrollbar-thumb {
  background: #B8C6F5;
  border-radius: 999px;
}

.mine-scroll::-webkit-scrollbar-thumb:hover {
  background: #2F5BEA;
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

/* ---------- Smaller screens ---------- */
/* Tablets and phones: the panels stack, so the long lists get shorter scroll areas */
@media (max-width: 991.98px) {
  .canvas-area {
    --stage-h: min(62vh, 560px); /* a bit shorter, so the panels below are not far away */
    padding-top: 20px;
    padding-bottom: 20px;
  }

  .gallery-scroll {
    max-height: 55vh; /* leaves room to reach the frames below */
  }
}

/* Phones: a little less padding so the content gets the room */
@media (max-width: 575.98px) {
  .panel {
    padding: 12px;
    border-radius: 12px;
  }
}
</style>
