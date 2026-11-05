<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { playSound } from '../sounds.js'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { useAuth } from '../composables/useAuth.js'
import { LAYOUTS, FRAME_STYLES, saveFields, saveField, cropOf, MAX_ZOOM, emptySlotIndexes, cutLabel, safeStickers } from '../stripData.js'
import { listMyItems, getFileUrl, templateFrameFields, loadTemplateProject } from '../studio.js'
import { getItem, listMySaved, searchPublicItems } from '../marketplace.js'
import { loadSavedFramesFromDB } from '../utils/savedFrameEngine.js'
import { resolveEditedVideos, editedVideoList } from '../clips.js'
import EditedVideoThumb from '../components/EditedVideoThumb.vue'
import ClipThumb from '../components/ClipThumb.vue'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import FrameTile from '../components/FrameTile.vue'
import AppIcon from '../components/AppIcon.vue'

// The "Pick" page (a child of RoomLayout.vue): choose a frame and drag photos into it.
//   Left:   gallery, photos grouped by session (shot)
//   Middle: the strip (PhotoStrip.vue)
//   Right:  saved frames (Default / Mine / Saved from the marketplace, Cut layouts), Skip video, Next
// Everything is saved in the room document, so everyone in the room sees the same strip.

const { room, photos, clips, roomRef, goToStage, fullStripBlocked } = useRoom() // goToStage: the whole room moves (the empty-state button below)
const { isAccount } = useAuth()

const selectedPhotoId = ref(null) // phones: the photo tapped (each person has their own)
const targetSlot = ref(null)      // phones: the slot tapped first, waiting for a photo / video to be tapped
const cropSlot = ref(null)        // the slot being repositioned (moved / zoomed), or null
const draftZoom = ref(null)       // the zoom slider's value while it is being dragged (only on this screen), or null
// const showCall = ref(true)        // the video call can be hidden so it does not cover the strip
const userTemplates = ref([])
const savedTemplates = ref([]) // templates I saved from the marketplace (shown under "Saved")
const loadingTemplates = ref(false)

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

// ---------- DEFAULT FRAMES: the ones the "Blue Studios" account published ----------
// The team publishes its ready-made frames from one account called Blue Studios (in the marketplace,
// public). Those are the Default frames everyone sees, guests too. If none can be loaded (offline, or
// none published yet), the built-in colour frames below are shown instead.
// The account name is matched loosely ("Blue Studio", "blue studios", "BlueStudios" all count).
const studioFrames = ref([])
const loadingStudioFrames = ref(true)
const DEFAULT_VISIBLE = 8           // 2 rows of 4, before "Show all"
const showAllDefault = ref(false)

function isStudioAccount(ownerName) {
  return /^blue\s*studios?$/i.test(String(ownerName || '').trim())
}

async function loadStudioFrames() {
  loadingStudioFrames.value = true
  try {
    // Search the public templates for the account's name, then keep only the ones it actually made
    const found = await searchPublicItems({ type: 'templates', text: 'blue studio' })
    const theirs = found.filter((item) => isStudioAccount(item.ownerName))
    studioFrames.value = await Promise.all(theirs.map(templateSwatch))
  } catch (err) {
    console.warn('Could not load the Blue Studios frames:', err)
    studioFrames.value = []
  } finally {
    loadingStudioFrames.value = false
  }
}
onMounted(loadStudioFrames)

// ---------- THE CUT UNDER EACH FRAME ----------
// "4-cut", "3-cut", "2x2"... A frame saved on this device has its slots already. A frame in the cloud only
// says how many slots it has, so its project file is read once to see how they are arranged.
const cuts = ref({})         // frame id -> '4-cut'
const cutLoading = new Set() // frames whose project file is being read

function cutOf(tpl) {
  return cuts.value[tpl.id] || cutLabel(tpl.slotCount || 0)
}

async function workOutCut(tpl) {
  if (!tpl || cuts.value[tpl.id] || cutLoading.has(tpl.id)) return
  const known = tpl.projectData && (tpl.projectData.slots || tpl.projectData.slotRects)
  if (known) {
    cuts.value = { ...cuts.value, [tpl.id]: cutLabel(known) }
    return
  }
  if (!tpl.dataPath) return
  cutLoading.add(tpl.id)
  try {
    const project = await loadTemplateProject(tpl)
    const slots = project && (project.slots || project.slotRects)
    if (slots) cuts.value = { ...cuts.value, [tpl.id]: cutLabel(slots) }
  } catch {
    // keep the slot count ("4-cut") if the file cannot be read
  } finally {
    cutLoading.delete(tpl.id)
  }
}

// The default frames shown now: the first 8, or all of them after "Show all"
const shownStudioFrames = computed(() =>
  showAllDefault.value ? studioFrames.value : studioFrames.value.slice(0, DEFAULT_VISIBLE))

// Saved from the marketplace: the first 8 too, then "Show all"
const showAllSaved = ref(false)
const shownSavedFrames = computed(() =>
  showAllSaved.value ? savedTemplates.value : savedTemplates.value.slice(0, DEFAULT_VISIBLE))

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

// ---------- EVERY FRAME MUST BE FILLED ----------
// The slots still without a photo or video. The room can only move on (Next / Export) when this is empty.
const emptySlots = computed(() => emptySlotIndexes(layout.value.slots.length, (i) => slotHasMedia(i)))
const flashEmpty = ref(false) // briefly true after trying to move on too early: the empty slots light up red
let flashTimer = null

// Next / Quick export (RoomStageNav.vue) only move on when every frame has something in it. When they are
// refused, useRoom.js says which frames are empty and counts it in fullStripBlocked: the empty frames flash red.
watch(fullStripBlocked, () => {
  flashEmpty.value = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flashEmpty.value = false), 1600)
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
  targetSlot.value = null
  cropSlot.value = index // show the reposition bar for what was just placed
  playSound('pop')
  await updateDoc(roomRef(), changes)
}

// Empty a slot, and remove its filter (that photo is no longer there)
async function clearSlot(index) {
  const changes = {}
  changes['stripSlots.' + index] = null
  changes['stripEdits.' + index] = null
  changes['stripCrops.' + index] = null
  if (cropSlot.value === index) cropSlot.value = null
  if (targetSlot.value === index) targetSlot.value = null
  playSound('remove')
  await updateDoc(roomRef(), changes)
}

// Phones do not support drag and drop: tap a photo, then tap a slot
// Tapping works in either order (phones have no drag and drop):
//   tap a photo / video, then tap a slot  -> it goes in that slot
//   tap a slot, then tap a photo / video  -> it goes in that slot too
function selectPhoto(photoId) {
  if (targetSlot.value !== null) {
    placePhoto(targetSlot.value, photoId) // a slot was tapped first
    return
  }
  selectedPhotoId.value = selectedPhotoId.value === photoId ? null : photoId // tap again to unselect
}

function onSlotClick(index) {
  if (selectedPhotoId.value) {
    placePhoto(index, selectedPhotoId.value) // a photo was tapped first
    return
  }
  if (targetSlot.value === index) {
    targetSlot.value = null // the same slot again: cancel
    cropSlot.value = null
    return
  }
  // Remember this slot for the next photo / video tapped. A filled slot also opens the reposition bar,
  // and the next photo tapped replaces what is in it.
  targetSlot.value = index
  cropSlot.value = slotHasMedia(index) ? index : null
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
const usesTouch = ref(window.matchMedia ? !window.matchMedia('(any-pointer: fine)').matches : false) // (older browsers and tests have no matchMedia)

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


// A style only changes the colours and slot shape, so the photos stay
async function chooseStyle(id) {
  await saveFields(roomRef(), { stripStyleId: id, stripCustomTemplate: null })
}

// Choose a saved template from the Template Editor
async function chooseCustomTemplate(tpl) {
  try {
    // No question first: a template with a different number of photo slots clears the strip for everyone
    const { fields } = await templateFrameFields(tpl)

    await saveFields(roomRef(), fields)
  } catch (err) {
    console.error('Failed to apply custom template:', err)
  }
}

// Change a saved edited video: it is loaded into the Video page's timeline, and everyone moves there
async function editSaved(edit) {
  await updateDoc(roomRef(), { videoTimeline: edit.timeline, videoEditing: edit.id, stage: 'video' })
}

// Work out the cut of every frame that is on screen (and of new ones as they load)
watch(
  () => [...shownStudioFrames.value, ...mineTemplates.value, ...shownSavedFrames.value],
  (frames) => frames.forEach(workOutCut),
  { immediate: true }
)
</script>

<template>
  <!-- app-page: the shared Blue Studios look (colours, font, buttons) from pages.css, see design.md -->
  <div class="app-page room-page">
  <StageBar current="pick" />

  <!-- 3 columns from Bootstrap "lg" (992px) up. On phones: strip first, then gallery, then frames -->
  <div class="row g-3">
    <!-- LEFT: gallery -->
    <div class="col-12 col-md-6 col-lg-3 order-2 order-lg-1">
      <div class="panel">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <h2 class="section-title mb-0">Gallery</h2>
        </div>
        <p class="hint">Drag a photo or video into a slot. On a phone: tap it, then a slot (or the slot first).</p>

        <!-- A slot was tapped first: say what to do next, with a way to cancel -->
        <div v-if="targetSlot !== null" class="target-hint mb-2" role="status">
          <span>Slot {{ targetSlot + 1 }} picked. Now tap a photo or video for it.</span>
          <button type="button" class="target-cancel" aria-label="Cancel" title="Cancel" @click="targetSlot = null; cropSlot = null"><AppIcon name="close" :size="14" /></button>
        </div>

        <div v-if="sessions.length === 0" class="empty-state">
          <div class="empty-icon"><AppIcon name="camera" :size="22" /></div>
          <p class="mb-2">No photos or videos yet.</p>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="goToStage('shoot')">Go to the camera</button>
        </div>

        <!-- The videos made on the Video page, to drag into a slot like a photo. Each one has a dark tag with scissors. -->
        <section v-if="editedList.length > 0" class="mb-3">
          <h3 class="group-label"><span class="badge edited-badge"><AppIcon name="scissors" :size="11" /> Edited videos</span></h3>
          <div class="row g-2 session-box edited-box">
            <div v-for="edit in editedList" :key="edit.id" class="col-6">
              <div
                class="thumb video-thumb edited"
                :class="{ selected: edit.id === selectedPhotoId }"
                draggable="true"
                data-sound="click"
                @dragstart="onPhotoDragStart($event, edit)"
                @click="selectPhoto(edit.id)"
              >
                <EditedVideoThumb :edited="edit" />
                <span class="name-tag edited-tag"><AppIcon name="scissors" :size="10" /> {{ edit.name }}</span>
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

        <!-- Scrolls up and down through the sessions; 2 per row in each session (col-6), like the gallery on the camera page -->
        <div class="gallery-scroll">
          <section v-for="session in sessions" :key="session.shotNumber" class="mb-3">
            <h3 class="group-label">Shot {{ session.shotNumber }}</h3>
            <div class="row g-2 session-box">
              <div v-for="photo in session.photos" :key="photo.id" class="col-6">
                <div class="thumb" :class="{ selected: photo.id === selectedPhotoId }">
                  <img
                    :src="photo.image"
                    :alt="'Photo by ' + photo.name"
                    draggable="true"
                    data-sound="click"
                    @dragstart="onPhotoDragStart($event, photo)"
                    @click="selectPhoto(photo.id)"
                  />
                  <span class="name-tag">{{ initials(photo.name) }} · #{{ session.shotNumber }}</span>
                  <span v-if="isUsed(photo.id)" class="used-tick">✓</span>
                </div>
              </div>

              <!-- The session's unedited clips: drag or tap like a photo. The round play button plays it right here. -->
              <div v-for="clip in session.clips" :key="clip.id" class="col-6">
                <div
                  class="thumb clip-thumb"
                  :class="{ selected: clip.id === selectedPhotoId }"
                  draggable="true"
                  data-sound="click"
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
          :stickers="safeStickers(room.stripStickers)"
          :selected-slot="targetSlot !== null ? targetSlot : cropSlot"
          :flash-empty="flashEmpty"
          @drop-photo="placePhoto"
          @slot-click="onSlotClick"
          @clear-slot="clearSlot"
          @crop-slot="saveCrop"
        />

        <!-- The reposition bar: shown after something is dropped in a slot, or a filled slot is tapped -->
        <div v-if="cropSlot !== null && slotHasMedia(cropSlot)" class="reposition-bar mt-3" role="group" :aria-label="'Reposition ' + cropLabel">
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="reposition-icon" aria-hidden="true"><AppIcon name="image" :size="18" /></span>
            <div class="flex-grow-1 lh-sm">
              <div class="fw-semibold small">Reposition {{ cropLabel }}</div>
              <div class="reposition-tip">Drag inside the frame to move · {{ usesTouch ? 'pinch' : 'scroll' }} to zoom</div>
            </div>
          </div>

          <!-- Zoom: − / slider / + . Zooming in gives the picture room to move. -->
          <div class="d-flex align-items-center gap-2">
            <button class="zoom-btn" :disabled="shownZoom <= 1" aria-label="Zoom out" title="Zoom out" @click="stepZoom(-0.25)">−</button>
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
            <button class="zoom-btn" :disabled="shownZoom >= MAX_ZOOM" aria-label="Zoom in" title="Zoom in" @click="stepZoom(0.25)">+</button>
            <span class="zoom-value tabular">{{ shownZoom.toFixed(1) }}×</span>
          </div>

          <div class="d-flex gap-2 mt-2">
            <button class="btn btn-outline-secondary btn-sm flex-fill" @click="resetCrop">Reset</button>
            <button class="btn btn-outline-danger btn-sm flex-fill" data-test="remove-from-bar" @click="clearSlot(cropSlot)">Remove</button>
            <button class="btn btn-primary btn-sm flex-fill" @click="cropSlot = null">Done</button>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: saved frames -->
    <div class="col-12 col-md-6 col-lg-3 order-3">
      <div class="panel d-flex flex-column">
        <h2 class="section-title">Saved frames</h2>

        <!-- DEFAULT: the frames published by the Blue Studios account (first 8, then "Show all") -->
        <h3 class="group-label">Default <span v-if="studioFrames.length" class="section-count">{{ studioFrames.length }}</span></h3>
        <div v-if="loadingStudioFrames" class="frame-grid" role="status" aria-label="Loading frames">
          <span v-for="n in 4" :key="n" class="skeleton frame-skeleton"></span>
        </div>
        <template v-else-if="studioFrames.length">
          <div class="frame-grid" :class="{ expanded: showAllDefault }">
            <FrameTile
              v-for="tpl in shownStudioFrames"
              :key="tpl.id"
              :frame="tpl"
              :cut="cutOf(tpl)"
              :active="tpl.id === frameStyle.id"
              @choose="chooseCustomTemplate(tpl)"
            />
          </div>
          <button
            v-if="studioFrames.length > DEFAULT_VISIBLE"
            type="button"
            class="btn btn-link show-all-btn"
            :aria-expanded="showAllDefault"
            data-test="default-show-all"
            @click="showAllDefault = !showAllDefault"
          >
            {{ showAllDefault ? 'Show less' : 'Show all ' + studioFrames.length }}
            <AppIcon :name="showAllDefault ? 'chevron-up' : 'chevron-down'" :size="14" />
          </button>
        </template>
        <!-- No Blue Studios frames could be loaded: the built-in colour frames -->
        <div v-else class="frame-grid">
          <FrameTile
            v-for="st in defaultStyles"
            :key="st.id"
            :frame="{ ...st, name: st.caption }"
            :cut="cutLabel(layout.slots)"
            :active="st.id === frameStyle.id"
            @choose="chooseStyle(st.id)"
          />
        </div>

        <!-- MINE: frames this account made. More than 8: 2 rows that scroll sideways, until View all -->
        <h3 class="group-label d-flex justify-content-between align-items-center">
          <span>Mine <span v-if="mineTemplates.length" class="section-count">{{ mineTemplates.length }}</span></span>
          <button
            v-if="mineTemplates.length > MINE_VISIBLE"
            type="button"
            class="btn btn-link show-all-btn mt-0"
            :aria-expanded="showAllMine"
            @click="showAllMine = !showAllMine"
          >{{ showAllMine ? 'Show less' : 'View all' }}</button>
        </h3>
        <div
          v-if="mineTemplates.length"
          class="frame-grid"
          :class="{ 'mine-scroll': mineTemplates.length > MINE_VISIBLE && !showAllMine, expanded: showAllMine }"
        >
          <FrameTile
            v-for="tpl in mineTemplates"
            :key="tpl.id"
            :frame="tpl"
            :cut="cutOf(tpl)"
            :active="tpl.id === frameStyle.id"
            @choose="chooseCustomTemplate(tpl)"
          />
        </div>
        <p v-else-if="!isAccount" class="group-empty">Log in to use the frames you made.</p>
        <p v-else-if="loadingTemplates" class="group-empty" role="status">Loading your frames…</p>
        <p v-else class="group-empty">No frames yet. Frames you make in the Frame Editor show up here.</p>

        <!-- SAVED: templates saved from the marketplace (in My Studio) -->
        <template v-if="savedTemplates.length">
          <h3 class="group-label">Saved <span class="section-count">{{ savedTemplates.length }}</span></h3>
          <div class="frame-grid" :class="{ expanded: showAllSaved }">
            <FrameTile
              v-for="tpl in shownSavedFrames"
              :key="tpl.id"
              :frame="{ ...tpl, saved: true }"
              :cut="cutOf(tpl)"
              :active="tpl.id === frameStyle.id"
              @choose="chooseCustomTemplate(tpl)"
            />
          </div>
          <button
            v-if="savedTemplates.length > DEFAULT_VISIBLE"
            type="button"
            class="btn btn-link show-all-btn"
            :aria-expanded="showAllSaved"
            @click="showAllSaved = !showAllSaved"
          >
            {{ showAllSaved ? 'Show less' : 'Show all ' + savedTemplates.length }}
            <AppIcon :name="showAllSaved ? 'chevron-up' : 'chevron-down'" :size="14" />
          </button>
        </template>

        <!-- The frame in use -->
        <div v-if="room.stripCustomTemplate" class="active-frame">
          <img v-if="room.stripCustomTemplate.thumbnailUrl" :src="room.stripCustomTemplate.thumbnailUrl" alt="" class="active-frame-thumb" />
          <div class="overflow-hidden">
            <div class="active-frame-name text-truncate">{{ room.stripCustomTemplate.name }}</div>
            <div class="active-frame-label">Frame in use · {{ cutLabel(layout.slots) }}</div>
          </div>
        </div>

        <p class="slot-count">
          <span class="tabular">{{ filledCount }} of {{ layout.slots.length }}</span> slots filled · a photo or video in each
        </p>

        <!-- Next, Quick export and Edit video are in the floating pill (RoomStageNav.vue) -->
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Styles follow design.md: the colours are the app-page variables (--brand, --ink, --muted, --line, --soft),
   corners 10px (buttons, tiles) / 16px (cards), soft low shadows, hover only with a mouse,
   and every movement switched off for people who ask for reduced motion (at the bottom). */

/* ---------- Page and panels ---------- */
.room-page {
  padding-bottom: 24px;
}

/* A card: white, 16px corners, a thin line and the soft card shadow */
.panel {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  height: 100%;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04);
}

/* The middle: the strip on a soft grey well, always the same size whatever frame is chosen
   (the strip is never taller than --stage-h, see PhotoStrip.vue) */
.canvas-area {
  --stage-h: min(72vh, 680px);
  background: var(--soft);
  min-height: calc(var(--stage-h) + 40px); /* + the panel's padding */
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  text-wrap: balance;
}

/* Small uppercase labels for the parts of a panel (Default, Mine, Saved, Shot 1) */
.group-label {
  margin: 16px 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.group-label:first-of-type {
  margin-top: 4px;
}

/* The count next to a title, e.g. "Mine 3" */
.section-count {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand-tint);
  color: var(--brand);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  vertical-align: 1px;
}

.hint,
.group-empty {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: var(--muted);
  text-wrap: pretty;
}

.group-empty {
  margin-bottom: 4px;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

.back-link {
  font-size: 0.82rem;
  font-weight: 600;
}

/* ---------- Frames ---------- */
/* 4 per row; each tile is a FrameTile card (picture + cut label, bigger preview on hover).
   The cards keep one size (72px wide at most) and the space left over goes between them. */
.frame-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 72px));
  justify-content: space-between;
  gap: 10px 8px;
  padding: 3px; /* room for the chosen frame's blue ring */
}

/* "Show all": every frame, scrolling inside the panel if there are a lot */
.frame-grid.expanded {
  max-height: 380px;
  overflow-y: auto;
}

/* More than 8 under Mine: 2 rows that run sideways, the next column peeking in at the right edge */
.frame-grid.mine-scroll {
  grid-template-columns: none;
  grid-template-rows: repeat(2, auto);
  grid-auto-flow: column;
  grid-auto-columns: min(72px, calc((100% - 3 * 8px) / 4.4));
  justify-content: start;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.frame-grid.mine-scroll::-webkit-scrollbar {
  height: 6px;
}

.frame-grid.mine-scroll::-webkit-scrollbar-thumb {
  background: var(--line);
  border-radius: 999px;
}

/* Grey placeholders while the default frames load, the size of a card */
.frame-skeleton {
  display: block;
  width: 100%;
  max-width: 72px;
  aspect-ratio: 3 / 4.6;
  border-radius: 10px;
}

.show-all-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 0;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}

/* The frame in use, under the lists */
.active-frame {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 8px 10px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.active-frame-thumb {
  width: 24px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.active-frame-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ink);
}

.active-frame-label {
  font-size: 0.72rem;
  color: var(--muted);
}

/* "2 of 4 frames filled" above the buttons */
.slot-count {
  margin: 16px 0 10px;
  font-size: 0.82rem;
  color: var(--muted);
}

/* ---------- "Frame 2 picked. Now tap a photo or video for it." ---------- */
.target-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: var(--brand-tint);
  color: var(--brand);
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
}

.target-cancel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: inherit;
}

/* ---------- The reposition bar (under the strip) ---------- */
/* A floating card: sticks to the bottom of the screen while the strip is in view */
.reposition-bar {
  position: sticky;
  bottom: 12px;
  z-index: 30;
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 12px 14px;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04), 0 12px 32px rgba(20, 23, 43, 0.06);
}

/* Icon tile: brand tint background, brand icon */
.reposition-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--brand-tint);
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.reposition-tip {
  font-size: 0.72rem;
  color: var(--muted);
}

/* Round − and + buttons (32px tap targets) */
.zoom-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  font-weight: 700;
  line-height: 1;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 160ms var(--ease-out);
}

.zoom-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.zoom-btn:disabled {
  opacity: 0.4;
}

.zoom-value {
  min-width: 36px;
  text-align: right;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--brand);
}

/* ---------- Gallery ---------- */
.gallery-scroll {
  max-height: 70vh; /* a fixed height, so the sessions scroll inside the card */
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.session-box {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 6px;
  margin: 0;
}

.thumb {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 3px solid transparent;
  transition: border-color 150ms ease, transform 160ms var(--ease-out);
}

.thumb:active {
  transform: scale(0.97);
}

.thumb.selected {
  border-color: var(--brand);
}

.video-thumb {
  aspect-ratio: 4 / 3; /* the same shape as a photo (and as the gallery on the camera page) */
  background: #0E1020; /* dark surfaces in a room are navy, not black */
  cursor: grab;
}

/* The edited video has a dark ink tag and line (not blue, which means "chosen"), so it is easy to tell from a normal photo or clip */
.edited-badge,
.edited-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--ink, #14172B);
  color: #fff;
}

.edited-box {
  border-color: var(--ink, #14172B);
}

.thumb.edited {
  border-color: var(--ink, #14172B);
}

.used-left {
  left: 4px;
  right: auto;
}

.thumb.edited.selected {
  border-color: var(--brand);
}

/* An unedited clip is exactly the size of a photo: the full width of its column, in the same 4:3 shape.
   The video is laid over the tile (absolute), so its own size cannot stretch or shrink the tile.
   The video ignores the mouse, so the whole tile is dragged. */
.clip-thumb :deep(.clip) {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 0;
  cursor: grab;
}

.clip-thumb :deep(video) {
  position: absolute;
  inset: 0;
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
  aspect-ratio: 4 / 3; /* the same shape as the photos taken (and the gallery on the camera page) */
  object-fit: cover;
  display: block;
  cursor: grab;
}

.name-tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  background: #fff;
  color: var(--ink);
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
  background: var(--brand);
  color: #fff;
  font-size: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Keyboard focus is always visible */
.target-cancel:focus-visible,
.zoom-btn:focus-visible,
.show-all-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

/* Hover colours only with a real mouse (otherwise phones keep them stuck after a tap) */
@media (hover: hover) and (pointer: fine) {
  .zoom-btn:hover:not(:disabled) {
    background: var(--brand-tint);
    color: var(--brand);
    border-color: var(--brand);
  }

  .target-cancel:hover {
    background: rgba(47, 91, 234, 0.12);
  }

  .show-all-btn:hover {
    text-decoration: underline;
  }
}

/* ---------- Smaller screens ---------- */
/* Tablets and phones: the panels stack, so the long lists get shorter scroll areas */
@media (max-width: 991.98px) {
  .canvas-area {
    --stage-h: min(62vh, 560px); /* a bit shorter, so the panels below are not far away */
  }

  .gallery-scroll {
    max-height: 55vh; /* leaves room to reach the frames below */
  }
}

/* Phones: cards keep 16px of space inside, and the buttons are full width */
@media (max-width: 575.98px) {
  .panel {
    padding: 16px;
  }
}

/* Reduced motion: no movement (colour fades stay) */
@media (prefers-reduced-motion: reduce) {
  .thumb,
  .zoom-btn {
    transition: border-color 150ms ease, background-color 150ms ease;
  }

  .thumb:active,
  .zoom-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
