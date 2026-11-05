<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { playSound } from '../sounds.js'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { getGuestName } from '../guest.js'
import { useAuth } from '../composables/useAuth.js'
import { saveStrip } from '../studio.js'
import { resolveEditedVideos, getClipUrl } from '../clips.js'
import { loadDefaultStickers, loadMyStickers, liveStickerPng, textStickerPng, DEFAULT_SECTIONS } from '../stickerTray.js'
import { FONT_GROUPS_READY, loadArtFonts } from '../stickerArt.js'
import { LAYOUTS, FRAME_STYLES, FILTERS, filterCss, saveField, saveFields, cropOf, cropSource, safeStickers } from '../stripData.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import LiveStickerPicker from '../components/LiveStickerPicker.vue'
import AppIcon from '../components/AppIcon.vue'
import PageTip from '../components/PageTip.vue'

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
const stickers = computed(() => safeStickers(room.value.stripStickers))
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
  { id: 'text', label: 'Text' },
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

const trayBodyEl = ref(null)
const trayScrolledDown = ref(false)
const trayCanScrollDown = ref(true)

function updateTrayScroll() {
  const el = trayBodyEl.value
  if (!el) return
  trayScrolledDown.value = el.scrollTop > 4
  trayCanScrollDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 6
}

// ---------- FIRST-TIME TIPS ----------
// The same as the Pick page's: the first time someone opens Decorate, three small cards explain it, each one
// pointing at the part it is about (PageTip.vue). The "?" next to Filters shows them again.
// Remembered per browser (localStorage); if storage is blocked they just show again.
const DECORATE_TIPS = [
  {
    target: 'edits',
    title: 'Filters and adjustments',
    text: 'Tap a photo or video on the strip, then pick a filter or move the sliders. Apply to all gives every slot the same look.',
  },
  {
    target: 'strip',
    title: 'Decorate together',
    text: 'Everyone in the room sees the same strip.',
  },
  {
    target: 'stickers',
    title: 'Add stickers',
    text: 'Drag a sticker onto the strip, or tap it to add it. Drag a layer by its grip to put a sticker in front or behind.',
  },
]
const DECORATE_TIPS_KEY = 'decorate-tips-seen'
const decorateTipIndex = ref(-1)
const decorateTip = computed(() => DECORATE_TIPS[decorateTipIndex.value] || null)
let tipOpenedTray = false // on a phone the sticker tray is a sheet: the last tip opens it, and closes it again after

function showDecorateTips() {
  decorateTipIndex.value = 0
}

function nextDecorateTip() {
  if (decorateTipIndex.value < DECORATE_TIPS.length - 1) decorateTipIndex.value++
  else closeDecorateTips()
}

function closeDecorateTips() {
  decorateTipIndex.value = -1
  try {
    localStorage.setItem(DECORATE_TIPS_KEY, '1')
  } catch (error) {
    // storage blocked: the tips will show again next time
  }
}

function seenDecorateTips() {
  try {
    return localStorage.getItem(DECORATE_TIPS_KEY) === '1'
  } catch (error) {
    return false
  }
}

// Phones: the sticker tip sits in the tray sheet, so open the sheet for it
watch(decorateTip, (tip) => {
  const phone = window.matchMedia && window.matchMedia('(max-width: 991.98px)').matches
  if (tip && tip.target === 'stickers' && phone && !trayOpen.value) {
    trayOpen.value = true
    tipOpenedTray = true
  } else if ((!tip || tip.target !== 'stickers') && tipOpenedTray) {
    trayOpen.value = false
    tipOpenedTray = false
  }
})

onMounted(() => {
  if (!seenDecorateTips()) showDecorateTips()
})

onMounted(async () => {
  loadArtFonts() // the Text tab's fonts (the same 29 as the Sticker Maker)
  refreshMyStickers()
  document.addEventListener('visibilitychange', onTabVisible)
  window.addEventListener('resize', updateTrayScroll)
  defaultStickers.value = await loadDefaultStickers()
  nextTick(updateTrayScroll)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onTabVisible)
  window.removeEventListener('resize', updateTrayScroll)
})
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

watch([trayTab, defaultSections, mineOpen], () => {
  nextTick(updateTrayScroll)
}, { deep: true })

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
// Its settings are kept on the sticker (live), so a place name can be changed later on the strip.
async function addLiveSticker({ config, live }) {
  trayError.value = ''
  try {
    const src = await liveStickerPng(config, live)
    addSticker(src, 50, 50, 80, { live: { config, live: live || null } })
    if (isPhone()) trayOpen.value = false
  } catch (err) {
    console.error('Could not draw the live sticker:', err)
    trayError.value = 'Could not add that sticker. Please try again.'
  }
}

// ---------- TEXT TAB ----------
// Type, pick a font, colour, bold or italic, then add it. With a text sticker selected, the
// same controls restyle that sticker instead (like the Sticker Maker). Its words are changed
// by double-tapping it on the strip.
const TEXT_COLORS = ['#14172B', '#FFFFFF', '#2F5BEA', '#0EA5E9', '#12B76A', '#F79009', '#F04438', '#7A5AF8', '#FFB3C6', '#FDE047']
const textDraft = ref({ words: '', font: 'Caveat', color: '#14172B', bold: false, italic: false })

// The selected sticker if it is a text sticker
const selectedTextSticker = computed(() => (selectedSticker.value && selectedSticker.value.text ? selectedSticker.value : null))
// What the Text tab's controls show and change: the selected text sticker, or the new one being typed
const textStyle = computed(() => (selectedTextSticker.value ? selectedTextSticker.value.text : textDraft.value))

// The typing box shows the words in the chosen font and style (white is shown dark, so it can be read)
const ALL_FONTS = FONT_GROUPS_READY.flatMap((group) => group.fonts)
const draftStyle = computed(() => ({
  fontFamily: (ALL_FONTS.find((f) => f.name === textDraft.value.font) || ALL_FONTS[0]).stack,
  fontWeight: textDraft.value.bold ? 700 : 400,
  fontStyle: textDraft.value.italic ? 'italic' : 'normal',
  color: textDraft.value.color === '#FFFFFF' ? '#14172B' : textDraft.value.color,
}))

async function addTextSticker() {
  const text = { ...textDraft.value, words: textDraft.value.words.trim() }
  if (!text.words) {
    trayError.value = 'Type something first.'
    return
  }
  trayError.value = ''
  try {
    addSticker(await textStickerPng(text), 50, 50, 70, { text })
    textDraft.value = { ...textDraft.value, words: '' }
    if (isPhone()) trayOpen.value = false
  } catch (err) {
    console.error('Could not draw the text:', err)
    trayError.value = 'Could not add the text. Please try again.'
  }
}

// A font, colour, bold or italic was picked
async function setTextStyle(changes) {
  const sticker = selectedTextSticker.value
  if (!sticker) {
    textDraft.value = { ...textDraft.value, ...changes }
    return
  }
  const text = { ...sticker.text, ...changes }
  try {
    await updateSticker(sticker.id, { text, src: await textStickerPng(text) })
  } catch (err) {
    console.error('Could not restyle the text:', err)
    trayError.value = 'Could not change the text. Please try again.'
  }
}

// ---------- EDITING WORDS ON THE STRIP ----------
// Double-tap a text sticker (or a location / weather one) and a bar opens over the strip with
// its words. The strip shows the change as you type (only on this screen); Done saves it for
// everyone. Time and date stickers show when they were added, so they cannot be retyped.
const editing = ref(null)        // { id, kind: 'text' | 'live', words } while the bar is open
const editPreview = ref(null)    // { id, src } the redrawn picture while typing
const editInput = ref(null)
let editTimer = null

function startEditSticker(id) {
  const sticker = stickers.value.find((s) => s.id === id)
  if (!sticker) return
  if (sticker.text) {
    editing.value = { id, kind: 'text', words: sticker.text.words }
  } else if (sticker.live && ['location', 'weather'].includes(sticker.live.config.type)) {
    editing.value = { id, kind: 'live', words: sticker.live.config.city }
  } else {
    return // a picture, or a time / date sticker: nothing to retype
  }
  editPreview.value = null
  setTimeout(() => editInput.value && editInput.value.focus(), 0)
}

// The picture for the words being typed
async function drawEdited(sticker, words) {
  if (editing.value.kind === 'text') return textStickerPng({ ...sticker.text, words })
  return liveStickerPng({ ...sticker.live.config, city: words.slice(0, 40) }, sticker.live.live)
}

function onEditInput() {
  clearTimeout(editTimer)
  // Wait for a pause in typing, so the picture is not redrawn on every key
  editTimer = setTimeout(async () => {
    if (!editing.value) return
    const sticker = stickers.value.find((s) => s.id === editing.value.id)
    const words = editing.value.words.trim()
    if (!sticker || !words) return
    editPreview.value = { id: sticker.id, src: await drawEdited(sticker, words) }
  }, 250)
}

async function finishEditSticker() {
  clearTimeout(editTimer)
  const edit = editing.value
  editing.value = null
  if (!edit) return
  const sticker = stickers.value.find((s) => s.id === edit.id)
  const words = edit.words.trim()
  if (!sticker || !words) {
    editPreview.value = null
    return
  }
  editing.value = edit // drawEdited reads the kind
  const src = await drawEdited(sticker, words)
  editing.value = null
  const changes = edit.kind === 'text'
    ? { src, text: { ...sticker.text, words } }
    : { src, live: { ...sticker.live, config: { ...sticker.live.config, city: words.slice(0, 40) } } }
  await updateSticker(edit.id, changes)
  editPreview.value = null
}

function cancelEditSticker() {
  clearTimeout(editTimer)
  editing.value = null
  editPreview.value = null
}

// The photo in the selected slot, used for the filter previews
const selectedPhoto = computed(() => photosById.value[slotPhotos.value[selectedSlot.value]] || null)

// ---------- FILTER PREVIEWS FOR VIDEOS ----------
// A slot can hold a clip or an edited video instead of a photo. Its filter previews show one still frame
// of it: the clip's first moment, or the first clip of the edited video at the point it was trimmed to.
const selectedVideo = computed(() => {
  const id = slotPhotos.value[selectedSlot.value]
  if (!id || selectedPhoto.value) return null
  const edited = editedVideos.value[id]
  if (edited && edited.entries.length > 0) {
    const first = edited.entries[0]
    return { clip: first.clip, start: first.start || 0 }
  }
  const clip = clips.value.find((c) => c.id === id)
  return clip ? { clip: clip, start: 0 } : null
})
const previewVideoSrc = ref('') // the video's local link, once it has downloaded

// Download the selected video (getClipUrl keeps it, so the strip and the previews share one download)
watch(selectedVideo, async (video) => {
  previewVideoSrc.value = ''
  if (!video) return
  try {
    const url = await getClipUrl(video.clip)
    if (selectedVideo.value === video) previewVideoSrc.value = url // still the same slot
  } catch (err) {
    console.warn('Could not load the video for the filter previews:', err)
  }
}, { immediate: true })

// Once a preview video knows its length, show the right moment (a little after the start, so it is not black)
function showPreviewFrame(event) {
  event.target.currentTime = (selectedVideo.value ? selectedVideo.value.start : 0) + 0.1
}

// "photo" or "video", for the label under the filters
const selectedKind = computed(() => (selectedVideo.value ? 'video' : 'photo'))

// The selected slot's edit, with the default values for anything not saved yet
const currentEdit = computed(() => {
  return { filter: 'original', brightness: 0, contrast: 0, saturation: 0, ...(edits.value[selectedSlot.value] || {}) }
})

const selectedSticker = computed(() => stickers.value.find((s) => s.id === selectedStickerId.value) || null)

// Selecting a text sticker opens the Text tab, so its font and colour are right there
watch(selectedTextSticker, (sticker) => {
  if (sticker) trayTab.value = 'text'
})

// Stickers sorted front to back, for the Layers list ([...] copies the list, so the real one is not reordered)
// (While a layer is being dragged, its new place in the list is shown, see dragOrder below.)
const layersFrontToBack = computed(() => {
  if (dragOrder.value) return dragOrder.value.map((id) => stickers.value.find((s) => s.id === id)).filter(Boolean)
  return [...stickers.value].sort((a, b) => b.z - a.z)
})

// What the strip draws: the room's stickers, restacked while a layer is being dragged
// (Also shows the words being retyped on the strip before they are saved, see editPreview.)
const stripStickers = computed(() => {
  let list = stickers.value
  if (dragOrder.value) {
    const order = dragOrder.value
    list = list.map((s) => ({ ...s, z: order.length - order.indexOf(s.id) }))
  }
  if (editPreview.value) {
    const preview = editPreview.value
    list = list.map((s) => (s.id === preview.id ? { ...s, src: preview.src } : s))
  }
  return list
})

const photoCount = computed(() => Object.values(slotPhotos.value).filter(Boolean).length)

// ---------- FILTERS ----------

// Save one value of the selected slot's edit, e.g. updateEdit('brightness', 10).
// Only this slot's edit is saved ('stripEdits.2'), so people editing different photos do not clash.
async function updateEdit(key, value) {
  const newEdit = { ...currentEdit.value }
  newEdit[key] = value
  appliedToAll.value = false
  await saveField(roomRef(), 'stripEdits.' + selectedSlot.value, newEdit)
}

// ---------- APPLY TO ALL ----------
// Copy the selected slot's filter and adjustments to every photo and video on the strip, in one save
const appliedToAll = ref(false) // shows "Applied to all" until the filter is changed again

const filledSlotIndexes = computed(() =>
  layout.value.slots.map((_, i) => i).filter((i) => !!slotPhotos.value[i]))

async function applyToAll() {
  const edit = { ...currentEdit.value }
  const changes = {}
  for (const i of filledSlotIndexes.value) {
    changes['stripEdits.' + i] = edit
  }
  if (Object.keys(changes).length === 0) return
  await updateDoc(roomRef(), changes)
  appliedToAll.value = true
}

// ---------- RESET ----------
// Back to Original with every slider at 0. Resets what the label says it is applied to:
// just the selected photo / video, or every one after "Apply to all".
const NO_EDIT = { filter: 'original', brightness: 0, contrast: 0, saturation: 0 }

function isEdited(index) {
  const edit = edits.value[index]
  if (!edit) return false
  return Object.keys(NO_EDIT).some((key) => (edit[key] ?? NO_EDIT[key]) !== NO_EDIT[key])
}

// Nothing to reset: the button is greyed out
const canReset = computed(() =>
  appliedToAll.value ? filledSlotIndexes.value.some(isEdited) : isEdited(selectedSlot.value))

async function resetEdits() {
  const indexes = appliedToAll.value ? filledSlotIndexes.value : [selectedSlot.value]
  const changes = {}
  for (const i of indexes) {
    changes['stripEdits.' + i] = { ...NO_EDIT }
  }
  await updateDoc(roomRef(), changes)
  appliedToAll.value = false
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
// extra: anything else to keep on the sticker, e.g. { text } or { live } so its words can be changed later
async function addSticker(src, x, y, width = 45, extra = {}) {
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
    ...extra,
  }
  selectedStickerId.value = sticker.id // select it, so the size / rotate sliders show
  playSound('pop')
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
  playSound('remove')
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
  if (event.target.closest('.strip-wrap, .tray, .layers, .edit-bar')) return // the strip handles its own taps
  selectedStickerId.value = null
}

onMounted(() => document.addEventListener('pointerdown', onPagePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPagePointerDown))

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
    playSound('success')
  } catch (error) {
    console.error(error)
    saveMessage.value = 'Could not save. Please try again.'
  }
  saving.value = false
}
</script>

<template>
  <!-- app-page: the shared Blue Studios look (colours, font, buttons) from pages.css, see design.md -->
  <div class="app-page room-page">
  <StageBar current="decorate" />

  <!-- 3 columns from Bootstrap "lg" (992px) up. On phones: strip first -->
  <div class="row g-3">
    <!-- LEFT: filters and adjustments -->
    <div class="col-12 col-md-6 col-lg-3 order-2 order-lg-1">
      <div class="panel side-panel" :class="{ 'tip-target': decorateTip && decorateTip.target === 'edits' }">
        <div class="panel-head mb-2">
          <h2 class="section-title mb-0">Filters</h2>
          <!-- Shows the how-to tips again -->
          <button type="button" class="tip-help" title="How to decorate the strip" aria-label="How to decorate the strip" @click="showDecorateTips">?</button>
          <PageTip
            v-if="decorateTip && decorateTip.target === 'edits'"
            class="tip-under-head"
            :title="decorateTip.title"
            :text="decorateTip.text"
            :step="decorateTipIndex + 1"
            :total="DECORATE_TIPS.length"
            @next="nextDecorateTip"
            @skip="closeDecorateTips"
          />
        </div>
        <!-- Each preview is the selected photo with that filter's CSS -->
        <div class="row g-2 mb-3">
          <div v-for="f in FILTERS" :key="f.id" class="col-6">
            <button class="filter-btn w-100" :class="{ active: currentEdit.filter === f.id }" data-sound="filter" @click="updateEdit('filter', f.id)">
              <img v-if="selectedPhoto" :src="selectedPhoto.image" alt="" :style="{ filter: f.css }" />
              <!-- a video: one still frame of it, with this filter (mirrored like on the strip if it was a selfie) -->
              <video
                v-else-if="previewVideoSrc"
                :src="previewVideoSrc"
                class="filter-video"
                muted
                playsinline
                preload="auto"
                :style="{ filter: f.css, transform: selectedVideo.clip.mirrored ? 'scaleX(-1)' : 'none' }"
                @loadedmetadata="showPreviewFrame"
              ></video>
              <span v-else class="filter-empty" :style="{ filter: f.css }"></span>
              <span class="small d-block mt-1">{{ f.name }}</span>
            </button>
          </div>
        </div>

        <h2 class="section-title mt-1">Adjustments</h2>
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

        <div class="d-flex align-items-center justify-content-between gap-2 mt-2 flex-wrap">
          <span class="badge rounded-pill text-bg-light">
            {{ appliedToAll ? 'Applied to all' : 'Applied to ' + selectedKind + ' ' + (selectedSlot + 1) }}
          </span>
          <div class="d-flex gap-2">
            <!-- Reset: back to Original and 0 on every slider, for what the label above says -->
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary filter-action"
              data-test="reset-filter"
              :disabled="!canReset"
              :title="appliedToAll ? 'Remove the filter and adjustments from every photo and video' : 'Remove the filter and adjustments from this ' + selectedKind"
              @click="resetEdits"
            >
              <AppIcon name="undo" :size="12" />
              {{ appliedToAll ? 'Reset all' : 'Reset' }}
            </button>
            <!-- Apply to all: the same filter and adjustments on every photo and video in the frame -->
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary filter-action"
              data-test="apply-all"
              :disabled="filledSlotIndexes.length < 2"
              @click="applyToAll"
            >Apply to all</button>
          </div>
        </div>
        <p class="hint mt-2 mb-0">Tap a photo or video on the strip to choose which one to edit.</p>
      </div>
    </div>

    <!-- MIDDLE: the strip (the same for everyone) -->
    <div class="col-12 col-lg-6 order-1 order-lg-2">
      <div class="panel canvas-area position-relative" :class="{ 'tip-target': decorateTip && decorateTip.target === 'strip' }">
        <PageTip
          v-if="decorateTip && decorateTip.target === 'strip'"
          class="tip-on-strip"
          arrow="down"
          :title="decorateTip.title"
          :text="decorateTip.text"
          :step="decorateTipIndex + 1"
          :total="DECORATE_TIPS.length"
          @next="nextDecorateTip"
          @skip="closeDecorateTips"
        />
        <!-- Retyping a text, location or weather sticker (opened by double-tapping it on the strip) -->
        <div v-if="editing" class="edit-bar" role="dialog" aria-label="Change the words">
          <textarea
            v-if="editing.kind === 'text'"
            ref="editInput"
            v-model="editing.words"
            class="form-control edit-input"
            rows="2"
            maxlength="120"
            aria-label="Words"
            @input="onEditInput"
            @keydown.esc="cancelEditSticker"
          ></textarea>
          <input
            v-else
            ref="editInput"
            v-model="editing.words"
            type="text"
            class="form-control edit-input"
            maxlength="40"
            aria-label="Place name"
            @input="onEditInput"
            @keydown.enter="finishEditSticker"
            @keydown.esc="cancelEditSticker"
          />
          <div class="edit-actions">
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="cancelEditSticker">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" @click="finishEditSticker">Done</button>
          </div>
        </div>

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
          @sticker-dblclick="startEditSticker"
          @delete-sticker="deleteSticker"
          @update-sticker="updateSticker"
          @slot-click="onSlotClick"
          @strip-click="onStripClick"
        />
      </div>
    </div>

    <!-- RIGHT: sticker tray, selected sticker, layers -->
    <div class="col-12 col-md-6 col-lg-3 order-3">
      <div class="panel side-panel d-flex flex-column" :class="{ 'tip-target': decorateTip && decorateTip.target === 'stickers' }">
        <!-- The sticker tray. On a laptop it sits here in the panel. On a phone it is a sheet
             that slides up from the "Stickers" button and closes when a sticker is picked. -->
        <section class="tray" :class="{ open: trayOpen }" aria-label="Sticker tray">
          <div class="tray-head">
            <h2 class="section-title mb-0">Sticker tray</h2>
            <button type="button" class="tray-close" aria-label="Close the sticker tray" @click="trayOpen = false"><AppIcon name="close" :size="16" /></button>
            <PageTip
              v-if="decorateTip && decorateTip.target === 'stickers'"
              class="tip-under-head"
              :title="decorateTip.title"
              :text="decorateTip.text"
              :step="decorateTipIndex + 1"
              :total="DECORATE_TIPS.length"
              @next="nextDecorateTip"
              @skip="closeDecorateTips"
            />
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

          <div class="tray-scroll-wrap">
            <div
              ref="trayBodyEl"
              class="tray-body"
              role="tabpanel"
              @scroll.passive="updateTrayScroll"
            >
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

              <!-- TEXT: type, style, add. With a text sticker selected, the style buttons change it. -->
              <template v-else-if="trayTab === 'text'">
                <template v-if="!selectedTextSticker">
                  <textarea
                    v-model="textDraft.words"
                    class="form-control text-words"
                    rows="2"
                    maxlength="120"
                    placeholder="Type something"
                    aria-label="Words for the text sticker"
                    :style="draftStyle"
                  ></textarea>
                  <button type="button" class="btn btn-primary btn-sm w-100 mt-2" @click="addTextSticker">Add to strip</button>
                </template>
                <p v-else class="small text-muted mb-2">Double-tap the text on the strip to change its words.</p>

                <!-- Bold, italic and colour -->
                <div class="text-row">
                  <button type="button" class="text-toggle" :class="{ active: textStyle.bold }" :aria-pressed="textStyle.bold" aria-label="Bold" title="Bold" @click="setTextStyle({ bold: !textStyle.bold })"><b>B</b></button>
                  <button type="button" class="text-toggle" :class="{ active: textStyle.italic }" :aria-pressed="textStyle.italic" aria-label="Italic" title="Italic" @click="setTextStyle({ italic: !textStyle.italic })"><i>I</i></button>
                  <span class="text-row-line" aria-hidden="true"></span>
                  <div class="text-colors">
                    <button
                      v-for="color in TEXT_COLORS"
                      :key="color"
                      type="button"
                      class="text-swatch"
                      :class="{ active: textStyle.color === color }"
                      :style="{ background: color }"
                      :aria-label="'Colour ' + color"
                      :aria-pressed="textStyle.color === color"
                      @click="setTextStyle({ color })"
                    ></button>
                    <label class="text-swatch text-swatch-any" title="Any colour">
                      <input type="color" :value="textStyle.color" aria-label="Any colour" @change="setTextStyle({ color: $event.target.value })" />
                    </label>
                  </div>
                </div>

                <!-- Fonts: each name in its own face -->
                <div v-for="group in FONT_GROUPS_READY" :key="group.group" class="tray-section">
                  <p class="tray-label">{{ group.group }}</p>
                  <div class="text-fonts">
                    <button
                      v-for="font in group.fonts"
                      :key="font.name"
                      type="button"
                      class="text-font"
                      :class="{ active: textStyle.font === font.name }"
                      :aria-pressed="textStyle.font === font.name"
                      :style="{ fontFamily: font.stack }"
                      @click="setTextStyle({ font: font.name })"
                    >{{ font.name }}</button>
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
            <!-- Scroll affordance shadows -->
            <div class="tray-scroll-hint top" :class="{ visible: trayScrolledDown }" aria-hidden="true"></div>
            <div class="tray-scroll-hint bottom" :class="{ visible: trayCanScrollDown }" aria-hidden="true"></div>
          </div>
        </section>

        <!-- Phones: the button that opens the tray, and the dim layer behind the open sheet -->
        <button type="button" class="tray-fab" :aria-expanded="trayOpen" @click="trayOpen = true">
          <span aria-hidden="true">✦</span> Stickers
        </button>
        <div v-if="trayOpen" class="tray-backdrop" @click="trayOpen = false"></div>

        <!-- Layers: front at the top. Drag a row by its grip to move a sticker in front of or behind
             others. Photos and frame are always behind the stickers, so they stay at the bottom. -->
        <section class="layers-section" aria-label="Layers">
          <h2 class="section-title">Layers</h2>
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
        </section>

        <div class="mt-auto">
          <!-- PLACEHOLDER (Shannon): the Music Mixer is at /room/:code/music on the music-mixer branch.
               When it is on main and 'music' is added to STAGE_PATHS in RoomLayout.vue, remove "disabled". -->
          <!-- <button v-if="isAccount" class="btn btn-outline-primary btn-sm w-100 mt-2" :disabled="saving || hasVideoSlot" @click="saveToStudio">
            {{ saving ? 'Saving...' : 'Save to My Studio' }}
          </button> -->
          <p v-if="saveMessage" class="small text-center mt-2 mb-0">{{ saveMessage }}</p>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Styles follow design.md: colours are the app-page variables (--brand, --ink, --muted, --line, --soft),
   corners 10px (buttons, tiles) / 16px (cards), soft low shadows, hover only with a mouse,
   and movement switched off for reduced motion. */

.room-page {
  padding-bottom: 24px;
  /* The same sizes on Pick and Decorate (PickView.vue and DecorateView.vue keep these the same):
     --stage-h  the most the strip can be tall
     --panel-h  on computers, all 3 panels are exactly this tall, whatever is in them (the side panels scroll inside),
                so nothing grows or shrinks when the frame, the photos or the stickers change */
  --stage-h: min(76vh, 740px);
  --panel-h: calc(var(--stage-h) + 40px); /* + the panel's padding */
}

/* Tablets and phones: the panels stack, and the strip is a bit shorter so the panels below are not far away */
@media (max-width: 991.98px) {
  .room-page {
    --stage-h: min(62vh, 560px);
  }
}

.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  text-wrap: balance;
}

/* ---------- First-time tips (PageTip.vue), the same as the Pick page's ---------- */
/* A panel heading that a tip can hang under */
.panel-head,
.tray-head {
  position: relative;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* Under the heading, the arrow pointing up at it */
.tip-under-head {
  top: calc(100% + 10px);
  left: 0;
}

/* On the strip: at the top, the arrow pointing down at it */
.tip-on-strip {
  top: 16px;
  left: 16px;
}

/* The panel a tip is about gets a soft blue ring */
.panel.tip-target {
  border-color: var(--brand);
  box-shadow: 0 0 0 4px rgba(47, 91, 234, 0.15);
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

/* The round "?" that shows the tips again */
.tip-help {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  transition: color 150ms ease, border-color 150ms ease, transform 160ms var(--ease-out);
}

.tip-help:active {
  transform: scale(0.97);
}

.tip-help:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .tip-help:hover {
    color: var(--brand);
    border-color: var(--brand);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tip-help:active {
    transform: none;
  }
}

.hint {
  font-size: 0.82rem;
  color: var(--muted);
  text-wrap: pretty;
}

/* Keyboard focus is always visible */
.filter-btn:focus-visible,
.tray-item:focus-visible,
.tray-tab:focus-visible,
.apply-all:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.panel {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  height: 100%;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04);
}

.canvas-area {
  /* The same space for every frame: the strip is never taller than --stage-h (see PhotoStrip.vue),
     and the area is always at least that tall, so it does not grow or shrink when a different frame is chosen */
  container: stage / inline-size;
  background: var(--soft);
  min-height: calc(var(--stage-h) + 40px); /* + the panel's padding */
  /* The strip is as wide as on the Pick page, where the reposition card (184px), the zoom buttons (44px)
     and the gaps (2 x 12px) sit beside it */
  --strip-cap: calc(100% - 252px);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* Filters */
/* "Reset" and "Apply to all" next to the "Applied to" label */
.filter-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  padding: 2px 10px;
  border-radius: 999px;
}

.filter-btn {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
}

.filter-btn img,
.filter-btn .filter-video,
.filter-empty {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 10px;
  border: 3px solid transparent;
  background: var(--soft, #F4F6FA); /* shown when no photo is selected yet */
}

.filter-btn.active img,
.filter-btn.active .filter-video,
.filter-btn.active .filter-empty {
  border-color: var(--brand);
}

.filter-btn.active span {
  color: var(--brand);
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
  color: var(--muted);
}

/* The tray's content scrolls inside the panel, so Layers and the buttons stay close */
.tray-scroll-wrap {
  position: relative;
  min-height: 0;
}

.tray-body {
  max-height: 360px;
  overflow-y: auto;
  margin-bottom: 0;
  padding-bottom: 12px;
  padding-right: 2px;
  scrollbar-width: thin;
}

/* Subtle scroll hints at the edges of the sticker tray */
.tray-scroll-hint {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 180ms ease;
  z-index: 2;
}

.tray-scroll-hint.top {
  top: 0;
  height: 20px;
  background: linear-gradient(to bottom, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0) 100%);
}

.tray-scroll-hint.bottom {
  bottom: 0;
  height: 30px;
  background: linear-gradient(to top, rgba(15, 23, 42, 0.1) 0%, rgba(15, 23, 42, 0.02) 60%, rgba(15, 23, 42, 0) 100%);
}

.tray-scroll-hint.visible {
  opacity: 1;
}

@supports (container-type: scroll-state) {
  .tray-scroll-wrap {
    container-type: scroll-state;
  }
  @container scroll-state(scrollable: top) {
    .tray-scroll-hint.top {
      opacity: 1;
    }
  }
  @container scroll-state(scrollable: bottom) {
    .tray-scroll-hint.bottom {
      opacity: 1;
    }
  }
}

.tray-section + .tray-section {
  margin-top: 12px;
}

.tray-label {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink);
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
  background: var(--soft);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink);
}

.tray-fold-count {
  margin-left: 4px;
  font-weight: 600;
  color: var(--muted);
}

.tray-chevron {
  line-height: 1;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.tray-chevron.up {
  transform: rotate(180deg);
}

/* ---------- Text tab ---------- */
.text-words {
  font-size: 1.15rem; /* also stops iPhones zooming in (16px or more) */
  line-height: 1.3;
  resize: vertical;
}

.text-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 12px 0 4px;
}

.text-toggle {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  color: var(--ink);
}

.text-toggle.active {
  border-color: var(--brand);
  background: var(--brand-tint);
  color: var(--brand);
}

.text-row-line {
  width: 1px;
  height: 22px;
  margin: 0 4px;
  flex-shrink: 0;
  background: var(--line);
}

/* The colours scroll sideways in a narrow panel */
.text-colors {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.text-swatch {
  position: relative;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid rgba(20, 23, 43, 0.15);
  border-radius: 999px;
}

.text-swatch.active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--brand);
}

/* "Any colour": a rainbow circle with the real colour picker invisibly on top */
.text-swatch-any {
  margin: 0;
  background: conic-gradient(#f04438, #f79009, #fdffb6, #12b76a, #0ea5e9, #7a5af8, #f04438);
  cursor: pointer;
}

.text-swatch-any input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.text-fonts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.text-font {
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  font-size: 0.95rem;
  color: var(--ink);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-font.active {
  border-color: var(--brand);
  background: var(--brand-tint);
  color: var(--brand);
}

/* The bar for retyping a sticker's words, floating at the top of the strip area */
.edit-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 50;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(20, 23, 43, 0.14);
}

.edit-input {
  font-size: 16px; /* 16px so iPhones do not zoom in */
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* Phones: the "Stickers" button and the dim layer behind the open sheet (hidden on laptops) */
.tray-fab,
.tray-backdrop {
  display: none;
}

.tray-tabs {
  display: flex;
  gap: 2px;
  background: var(--soft);
  border-radius: 10px;
  padding: 3px;
  overflow-x: auto;      /* very narrow: scroll the tabs instead of wrapping them */
  scrollbar-width: none; /* no scroll bar for 3 short tabs */
}

.tray-tabs::-webkit-scrollbar {
  display: none;
}

/* Equal-width tabs, each name centred (flex: 1 1 0 shares the width evenly, so the bold active tab and the
   "Mine 5" count do not make one tab wider than the others; min-width keeps a tab from being squashed) */
.tray-tab {
  flex: 1 1 0;
  min-width: max-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.8rem;
  line-height: 1.3;
  color: #444;
  white-space: nowrap;
}

.tray-tab.active {
  background: #fff;
  color: var(--brand);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.tray-count {
  font-size: 0.65rem;
  background: var(--brand-tint);
  color: var(--brand);
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
  width: 100%;      /* a <button> does not stretch to its grid cell by itself */
  min-width: 0;
  overflow: hidden; /* nothing can poke out of the box */
  background: var(--soft);
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

/* The sticker fills the box's inside (6px from each edge), shrunk to fit and centred.
   Absolute + object-fit instead of max-height: 100%, because Safari (Mac, iPhone) cannot work out a %
   height inside a box whose height comes from aspect-ratio, so tall stickers spilled out of their box. */
.tray-item img {
  position: absolute;
  inset: 6px;
  width: calc(100% - 12px);
  height: calc(100% - 12px);
  object-fit: contain;
  object-position: center;
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .tray-item:hover {
    border-color: var(--brand);
    background: var(--brand-tint);
  }
}


/* Layers */
.layers-section {
  position: relative;
  z-index: 4;
  background: #fff;
  margin: 0 -16px;
  padding: 14px 16px 0;
  border-top: 1px solid rgba(15, 23, 42, 0.1);
  box-shadow: 0 -10px 24px -2px rgba(15, 23, 42, 0.2), 0 -3px 8px -1px rgba(15, 23, 42, 0.1);
  clip-path: inset(-50px 0 0 0);
}

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
  background: var(--brand-tint);
  color: var(--brand);
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
  color: var(--brand);
}

.layer.muted {
  color: var(--muted);
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
  color: var(--muted);
}

/* A hidden sticker's crossed-out eye is paler, so hidden layers stand out in the list */
.icon-btn.hidden {
  color: #B9BECC;
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn:hover {
    color: var(--brand);
    background: var(--brand-tint);
  }
}

.icon-btn:disabled {
  opacity: 0.3;
}
/* ---------- Smaller screens ---------- */
/* Tablets and phones: the panels stack, so the long lists get shorter scroll areas */
@media (max-width: 991.98px) {
  .canvas-area {
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

  .layers-section {
    margin: 0;
    padding: 0;
    border-top: none;
    box-shadow: none;
    background: transparent;
    clip-path: none;
  }

  /* A round button at the bottom right that opens the tray, always in reach of a thumb.
     It sits above the Back / Next bar at the bottom (RoomStageNav.vue sets its height as --stage-nav-h) */
  .tray-fab {
    position: fixed;
    right: 16px;
    bottom: calc(var(--stage-nav-h, 56px) + 12px);
    z-index: 1040;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 18px;
    border: none;
    border-radius: 999px;
    background: var(--brand);
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
    padding: 16px; /* the same as the Pick page */
  }
}

/* A narrow middle panel: on the Pick page the zoom buttons (44px + a 12px gap) are beside the strip, and the
   reposition card goes under it */
@container stage (max-width: 520px) {
  .canvas-area > * {
    --strip-cap: calc(100% - 56px);
  }
}

/* Computers: all 3 panels exactly --panel-h tall, like the Pick page. The side panels scroll inside. */
@media (min-width: 992px) {
  .canvas-area {
    height: var(--panel-h);
  }

  .side-panel {
    height: var(--panel-h);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
  }
}
</style>
