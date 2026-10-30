<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { getGuestName } from '../guest.js'
import { useAuth } from '../composables/useAuth.js'
import { saveStrip } from '../studio.js'
import { resolveEditedVideos } from '../clips.js'
import { loadDefaultStickers, loadMyStickers, liveStickerPng, DEFAULT_SECTIONS } from '../stickerTray.js'
import { LAYOUTS, FRAME_STYLES, FILTERS, filterCss, saveField, saveFields, cropOf, cropSource } from '../stripData.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import LiveStickerPicker from '../components/LiveStickerPicker.vue'
import AppIcon from '../components/AppIcon.vue'

// The "Decorate" page (a child of RoomLayout.vue): filters and stickers.
//   Left:   filters and adjustments for the photo tapped on the strip
//   Middle: the strip - drop stickers anywhere, drag them to move
//   Right:  sticker tray, size / rotate, layers, Mix soundtrack
// Layers use z-index: a bigger z is drawn in front.

const { code, room, photos, clips, roomRef } = useRoom()
const myName = getGuestName()

const selectedSlot = ref(0)          // the photo the filters change ("Applied to photo 1")
const selectedStickerId = ref(null)  // the sticker being resized / rotated
const trayTab = ref('default')       // 'default' | 'live' | 'mine' (see stickerTray.js)
const trayOpen = ref(false)          // phones: the sticker tray is a sheet that slides up
const mineOpen = ref({ mine: true, giphy: true }) // the Mine tab's two sections, folded or not
const trayError = ref('')

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
// Default = the same stickers as the Sticker Maker (stickerArt.js). Live = time, date, weather and
// location (LiveStickerPicker.vue). Mine = this account's stickers and GIFs from the Sticker Maker
// (Rae) and the ones saved from the marketplace, loaded from Firebase (see stickerTray.js).
const TRAY_TABS = [
  { id: 'default', label: 'Default' },
  { id: 'live', label: 'Live' },
  { id: 'mine', label: 'Mine' },
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

// The Default tab in the Sticker Maker's sections, and the Mine tab's two lists
const defaultSections = computed(() => DEFAULT_SECTIONS
  .map((section) => ({ ...section, stickers: defaultStickers.value.filter((s) => s.section === section.id) }))
  .filter((section) => section.stickers.length > 0))
const mineGroups = computed(() => [
  {
    id: 'mine',
    title: 'My stickers',
    list: myStickers.value.filter((s) => s.tab === 'mine'),
    empty: 'Stickers you make in the Sticker Maker or save from the marketplace show up here.',
  },
  {
    id: 'giphy',
    title: 'My GIFs',
    list: myStickers.value.filter((s) => s.tab === 'giphy'),
    empty: 'GIFs you make in the Sticker Maker or save from the marketplace show up here.',
  },
])

// The width where the page's columns stack and the tray becomes a sheet (Bootstrap "lg")
function isPhone() {
  return window.innerWidth < 992
}

// Tapping (or clicking) a tray sticker puts it in the middle of the strip, selected, so it can
// be dragged straight into place. On a phone the tray sheet closes so the strip is in view.
// (On a laptop, dragging a sticker onto a spot on the strip still works too.)
function pickTraySticker(item, width) {
  addSticker(item.src, 50, 50, width)
  if (isPhone()) trayOpen.value = false
}

// The Live tab chose a sticker: draw it as a picture of this moment, then place it.
// WHY wider: it is a row of words, and at a normal sticker's width they would be tiny.
async function addLiveSticker({ config, live }) {
  trayError.value = ''
  try {
    pickTraySticker({ src: await liveStickerPng(config, live) }, 80)
  } catch (err) {
    console.error('Could not draw the live sticker:', err)
    trayError.value = 'Could not add that sticker. Please try again.'
  }
}

// The photo in the selected slot, used for the filter previews
const selectedPhoto = computed(() => photosById.value[slotPhotos.value[selectedSlot.value]] || null)

// The selected slot's edit, with the default values for anything not saved yet
const currentEdit = computed(() => {
  return { filter: 'original', brightness: 0, contrast: 0, saturation: 0, ...(edits.value[selectedSlot.value] || {}) }
})

const selectedSticker = computed(() => stickers.value.find((s) => s.id === selectedStickerId.value) || null)

// Stickers sorted front to back, for the Layers list ([...] copies the list, so the real one is not reordered)
// (While a layer is being dragged, its new place in the list is shown, see dragOrder below.)
const layersFrontToBack = computed(() => {
  if (dragOrder.value) return dragOrder.value.map((id) => stickers.value.find((s) => s.id === id)).filter(Boolean)
  return [...stickers.value].sort((a, b) => b.z - a.z)
})

// What the strip draws: the room's stickers, restacked while a layer is being dragged
const stripStickers = computed(() => {
  if (!dragOrder.value) return stickers.value
  const order = dragOrder.value
  return stickers.value.map((s) => ({ ...s, z: order.length - order.indexOf(s.id) }))
})

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
async function addSticker(src, x, y, width = 45) {
  const topZ = Math.max(0, ...stickers.value.map((s) => s.z)) // the highest z so far (0 if none)
  const sticker = {
    id: Date.now(),  // a simple unique id
    src: src,
    x: Math.round(x), // centre of the sticker, in % of the strip
    y: Math.round(y),
    w: width,         // width, in % of the strip
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

// ---------- REORDERING LAYERS (drag the grip, like the Sticker Maker) ----------
// While dragging, the new order is only kept here (dragOrder) and shown on the strip straight
// away, so you see the sticker move in front of or behind the others. It is saved to the room
// once, when you let go, so the room is not written on every move of the finger.
// WHY pointer events: the browser's own drag-and-drop does not work with a finger.
const layerListEl = ref(null)
const dragOrder = ref(null)        // sticker ids, front to back, while a row is dragged
const draggingLayerId = ref(null)
let orderBeforeDrag = []           // to tell, on letting go, whether anything moved

function startLayerDrag(event, sticker) {
  event.preventDefault()
  selectedStickerId.value = sticker.id
  draggingLayerId.value = sticker.id
  orderBeforeDrag = layersFrontToBack.value.map((s) => s.id)
  dragOrder.value = [...orderBeforeDrag]
  // On the window, so the drag keeps working while the row moves under the finger
  window.addEventListener('pointermove', moveLayerDrag)
  window.addEventListener('pointerup', endLayerDrag)
  window.addEventListener('pointercancel', endLayerDrag)
}

function moveLayerDrag(event) {
  if (!dragOrder.value || !layerListEl.value) return
  // The new place = how many other rows have their middle above the finger
  let index = 0
  layerListEl.value.querySelectorAll('[data-layer-id]').forEach((row) => {
    if (row.dataset.layerId === String(draggingLayerId.value)) return
    const box = row.getBoundingClientRect()
    if (event.clientY > box.top + box.height / 2) index++
  })
  const order = dragOrder.value.filter((id) => id !== draggingLayerId.value)
  order.splice(index, 0, draggingLayerId.value)
  dragOrder.value = order
}

async function endLayerDrag() {
  window.removeEventListener('pointermove', moveLayerDrag)
  window.removeEventListener('pointerup', endLayerDrag)
  window.removeEventListener('pointercancel', endLayerDrag)
  const order = dragOrder.value
  draggingLayerId.value = null
  if (!order) return
  // (Not layersFrontToBack: while dragging, that already shows the new order.)
  if (order.some((id, i) => id !== orderBeforeDrag[i])) {
    // Front of the list = the biggest z
    await saveStickers(stickers.value.map((s) => ({ ...s, z: order.length - order.indexOf(s.id) })))
  }
  dragOrder.value = null
}

onBeforeUnmount(endLayerDrag) // the page was left mid-drag

// A tap on an empty spot of the strip lets go of the selected sticker (its box closes).
// (On a phone, a sticker on the strip is moved by dragging it with a finger, see PhotoStrip.vue.)
function onStripClick() {
  selectedStickerId.value = null
}

// A click or tap anywhere else on the page (not on a sticker, its box, the tray or the layers list)
// also lets go of the selected sticker
function onPagePointerDown(event) {
  if (selectedStickerId.value === null) return
  if (event.target.closest('.strip-wrap, .tray, .layers')) return // the strip handles its own taps
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

// Draw the strip on a canvas (used by Save to My Studio)
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
          :stickers="stripStickers"
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
        <!-- The sticker tray. On a laptop it sits here in the panel. On a phone it is a sheet
             that slides up from the "Stickers" button and closes when a sticker is picked. -->
        <section class="tray" :class="{ open: trayOpen }" aria-label="Sticker tray">
          <div class="tray-head">
            <h2 class="h5 fw-bold mb-0">Sticker tray</h2>
            <button type="button" class="tray-close" aria-label="Close the sticker tray" @click="trayOpen = false">✕</button>
          </div>

          <!-- Tabs: Default, Live, Mine -->
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
              {{ tab.label }}<span v-if="tab.id === 'mine' && myStickers.length" class="tray-count">{{ myStickers.length }}</span>
            </button>
          </div>

          <div class="tray-body" role="tabpanel">
            <p v-if="trayError" class="small text-danger mb-2" role="alert">{{ trayError }}</p>

            <!-- DEFAULT: the Sticker Maker's stickers, shapes, washi tape and emoji.
                 Click or tap to add to the middle of the strip; on a laptop you can also drag one onto a spot. -->
            <template v-if="trayTab === 'default'">
              <p v-if="defaultSections.length === 0" class="small text-muted mb-2">Loading stickers…</p>
              <div v-for="section in defaultSections" :key="section.id" class="tray-section">
                <p class="tray-label">{{ section.title }}</p>
                <div class="tray-grid" :class="{ wide: section.id === 'tapes' }">
                  <button
                    v-for="s in section.stickers"
                    :key="s.id"
                    type="button"
                    class="tray-item"
                    :title="'Add ' + s.name"
                    :aria-label="'Add ' + s.name"
                    draggable="true"
                    @dragstart="onTrayDragStart($event, s)"
                    @click="pickTraySticker(s)"
                  >
                    <img :src="s.src" alt="" draggable="false" />
                  </button>
                </div>
              </div>
            </template>

            <!-- LIVE: time, date, weather and location -->
            <LiveStickerPicker v-else-if="trayTab === 'live'" @add="addLiveSticker" />

            <!-- MINE: my stickers, then my GIFs, each folds away -->
            <template v-else>
              <p v-if="!isAccount" class="small text-muted mb-2">Log in to use the stickers you made or saved.</p>
              <p v-else-if="loadingMine && myStickers.length === 0" class="small text-muted mb-2">Loading your stickers…</p>
              <template v-else>
                <div v-for="group in mineGroups" :key="group.id" class="tray-section">
                  <button
                    type="button"
                    class="tray-fold"
                    :aria-expanded="mineOpen[group.id]"
                    @click="mineOpen[group.id] = !mineOpen[group.id]"
                  >
                    <span>{{ group.title }} <span class="tray-fold-count">{{ group.list.length }}</span></span>
                    <AppIcon name="chevron" :size="16" class="tray-chevron" :class="{ up: mineOpen[group.id] }" />
                  </button>
                  <template v-if="mineOpen[group.id]">
                    <p v-if="group.list.length === 0" class="small text-muted mb-2">{{ group.empty }}</p>
                    <div v-else class="tray-grid">
                      <button
                        v-for="s in group.list"
                        :key="s.id"
                        type="button"
                        class="tray-item"
                        :title="s.saved ? s.name + ' (saved from the marketplace)' : 'Add ' + s.name"
                        :aria-label="'Add ' + s.name"
                        draggable="true"
                        @dragstart="onTrayDragStart($event, s)"
                        @click="pickTraySticker(s)"
                      >
                        <img :src="s.src" alt="" draggable="false" />
                        <span v-if="s.saved" class="saved-tag" aria-hidden="true">★</span>
                      </button>
                    </div>
                  </template>
                </div>
              </template>
            </template>
          </div>
        </section>

        <!-- Phones: the button that opens the tray, and the dim layer behind the open sheet -->
        <button type="button" class="tray-fab" :aria-expanded="trayOpen" @click="trayOpen = true">
          <span aria-hidden="true">✦</span> Stickers
        </button>
        <div v-if="trayOpen" class="tray-backdrop" @click="trayOpen = false"></div>

        <!-- Layers: front at the top. Drag a row by its grip to move a sticker in front of or behind
             others. Photos and frame are always behind the stickers, so they stay at the bottom. -->
        <h2 class="h5 fw-bold">Layers</h2>
        <ul ref="layerListEl" class="list-unstyled layers mb-3">
          <li
            v-for="s in layersFrontToBack"
            :key="s.id"
            :data-layer-id="s.id"
            class="layer"
            :class="{ active: s.id === selectedStickerId, dragging: s.id === draggingLayerId }"
            @click="selectedStickerId = s.id"
          >
            <span
              class="layer-grip"
              title="Drag to move this sticker in front of or behind others"
              aria-label="Drag to reorder"
              @pointerdown="startLayerDrag($event, s)"
              @click.stop
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 8h16 M4 16h16" /></svg>
            </span>
            <img :src="s.src" alt="" class="layer-thumb" />
            <span class="flex-grow-1 small text-truncate">Sticker · {{ s.by || 'someone' }}</span>
            <button
              class="icon-btn"
              :class="{ hidden: !s.visible }"
              :title="s.visible ? 'Hide this sticker' : 'Show this sticker'"
              :aria-label="s.visible ? 'Hide this sticker' : 'Show this sticker'"
              :aria-pressed="!s.visible"
              @click.stop="updateSticker(s.id, { visible: !s.visible })"
            >
              <AppIcon :name="s.visible ? 'eye' : 'eye-off'" :size="16" />
            </button>
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
            <button class="btn btn-outline-primary btn-sm flex-fill" @click="goToStage('export')">Export &rarr;</button>
          </div>
          <button v-if="isAccount" class="btn btn-outline-primary btn-sm w-100 mt-2" :disabled="saving || hasVideoSlot" @click="saveToStudio">
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
.tray-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

/* The ✕ only means something on a phone, where the tray is a sheet */
.tray-close {
  display: none;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: none;
  color: #6B7080;
}

/* The tray's content scrolls inside the panel, so Layers and the buttons stay close */
.tray-body {
  max-height: 360px;
  overflow-y: auto;
  margin-bottom: 16px;
  padding-right: 2px;
  scrollbar-width: thin;
}

.tray-section + .tray-section {
  margin-top: 12px;
}

.tray-label {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #14172B;
}

/* Mine: "My stickers" and "My GIFs" headers that fold their list away */
.tray-fold {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 6px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: #F4F5F9;
  font-size: 0.8rem;
  font-weight: 700;
  color: #14172B;
}

.tray-fold-count {
  margin-left: 4px;
  font-weight: 600;
  color: #6B7080;
}

.tray-chevron {
  line-height: 1;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.tray-chevron.up {
  transform: rotate(180deg);
}

/* Phones: the "Stickers" button and the dim layer behind the open sheet (hidden on laptops) */
.tray-fab,
.tray-backdrop {
  display: none;
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

/* 4 stickers a row; washi tape (long and thin) 2 a row. minmax(0, 1fr) lets the columns
   shrink below the pictures' own width, so nothing pokes out of a narrow panel. */
.tray-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.tray-grid.wide {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  min-width: 0;
  background: #F4F5F9;
  border-radius: 10px;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  cursor: grab;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 150ms ease, background-color 150ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.tray-grid.wide .tray-item {
  aspect-ratio: 2.4 / 1;
}

.tray-item:active {
  transform: scale(0.94);
}

.tray-item img {
  max-width: 100%;
  max-height: 100%;
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .tray-item:hover {
    border-color: #2F5BEA;
    background: #E8EEFF;
  }
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

/* The row being dragged lifts off the list, so it is clear which sticker is moving */
.layer.dragging {
  position: relative;
  z-index: 1;
  background: #fff;
  box-shadow: 0 8px 20px rgba(20, 23, 43, 0.14);
  transform: scale(1.02);
}

/* The grip is the drag handle: big enough for a thumb, and touch-action none so dragging it
   moves the layer instead of scrolling the page */
.layer-grip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: -4px 0 -4px -6px;
  flex-shrink: 0;
  border-radius: 6px;
  color: #9AA0AE;
  cursor: grab;
  touch-action: none;
}

.layer-grip svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.layer-grip:active {
  cursor: grabbing;
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: none;
  padding: 0;
  color: #6B7080;
}

/* A hidden sticker's crossed-out eye is paler, so hidden layers stand out in the list */
.icon-btn.hidden {
  color: #B9BECC;
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn:hover {
    color: #2F5BEA;
    background: #E8EEFF;
  }
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

  /* The tray becomes a sheet that slides up from the bottom, over the page. A picked sticker
     closes it (pickTraySticker), so the strip is in view to drag the sticker into place. */
  .tray {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1045;
    max-height: 70vh;
    max-height: 70dvh;
    display: flex;
    flex-direction: column;
    padding: 14px 16px calc(12px + env(safe-area-inset-bottom));
    background: #fff;
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -12px 32px rgba(20, 23, 43, 0.14);
    transform: translateY(105%);
    transition: transform 300ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .tray.open {
    transform: translateY(0);
  }

  .tray-close {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tray-body {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    margin-bottom: 0;
  }

  .tray-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .tray-grid.wide {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  /* A round button at the bottom right that opens the tray, always in reach of a thumb */
  .tray-fab {
    position: fixed;
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 1040;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 18px;
    border: none;
    border-radius: 999px;
    background: #2F5BEA;
    color: #fff;
    font-weight: 700;
    box-shadow: 0 8px 24px rgba(47, 91, 234, 0.35);
  }

  .tray-fab:active {
    transform: scale(0.97);
  }

  .tray-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1042;
    background: rgba(20, 23, 43, 0.25);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tray,
  .tray-item,
  .tray-chevron {
    transition: none;
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
