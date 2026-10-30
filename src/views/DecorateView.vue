<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { getGuestName } from '../guest.js'
import { useAuth } from '../composables/useAuth.js'
import { saveStrip } from '../studio.js'
import { resolveEditedVideos } from '../clips.js'
import { loadDefaultStickers, loadMyStickers } from '../stickerTray.js'
import { LAYOUTS, FRAME_STYLES, FILTERS, filterCss, saveField, saveFields, cropOf, cropSource } from '../stripData.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'

// The "Decorate" page (a child of RoomLayout.vue): filters and stickers.
//   Left:   filters and adjustments for the photo tapped on the strip
//   Middle: the strip - drop stickers anywhere, drag them to move
//   Right:  sticker tray, size / rotate, layers, Mix soundtrack
// Layers use z-index: a bigger z is drawn in front.

const { code, room, photos, clips, roomRef } = useRoom()
const myName = getGuestName()

const selectedSlot = ref(0)          // the photo the filters change ("Applied to photo 1")
const selectedStickerId = ref(null)  // the sticker being resized / rotated
const trayTab = ref('default')       // 'default' | 'mine' | 'giphy' (see stickerTray.js)
const selectedTrayId = ref(null)     // phones: the tray sticker tapped
const exporting = ref(false)

// Accounts can also save the strip to My Studio
const { isAccount } = useAuth()
const saving = ref(false)
const saveMessage = ref('')

// The strip, from the room document (the same fields as the Pick page)
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
const edits = computed(() => room.value.stripEdits || {})
const crops = computed(() => room.value.stripCrops || {}) // where each photo sits in its slot (set on the Pick page)
const stickers = computed(() => room.value.stripStickers || [])
const editedVideos = computed(() => resolveEditedVideos(room.value.editedVideos, clips.value)) // the videos made on the Video page

// True if any slot holds a video (a clip, or an edited video). A strip with a video cannot be saved as a
// JPG, because a JPG is a still picture: it will be exported as an MP4 instead (Export step, not built yet).
const hasVideoSlot = computed(() => {
  return Object.values(slotPhotos.value).some((id) => editedVideos.value[id] || clips.value.some((c) => c.id === id))
})

const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// ---------- STICKER TRAY ----------
// Default = the Template Editor's stickers (Joash). My stickers / My GIPHY = this account's stickers from the
// Sticker Maker (Rae) and the ones saved from the marketplace, loaded from Firebase (see stickerTray.js).
const TRAY_TABS = [
  { id: 'default', label: 'Default' },
  { id: 'mine', label: 'My stickers' },
  { id: 'giphy', label: 'My GIPHY' },
]
const defaultStickers = ref([])
const myStickers = ref([])
const loadingMine = ref(false)

async function refreshMyStickers() {
  loadingMine.value = true
  try {
    myStickers.value = await loadMyStickers(isAccount.value)
  } catch (err) {
    console.error('Could not load my stickers:', err)
  } finally {
    loadingMine.value = false
  }
}

// Load again when this browser tab comes back into view (e.g. after making a sticker in another tab)
function onTabVisible() {
  if (document.visibilityState === 'visible') refreshMyStickers()
}

onMounted(async () => {
  refreshMyStickers()
  document.addEventListener('visibilitychange', onTabVisible)
  defaultStickers.value = await loadDefaultStickers()
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onTabVisible))
watch(isAccount, refreshMyStickers) // logged in or out: load again

// Every sticker the tray knows, the open tab's ones, and how many each tab has (for the small counts)
const allStickers = computed(() => defaultStickers.value.concat(myStickers.value))
const trayStickers = computed(() => allStickers.value.filter((s) => s.tab === trayTab.value))
function tabCount(tab) {
  return allStickers.value.filter((s) => s.tab === tab).length
}

// The photo in the selected slot, used for the filter previews
const selectedPhoto = computed(() => photosById.value[slotPhotos.value[selectedSlot.value]] || null)

// The selected slot's edit, with the default values for anything not saved yet
const currentEdit = computed(() => {
  return { filter: 'original', brightness: 0, contrast: 0, saturation: 0, ...(edits.value[selectedSlot.value] || {}) }
})

const selectedSticker = computed(() => stickers.value.find((s) => s.id === selectedStickerId.value) || null)

// Stickers sorted front to back, for the Layers list ([...] copies the list, so the real one is not reordered)
const layersFrontToBack = computed(() => [...stickers.value].sort((a, b) => b.z - a.z))

const photoCount = computed(() => Object.values(slotPhotos.value).filter(Boolean).length)

// ---------- FILTERS ----------

// Save one value of the selected slot's edit, e.g. updateEdit('brightness', 10).
// Only this slot's edit is saved ('stripEdits.2'), so people editing different photos do not clash.
async function updateEdit(key, value) {
  const newEdit = { ...currentEdit.value }
  newEdit[key] = value
  await saveField(roomRef(), 'stripEdits.' + selectedSlot.value, newEdit)
}

// Tapping a photo on the strip chooses which photo the filters change
function onSlotClick(index) {
  selectedSlot.value = index
  selectedStickerId.value = null
}

// ---------- STICKERS ----------

// Stickers are a list, so the whole list is saved each time
async function saveStickers(list) {
  await saveFields(roomRef(), { stripStickers: list })
}

// Dragging a sticker from the tray: the parcel carries its image URL
function onTrayDragStart(event, item) {
  event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'newSticker', src: item.src }))
  event.dataTransfer.effectAllowed = 'copy'
}

// A tray sticker was dropped at (x, y) %. The new sticker goes in front of all the others.
async function addSticker(src, x, y) {
  const topZ = Math.max(0, ...stickers.value.map((s) => s.z)) // the highest z so far (0 if none)
  const sticker = {
    id: Date.now(),  // a simple unique id
    src: src,
    x: Math.round(x), // centre of the sticker, in % of the strip
    y: Math.round(y),
    w: 45,            // width, in % of the strip
    rotate: 0,        // degrees
    z: topZ + 1,
    visible: true,
    by: myName,       // who placed it (shown when it is selected)
  }
  selectedStickerId.value = sticker.id // select it, so the size / rotate sliders show
  await saveStickers([...stickers.value, sticker])
}

// Change some values of one sticker, e.g. updateSticker(id, { w: 50 })
async function updateSticker(id, changes) {
  const list = stickers.value.map((s) => (s.id === id ? { ...s, ...changes } : s))
  await saveStickers(list)
}

// A sticker on the strip was dragged to (x, y) %
function moveSticker(id, x, y) {
  selectedStickerId.value = id
  updateSticker(id, { x: Math.round(x), y: Math.round(y), by: myName })
}

async function deleteSticker(id) {
  selectedStickerId.value = null
  await saveStickers(stickers.value.filter((s) => s.id !== id))
}

// Bring forward / send backward: swap z with the sticker above or below it in the Layers list
async function moveLayer(id, direction) {
  const ordered = layersFrontToBack.value
  const index = ordered.findIndex((s) => s.id === id)
  const other = ordered[direction === 'up' ? index - 1 : index + 1]
  if (!other) return // already at the front / back
  const me = ordered[index]
  const list = stickers.value.map((s) => {
    if (s.id === me.id) return { ...s, z: other.z }
    if (s.id === other.id) return { ...s, z: me.z }
    return s
  })
  await saveStickers(list)
}

// A tap on the strip: with a tray sticker tapped first (phones), add it there.
// Otherwise it is a tap on an empty spot, so the selected sticker is let go (its box closes).
// (On a phone, a sticker on the strip is moved by dragging it with a finger, see PhotoStrip.vue.)
function onStripClick(x, y) {
  if (selectedTrayId.value) {
    const item = allStickers.value.find((s) => s.id === selectedTrayId.value)
    addSticker(item.src, x, y)
    selectedTrayId.value = null
  } else {
    selectedStickerId.value = null
  }
}

// A click or tap anywhere else on the page (not on a sticker, its box, the tray or the layers list)
// also lets go of the selected sticker
function onPagePointerDown(event) {
  if (selectedStickerId.value === null) return
  if (event.target.closest('.strip-wrap, .tray-item, .layers')) return // the strip handles its own taps
  selectedStickerId.value = null
}

onMounted(() => document.addEventListener('pointerdown', onPagePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPagePointerDown))

// Everyone moves to another page together (RoomLayout.vue follows the room's "stage")
async function goToStage(stage) {
  await updateDoc(roomRef(), { stage: stage })
}

// ---------- QUICK DOWNLOAD ----------
// PLACEHOLDER (Saw Jun Han): a simple JPG download until the Export step is ready.
// Draws the frame, each photo (cropped like object-fit: cover, with its filter), the stickers
// from back to front, and the caption, on a canvas.

// Turn an image URL into an <img> element we can draw on a canvas.
// Loading takes a moment, so we wrap it in a Promise and wait for onload.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Needed for images from Firebase Storage (e.g. stickers), or the canvas cannot be saved
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Draw the strip on a canvas (used by Download and Save to My Studio)
async function drawStripCanvas() {
  const W = 900                                 // width of the PNG, in pixels
  const H = Math.round(W / layout.value.aspect) // height, from the strip's shape
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
    if (!photo) continue // empty slot

    const img = await loadImage(photo.image)
    const r = cropSource(img.width, img.height, w, h, cropOf(crops.value, i)) // the part of the photo that shows (Pick page crop)

    ctx.save()
    // Only draw inside the slot's shape (an ellipse for circle slots)
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
    ctx.filter = filterCss(edits.value[i]) || 'none' // the same filter as on screen
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, x, y, w, h)
    ctx.restore()
  }

  // Stickers, back to front. Move to the sticker's centre, rotate (canvas uses radians), draw it centred.
  const ordered = [...stickers.value].filter((s) => s.visible).sort((a, b) => a.z - b.z)
  for (const st of ordered) {
    const img = await loadImage(st.src)
    const w = (st.w / 100) * W
    const h = w * (img.height / img.width) // keep the sticker's own proportions
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
  return canvas
}

async function downloadJpg() {
  exporting.value = true
  try {
    const canvas = await drawStripCanvas()
    // Download: make a temporary link to the PNG and click it
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'photostrip-' + code.value + '.png'
    link.click()
  } catch (error) {
    console.error(error)
  }
  exporting.value = false
}

// Accounts: save a copy of the strip to My Studio (Firebase Storage + a strips document, see studio.js)
async function saveToStudio() {
  saving.value = true
  saveMessage.value = ''
  try {
    const canvas = await drawStripCanvas()
    // toBlob gives the JPG as a file-like Blob (smaller than a data URL)
    const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    await saveStrip({ title: 'Room ' + code.value + ' · ' + new Date().toLocaleDateString(), image: image })
    saveMessage.value = 'Saved to My Studio!'
  } catch (error) {
    console.error(error)
    saveMessage.value = 'Could not save. Please try again.'
  }
  saving.value = false
}
</script>

<template>
  <StageBar current="decorate" />

  <!-- 3 columns from Bootstrap "lg" (992px) up. On phones: strip first -->
  <div class="row g-3">
    <!-- LEFT: filters and adjustments -->
    <div class="col-12 col-md-6 col-lg-3 order-2 order-lg-1">
      <div class="panel">
        <h2 class="h5 fw-bold">Filters</h2>
        <!-- Each preview is the selected photo with that filter's CSS -->
        <div class="row g-2 mb-3">
          <div v-for="f in FILTERS" :key="f.id" class="col-6">
            <button class="filter-btn w-100" :class="{ active: currentEdit.filter === f.id }" @click="updateEdit('filter', f.id)">
              <img v-if="selectedPhoto" :src="selectedPhoto.image" alt="" :style="{ filter: f.css }" />
              <span v-else class="filter-empty" :style="{ filter: f.css }"></span>
              <span class="small d-block mt-1">{{ f.name }}</span>
            </button>
          </div>
        </div>

        <h2 class="h5 fw-bold">Adjustments</h2>
        <!-- Saved on @change (when the slider is let go), so Firestore is not written on every pixel -->
        <label class="form-label small d-flex justify-content-between mb-0">Brightness <span>{{ currentEdit.brightness }}</span></label>
        <input type="range" class="form-range" min="-50" max="50" :value="currentEdit.brightness"
               @change="updateEdit('brightness', Number($event.target.value))" />
        <label class="form-label small d-flex justify-content-between mb-0">Contrast <span>{{ currentEdit.contrast }}</span></label>
        <input type="range" class="form-range" min="-50" max="50" :value="currentEdit.contrast"
               @change="updateEdit('contrast', Number($event.target.value))" />
        <label class="form-label small d-flex justify-content-between mb-0">Saturation <span>{{ currentEdit.saturation }}</span></label>
        <input type="range" class="form-range" min="-50" max="50" :value="currentEdit.saturation"
               @change="updateEdit('saturation', Number($event.target.value))" />

        <span class="badge rounded-pill text-bg-light mt-2">Applied to photo {{ selectedSlot + 1 }}</span>
        <p class="small text-muted mt-2 mb-0">Tap a photo on the strip to choose which one to edit.</p>
      </div>
    </div>

    <!-- MIDDLE: the strip (the same for everyone) -->
    <div class="col-12 col-lg-6 order-1 order-lg-2">
      <div class="panel canvas-area position-relative">
        <PhotoStrip
          mode="decorate"
          :layout="layout"
          :frame-style="frameStyle"
          :photos-by-id="photosById"
          :slot-photos="slotPhotos"
          :edits="edits"
          :crops="crops"
          :stickers="stickers"
          :clips="clips"
          :edited-videos="editedVideos"
          :selected-slot="selectedStickerId ? null : selectedSlot"
          :selected-sticker-id="selectedStickerId"
          @drop-sticker="addSticker"
          @move-sticker="moveSticker"
          @sticker-click="(id) => (selectedStickerId = id)"
          @delete-sticker="deleteSticker"
          @update-sticker="updateSticker"
          @slot-click="onSlotClick"
          @strip-click="onStripClick"
        />
      </div>
    </div>

    <!-- RIGHT: sticker tray, selected sticker, layers -->
    <div class="col-12 col-md-6 col-lg-3 order-3">
      <div class="panel d-flex flex-column">
        <h2 class="h5 fw-bold mb-1">Sticker tray</h2>
        <p class="tray-hint text-muted mb-2">Drag stickers onto the strip, then drag to move. Phone: tap a sticker in the tray, then tap the strip.</p>

        <!-- Tabs: Default, My stickers, My GIPHY. On a narrow panel they scroll sideways instead of squashing. -->
        <div class="tray-tabs mb-2" role="tablist" aria-label="Sticker tray">
          <button
            v-for="tab in TRAY_TABS"
            :key="tab.id"
            type="button"
            class="tray-tab"
            :class="{ active: trayTab === tab.id }"
            role="tab"
            :aria-selected="trayTab === tab.id"
            @click="trayTab = tab.id"
          >
            {{ tab.label }}<span v-if="tab.id !== 'default' && tabCount(tab.id)" class="tray-count">{{ tabCount(tab.id) }}</span>
          </button>
        </div>

        <!-- When a tab has nothing to show -->
        <template v-if="trayStickers.length === 0">
          <p v-if="trayTab === 'default'" class="small text-muted mb-2">Loading stickers…</p>
          <p v-else-if="!isAccount" class="small text-muted mb-2">Log in to use the stickers you made or saved.</p>
          <p v-else-if="loadingMine" class="small text-muted mb-2">Loading your stickers…</p>
          <p v-else-if="trayTab === 'mine'" class="small text-muted mb-2">No stickers yet. Stickers you make in the Sticker Maker or save from the marketplace show up here.</p>
          <p v-else class="small text-muted mb-2">No GIFs yet. GIF stickers you make in the Sticker Maker or save from the marketplace show up here.</p>
        </template>

        <!-- Drag a sticker onto the strip, or tap it (phones). 4 per row on phones and tablets, 3 in the narrow laptop side panel. -->
        <div v-else class="row g-2 mb-3 tray-grid" role="tabpanel">
          <div v-for="s in trayStickers" :key="s.id" class="col-3 col-lg-4 col-xxl-3">
            <div class="tray-item" :class="{ selected: s.id === selectedTrayId }" :title="s.saved ? s.name + ' (saved from the marketplace)' : s.name">
              <img
                :src="s.src"
                :alt="s.name"
                draggable="true"
                @dragstart="onTrayDragStart($event, s)"
                @click="selectedTrayId = selectedTrayId === s.id ? null : s.id"
              />
              <span v-if="s.saved" class="saved-tag" aria-hidden="true">★</span>
            </div>
          </div>
        </div>


        <!-- Layers: front at the top. Photos and frame are always behind the stickers, so they stay at the bottom -->
        <h2 class="h5 fw-bold">Layers</h2>
        <ul class="list-unstyled layers mb-3">
          <li
            v-for="(s, index) in layersFrontToBack"
            :key="s.id"
            class="layer"
            :class="{ active: s.id === selectedStickerId }"
            @click="selectedStickerId = s.id"
          >
            <img :src="s.src" alt="" class="layer-thumb" />
            <span class="flex-grow-1 small text-truncate">Sticker · {{ s.by || 'someone' }}</span>
            <button class="icon-btn" :disabled="index === 0" title="Bring forward" @click.stop="moveLayer(s.id, 'up')">↑</button>
            <button class="icon-btn" :disabled="index === layersFrontToBack.length - 1" title="Send backward" @click.stop="moveLayer(s.id, 'down')">↓</button>
            <button class="icon-btn" title="Show / hide" @click.stop="updateSticker(s.id, { visible: !s.visible })">{{ s.visible ? '👁' : '—' }}</button>
          </li>
          <li class="layer muted"><span class="small">Photos ({{ photoCount }})</span></li>
          <li class="layer muted"><span class="small">Frame · {{ layout.name }}</span></li>
        </ul>

        <div class="mt-auto">
          <!-- PLACEHOLDER (Shannon): the Music Mixer is at /room/:code/music on the music-mixer branch.
               When it is on main and 'music' is added to STAGE_PATHS in RoomLayout.vue, remove "disabled". -->
          <button class="btn btn-primary w-100 mb-2" @click="goToStage('music')">Mix soundtrack</button>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-secondary btn-sm flex-fill" @click="goToStage('pick')">&larr; Pick</button>
            <button class="btn btn-outline-secondary btn-sm flex-fill" :disabled="exporting || hasVideoSlot" :title="hasVideoSlot ? 'A strip with video is exported as an MP4' : ''" @click="downloadJpg">
              {{ exporting ? 'Saving...' : 'Download JPG' }}
            </button>
          </div>
          <button v-if="isAccount" class="btn btn-outline-primary btn-sm w-100 mt-2" :disabled="saving || hasVideoSlot" @click="saveToStudio">
            {{ saving ? 'Saving...' : 'Save to My Studio' }}
          </button>
          <!-- A strip with video is exported as an MP4 on the Export page (the JPG buttons above are for photo strips) -->
          <button v-if="hasVideoSlot" class="btn btn-primary btn-sm w-100 mt-2" @click="goToStage('export')">Export video &rarr;</button>
          <p v-if="hasVideoSlot" class="small text-muted text-center mt-1 mb-0">This strip has a video, so it is exported as an MP4.</p>
          <p v-if="saveMessage" class="small text-center mt-2 mb-0">{{ saveMessage }}</p>
        </div>
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
  /* The same space for every frame: the strip is never taller than --stage-h (see PhotoStrip.vue),
     and the area is always at least that tall, so it does not grow or shrink when a different frame is chosen */
  --stage-h: min(72vh, 680px);
  background: #EEF0F6;
  min-height: calc(var(--stage-h) + 32px); /* + the panel's padding */
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* Filters */
.filter-btn {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
}

.filter-btn img,
.filter-empty {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 10px;
  border: 3px solid transparent;
  background: #F2C94C; /* shown when no photo is selected yet */
}

.filter-btn.active img,
.filter-btn.active .filter-empty {
  border-color: #2F5BEA;
}

.filter-btn.active span {
  color: #2F5BEA;
  font-weight: 600;
}

/* Sticker tray */
/* The how-to line under the Sticker tray title */
.tray-hint {
  font-size: 0.72rem;
  line-height: 1.35;
}

.tray-tabs {
  display: flex;
  gap: 2px;
  background: #F1F2F6;
  border-radius: 10px;
  padding: 3px;
  overflow-x: auto;      /* very narrow: scroll the tabs instead of wrapping them */
  scrollbar-width: none; /* no scroll bar for 3 short tabs */
}

.tray-tabs::-webkit-scrollbar {
  display: none;
}

.tray-tab {
  flex: 1 0 auto;
  border: none;
  background: none;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.78rem;
  color: #444;
  white-space: nowrap;
}

.tray-tab.active {
  background: #fff;
  color: #2F5BEA;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tray-count {
  margin-left: 4px;
  font-size: 0.65rem;
  background: #E8EEFF;
  color: #2F5BEA;
  border-radius: 999px;
  padding: 0 6px;
}

/* Many stickers: the tray scrolls inside the panel instead of pushing the layers far down */
.tray-grid {
  max-height: 280px;
  overflow-y: auto;
}

/* ★ on a sticker saved from the marketplace */
.saved-tag {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 0.65rem;
  color: #E0A100;
}

.tray-item {
  position: relative;
  aspect-ratio: 1;
  background: #F4F5F9;
  border-radius: 10px;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
}

.tray-item img {
  max-width: 100%;
  max-height: 100%;
  cursor: grab;
}

.tray-item.selected {
  border-color: #2F5BEA;
}


/* Layers */
.layers {
  max-height: 240px;
  overflow-y: auto;
}

.layer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.layer.active {
  background: #E8EEFF;
  color: #2F5BEA;
}

.layer.muted {
  color: #6B7080;
  cursor: default;
}

.layer-thumb {
  width: 40px;
  height: 20px;
  object-fit: contain;
}

.icon-btn {
  border: none;
  background: none;
  padding: 0 4px;
  color: #6B7080;
}

.icon-btn:disabled {
  opacity: 0.3;
}
/* ---------- Smaller screens ---------- */
/* Tablets and phones: the panels stack, so the long lists get shorter scroll areas */
@media (max-width: 991.98px) {
  .canvas-area {
    --stage-h: min(62vh, 560px); /* a bit shorter, so the panels below are not far away */
    padding-top: 20px;
    padding-bottom: 20px;
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
