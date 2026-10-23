<script setup>
import { ref, computed } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { getGuestName } from '../guest.js'
import { useAuth } from '../composables/useAuth.js'
import { saveStrip } from '../studio.js'
import { LAYOUTS, FRAME_STYLES, STICKERS, FILTERS, filterCss, saveField, saveFields } from '../stripData.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'

// The "Decorate" page (a child of RoomLayout.vue): filters and stickers.
//   Left:   filters and adjustments for the photo tapped on the strip
//   Middle: the strip - drop stickers anywhere, drag them to move
//   Right:  sticker tray, size / rotate, layers, Mix soundtrack
// Layers use z-index: a bigger z is drawn in front.

const { code, room, photos, roomRef } = useRoom()
const myName = getGuestName()

const selectedSlot = ref(0)          // the photo the filters change ("Applied to photo 1")
const selectedStickerId = ref(null)  // the sticker being resized / rotated
const trayTab = ref('mine')          // 'mine' | 'giphy' | 'dynamic'
const selectedTrayId = ref(null)     // phones: the tray sticker tapped
const exporting = ref(false)

// Accounts can also save the strip to My Studio
const { isAccount } = useAuth()
const saving = ref(false)
const saveMessage = ref('')

// The strip, from the room document (the same fields as the Pick page)
const layout = computed(() => LAYOUTS.find((l) => l.id === room.value.stripLayoutId) || LAYOUTS[0])
const frameStyle = computed(() => FRAME_STYLES.find((s) => s.id === room.value.stripStyleId) || FRAME_STYLES[0])
const slotPhotos = computed(() => room.value.stripSlots || {})
const edits = computed(() => room.value.stripEdits || {})
const stickers = computed(() => room.value.stripStickers || [])

const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// PLACEHOLDER (Rae): STICKERS is in stripData.js. Only the open tab's stickers are shown.
const trayStickers = computed(() => STICKERS.filter((s) => s.tab === trayTab.value))

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

// Phones do not support drag and drop:
// tap a tray sticker then tap the strip to add it, or select a strip sticker then tap the strip to move it
function onStripClick(x, y) {
  if (selectedTrayId.value) {
    const item = STICKERS.find((s) => s.id === selectedTrayId.value)
    addSticker(item.src, x, y)
    selectedTrayId.value = null
  } else if (selectedSticker.value) {
    moveSticker(selectedSticker.value.id, x, y)
  }
}

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

// Draw the strip on a canvas (used by Download JPG and Save to My Studio)
async function drawStripCanvas() {
  const W = 900                                 // width of the JPG, in pixels
  const H = Math.round(W / layout.value.aspect) // height, from the strip's shape
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Frame background
  ctx.fillStyle = frameStyle.value.background
  ctx.fillRect(0, 0, W, H)

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
    const scale = Math.max(w / img.width, h / img.height)
    const cropWidth = w / scale
    const cropHeight = h / scale

    ctx.save()
    // Only draw inside the slot's shape (an ellipse for circle slots)
    ctx.beginPath()
    if (frameStyle.value.shape === 'circle') {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    } else {
      ctx.rect(x, y, w, h)
    }
    ctx.clip()
    ctx.filter = filterCss(edits.value[i]) || 'none' // the same filter as on screen
    ctx.drawImage(img, (img.width - cropWidth) / 2, (img.height - cropHeight) / 2, cropWidth, cropHeight, x, y, w, h)
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

  // Caption
  ctx.fillStyle = frameStyle.value.border
  ctx.font = 'bold 34px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(frameStyle.value.caption, W / 2, H - H * 0.03)
  return canvas
}

async function downloadJpg() {
  exporting.value = true
  try {
    const canvas = await drawStripCanvas()
    // Download: make a temporary link to the JPG and click it
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/jpeg', 0.92)
    link.download = 'photostrip-' + code.value + '.jpg'
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
          :stickers="stickers"
          :selected-slot="selectedStickerId ? null : selectedSlot"
          :selected-sticker-id="selectedStickerId"
          @drop-sticker="addSticker"
          @move-sticker="moveSticker"
          @sticker-click="(id) => (selectedStickerId = id)"
          @slot-click="onSlotClick"
          @strip-click="onStripClick"
        />
        <p class="small text-muted text-center mt-2 mb-0">
          Drag stickers onto the strip, then drag to move. Phone: tap a sticker in the tray, then tap the strip.
        </p>      </div>
    </div>

    <!-- RIGHT: sticker tray, selected sticker, layers -->
    <div class="col-12 col-md-6 col-lg-3 order-3">
      <div class="panel d-flex flex-column">
        <h2 class="h5 fw-bold">Sticker tray</h2>

        <ul class="nav nav-pills nav-fill small mb-2 tray-tabs">
          <li class="nav-item"><button class="nav-link" :class="{ active: trayTab === 'mine' }" @click="trayTab = 'mine'">My stickers</button></li>
          <li class="nav-item"><button class="nav-link" :class="{ active: trayTab === 'giphy' }" @click="trayTab = 'giphy'">GIPHY</button></li>
          <li class="nav-item"><button class="nav-link" :class="{ active: trayTab === 'dynamic' }" @click="trayTab = 'dynamic'">Dynamic</button></li>
        </ul>

        <!-- Drag a sticker onto the strip, or tap it (phones) -->
        <div class="row g-2 mb-3">
          <div v-for="s in trayStickers" :key="s.id" class="col-4">
            <div class="tray-item" :class="{ selected: s.id === selectedTrayId }" :title="s.name">
              <img
                :src="s.src"
                :alt="s.name"
                draggable="true"
                @dragstart="onTrayDragStart($event, s)"
                @click="selectedTrayId = selectedTrayId === s.id ? null : s.id"
              />
            </div>
          </div>
          <div class="col-4">
            <!-- PLACEHOLDER (Rae): link to the Sticker Maker page when it is on main -->
            <div class="tray-item add-item" title="Sticker maker coming soon">+</div>
          </div>
        </div>

        <!-- Only shown when a sticker on the strip is selected -->
        <div v-if="selectedSticker" class="mb-3">
          <label class="form-label small d-flex justify-content-between mb-0">Size <span>{{ selectedSticker.w }}%</span></label>
          <input type="range" class="form-range" min="10" max="100" :value="selectedSticker.w"
                 @change="updateSticker(selectedSticker.id, { w: Number($event.target.value) })" />
          <label class="form-label small d-flex justify-content-between mb-0">Rotate <span>{{ selectedSticker.rotate }}°</span></label>
          <input type="range" class="form-range" min="-180" max="180" :value="selectedSticker.rotate"
                 @change="updateSticker(selectedSticker.id, { rotate: Number($event.target.value) })" />
          <button class="btn btn-outline-danger btn-sm" @click="deleteSticker(selectedSticker.id)">Delete sticker</button>
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
          <button class="btn btn-primary w-100 mb-2" disabled title="Music Mixer coming soon" @click="goToStage('music')">Mix soundtrack</button>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-secondary btn-sm flex-fill" @click="goToStage('strip')">&larr; Pick</button>
            <button class="btn btn-outline-secondary btn-sm flex-fill" :disabled="exporting" @click="downloadJpg">
              {{ exporting ? 'Saving...' : 'Download JPG' }}
            </button>
          </div>
          <button v-if="isAccount" class="btn btn-outline-primary btn-sm w-100 mt-2" :disabled="saving" @click="saveToStudio">
            {{ saving ? 'Saving...' : 'Save to My Studio' }}
          </button>
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
  background: #EEF0F6;
  min-height: 420px;
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
.tray-tabs {
  background: #F1F2F6;
  border-radius: 10px;
  padding: 3px;
}

.tray-tabs .nav-link {
  padding: 4px 6px;
  color: #444;
}

.tray-tabs .nav-link.active {
  background: #fff;
  color: #2F5BEA;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tray-item {
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

.add-item {
  border: 2px dashed #B8BECC;
  color: #8A90A0;
  font-size: 1.5rem;
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
}</style>
