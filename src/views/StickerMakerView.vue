<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
// useAuth tells us if the user has an account (guests cannot load or save stickers).
import { useAuth } from '../composables/useAuth.js'
// Gabriel's helpers, so we never rewrite Firebase code ourselves.
import { listMyItems, getFileUrl, saveSticker, MAX_CATEGORIES } from '../studio.js'
// Our own folder helpers (src/stickerCategories.js).
import {
  DEFAULT_CATEGORIES, MAX_FOLDER_NAME, MAX_FOLDERS,
  listMyFolders, createFolder, renameFolder, deleteFolder, addItemToFolders,
} from '../stickerCategories.js'
// Our GIF encoder wrapper (src/gif.js), which uses gifenc.
import { encodeGif } from '../gif.js'
// The shared artwork + font library (src/stickerArt.js). One list is used by the Sticker
// Maker, Joash's Template Editor and Germaine's photostrip tray, so nothing is copied
// three times and the three pages can never drift apart.
import { ART, STICKERS, SHAPES, TAPES, EMOJI, FONTS, FONT_GROUPS_READY, loadArtFonts } from '../stickerArt.js'
// Background removal goes through our server function, so the remove.bg key stays secret.
import { removeBackground } from '../removeBackground.js'
// The design guide says never use window.confirm(): it cannot be styled and some phones block it.
import { askConfirm } from '../composables/useDialog.js'
// The app's shared line icons, so this page matches every other page.
import AppIcon from '../components/AppIcon.vue'
// Live stickers (time, date, weather, location). Shared with Joash and Germaine, so a
// sticker saved here is drawn the same way on their pages.
import {
  DYNAMIC_STYLES, dynamicDataUrl, fetchWeather, cleanDynamicConfig, isDynamicConfig,
} from '../dynamicStickers.js'
// Only for writing a live sticker's settings next to it (see saveLiveConfig).
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'

const { isAccount } = useAuth()

// ----
// Sizes
// ----

// WHY two sizes: a downloaded file can be large, but a saved sticker must stay under
// 2 MB because the Storage rules reject anything bigger, so saving uses 512.
const EXPORT_SIZE = 512
const DOWNLOAD_SIZE = 1000
// WHY 512 for the GIF: a 1000px animated GIF is several MB and slow to encode.
const GIF_SIZE = 512

// ----
// Fonts
// ----

// WHY: the fonts come from the shared library (src/stickerArt.js), so the Sticker Maker
// and Joash's Template Editor offer exactly the same fonts. A layer stores the short
// font name ('Caveat'), the same name the library uses, so a sticker made here means
// the same thing on every page.
// Plus Jakarta Sans is the app's own font (design.md), so a new text box matches the
// rest of Blue Studios until the user picks something more fun.
const APP_FONT = 'Plus Jakarta Sans'

// Turns a stored font name back into the CSS the preview and the export canvas both use,
// so the two can never disagree.
const fontStack = (name) => (FONTS.find((f) => f.name === name) || FONTS[0]).stack

// "Caveat (Doodle Signature)" -> "Doodle Signature": the hint shown under each font name.
const fontHint = (font) => font.label.slice(font.name.length).replace(/[()]/g, '').trim()

// WHY: the browser only makes a web font available to <canvas> after it has loaded.
// Without this the first export after a page load draws the text in a fallback font.
// Only the fonts actually used on a layer are loaded, not all 29.
async function waitForFonts() {
  if (!document.fonts) return
  const wanted = new Set()
  for (const frame of frames.value) {
    for (const layer of frame.layers) {
      if (layer.type === 'text') wanted.add((layer.weight || 400) + ' 56px ' + fontStack(layer.font))
    }
  }
  try {
    await Promise.all([...wanted].map((font) => document.fonts.load(font)))
    await document.fonts.ready
  } catch (error) {
    // A missing font is not worth blocking the export over.
  }
}

// ----
// Sticker artwork filters
// WHY: every item in the shared library has tags ('Y2K', 'Doodles'...). Showing them as
// chips lets you find a sticker without scrolling past all 35.
// ----
const ART_TAGS = ['All', ...new Set(ART.flatMap((item) => item.tags))]
const activeTag = ref('All')

function byTag(list) {
  if (activeTag.value === 'All') return list
  return list.filter((item) => item.tags.includes(activeTag.value))
}

// One entry per section of the Stickers drawer, so the template is a single loop.
const artSections = computed(() => [
  { id: 'stickers', title: 'Stickers', items: byTag(STICKERS) },
  { id: 'shapes', title: 'Cute shapes', items: byTag(SHAPES) },
  { id: 'tapes', title: 'Washi tape', items: byTag(TAPES) },
  { id: 'emoji', title: 'Emoji', items: byTag(EMOJI) },
].filter((section) => section.items.length > 0))

// Sizes are percentages of the canvas width, so a heading stays a heading at any size.
const TEXT_STYLES = [
  { name: 'Heading', size: 12, weight: 700 },
  { name: 'Subheading', size: 9, weight: 600 },
  { name: 'Body', size: 6, weight: 400 },
  { name: 'Caption', size: 4, weight: 400 },
]

// WHY: most icons come from the app's AppIcon component (design.md). AppIcon has no
// "text", "sticker", "grip" or "sliders" icon, so those four stay as local paths here
// rather than editing a component the whole team shares.
const LOCAL_ICONS = {
  sticker: 'M4 4h11l5 5v11H4z M15 4v5h5 M8 15c1.4-1.6 3-1.6 4.4 0',
  text: 'M5 6h14 M12 6v13 M8.5 19h7',
  sliders: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M14 5v4 M8 15v4',
  grip: 'M4 8h16 M4 16h16',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7v5l3 2',
}

// icon: an AppIcon name; local: a LOCAL_ICONS name.
const TOOLS = [
  { id: 'stickers', label: 'Stickers', local: 'sticker' },
  { id: 'text', label: 'Text', local: 'text' },
  { id: 'live', label: 'Live', local: 'clock' },
  { id: 'draw', label: 'Draw', icon: 'pen' },
  { id: 'upload', label: 'Upload', icon: 'upload' },
]

const BRUSHES = [
  { id: 'pen', label: 'Pen', icon: 'pen' },
  { id: 'highlighter', label: 'Highlighter', icon: 'highlighter' },
  { id: 'sparkle', label: 'Sparkle', icon: 'glitter' },
]

// WHY 4-digit hex like #0000 is transparent, not black, so the old list had an
// invisible "black" swatch. These are written out in full.
const SOLID_COLORS = ['#101828', '#ffffff', '#1d4ed8', '#0ea5e9', '#12b76a', '#f79009', '#f04438', '#7a5af8']
const PASTEL_COLORS = ['#ffb3c6', '#ffd6a5', '#fdffb6', '#caffbf', '#a0c4ff']

// ----
// State
// ----

const stageEl = ref(null)        // the grey area the canvas sits in (measured to size the canvas)
const canvasEl = ref(null)       // the square white canvas
const fileInput = ref(null)      // the hidden <input type="file"> the Upload button clicks
const editEl = ref(null)         // the contenteditable div while a text layer is being typed into
const stageWidth = ref(400)      // the canvas width in px, so text size scales with the preview

const mode = ref('sticker')      // 'sticker' | 'gif' — controls the frame strip and the save kind
const tool = ref('stickers')     // which drawer is open: stickers | text | draw | upload
const mobilePanel = ref(null)    // 'drawer' | 'props' | null, only used on small screens

// A GIF is a list of frames and each frame has its own layers. A still sticker is
// simply one frame, so the same editor serves both.
const frames = ref([{ id: 'frame-1', layers: [] }])
const activeFrameId = ref('frame-1')

const activeFrame = computed(() => {
  return frames.value.find((frame) => frame.id === activeFrameId.value) || frames.value[0]
})

// WHY: "layers" keeps the name the rest of this file already uses, so every existing
// function still works. Reading gives the active frame's layers; assigning replaces them.
const layers = computed({
  get: () => activeFrame.value.layers,
  set: (value) => { activeFrame.value.layers = value },
})

const selectedId = ref(null)
const editingId = ref(null)      // the text layer currently being typed into
const gifSpeed = ref(6)          // frames per second

// WHY: drawing is just the Draw tool being open, so it is derived rather than stored.
// One source of truth means the rail highlight and the overlay can never disagree.
const drawing = computed(() => tool.value === 'draw')

const currentColor = ref('#101828')
const brush = ref('pen')         // 'pen' | 'highlighter' | 'sparkle'
const brushSize = ref(1.2)       // percent of the canvas width
const drawLayerId = ref(null)    // the drawing layer new strokes are added to

const myStickers = ref([])
const loadingMine = ref(false)
const activeFolder = ref('all')  // 'all' or a folder id

// Remove Background
// WHY: the properties panel's "Remove background" button calls this. It goes through
// our server function so the remove.bg key stays secret, then swaps the layer's
// picture for the cut-out one.
async function cutOutBackground(layer) {
  errorMessage.value = ''
  removingBg.value = true
  try {
    // Turn the layer's picture back into a Blob. This works for a photo (blob: link)
    // and a saved sticker (https link), so one function covers both.
    const original = await (await fetch(layer.url)).blob()
    const cutOut = await removeBackground(original)

    const url = tempUrl(cutOut)
    const img = await loadImage(url)
    snapshot() // so Undo brings the original photo back
    layer.url = url
    layer.ratio = img.naturalHeight / img.naturalWidth // keep the shape correct
    layer.name = layer.name + ' (cut out)'
    // WHY: the button only shows for source === 'photo'. Without this line it stays on
    // screen after a successful cut-out, and a second click spends another remove.bg credit.
    layer.source = 'sticker'
  } catch (error) {
    errorMessage.value = error.message || 'Could not remove the background.'
  } finally {
    removingBg.value = false // always re-enable the button
  }
}

// Save to My Studio pop-up
const showSave = ref(false)
const stickerName = ref('')
const pickedDefaults = ref([])
const pickedFolders = ref([])
const folders = ref([])
const saving = ref(false)
const addingFolder = ref(false)
const newFolderName = ref('')
const editingFolderId = ref('')
const editName = ref('')

// Download pop-up
const dlOpen = ref(false)
const dlName = ref('my-sticker')
const dlBg = ref('white')        // 'white' | 'clear'
const dlFormat = ref('photo')    // 'photo' | 'gif'
const downloading = ref(false)
const previewUrl = ref('')       // a small PNG of the active frame, drawn by the export code

const errorMessage = ref('')
const toastText = ref('')
const toastType = ref('ok')
let toastTimer = null

const removingBg = ref(false)

// Live drawer
const liveStyle = ref('pill')
const liveHour12 = ref(true)
const liveLockZone = ref(false)   // true: always show MY time zone, not the viewer's
const myTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
const liveCity = ref('')          // what is typed in the city box
const livePlace = ref(null)       // { city, country } once a city or location is found
const liveWeather = ref(null)     // the latest answer from /api/weather
const liveBusy = ref('')          // 'city' | 'gps' while a request is running
const liveError = ref('')

// Copy and paste
// WHY our own clipboard for layers: the system clipboard only holds text and pictures,
// not a layer with its position, font and rotation. The system clipboard gets a marker
// text instead, so a paste can tell "our layer" from a screenshot or text copied elsewhere.
const CLIPBOARD_MARKER = 'Blue Studios sticker layer'
const copiedLayers = ref([])
let pasteCount = 0

// WHY remember every temporary photo link instead of freeing it on delete: undo, copies and
// duplicates can still point to it. They are all freed together when the page closes.
const createdUrls = new Set()

// ----
// Undo / redo
// WHY: the top bar has the buttons, so they have to work. A JSON copy of the frames
// is enough because layers are plain data (numbers, strings, arrays).
// ----
const undoStack = ref([])
const redoStack = ref([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

function snapshot() {
  undoStack.value.push(JSON.stringify(frames.value))
  if (undoStack.value.length > 40) undoStack.value.shift() // keep memory small
  redoStack.value = []
}

function restore(json) {
  frames.value = JSON.parse(json)
  // The frame or layer we were on may not exist any more after an undo.
  if (!frames.value.some((frame) => frame.id === activeFrameId.value)) {
    activeFrameId.value = frames.value[0].id
  }
  if (!layers.value.some((layer) => layer.id === selectedId.value)) selectedId.value = null
  drawLayerId.value = null
  editingId.value = null
}

function undo() {
  if (!undoStack.value.length) return
  redoStack.value.push(JSON.stringify(frames.value))
  restore(undoStack.value.pop())
}

function redo() {
  if (!redoStack.value.length) return
  undoStack.value.push(JSON.stringify(frames.value))
  restore(redoStack.value.pop())
}

// ----
// Small helpers
// ----

function newId() {
  return Date.now() + '-' + Math.random().toString(16).slice(2)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// WHY: a file name has to survive being saved on Windows, macOS and Android, so we
// keep only letters, numbers and dashes.
function slug(text) {
  const clean = (text || 'sticker').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return clean || 'sticker'
}

// A temporary browser link to a file, remembered so it can be freed when the page closes.
function tempUrl(blob) {
  const url = URL.createObjectURL(blob)
  createdUrls.add(url)
  return url
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

function showToast(text, type = 'ok') {
  toastText.value = text
  toastType.value = type
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 3000)
}

function isSelected(layer) {
  return layer.id === selectedId.value
}

// Photos and stickers resize by "width"; text resizes by "size".
function sizeKey(layer) {
  return layer.type === 'image' ? 'width' : 'size'
}

function sizeLimits(layer) {
  return layer.type === 'image' ? [3, 200] : [3, 40]
}

function layerLabel(layer) {
  if (layer.type === 'text') return layer.text || 'Text box'
  return layer.name
}

const layersTopFirst = computed(() => [...layers.value].reverse())

// WHY: the properties panel needs the selected layer in dozens of places. One computed
// is easier to read than repeating layers.find(...) on every line of the template.
const selectedLayer = computed(() => layers.value.find((layer) => layer.id === selectedId.value) || null)

const selectedKind = computed(() => {
  const layer = selectedLayer.value
  if (!layer) return ''
  if (layer.type === 'text') return layer.emoji ? 'Emoji' : 'Text'
  if (layer.type === 'image') return layer.dynamic ? 'Live sticker' : layer.source === 'photo' ? 'Photo' : 'Sticker'
  return 'Drawing'
})

// Clicking a font: restyle the selected text box, or start a new one in that font.
function pickFont(font) {
  const layer = selectedLayer.value
  if (layer && layer.type === 'text' && !layer.emoji) {
    snapshot()
    layer.font = font.name
    return
  }
  addText(null, font)
}

// Every slider edit goes through here, so undo works the same for all of them.
function setProp(key, value) {
  if (selectedLayer.value) selectedLayer.value[key] = value
}

const currentToolLabel = computed(() => {
  const found = TOOLS.find((item) => item.id === tool.value)
  return found ? found.label : 'Tools'
})

// How big the preview is compared with the file you export.
const zoomPercent = computed(() => Math.round((stageWidth.value / EXPORT_SIZE) * 100))

// Folder tabs: "All" shows everything, a folder shows only the stickers inside it.
const visibleStickers = computed(() => {
  if (activeFolder.value === 'all') return myStickers.value
  const folder = folders.value.find((f) => f.id === activeFolder.value)
  if (!folder) return myStickers.value
  const ids = folder.itemIds || []
  return myStickers.value.filter((sticker) => ids.includes(sticker.id))
})

// ----
// Tools
// ----

function pickTool(id) {
  tool.value = id
  selectedId.value = null
  editingId.value = null
  // Load the user's saved stickers the first time the panel opens (accounts only).
  if (id === 'stickers' && isAccount.value && myStickers.value.length === 0) loadMine()
  // On a phone the drawer is a sheet, so opening a tool opens the sheet too.
  if (window.innerWidth < 992) mobilePanel.value = 'drawer'
}

function setMode(next) {
  mode.value = next
  // The frame strip only exists in GIF mode, so the download format follows it.
  if (next === 'sticker' && dlFormat.value === 'gif') dlFormat.value = 'photo'
}

// ----
// Adding layers
// ----

// WHY: the shared library already turns each drawing into a data: URL plus its shape
// (ratio), so an <img> can show it and the export canvas can draw it without being
// "tainted". Emoji have no picture: the library says to add them as a text layer.
function addArt(item) {
  if (item.kind === 'emoji') {
    addEmoji(item)
    return
  }
  // Tape is long and thin, so it starts wider than a square sticker.
  const width = item.kind === 'tape' ? 44 : 30
  addImageLayer(item.url, item.name, item.ratio, width, 'sticker')
}

function addEmoji(item) {
  snapshot()
  const id = newId()
  layers.value.push({
    id: id,
    type: 'text',
    text: item.content,
    emoji: true,           // no text shadow: a dark halo looks wrong around an emoji
    x: 50,
    y: 50,
    width: 30,
    size: 20,
    font: APP_FONT,
    weight: 400,
    align: 'center',
    color: '#101828',
    rotation: 0,
  })
  selectedId.value = id
  editingId.value = null
}

function openFilePicker() {
  fileInput.value.click()
}

async function uploadPhoto(event) {
  const file = event.target.files[0]
  if (!file) return
  event.target.value = '' // so choosing the same file again still fires a change
  await addPhotoFile(file)
}

// Shared by Upload and by pasting a screenshot or copied picture (Ctrl+V).
async function addPhotoFile(file) {
  errorMessage.value = ''

  const allowed = ['image/png', 'image/jpeg', 'image/webp']
  if (!allowed.includes(file.type)) {
    errorMessage.value = 'Please upload a PNG, JPEG, or WebP image.'
    return
  }

  // A temporary browser link: the photo stays on this device, nothing is uploaded yet.
  const url = tempUrl(file)
  try {
    const img = await loadImage(url)
    const ratio = img.naturalHeight / img.naturalWidth
    // Fit the photo inside 80% of the canvas, whatever its shape.
    const fit = ratio <= 1 ? 80 : 80 / ratio
    addImageLayer(url, file.name, ratio, fit)
  } catch (error) {
    errorMessage.value = 'That image could not be opened.'
  }
}

// ----
// Copy, cut and paste
// WHY the browser's copy/cut/paste events and not keydown: they also fire from the
// browser menu and on phones, and only they can read a pasted screenshot.
// ----

// True when the user is typing, so Ctrl+C/V go to the text box as normal.
function isTypingIn(target) {
  const tag = (target && target.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)
}

function copyLayer(layer) {
  copiedLayers.value = [JSON.parse(JSON.stringify(layer))]
  pasteCount = 0
}

function onCopy(event) {
  if (isTypingIn(event.target) || !selectedLayer.value) return
  copyLayer(selectedLayer.value)
  event.clipboardData.setData('text/plain', CLIPBOARD_MARKER)
  event.preventDefault()
  showToast('Copied. Press Ctrl+V to paste, even in another frame.')
}

function onCut(event) {
  if (isTypingIn(event.target) || !selectedLayer.value) return
  const layer = selectedLayer.value
  copyLayer(layer)
  event.clipboardData.setData('text/plain', CLIPBOARD_MARKER)
  event.preventDefault()
  deleteLayer(layer)
  showToast('Cut. Press Ctrl+V to paste it back.')
}

async function onPaste(event) {
  if (isTypingIn(event.target)) return
  const data = event.clipboardData
  if (!data) return

  // 1. A picture (a screenshot, or "Copy image" in another app) becomes a photo layer.
  const file = [...data.files].find((item) => item.type.startsWith('image/'))
  if (file) {
    event.preventDefault()
    await addPhotoFile(file)
    return
  }

  const text = data.getData('text/plain')
  // 2. Our own marker: paste the copied layer.
  if (text === CLIPBOARD_MARKER && copiedLayers.value.length > 0) {
    event.preventDefault()
    pasteLayers()
    return
  }
  // 3. Any other text becomes a new text box.
  if (text && text.trim()) {
    event.preventDefault()
    snapshot()
    const id = newId()
    layers.value.push({
      id, type: 'text', text: text.trim().slice(0, 200),
      x: 50, y: 50, width: 70, size: 8, font: APP_FONT, weight: 600,
      align: 'center', color: currentColor.value, rotation: 0,
    })
    selectedId.value = id
  }
}

// Each paste lands a little further down-right, so pasting twice does not hide the first copy.
function pasteLayers() {
  if (copiedLayers.value.length === 0) return
  snapshot()
  pasteCount++
  let lastId = null
  for (const original of copiedLayers.value) {
    const copy = JSON.parse(JSON.stringify(original))
    copy.id = newId()
    if (copy.type !== 'draw') {
      copy.x = clamp(original.x + 4 * pasteCount, 0, 100)
      copy.y = clamp(original.y + 4 * pasteCount, 0, 100)
    }
    layers.value.push(copy)
    lastId = copy.id
  }
  selectedId.value = lastId
  editingId.value = null
}

// "Copy image": the whole sticker as a PNG on the system clipboard, ready to paste into
// a chat or another app. Some browsers (older Firefox) cannot do this, so it says so.
async function copyStickerImage() {
  errorMessage.value = ''
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    errorMessage.value = 'This browser cannot copy pictures. Use Download instead.'
    return
  }
  try {
    await waitForFonts()
    const background = dlBg.value === 'white' ? 'white' : 'transparent'
    // WHY a Promise inside ClipboardItem: Safari only allows the copy if it starts right
    // after the click, so the picture is handed over while it is still being drawn.
    const png = renderPng(activeFrame.value, DOWNLOAD_SIZE, background)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    showToast('Copied the sticker as a picture.')
  } catch (error) {
    errorMessage.value = 'Could not copy the picture. Use Download instead.'
  }
}

// ----
// Live stickers: time, date, weather, location
// WHY a layer remembers its config: the picture on the canvas is redrawn from it every
// 30 seconds (so the clock ticks), and Save stores it so other pages can draw it live too.
// ----

function addLiveLayer(config, live = null) {
  const { url, ratio } = dynamicDataUrl(config, live)
  const names = { time: 'Live time', date: 'Live date', weather: 'Weather', location: 'Location' }
  addImageLayer(url, names[config.type], ratio, 56, 'live')
  const layer = selectedLayer.value
  layer.dynamic = config
  layer.liveData = live // the last weather answer, so redrawing does not ask the server again
}

function addTimeSticker(type) {
  addLiveLayer({
    type,
    style: liveStyle.value,
    hour12: liveHour12.value,
    timeZone: liveLockZone.value ? myTimeZone : '',
  })
}

function weatherMessage(error) {
  return (error && error.message) || 'Weather is not available right now.'
}

async function findCity() {
  const city = liveCity.value.trim()
  if (!city) {
    liveError.value = 'Type a city first, like Singapore.'
    return
  }
  liveError.value = ''
  liveBusy.value = 'city'
  try {
    const answer = await fetchWeather({ city })
    liveWeather.value = answer
    livePlace.value = { city: answer.city, country: answer.country }
    liveCity.value = answer.city
  } catch (error) {
    liveError.value = weatherMessage(error)
  } finally {
    liveBusy.value = ''
  }
}

// WHY the browser's location only finds the CITY: the coordinates go to our server once,
// to look up the city name, and are never saved. A public sticker must not reveal where
// someone lives.
function useMyLocation() {
  liveError.value = ''
  if (!navigator.geolocation) {
    liveError.value = 'This browser cannot share your location. Type a city instead.'
    return
  }
  liveBusy.value = 'gps'
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const answer = await fetchWeather({ lat: position.coords.latitude, lon: position.coords.longitude })
        liveWeather.value = answer
        livePlace.value = { city: answer.city, country: answer.country }
        liveCity.value = answer.city
      } catch (error) {
        liveError.value = weatherMessage(error)
      } finally {
        liveBusy.value = ''
      }
    },
    (error) => {
      liveBusy.value = ''
      liveError.value = error.code === 1
        ? 'Location is blocked. Allow it in the address bar, or type a city.'
        : 'Could not find your location. Type a city instead.'
    },
    { timeout: 10000, maximumAge: 10 * 60 * 1000 },
  )
}

function addPlaceSticker(type) {
  if (!livePlace.value) {
    liveError.value = 'Find a city or use your location first.'
    return
  }
  addLiveLayer(
    { type, style: liveStyle.value, city: livePlace.value.city, country: livePlace.value.country },
    type === 'weather' ? liveWeather.value : null,
  )
}

// Change the look of the selected live sticker (Properties panel).
function setLiveStyle(style) {
  const layer = selectedLayer.value
  if (!layer || !layer.dynamic) return
  snapshot()
  layer.dynamic = { ...layer.dynamic, style }
  redrawLive(layer)
}

function redrawLive(layer) {
  const { url, ratio } = dynamicDataUrl(layer.dynamic, layer.liveData || null)
  // Keep the same height on screen when the text gets longer or shorter.
  if (layer.url !== url) {
    layer.width = layer.width * (layer.ratio / ratio)
    layer.url = url
    layer.ratio = ratio
  }
}

// Every 30 seconds, redraw the live layers in every frame so the clock keeps time.
let liveTimer = null
function tickLive() {
  for (const frame of frames.value) {
    for (const layer of frame.layers) {
      if (layer.dynamic && (layer.dynamic.type === 'time' || layer.dynamic.type === 'date')) redrawLive(layer)
    }
  }
}

// Save writes the settings of a live sticker next to it, so Joash and Germaine can draw it
// live. WHY a second step: saveSticker (Gabriel's) only saves a picture. If the Firestore
// rules do not allow config yet, the sticker is still saved, just as a picture.
async function saveLiveConfig(stickerId, config) {
  await updateDoc(doc(db, 'stickers', stickerId), {
    config: cleanDynamicConfig(config),
    updatedAt: Date.now(),
  })
}

// A sticker is "dynamic" only when it is one live element on its own. Mixed with other
// layers it is saved as a normal picture, because another page could not redraw the rest.
const liveOnlyLayer = computed(() => {
  if (frames.value.length !== 1 || layers.value.length !== 1) return null
  const layer = layers.value[0]
  return layer.dynamic && isDynamicConfig(layer.dynamic) ? layer : null
})
const hasLiveLayer = computed(() => layers.value.some((layer) => layer.dynamic))

// source records where the picture came from: 'photo' | 'sticker'.
// Only a real photo gets the Remove background button, because the other one already
// has no background and every cut-out spends one of our remove.bg credits.
function addImageLayer(url, name, ratio, width, source = 'photo') {
  snapshot()
  const id = newId()
  layers.value.push({
    id: id,
    type: 'image',
    name: name,
    url: url,
    ratio: ratio,
    x: 50,
    y: 50,
    width: width,
    fitWidth: width,
    rotation: 0,
    source: source,
  })
  selectedId.value = id
  editingId.value = null
}

// style: one of TEXT_STYLES (or null). font: a font from the library, so clicking a font
// in the Text drawer starts a box already set in that font, with its sample word.
async function addText(style, font = null) {
  snapshot()
  const id = newId()
  layers.value.push({
    id: id,
    type: 'text',
    text: font ? font.preview : '',
    x: 50,
    y: 50,
    width: 70,             // percent of the canvas: the box the text wraps inside
    size: style ? style.size : 10,
    font: font ? font.name : APP_FONT,
    weight: style ? style.weight : font ? 400 : 600,
    align: 'center',
    color: currentColor.value,
    rotation: 0,
  })
  selectedId.value = id
  tool.value = 'text'
  // Wait for the box to exist, then put the caret in it.
  await nextTick()
  startEditing(layers.value.find((layer) => layer.id === id))
}

// ----
// Typing straight into the canvas
// WHY: the text is written into a contenteditable div once, then only pushed OUT on
// input. Binding the text back in would reset the caret to the start on every keypress.
// ----

function setEditEl(el) {
  editEl.value = el
}

function startEditing(layer) {
  if (!layer) return
  selectedId.value = layer.id
  editingId.value = layer.id
  nextTick(() => {
    const el = editEl.value
    if (!el) return
    el.innerText = layer.text
    el.focus()
    // Select everything, so typing replaces the placeholder instead of appending.
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

function onTextInput(event, layer) {
  layer.text = event.target.innerText
}

function stopEditing() {
  editingId.value = null
}

// ----
// Stickers from My Studio
// ----

async function loadFolders() {
  if (!isAccount.value) return
  try {
    folders.value = await listMyFolders()
  } catch (error) {
    errorMessage.value = 'Could not load your folders.'
  }
}

async function loadMine() {
  loadingMine.value = true
  try {
    const items = await listMyItems('stickers')
    // Turn each stored file path into a link an <img> can show.
    const withUrls = await Promise.all(items.map(async (item) => {
      try {
        return { ...item, thumbUrl: await getFileUrl(item.imagePath) }
      } catch (error) {
        return null // skip a sticker whose file cannot be read
      }
    }))
    myStickers.value = withUrls.filter(Boolean)
    await loadFolders() // the folder tabs need the folders too
  } catch (error) {
    errorMessage.value = 'Could not load your saved stickers.'
  } finally {
    loadingMine.value = false
  }
}

// WHY: a saved sticker lives on Firebase Storage, and drawing a cross-origin image
// onto the export canvas is blocked. Downloading it into the browser first makes it a
// local blob: link, which the canvas is allowed to use.
async function addMySticker(sticker) {
  errorMessage.value = ''
  try {
    const response = await fetch(sticker.thumbUrl)
    const blob = await response.blob()
    const url = tempUrl(blob)
    const img = await loadImage(url)
    addImageLayer(url, sticker.name, img.naturalHeight / img.naturalWidth, 30, 'sticker')
  } catch (error) {
    errorMessage.value = 'Could not add that sticker. Ask Gabriel to check the Storage CORS settings.'
  }
}

// ----
// Selecting, ordering and deleting layers
// ----

function clearSelection() {
  if (drawing.value) return
  selectedId.value = null
  editingId.value = null
}

function selectLayer(layer) {
  selectedId.value = layer.id
  editingId.value = null
}

function deleteLayer(layer) {
  snapshot()
  // The photo link is NOT freed here: Undo, copies and duplicates may still use it (see createdUrls).
  layers.value = layers.value.filter((item) => item.id !== layer.id)
  if (selectedId.value === layer.id) selectedId.value = null
  if (drawLayerId.value === layer.id) drawLayerId.value = null
}

function duplicateLayer(layer) {
  snapshot()
  const copy = JSON.parse(JSON.stringify(layer))
  copy.id = newId()
  copy.x = clamp(layer.x + 5, 0, 100)
  copy.y = clamp(layer.y + 5, 0, 100)
  layers.value.push(copy)
  selectedId.value = copy.id
}

// Later in the list = drawn on top.
function moveUp(layer) {
  const index = layers.value.indexOf(layer)
  if (index === -1 || index === layers.value.length - 1) return
  snapshot()
  layers.value.splice(index, 1)
  layers.value.splice(index + 1, 0, layer)
}

function moveDown(layer) {
  const index = layers.value.indexOf(layer)
  if (index <= 0) return
  snapshot()
  layers.value.splice(index, 1)
  layers.value.splice(index - 1, 0, layer)
}

function bringToFront(layer) {
  snapshot()
  layers.value = layers.value.filter((item) => item.id !== layer.id)
  layers.value.push(layer)
}

function sendToBack(layer) {
  snapshot()
  layers.value = layers.value.filter((item) => item.id !== layer.id)
  layers.value.unshift(layer)
}

// Put a photo or sticker back to the middle, upright and at its first size.
function resetLayer(layer) {
  snapshot()
  layer.x = 50
  layer.y = 50
  layer.rotation = 0
  layer.width = layer.fitWidth
}

// ----
// Drag and drop inside the Layers list (the browser's own drag events)
// ----

let draggedId = null
const dropTargetId = ref(null)

function onRowDragStart(layer) {
  draggedId = layer.id
}

function onRowDrop(target) {
  if (draggedId && draggedId !== target.id) {
    snapshot()
    const from = layers.value.findIndex((item) => item.id === draggedId)
    const to = layers.value.findIndex((item) => item.id === target.id)
    // Take the dragged layer out, then drop it into the target's place.
    const moved = layers.value.splice(from, 1)[0]
    layers.value.splice(to, 0, moved)
  }
  draggedId = null
  dropTargetId.value = null
}

function onRowDragEnd() {
  draggedId = null
  dropTargetId.value = null
}

// ----
// Colours
// ----

function pickColor(color) {
  currentColor.value = color
  // If a text layer is selected, recolour it straight away.
  if (selectedId.value) {
    const layer = layers.value.find((item) => item.id === selectedId.value)
    if (layer && layer.type === 'text') layer.color = color
  }
}

// ----
// Moving, resizing and rotating on the canvas
// ----

// One object remembers the gesture in progress: 'move', 'resize' or 'rotate'.
let gesture = null

function startGesture(event, layer, mode2) {
  // While typing, a drag on the text box must not move it.
  if (editingId.value === layer.id) return
  event.preventDefault() // stops the browser selecting text or dragging the image
  selectedId.value = layer.id
  snapshot()

  const rect = canvasEl.value.getBoundingClientRect()
  // The layer's centre in screen pixels: resizing and rotating are measured from here.
  const centerX = rect.left + (layer.x / 100) * rect.width
  const centerY = rect.top + (layer.y / 100) * rect.height

  gesture = {
    mode: mode2,
    id: layer.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: layer.x,
    originY: layer.y,
    rectWidth: rect.width,
    rectHeight: rect.height,
    centerX: centerX,
    centerY: centerY,
    startDistance: Math.hypot(event.clientX - centerX, event.clientY - centerY) || 1,
    startSize: layer[sizeKey(layer)],
  }

  // Listen on the whole window so the gesture keeps working if the pointer leaves.
  window.addEventListener('pointermove', onGesture)
  window.addEventListener('pointerup', endGesture)
}

function onGesture(event) {
  if (!gesture) return
  const layer = layers.value.find((item) => item.id === gesture.id)
  if (!layer) return

  if (gesture.mode === 'move') {
    // Pixels moved, turned into percentages of the canvas
    const movedX = ((event.clientX - gesture.startX) / gesture.rectWidth) * 100
    const movedY = ((event.clientY - gesture.startY) / gesture.rectHeight) * 100
    layer.x = clamp(gesture.originX + movedX, 0, 100)
    layer.y = clamp(gesture.originY + movedY, 0, 100)
  } else if (gesture.mode === 'resize') {
    // Dragging a corner twice as far from the centre makes the layer twice as big.
    const distance = Math.hypot(event.clientX - gesture.centerX, event.clientY - gesture.centerY)
    const limits = sizeLimits(layer)
    layer[sizeKey(layer)] = clamp(gesture.startSize * (distance / gesture.startDistance), limits[0], limits[1])
  } else if (gesture.mode === 'rotate') {
    // The angle from the centre to the pointer. +90 because the handle sits straight above.
    let angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX) * 180 / Math.PI + 90
    if (angle > 180) angle -= 360
    // Shift snaps to 15° steps, which is how you get a perfectly straight sticker.
    layer.rotation = event.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle)
  }
}

function endGesture() {
  gesture = null
  window.removeEventListener('pointermove', onGesture)
  window.removeEventListener('pointerup', endGesture)
}

// ----
// Drawing
// ----

// Mouse position -> percentage of the canvas (0 to 100)
function pointInStage(event) {
  const rect = canvasEl.value.getBoundingClientRect()
  return [
    clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
  ]
}

let currentStroke = null
let lastStar = null

function startStroke(event) {
  // Keeps the move/up events coming to the overlay even if the pointer leaves it.
  event.currentTarget.setPointerCapture(event.pointerId)
  snapshot()

  // Strokes go into one drawing layer, created on the first stroke.
  let layer = layers.value.find((item) => item.id === drawLayerId.value)
  if (!layer) {
    layers.value.push({ id: newId(), type: 'draw', name: 'Drawing', strokes: [] })
    layer = layers.value[layers.value.length - 1] // take the reactive copy
    drawLayerId.value = layer.id
  }

  const point = pointInStage(event)
  const width = brush.value === 'highlighter' ? brushSize.value * 3
    : brush.value === 'sparkle' ? brushSize.value * 0.7
    : brushSize.value

  layer.strokes.push({
    brush: brush.value,
    color: currentColor.value,
    width: width,
    opacity: brush.value === 'highlighter' ? 0.4 : 1, // see-through, like a real highlighter
    // The second point is almost the same, so a single click still leaves a dot.
    points: [point, [point[0] + 0.01, point[1]]],
    stars: [],
  })
  currentStroke = layer.strokes[layer.strokes.length - 1]
  lastStar = point
  if (brush.value === 'sparkle') addStar(point)
}

function moveStroke(event) {
  if (!currentStroke) return
  const point = pointInStage(event)
  currentStroke.points.push(point)

  // The sparkle pen drops a star each time the pen has moved a little way.
  if (currentStroke.brush === 'sparkle' && Math.hypot(point[0] - lastStar[0], point[1] - lastStar[1]) > 4) {
    addStar(point)
    lastStar = point
  }
}

function endStroke() {
  currentStroke = null
}

function addStar(point) {
  currentStroke.stars.push({
    x: point[0] + (Math.random() * 2 - 1),
    y: point[1] + (Math.random() * 2 - 1),
    r: (1 + Math.random() * 1.2) * (0.7 + brushSize.value * 0.5), // a random size looks natural
  })
}

// Remove the last stroke of the current drawing (an undo just for drawing).
function undoStroke() {
  const layer = layers.value.find((item) => item.id === drawLayerId.value)
  if (!layer) return
  snapshot()
  layer.strokes.pop()
  if (layer.strokes.length === 0) {
    layers.value = layers.value.filter((item) => item.id !== layer.id) // an empty drawing is not worth keeping
    drawLayerId.value = null
  }
}

function clearDrawings() {
  snapshot()
  layers.value = layers.value.filter((item) => item.type !== 'draw')
  drawLayerId.value = null
}

// A 4-point star as an SVG path string. The preview uses it directly and the export
// reuses the same string through Path2D, so both look identical.
function starPath(cx, cy, r) {
  const parts = []
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 - 90) * Math.PI / 180
    const radius = i % 2 === 0 ? r : r * 0.3
    parts.push((i === 0 ? 'M' : 'L') + (cx + Math.cos(angle) * radius).toFixed(2) + ' ' + (cy + Math.sin(angle) * radius).toFixed(2))
  }
  return parts.join(' ') + ' Z'
}

function pointsToString(points) {
  return points.map((point) => point[0].toFixed(2) + ',' + point[1].toFixed(2)).join(' ')
}

// ----
// Export
// WHY: ONE function draws a frame, and the PNG, the ZIP and the GIF all reuse it, so
// the file on the laptop and the one in Firebase always look identical.
// ----

// Break a paragraph into lines that fit inside maxWidth, the same way the preview wraps.
function wrapText(ctx, text, maxWidth) {
  const lines = []
  const paragraphs = String(text || '').split('\n')
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const attempt = line ? line + ' ' + word : word
      if (ctx.measureText(attempt).width > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = attempt
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

// Draw ONE frame onto an off-screen canvas and hand the canvas back.
async function renderFrameCanvas(frame, size = EXPORT_SIZE, background = 'transparent') {
  const S = size
  const k = S / 100 // converts "percent of the canvas" into export pixels
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')

  if (background === 'white') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, S, S)
  }

  for (const layer of frame.layers) {
    ctx.save()

    if (layer.type === 'image') {
      const img = await loadImage(layer.url)
      const w = layer.width * k
      const h = w * layer.ratio
      ctx.translate(layer.x * k, layer.y * k)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
    } else if (layer.type === 'text') {
      const fontSize = layer.size * k
      const maxWidth = (layer.width || 70) * k
      ctx.translate(layer.x * k, layer.y * k)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.font = (layer.weight || 400) + ' ' + fontSize + 'px ' + fontStack(layer.font)
      ctx.fillStyle = layer.color
      ctx.textAlign = layer.align || 'center'   // matches text-align in the preview
      ctx.textBaseline = 'middle'
      if (!layer.emoji) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)' // the same thin shadow as the preview
        ctx.shadowBlur = 2 * (S / EXPORT_SIZE)
      }
      const lines = wrapText(ctx, layer.text, maxWidth)
      const lineHeight = fontSize * 1.2
      const startY = -((lines.length - 1) * lineHeight) / 2
      // Left-aligned text starts at the left edge of its box, right-aligned at the right.
      const startX = layer.align === 'left' ? -maxWidth / 2 : layer.align === 'right' ? maxWidth / 2 : 0
      lines.forEach((line, index) => ctx.fillText(line, startX, startY + index * lineHeight))
    } else if (layer.type === 'draw') {
      for (const stroke of layer.strokes) {
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.width * k
        ctx.globalAlpha = stroke.opacity
        ctx.beginPath()
        stroke.points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point[0] * k, point[1] * k)
          else ctx.lineTo(point[0] * k, point[1] * k)
        })
        ctx.stroke()
        ctx.restore()

        // Sparkle stars
        for (const star of stroke.stars) {
          ctx.save()
          ctx.fillStyle = stroke.color
          ctx.translate(star.x * k, star.y * k)
          ctx.scale(k, k)
          ctx.fill(new Path2D(starPath(0, 0, star.r)))
          ctx.restore()
        }
      }
    }

    ctx.restore()
  }

  return canvas
}

// One frame -> a PNG Blob.
async function renderPng(frame, size = EXPORT_SIZE, background = 'transparent') {
  const canvas = await renderFrameCanvas(frame, size, background)
  // toBlob uses a callback, so we wrap it in a Promise to be able to await it.
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Every frame -> one animated GIF Blob.
async function renderGif(size = EXPORT_SIZE, background = 'transparent') {
  if (frames.value.length < 2) return null
  const canvases = []
  for (const frame of frames.value) {
    canvases.push(await renderFrameCanvas(frame, size, background))
  }
  // The slider is in frames per second, but a GIF wants "how long each frame stays" in ms
  const delayMs = Math.round(1000 / gifSpeed.value)
  return encodeGif(canvases, delayMs)
}

// ----
// ZIP
// WHY: no extra library. A ZIP with no compression ("store") is a few dozen lines,
// and PNGs are already compressed, so storing them costs nothing.
// ----

// Every ZIP entry carries a CRC32 checksum, so we need one.
function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipStore(files) {
  const encoder = new TextEncoder()
  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff]
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
  const now = new Date()
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff
  const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff

  const parts = []
  const directory = []
  let offset = 0

  files.forEach((file) => {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const head = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(time), u16(date),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0)
    )
    parts.push(new Uint8Array(head), name, file.data)
    directory.push({ name, crc, size: file.data.length, offset })
    offset += head.length + name.length + file.data.length
  })

  const directoryStart = offset
  let directorySize = 0
  directory.forEach((entry) => {
    const record = [].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(time), u16(date),
      u32(entry.crc), u32(entry.size), u32(entry.size), u16(entry.name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(entry.offset)
    )
    parts.push(new Uint8Array(record), entry.name)
    directorySize += record.length + entry.name.length
  })

  parts.push(new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(directorySize), u32(directoryStart), u16(0)
  )))

  return new Blob(parts, { type: 'application/zip' })
}

function canvasToBytes(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))), 'image/png')
  })
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000) // tidy up the temporary link
}

// ----
// Download to device
// WHY: this never touches Firebase. Photo gives one PNG, or a ZIP of per-frame PNGs
// when the project has more than one frame. GIF gives one animated file.
// ----

const dlSuffix = computed(() => {
  if (dlFormat.value === 'gif') return '.gif'
  return frames.value.length > 1 ? '.zip' : '.png'
})

const dlSummary = computed(() => {
  if (dlFormat.value === 'gif') {
    return 'One animated GIF, ' + frames.value.length + ' frames at ' + gifSpeed.value + ' fps.'
  }
  if (frames.value.length > 1) {
    return 'All ' + frames.value.length + ' frames, each a ' + DOWNLOAD_SIZE + ' × ' + DOWNLOAD_SIZE + ' PNG, bundled into one .zip file.'
  }
  return 'One PNG at ' + DOWNLOAD_SIZE + ' × ' + DOWNLOAD_SIZE + '.'
})

// A small picture of the active frame, drawn by the same code that makes the file.
async function refreshPreview() {
  try {
    const canvas = await renderFrameCanvas(activeFrame.value, 240, dlBg.value === 'white' ? 'white' : 'transparent')
    previewUrl.value = canvas.toDataURL('image/png')
  } catch (error) {
    previewUrl.value = ''
  }
}

async function openDownload() {
  errorMessage.value = ''
  if (layers.value.length === 0) {
    showToast('Add a photo, text or drawing first.', 'warn')
    return
  }
  if (frames.value.length < 2 && dlFormat.value === 'gif') dlFormat.value = 'photo'
  dlOpen.value = true
  await nextTick()
  await refreshPreview()
}

// The background choice changes the preview, so redraw it when it changes.
watch(dlBg, () => {
  if (dlOpen.value) refreshPreview()
})

async function doDownload() {
  errorMessage.value = ''
  downloading.value = true
  const name = slug(dlName.value)
  const background = dlBg.value === 'white' ? 'white' : 'transparent'
  try {
    await waitForFonts() // so the canvas has the real font, not a substitute

    if (dlFormat.value === 'gif') {
      const blob = await renderGif(GIF_SIZE, background)
      if (!blob) {
        errorMessage.value = 'Add a second frame to make a GIF.'
        return
      }
      saveBlob(blob, name + '.gif')
      dlOpen.value = false
      showToast('Downloaded ' + name + '.gif (' + frames.value.length + ' frames)')
      return
    }

    if (frames.value.length > 1) {
      const files = []
      for (let i = 0; i < frames.value.length; i++) {
        const canvas = await renderFrameCanvas(frames.value[i], DOWNLOAD_SIZE, background)
        files.push({
          name: name + '-' + String(i + 1).padStart(2, '0') + '.png',
          data: await canvasToBytes(canvas),
        })
      }
      saveBlob(zipStore(files), name + '.zip')
      dlOpen.value = false
      showToast('Downloaded ' + name + '.zip (' + files.length + ' PNG files)')
      return
    }

    const blob = await renderPng(activeFrame.value, DOWNLOAD_SIZE, background)
    saveBlob(blob, name + '.png')
    dlOpen.value = false
    showToast('Downloaded ' + name + '.png')
  } catch (error) {
    errorMessage.value = 'Could not build the file. If you added a saved sticker, check the Storage CORS settings.'
  } finally {
    downloading.value = false
  }
}

// ----
// Save to My Studio (Firebase). Nothing is downloaded to the device here.
// ----

async function openSave() {
  errorMessage.value = ''
  if (layers.value.length === 0) {
    showToast('Add a photo, text or drawing first.', 'warn')
    return
  }
  showSave.value = true
  await loadFolders() // fresh list every time, in case folders changed in another tab
}

function closeSave() {
  if (!saving.value) showSave.value = false // do not allow closing in the middle of an upload
}

// Tap a public pill to pick or unpick it. The cap is 3 because firestore.rules only
// allows 1-3 public categories.
function toggleDefault(id) {
  const index = pickedDefaults.value.indexOf(id)
  if (index !== -1) pickedDefaults.value.splice(index, 1)
  else if (pickedDefaults.value.length < MAX_CATEGORIES) pickedDefaults.value.push(id)
}

// Tap one of my own folders to pick or unpick it. No cap, because these are only mine.
function toggleFolder(id) {
  const index = pickedFolders.value.indexOf(id)
  if (index !== -1) pickedFolders.value.splice(index, 1)
  else pickedFolders.value.push(id)
}

async function addFolder() {
  errorMessage.value = ''
  if (folders.value.length >= MAX_FOLDERS) {
    errorMessage.value = 'You can have up to ' + MAX_FOLDERS + ' folders.'
    return
  }
  try {
    const folder = await createFolder(newFolderName.value)
    folders.value.push(folder)
    pickedFolders.value.push(folder.id)
    newFolderName.value = ''
    addingFolder.value = false
  } catch (error) {
    errorMessage.value = error.message
  }
}

function startRename(folder) {
  editingFolderId.value = folder.id
  editName.value = folder.name
}

async function confirmRename(folder) {
  errorMessage.value = ''
  try {
    folder.name = await renameFolder(folder.id, editName.value)
    editingFolderId.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function removeFolder(folder) {
  // askConfirm shows our own styled dialog and returns true/false, like confirm() but usable on phones.
  const sure = await askConfirm({
    title: 'Delete the folder "' + folder.name + '"?',
    message: 'Your stickers will not be deleted, only the folder.',
    confirmLabel: 'Delete folder',
    danger: true,
    icon: 'trash',
  })
  if (!sure) return
  try {
    await deleteFolder(folder.id)
    folders.value = folders.value.filter((f) => f.id !== folder.id)
    pickedFolders.value = pickedFolders.value.filter((id) => id !== folder.id)
    if (activeFolder.value === folder.id) activeFolder.value = 'all'
  } catch (error) {
    errorMessage.value = 'Could not delete the folder.'
  }
}

async function saveToStudio() {
  errorMessage.value = ''
  const name = stickerName.value.trim()

  // Check here first, so the user gets a friendly message instead of a Firebase rules error
  if (name.length < 1 || name.length > 40) {
    errorMessage.value = 'Give your sticker a name (1 to 40 characters).'
    return
  }
  if (pickedDefaults.value.length + pickedFolders.value.length < 1) {
    errorMessage.value = 'Pick at least one category or folder.'
    return
  }

  // Firebase needs 1-3 PUBLIC categories on every sticker. If the user only picked
  // their own folders, we quietly use 'other' so the rules accept it.
  const publicCategories = pickedDefaults.value.length > 0 ? pickedDefaults.value : ['other']
  const animated = mode.value === 'gif' && frames.value.length > 1
  const live = animated ? null : liveOnlyLayer.value

  saving.value = true
  try {
    await waitForFonts() // the saved file must use the real font too
    const blob = animated
      ? await renderGif(EXPORT_SIZE, 'transparent')
      : await renderPng(activeFrame.value, EXPORT_SIZE, 'transparent')
    if (!blob) {
      errorMessage.value = 'Could not build the image.'
      return
    }
    if (blob.size > 2 * 1024 * 1024) { // the storage rules reject files over 2 MB
      errorMessage.value = 'This sticker is over 2 MB. Try fewer or smaller photos.'
      return
    }

    // Step 1: upload the image + create the sticker document.
    const stickerId = await saveSticker({
      name: name,
      // 'animated' is what My Studio expects for a GIF; 'dynamic' is a live sticker whose
      // image is only a preview — other pages redraw it from its config.
      kind: animated ? 'animated' : live ? 'dynamic' : 'static',
      categories: publicCategories,
      image: blob,
    })

    // Step 1b: a live sticker also stores its settings, so teammates can draw it live.
    let configFailed = false
    if (live) {
      try {
        await saveLiveConfig(stickerId, live.dynamic)
      } catch (error) {
        console.error('Could not save the live settings', error)
        configFailed = true
      }
    }

    // Step 2: add that ID to each of my chosen folders. The sticker is already safe at
    // this point, so a failure here only affects the folders.
    let folderFailed = false
    try {
      await addItemToFolders(stickerId, pickedFolders.value)
    } catch (error) {
      folderFailed = true
    }

    showSave.value = false
    stickerName.value = ''
    pickedDefaults.value = []
    pickedFolders.value = []
    myStickers.value = []
    await loadMine() // reload so the new sticker shows up in its folder tabs
    if (configFailed) {
      // WHY warn instead of fail: the picture is safe in My Studio. Only the "live" part
      // waits for the Firestore rules to allow stickers.config.
      showToast('"' + name + '" was saved as a picture. Live updates need the new Firebase rule.', 'warn')
    } else {
      showToast(folderFailed
        ? '"' + name + '" was saved, but it could not be added to your folders.'
        : '"' + name + '" was saved to My Studio.')
    }
  } catch (error) {
    errorMessage.value = error.message || 'Could not save the sticker. Please try again.'
  } finally {
    saving.value = false // always re-enable the buttons, whether it worked or not
  }
}

// ----
// Frames
// ----

function addFrame() {
  snapshot()
  const index = frames.value.findIndex((frame) => frame.id === activeFrameId.value)
  const frame = { id: newId(), layers: [] }
  frames.value.splice(index + 1, 0, frame) // insert right after, so the order stays predictable
  goToFrame(frame.id)
}

function duplicateFrame() {
  snapshot()
  const index = frames.value.findIndex((frame) => frame.id === activeFrameId.value)
  const copy = {
    id: newId(),
    // A JSON round-trip is the simplest deep copy; layers are plain data, so it is safe.
    layers: JSON.parse(JSON.stringify(activeFrame.value.layers)),
  }
  frames.value.splice(index + 1, 0, copy)
  goToFrame(copy.id)
}

function deleteFrame(frame) {
  if (frames.value.length === 1) return
  snapshot()
  const index = frames.value.findIndex((item) => item.id === frame.id)
  frames.value = frames.value.filter((item) => item.id !== frame.id)
  if (activeFrameId.value === frame.id) {
    goToFrame(frames.value[Math.max(0, index - 1)].id) // step back to the one before it
  }
}

function goToFrame(id) {
  activeFrameId.value = id
  selectedId.value = null
  editingId.value = null
  drawLayerId.value = null
}

function moveFrame(frame, direction) {
  const index = frames.value.findIndex((item) => item.id === frame.id)
  const target = index + direction
  if (target < 0 || target >= frames.value.length) return
  snapshot()
  const moved = frames.value.splice(index, 1)[0]
  frames.value.splice(target, 0, moved)
}

// ----
// Frame thumbnails
// WHY: a thumbnail is just the export code at 96px, so it can never drift from the
// real frame. Redrawn when you switch frames rather than on every keystroke, which
// would re-load every photo dozens of times a second.
// ----
const frameThumbs = ref({})

async function refreshThumbs() {
  const next = {}
  for (const frame of frames.value) {
    try {
      const canvas = await renderFrameCanvas(frame, 96, 'white')
      next[frame.id] = canvas.toDataURL('image/png')
    } catch (error) {
      next[frame.id] = ''
    }
  }
  frameThumbs.value = next
}

// WHY: a new frame starts with no thumbnail and editing a frame changes its picture,
// so redraw the strip whenever the frames change. The 400ms delay stops every
// keystroke in a text box from re-rendering every frame.
let thumbTimer = null
watch(frames, () => {
  clearTimeout(thumbTimer)
  thumbTimer = setTimeout(refreshThumbs, 400)
}, { deep: true })

// ----
// Keyboard
// WHY: an editor without Ctrl+Z and Delete feels broken, and Escape closing the
// dialogs is what everyone expects.
// ----

function onKeyDown(event) {
  const tag = (event.target.tagName || '').toLowerCase()
  const typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (typing) return

  // Ctrl+D duplicates (the browser's own Ctrl+D would add a bookmark instead).
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedLayer.value) {
    event.preventDefault()
    duplicateLayer(selectedLayer.value)
    return
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId.value) {
    event.preventDefault()
    const layer = layers.value.find((item) => item.id === selectedId.value)
    if (layer) deleteLayer(layer)
  }
  if (event.key === 'Escape') {
    selectedId.value = null
    editingId.value = null
    dlOpen.value = false
    showSave.value = false
    mobilePanel.value = null
  }
}

// ----
// Lifecycle
// ----

let resizeObserver = null

// WHY: the canvas is square, so it must fit the smaller of the two sides of the grey
// area. The 48px leaves room for the corner labels and a little breathing space.
function measureStage() {
  const el = stageEl.value
  if (!el) return
  const box = el.getBoundingClientRect()
  stageWidth.value = Math.max(180, Math.floor(Math.min(box.width - 56, box.height - 64)))
}

onMounted(() => {
  loadArtFonts() // the shared library's 29 fonts (only added to the page once)
  measureStage()
  resizeObserver = new ResizeObserver(measureStage)
  resizeObserver.observe(stageEl.value)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('copy', onCopy)
  window.addEventListener('cut', onCut)
  window.addEventListener('paste', onPaste)
  liveTimer = setInterval(tickLive, 30 * 1000)
  refreshThumbs()
  if (isAccount.value) loadMine()
})

// WHY: Firebase restores the login a moment after mount, so isAccount can still be
// false when onMounted runs. This loads the stickers as soon as it flips to true.
watch(isAccount, (yes) => {
  if (yes && myStickers.value.length === 0) loadMine()
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  endGesture() // remove the window listeners if the page is left mid-drag
  clearTimeout(toastTimer)
  clearTimeout(thumbTimer)
  clearInterval(liveTimer)
  window.removeEventListener('copy', onCopy)
  window.removeEventListener('cut', onCut)
  window.removeEventListener('paste', onPaste)
  // Free every temporary photo link this page made, in every frame, undo step and copy.
  createdUrls.forEach((url) => URL.revokeObjectURL(url))
})

// ----
// Styles used by the template
// ----

function textStyle(layer) {
  return {
    left: layer.x + '%',
    top: layer.y + '%',
    width: layer.width + '%',
    fontSize: (layer.size / 100) * stageWidth.value + 'px',
    fontFamily: fontStack(layer.font),
    fontWeight: layer.weight,
    textAlign: layer.align,
    color: layer.color,
    transform: 'translate(-50%, -50%) rotate(' + layer.rotation + 'deg)',
  }
}

function imageStyle(layer) {
  return {
    left: layer.x + '%',
    top: layer.y + '%',
    width: layer.width + '%',
    aspectRatio: '1 / ' + layer.ratio,
    transform: 'translate(-50%, -50%) rotate(' + layer.rotation + 'deg)',
  }
}
</script>

<template>
  <!-- app-page gives us the shared colours, font, buttons, chips and tabs from pages.css -->
  <section class="app-page sm-page">
    <!-- ============ TOP BAR ============ -->
    <header class="sm-topbar sm-card">
      <div class="sm-brand">
        <span class="sm-brand-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="sm-local-icon"><path :d="LOCAL_ICONS.sticker" /></svg>
        </span>
        <div class="sm-brand-text">
          <h1 class="sm-brand-title">Sticker Maker</h1>
        </div>
      </div>

      <!-- Sticker / GIF: the only difference is whether the frame strip exists -->
      <div class="seg-tabs sm-mode" role="tablist" aria-label="Mode">
        <button
          type="button"
          role="tab"
          class="seg-tab"
          :class="{ active: mode === 'sticker' }"
          :aria-selected="mode === 'sticker'"
          @click="setMode('sticker')"
        >
          <AppIcon name="image" :size="15" />
          <span>Sticker</span>
        </button>
        <button
          type="button"
          role="tab"
          class="seg-tab"
          :class="{ active: mode === 'gif' }"
          :aria-selected="mode === 'gif'"
          @click="setMode('gif')"
        >
          <AppIcon name="film" :size="15" />
          <span>GIF</span>
        </button>
      </div>

      <div class="sm-topbar-actions">
        <button
          type="button"
          class="btn btn-outline-secondary sm-square"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          :disabled="!canUndo"
          @click="undo"
        >
          <AppIcon name="undo" :size="16" />
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary sm-square"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          :disabled="!canRedo"
          @click="redo"
        >
          <AppIcon name="redo" :size="16" />
        </button>
        <button type="button" class="btn btn-outline-secondary sm-action" aria-label="Download" @click="openDownload">
          <AppIcon name="download" :size="16" />
          <span class="sm-hide-xs">Download</span>
        </button>
        <button type="button" class="btn btn-primary sm-action" aria-label="Save to My Studio" @click="openSave">
          <AppIcon name="save" :size="16" />
          <span class="sm-hide-xs">Save to My Studio</span>
        </button>
      </div>
    </header>

    <!-- ============ BODY ============ -->
    <div class="sm-body">
      <!-- Tool rail: each tool is a small tile, the open one is tinted blue -->
      <nav class="sm-rail sm-card" aria-label="Tools">
        <button
          v-for="item in TOOLS"
          :key="item.id"
          type="button"
          class="sm-rail-btn"
          :class="{ active: tool === item.id }"
          :aria-pressed="tool === item.id"
          @click="pickTool(item.id)"
        >
          <span class="sm-rail-tile">
            <AppIcon v-if="item.icon" :name="item.icon" :size="18" />
            <svg v-else viewBox="0 0 24 24" class="sm-local-icon"><path :d="LOCAL_ICONS[item.local]" /></svg>
          </span>
          <span>{{ item.label }}</span>
        </button>
        <!-- Only on phones: opens the properties sheet -->
        <button type="button" class="sm-rail-btn sm-mobile-only" @click="mobilePanel = 'props'">
          <span class="sm-rail-tile">
            <svg viewBox="0 0 24 24" class="sm-local-icon"><path :d="LOCAL_ICONS.sliders" /></svg>
          </span>
          <span>Edit</span>
        </button>
      </nav>

      <!-- Drawer: the contents of the open tool -->
      <aside class="sm-panel sm-drawer sm-card" :class="{ 'is-open': mobilePanel === 'drawer' }">
        <div class="sm-panel-head">
          <h2 class="sm-panel-title">{{ currentToolLabel }}</h2>
          <button type="button" class="sm-close sm-mobile-only" aria-label="Close" @click="mobilePanel = null">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="sm-panel-body">
          <!-- ---------- STICKERS ---------- -->
          <template v-if="tool === 'stickers'">
            <!-- Tag filter: the tags come from the shared library -->
            <div class="sm-chip-row" role="group" aria-label="Filter stickers">
              <button
                v-for="tag in ART_TAGS"
                :key="tag"
                type="button"
                class="chip chip-sm"
                :class="{ active: activeTag === tag }"
                :aria-pressed="activeTag === tag"
                @click="activeTag = tag"
              >{{ tag }}</button>
            </div>

            <div v-for="section in artSections" :key="section.id" class="sm-section">
              <p class="sm-label">
                {{ section.title }}
                <span class="sm-count">{{ section.items.length }}</span>
              </p>
              <div class="sm-grid" :class="{ 'sm-grid-2': section.id === 'tapes' }">
                <button
                  v-for="item in section.items"
                  :key="item.id"
                  type="button"
                  class="sm-cell"
                  :class="{ 'sm-cell-wide': item.kind === 'tape' }"
                  :title="item.name"
                  :aria-label="'Add ' + item.name"
                  @click="addArt(item)"
                >
                  <span v-if="item.kind === 'emoji'" class="sm-emoji" aria-hidden="true">{{ item.content }}</span>
                  <img v-else :src="item.url" alt="" class="sm-thumb" draggable="false" />
                </button>
              </div>
            </div>

            <div class="sm-section">
              <p class="sm-label">
                My stickers
                <span class="sm-count">{{ myStickers.length }}</span>
              </p>

              <div v-if="!isAccount" class="empty-state sm-empty-state">
                <span class="empty-icon"><AppIcon name="lock" :size="20" /></span>
                <span>
                  <RouterLink :to="{ path: '/login', query: { redirect: '/sticker-maker' } }">Log in</RouterLink>
                  to use the stickers you saved in My Studio.
                </span>
              </div>
              <div v-else-if="loadingMine" class="sm-grid sm-grid-3" role="status" aria-label="Loading your stickers">
                <span v-for="n in 6" :key="n" class="skeleton sm-cell-skeleton"></span>
              </div>
              <div v-else-if="myStickers.length === 0" class="empty-state sm-empty-state">
                <span class="empty-icon"><AppIcon name="sparkle" :size="20" /></span>
                <span>Nothing saved yet. Make one and press "Save to My Studio".</span>
              </div>
              <template v-else>
                <!-- Folder tabs: "All" plus one per folder -->
                <div class="sm-chip-row" role="group" aria-label="Folders">
                  <button
                    type="button"
                    class="chip chip-sm"
                    :class="{ active: activeFolder === 'all' }"
                    :aria-pressed="activeFolder === 'all'"
                    @click="activeFolder = 'all'"
                  >All</button>
                  <button
                    v-for="folder in folders"
                    :key="folder.id"
                    type="button"
                    class="chip chip-sm"
                    :class="{ active: activeFolder === folder.id }"
                    :aria-pressed="activeFolder === folder.id"
                    @click="activeFolder = folder.id"
                  >{{ folder.name }}</button>
                </div>

                <p v-if="visibleStickers.length === 0" class="sm-hint">No stickers in this folder yet.</p>
                <div v-else class="sm-grid sm-grid-3">
                  <button
                    v-for="item in visibleStickers"
                    :key="item.id"
                    type="button"
                    class="sm-cell"
                    :title="item.name"
                    :aria-label="'Add ' + item.name"
                    @click="addMySticker(item)"
                  >
                    <img :src="item.thumbUrl" alt="" class="sm-thumb" draggable="false" />
                  </button>
                </div>
              </template>
            </div>
          </template>

          <!-- ---------- TEXT ---------- -->
          <template v-else-if="tool === 'text'">
            <button type="button" class="btn btn-primary w-100 sm-action" @click="addText(null)">
              <AppIcon name="plus" :size="16" />
              <span>Add a text box</span>
            </button>
            <p class="sm-hint">Type straight into the box on the canvas, then click anywhere else to finish.</p>

            <div class="sm-section">
              <p class="sm-label">Text styles</p>
              <div class="sm-grid sm-grid-2">
                <button
                  v-for="style in TEXT_STYLES"
                  :key="style.name"
                  type="button"
                  class="sm-cell sm-cell-style"
                  @click="addText(style)"
                >
                  <span class="sm-style-sample" :style="{ fontWeight: style.weight }">Aa</span>
                  <span class="sm-cell-caption">{{ style.name }}</span>
                </button>
              </div>
            </div>

            <!-- The fun fonts from the shared library. Each card is set in its own face. -->
            <div v-for="group in FONT_GROUPS_READY" :key="group.group" class="sm-section">
              <p class="sm-label">
                {{ group.group }}
                <span class="sm-count">{{ group.fonts.length }}</span>
              </p>
              <div class="sm-font-cards">
                <button
                  v-for="font in group.fonts"
                  :key="font.name"
                  type="button"
                  class="sm-font-card"
                  :title="'Add text in ' + font.name"
                  @click="pickFont(font)"
                >
                  <span class="sm-font-card-sample" :style="{ fontFamily: font.stack }">{{ font.preview }}</span>
                  <span class="sm-font-card-name">{{ font.name }}</span>
                </button>
              </div>
            </div>
          </template>

          <!-- ---------- LIVE (time, date, weather, location) ---------- -->
          <template v-else-if="tool === 'live'">
            <p class="sm-hint mt-0">
              Live stickers update by themselves. Saved on their own, they keep updating on
              everyone's photostrips.
            </p>

            <div class="sm-section">
              <p class="sm-label">Look</p>
              <div class="seg-tabs sm-seg-block" role="group" aria-label="Look">
                <button
                  v-for="style in DYNAMIC_STYLES"
                  :key="style.id"
                  type="button"
                  class="seg-tab"
                  :class="{ active: liveStyle === style.id }"
                  :aria-pressed="liveStyle === style.id"
                  @click="liveStyle = style.id"
                >{{ style.label }}</button>
              </div>
            </div>

            <div class="sm-section">
              <p class="sm-label">Time and date</p>
              <div class="sm-grid sm-grid-2">
                <button type="button" class="sm-cell sm-cell-live" @click="addTimeSticker('time')">
                  <img :src="dynamicDataUrl({ type: 'time', style: liveStyle, hour12: liveHour12, timeZone: liveLockZone ? myTimeZone : '' }).url" alt="" class="sm-thumb" />
                  <span class="sm-cell-caption">Time</span>
                </button>
                <button type="button" class="sm-cell sm-cell-live" @click="addTimeSticker('date')">
                  <img :src="dynamicDataUrl({ type: 'date', style: liveStyle, timeZone: liveLockZone ? myTimeZone : '' }).url" alt="" class="sm-thumb" />
                  <span class="sm-cell-caption">Date</span>
                </button>
              </div>
              <div class="sm-toggles">
                <label class="form-check form-switch">
                  <input v-model="liveHour12" class="form-check-input" type="checkbox" role="switch" />
                  <span class="form-check-label">12-hour clock (3:42 PM)</span>
                </label>
                <label class="form-check form-switch">
                  <input v-model="liveLockZone" class="form-check-input" type="checkbox" role="switch" />
                  <span class="form-check-label">Always show my time zone</span>
                </label>
                <p class="sm-hint mt-0">
                  {{ liveLockZone ? 'Everyone sees the time in ' + myTimeZone + '.' : 'Everyone sees their own local time.' }}
                </p>
              </div>
            </div>

            <div class="sm-section">
              <p class="sm-label">Weather and location</p>
              <form class="input-group" @submit.prevent="findCity">
                <input
                  v-model="liveCity"
                  type="text"
                  class="form-control sm-city"
                  maxlength="60"
                  placeholder="City, e.g. Singapore"
                  aria-label="City"
                />
                <button type="submit" class="btn btn-outline-secondary" :disabled="liveBusy !== ''">
                  {{ liveBusy === 'city' ? 'Finding…' : 'Find' }}
                </button>
              </form>
              <button
                type="button"
                class="btn btn-outline-primary btn-sm w-100 mt-2"
                :disabled="liveBusy !== ''"
                @click="useMyLocation"
              >
                <AppIcon name="globe" :size="14" />
                {{ liveBusy === 'gps' ? 'Finding you…' : 'Use my location' }}
              </button>
              <p v-if="liveError" class="sm-error" role="alert">{{ liveError }}</p>

              <div v-if="livePlace" class="sm-grid sm-grid-2 mt-3">
                <button type="button" class="sm-cell sm-cell-live" @click="addPlaceSticker('weather')">
                  <img :src="dynamicDataUrl({ type: 'weather', style: liveStyle, city: livePlace.city, country: livePlace.country }, liveWeather).url" alt="" class="sm-thumb" />
                  <span class="sm-cell-caption">Weather</span>
                </button>
                <button type="button" class="sm-cell sm-cell-live" @click="addPlaceSticker('location')">
                  <img :src="dynamicDataUrl({ type: 'location', style: liveStyle, city: livePlace.city, country: livePlace.country }).url" alt="" class="sm-thumb" />
                  <span class="sm-cell-caption">Location</span>
                </button>
              </div>
              <p class="sm-hint">Only the city name is saved, never your exact location.</p>
            </div>
          </template>

          <!-- ---------- DRAW ---------- -->
          <template v-else-if="tool === 'draw'">
            <p class="sm-label">Brush</p>
            <div class="sm-brushes" role="group" aria-label="Brush">
              <button
                v-for="item in BRUSHES"
                :key="item.id"
                type="button"
                class="sm-brush"
                :class="{ active: brush === item.id }"
                :aria-pressed="brush === item.id"
                @click="brush = item.id"
              >
                <AppIcon :name="item.icon" :size="18" />
                <span>{{ item.label }}</span>
              </button>
            </div>

            <div class="sm-section">
              <p class="sm-label">Colour</p>
              <div class="sm-swatches">
                <button
                  v-for="color in [...SOLID_COLORS, ...PASTEL_COLORS]"
                  :key="color"
                  type="button"
                  class="sm-swatch"
                  :class="{ active: currentColor === color }"
                  :style="{ background: color }"
                  :aria-label="'Colour ' + color"
                  :aria-pressed="currentColor === color"
                  @click="pickColor(color)"
                ></button>
                <label class="sm-swatch sm-swatch-custom" title="Custom colour">
                  <input
                    type="color"
                    :value="currentColor"
                    aria-label="Custom colour"
                    @input="pickColor($event.target.value)"
                  />
                  <AppIcon name="plus" :size="14" />
                </label>
              </div>
            </div>

            <div class="sm-section">
              <p class="sm-label">
                Stroke
                <span class="sm-count">{{ brushSize.toFixed(1) }}</span>
              </p>
              <input
                v-model.number="brushSize"
                type="range"
                class="sm-range"
                :style="{ '--fill': ((brushSize - 0.5) / 4.5) * 100 + '%' }"
                min="0.5"
                max="5"
                step="0.1"
                aria-label="Stroke size"
              />
            </div>

            <div class="sm-section sm-btn-row">
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="undoStroke">
                <AppIcon name="undo" :size="14" /> Last stroke
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="clearDrawings">
                <AppIcon name="eraser" :size="14" /> Clear all
              </button>
            </div>
            <p class="sm-hint">Draw straight on the canvas. Pick another tool to stop drawing.</p>
          </template>

          <!-- ---------- UPLOAD ---------- -->
          <template v-else-if="tool === 'upload'">
            <button type="button" class="sm-drop" @click="openFilePicker">
              <span class="empty-icon"><AppIcon name="upload" :size="20" /></span>
              <span class="sm-drop-title">Choose a photo</span>
              <span class="sm-hint mt-0">PNG, JPEG or WebP</span>
            </button>
            <input
              ref="fileInput"
              type="file"
              class="d-none"
              accept="image/png,image/jpeg,image/webp"
              @change="uploadPhoto"
            />
            <p class="sm-hint">
              The photo becomes a layer you can move, resize and rotate. Select it to
              remove the background.
            </p>
          </template>
        </div>
      </aside>

      <!-- ---------- CANVAS + FRAMES ---------- -->
      <main class="sm-main">
        <div ref="stageEl" class="sm-stage">
          <span class="sm-stage-pill sm-stage-tag">{{ EXPORT_SIZE }} × {{ EXPORT_SIZE }}</span>
          <span class="sm-stage-pill sm-stage-zoom">{{ zoomPercent }}%</span>

          <div
            ref="canvasEl"
            class="sm-canvas"
            :style="{ width: stageWidth + 'px', height: stageWidth + 'px' }"
            @pointerdown.self="clearSelection"
          >
            <div v-if="layers.length === 0" class="sm-empty">
              <span class="sm-empty-tile"><AppIcon name="sparkle" :size="22" /></span>
              <span class="sm-empty-title">Your sticker starts here</span>
              <span>Pick a sticker, add some text or upload a photo.</span>
            </div>

            <!-- One element per layer. Later layers are drawn on top, because that is the list order. -->
            <template v-for="item in layers" :key="item.id">
              <!-- PHOTO / STICKER -->
              <div
                v-if="item.type === 'image'"
                class="sm-layer"
                :class="{ 'is-selected': isSelected(item) }"
                :style="imageStyle(item)"
                @pointerdown.stop="startGesture($event, item, 'move')"
              >
                <img :src="item.url" :alt="item.name" class="sm-layer-img" draggable="false" />
                <template v-if="isSelected(item)">
                  <span class="sm-handle nw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle ne" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle se" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle sw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-rot-stem"></span>
                  <span class="sm-rot" title="Rotate (hold Shift to snap)" @pointerdown.stop.prevent="startGesture($event, item, 'rotate')"></span>
                </template>
              </div>

              <!-- TEXT (and emoji, which are text too) -->
              <div
                v-else-if="item.type === 'text'"
                class="sm-layer sm-text"
                :class="{ 'is-selected': isSelected(item), 'is-emoji': item.emoji }"
                :style="textStyle(item)"
                @pointerdown.stop="startGesture($event, item, 'move')"
                @dblclick.stop="startEditing(item)"
              >
                <div
                  v-if="editingId === item.id"
                  :ref="setEditEl"
                  class="sm-text-edit"
                  contenteditable="true"
                  @pointerdown.stop
                  @input="onTextInput($event, item)"
                  @blur="stopEditing"
                  @keydown.esc.prevent="stopEditing"
                ></div>
                <div v-else class="sm-text-view">{{ item.text || 'Text' }}</div>

                <template v-if="isSelected(item) && editingId !== item.id">
                  <span class="sm-handle nw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle ne" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle se" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle sw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-rot-stem"></span>
                  <span class="sm-rot" title="Rotate (hold Shift to snap)" @pointerdown.stop.prevent="startGesture($event, item, 'rotate')"></span>
                </template>
              </div>

              <!-- DRAWING: an SVG over the whole canvas, 0-100 matches our percentages -->
              <svg
                v-else-if="item.type === 'draw'"
                class="sm-draw-layer"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <g v-for="(stroke, i) in item.strokes" :key="i">
                  <polyline
                    :points="pointsToString(stroke.points)"
                    fill="none"
                    :stroke="stroke.color"
                    :stroke-width="stroke.width"
                    :stroke-opacity="stroke.opacity"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path v-for="(star, j) in stroke.stars" :key="j" :d="starPath(star.x, star.y, star.r)" :fill="stroke.color" />
                </g>
              </svg>
            </template>

            <!-- While drawing, this transparent sheet catches the pointer so layers below are not moved -->
            <div
              v-if="drawing"
              class="sm-draw-overlay"
              @pointerdown="startStroke"
              @pointermove="moveStroke"
              @pointerup="endStroke"
              @pointercancel="endStroke"
            ></div>
          </div>
        </div>

        <!-- Frame strip: the order here is the order the GIF plays in -->
        <div v-if="mode === 'gif'" class="sm-frames sm-card">
          <div class="sm-frame-list">
            <div
              v-for="(frame, index) in frames"
              :key="frame.id"
              class="sm-frame-wrap"
            >
              <button
                type="button"
                class="sm-frame"
                :class="{ active: frame.id === activeFrameId }"
                :aria-label="'Frame ' + (index + 1)"
                :aria-current="frame.id === activeFrameId ? 'step' : null"
                @click="goToFrame(frame.id)"
              >
                <img v-if="frameThumbs[frame.id]" :src="frameThumbs[frame.id]" alt="" class="sm-frame-img" />
                <span v-else class="sm-frame-blank"></span>
                <span class="sm-frame-num">{{ index + 1 }}</span>
              </button>
              <!-- Reorder arrows only on the frame you are on, so the strip stays calm -->
              <div v-if="frame.id === activeFrameId && frames.length > 1" class="sm-frame-move">
                <button type="button" :disabled="index === 0" aria-label="Move frame left" @click="moveFrame(frame, -1)">‹</button>
                <button type="button" :disabled="index === frames.length - 1" aria-label="Move frame right" @click="moveFrame(frame, 1)">›</button>
              </div>
            </div>

            <button type="button" class="sm-frame sm-frame-add" title="Add frame" aria-label="Add frame" @click="addFrame">
              <AppIcon name="plus" :size="18" />
            </button>
          </div>

          <div class="sm-frame-actions">
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="duplicateFrame">
              <AppIcon name="duplicate" :size="14" /> Duplicate
            </button>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm"
              :disabled="frames.length === 1"
              @click="deleteFrame(activeFrame)"
            >
              <AppIcon name="trash" :size="14" /> Delete
            </button>
          </div>

          <div class="sm-frame-speed">
            <span class="sm-label mb-0">Speed</span>
            <input
              v-model.number="gifSpeed"
              type="range"
              class="sm-range"
              :style="{ '--fill': ((gifSpeed - 1) / 14) * 100 + '%' }"
              min="1"
              max="15"
              step="1"
              aria-label="GIF speed"
            />
            <span class="sm-frame-fps">{{ gifSpeed }} fps</span>
          </div>
        </div>
      </main>

      <!-- ---------- PROPERTIES ---------- -->
      <aside class="sm-panel sm-props sm-card" :class="{ 'is-open': mobilePanel === 'props' }">
        <div class="sm-panel-head">
          <h2 class="sm-panel-title">{{ selectedLayer ? selectedKind : 'Canvas' }}</h2>
          <button type="button" class="sm-close sm-mobile-only" aria-label="Close" @click="mobilePanel = null">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="sm-panel-body">
          <!-- Nothing selected: canvas facts -->
          <template v-if="!selectedLayer">
            <div class="sm-rows">
              <div class="sm-row"><span>Size</span><span>{{ EXPORT_SIZE }} × {{ EXPORT_SIZE }}</span></div>
              <div class="sm-row"><span>Background</span><span>Transparent</span></div>
              <div class="sm-row"><span>Layers</span><span>{{ layers.length }}</span></div>
              <div class="sm-row"><span>Saves as</span><span>{{ mode === 'gif' && frames.length > 1 ? 'Animated' : liveOnlyLayer ? 'Live' : 'Still' }}</span></div>
            </div>
          </template>

          <!-- Something selected -->
          <template v-else>
            <!-- TEXT properties (emoji only get size + rotation) -->
            <template v-if="selectedLayer.type === 'text'">
              <template v-if="!selectedLayer.emoji">
                <textarea
                  :value="selectedLayer.text"
                  class="form-control sm-textarea"
                  rows="2"
                  placeholder="Type your text"
                  aria-label="Text"
                  @focus="snapshot"
                  @input="setProp('text', $event.target.value)"
                ></textarea>

                <div class="sm-section">
                  <p class="sm-label">
                    Font
                    <span class="sm-count">{{ FONTS.length }}</span>
                  </p>
                  <!-- Every name is set in its own face, grouped like the Template Editor -->
                  <div class="sm-font-list">
                    <template v-for="group in FONT_GROUPS_READY" :key="group.group">
                      <p class="sm-font-group">{{ group.group }}</p>
                      <button
                        v-for="font in group.fonts"
                        :key="font.name"
                        type="button"
                        class="sm-font-item"
                        :class="{ active: selectedLayer.font === font.name }"
                        :aria-pressed="selectedLayer.font === font.name"
                        @click="pickFont(font)"
                      >
                        <span class="sm-font-item-name" :style="{ fontFamily: font.stack }">{{ font.name }}</span>
                        <span class="sm-font-item-hint">{{ fontHint(font) }}</span>
                      </button>
                    </template>
                  </div>
                </div>
              </template>

              <div class="sm-section">
                <p class="sm-label">
                  Size
                  <span class="sm-count">{{ Math.round(selectedLayer.size) }}</span>
                </p>
                <input
                  type="range"
                  class="sm-range"
                  min="3"
                  max="40"
                  step="0.5"
                  :value="selectedLayer.size"
                  :style="{ '--fill': ((selectedLayer.size - 3) / 37) * 100 + '%' }"
                  aria-label="Text size"
                  @pointerdown="snapshot"
                  @input="setProp('size', +$event.target.value)"
                />
              </div>

              <template v-if="!selectedLayer.emoji">
                <div class="sm-section">
                  <p class="sm-label">Weight</p>
                  <div class="seg-tabs sm-seg-block" role="group" aria-label="Weight">
                    <button
                      v-for="weight in [400, 500, 700]"
                      :key="weight"
                      type="button"
                      class="seg-tab"
                      :class="{ active: selectedLayer.weight === weight }"
                      :aria-pressed="selectedLayer.weight === weight"
                      :style="{ fontWeight: weight }"
                      @click="snapshot(); setProp('weight', weight)"
                    >{{ weight === 400 ? 'Regular' : weight === 500 ? 'Medium' : 'Bold' }}</button>
                  </div>
                </div>

                <div class="sm-section">
                  <p class="sm-label">Align</p>
                  <div class="seg-tabs sm-seg-block" role="group" aria-label="Align">
                    <button
                      v-for="align in ['left', 'center', 'right']"
                      :key="align"
                      type="button"
                      class="seg-tab"
                      :class="{ active: selectedLayer.align === align }"
                      :aria-pressed="selectedLayer.align === align"
                      @click="snapshot(); setProp('align', align)"
                    >{{ align === 'center' ? 'Centre' : align.charAt(0).toUpperCase() + align.slice(1) }}</button>
                  </div>
                </div>

                <div class="sm-section">
                  <p class="sm-label">Colour</p>
                  <div class="sm-swatches">
                    <button
                      v-for="color in [...SOLID_COLORS, ...PASTEL_COLORS]"
                      :key="color"
                      type="button"
                      class="sm-swatch"
                      :class="{ active: selectedLayer.color === color }"
                      :style="{ background: color }"
                      :aria-label="'Colour ' + color"
                      :aria-pressed="selectedLayer.color === color"
                      @click="snapshot(); pickColor(color)"
                    ></button>
                    <label class="sm-swatch sm-swatch-custom" title="Custom colour">
                      <input
                        type="color"
                        :value="selectedLayer.color"
                        aria-label="Custom colour"
                        @input="pickColor($event.target.value)"
                      />
                      <AppIcon name="plus" :size="14" />
                    </label>
                  </div>
                </div>
              </template>
            </template>

            <!-- PHOTO / STICKER properties -->
            <template v-else-if="selectedLayer.type === 'image'">
              <div v-if="selectedLayer.dynamic" class="sm-section mt-0 mb-3">
                <p class="sm-label">Look</p>
                <div class="seg-tabs sm-seg-block" role="group" aria-label="Look">
                  <button
                    v-for="style in DYNAMIC_STYLES"
                    :key="style.id"
                    type="button"
                    class="seg-tab"
                    :class="{ active: selectedLayer.dynamic.style === style.id }"
                    :aria-pressed="selectedLayer.dynamic.style === style.id"
                    @click="setLiveStyle(style.id)"
                  >{{ style.label }}</button>
                </div>
                <p class="sm-hint">
                  {{ liveOnlyLayer ? 'Saves as a live sticker that keeps updating.' : 'With other layers it saves as a picture. Keep it on its own to stay live.' }}
                </p>
              </div>
              <div class="sm-section mt-0">
                <p class="sm-label">
                  Size
                  <span class="sm-count">{{ Math.round(selectedLayer.width) }}%</span>
                </p>
                <input
                  type="range"
                  class="sm-range"
                  min="3"
                  max="200"
                  step="1"
                  :value="selectedLayer.width"
                  :style="{ '--fill': ((selectedLayer.width - 3) / 197) * 100 + '%' }"
                  aria-label="Size"
                  @pointerdown="snapshot"
                  @input="setProp('width', +$event.target.value)"
                />
              </div>

              <button
                v-if="selectedLayer.source === 'photo'"
                type="button"
                class="btn btn-outline-primary w-100 sm-action mt-3"
                :disabled="removingBg"
                @click="cutOutBackground(selectedLayer)"
              >
                <AppIcon name="sparkle" :size="16" />
                <span>{{ removingBg ? 'Removing…' : 'Remove background' }}</span>
              </button>
            </template>

            <!-- Rotation: photos, stickers, text and emoji all turn the same way -->
            <div v-if="selectedLayer.type !== 'draw'" class="sm-section">
              <p class="sm-label">
                Rotation
                <span class="sm-count">{{ Math.round(selectedLayer.rotation) }}°</span>
              </p>
              <input
                type="range"
                class="sm-range"
                min="-180"
                max="180"
                step="1"
                :value="selectedLayer.rotation"
                :style="{ '--fill': ((selectedLayer.rotation + 180) / 360) * 100 + '%' }"
                aria-label="Rotation"
                @pointerdown="snapshot"
                @input="setProp('rotation', +$event.target.value)"
              />
            </div>

            <!-- Order and actions -->
            <div class="sm-section">
              <p class="sm-label">Arrange</p>
              <div class="sm-btn-grid">
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="bringToFront(selectedLayer)">To front</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="moveUp(selectedLayer)">Forward</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="moveDown(selectedLayer)">Backward</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="sendToBack(selectedLayer)">To back</button>
              </div>
              <div class="sm-btn-row mt-2">
                <button
                  v-if="selectedLayer.type === 'image'"
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  @click="resetLayer(selectedLayer)"
                >
                  <AppIcon name="refresh" :size="14" /> Reset
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  title="Copy (Ctrl+C), then paste with Ctrl+V, even in another frame"
                  @click="copyLayer(selectedLayer); showToast('Copied. Press Ctrl+V to paste.')"
                >Copy</button>
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  title="Duplicate (Ctrl+D)"
                  @click="duplicateLayer(selectedLayer)"
                >
                  <AppIcon name="duplicate" :size="14" /> Duplicate
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" @click="deleteLayer(selectedLayer)">
                  <AppIcon name="trash" :size="14" /> Delete
                </button>
              </div>
            </div>
          </template>

          <!-- Layers list: the top row is the front-most layer -->
          <div class="sm-layers">
            <p class="sm-label">
              {{ mode === 'gif' ? 'Layers in this frame' : 'Layers' }}
              <span class="sm-count">{{ layers.length }}</span>
            </p>
            <p v-if="layers.length === 0" class="sm-hint">Nothing here yet. Add a sticker or a text box.</p>
            <div v-else class="sm-layer-list">
              <div
                v-for="layer in layersTopFirst"
                :key="layer.id"
                class="sm-layer-row"
                :class="{ active: layer.id === selectedId, 'drop-target': layer.id === dropTargetId }"
                draggable="true"
                @click="selectLayer(layer)"
                @dragstart="onRowDragStart(layer)"
                @dragover.prevent="dropTargetId = layer.id"
                @dragleave="dropTargetId = null"
                @drop.prevent="onRowDrop(layer)"
                @dragend="onRowDragEnd"
              >
                <svg class="sm-grip sm-local-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="LOCAL_ICONS.grip" /></svg>
                <img v-if="layer.type === 'image'" :src="layer.url" alt="" class="sm-layer-thumb" />
                <span v-else class="sm-layer-thumb sm-layer-icon">
                  {{ layer.emoji ? layer.text : layer.type === 'text' ? 'T' : '' }}
                  <AppIcon v-if="layer.type === 'draw'" name="pen" :size="13" />
                </span>
                <span class="sm-layer-name">{{ layerLabel(layer) }}</span>
                <button type="button" class="sm-row-del" title="Delete layer" aria-label="Delete layer" @click.stop="deleteLayer(layer)">
                  <AppIcon name="trash" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Backdrop for the phone sheets -->
    <div v-if="mobilePanel" class="sm-sheet-backdrop sm-mobile-only" @click="mobilePanel = null"></div>

    <!-- ============ DOWNLOAD DIALOG ============ -->
    <div v-if="dlOpen" class="sm-modal-backdrop" @click.self="dlOpen = false">
      <div class="sm-modal" role="dialog" aria-modal="true" aria-labelledby="sm-dl-title">
        <div class="sm-modal-head">
          <span class="sm-modal-tile"><AppIcon name="download" :size="18" /></span>
          <h2 id="sm-dl-title" class="sm-modal-title">Download to your device</h2>
          <button type="button" class="sm-close" aria-label="Close" @click="dlOpen = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="sm-modal-body">
          <p class="sm-hint mt-0 mb-3">This saves a file to your computer. It does not appear in My Studio.</p>

          <div class="sm-dl-top">
            <div class="sm-dl-preview" :class="{ 'is-clear': dlBg === 'clear' }">
              <img v-if="previewUrl" :src="previewUrl" alt="Preview of the sticker" />
            </div>

            <div class="sm-dl-fields">
              <label class="sm-label" for="sm-dl-name">File name</label>
              <div class="input-group">
                <input id="sm-dl-name" v-model="dlName" type="text" class="form-control" maxlength="60" />
                <span class="input-group-text sm-suffix">{{ dlSuffix }}</span>
              </div>

              <p class="sm-label mt-3">Format</p>
              <div class="seg-tabs sm-seg-block" role="group" aria-label="Format">
                <button
                  type="button"
                  class="seg-tab"
                  :class="{ active: dlFormat === 'photo' }"
                  :aria-pressed="dlFormat === 'photo'"
                  @click="dlFormat = 'photo'"
                >Photo</button>
                <button
                  type="button"
                  class="seg-tab"
                  :class="{ active: dlFormat === 'gif' }"
                  :aria-pressed="dlFormat === 'gif'"
                  :disabled="frames.length < 2"
                  :title="frames.length < 2 ? 'Add a second frame to export a GIF' : ''"
                  @click="dlFormat = 'gif'"
                >GIF</button>
              </div>
              <p class="sm-hint">{{ dlSummary }}</p>
            </div>
          </div>

          <p class="sm-label mt-3">Background</p>
          <div class="seg-tabs sm-seg-block" role="group" aria-label="Background">
            <button
              type="button"
              class="seg-tab"
              :class="{ active: dlBg === 'white' }"
              :aria-pressed="dlBg === 'white'"
              @click="dlBg = 'white'"
            >White</button>
            <button
              type="button"
              class="seg-tab"
              :class="{ active: dlBg === 'clear' }"
              :aria-pressed="dlBg === 'clear'"
              @click="dlBg = 'clear'"
            >Transparent</button>
          </div>

          <div class="sm-rows mt-3">
            <div class="sm-row"><span>Dimensions</span><span>{{ dlFormat === 'gif' ? GIF_SIZE : DOWNLOAD_SIZE }} × {{ dlFormat === 'gif' ? GIF_SIZE : DOWNLOAD_SIZE }} px</span></div>
            <div class="sm-row"><span>Frames</span><span>{{ frames.length }}</span></div>
            <div class="sm-row"><span>Files</span><span>{{ dlFormat === 'gif' ? 1 : frames.length }}</span></div>
          </div>

          <p v-if="errorMessage" class="sm-error" role="alert">{{ errorMessage }}</p>

          <div class="sm-modal-actions">
            <button type="button" class="btn btn-outline-secondary" @click="dlOpen = false; showSave = true">Save to My Studio instead</button>
            <button
              type="button"
              class="btn btn-outline-secondary sm-action"
              title="Copy this frame as a picture, to paste into a chat or another app"
              @click="copyStickerImage"
            >
              <AppIcon name="duplicate" :size="16" />
              <span>Copy image</span>
            </button>
            <button type="button" class="btn btn-primary sm-action" :disabled="downloading" @click="doDownload">
              <AppIcon name="download" :size="16" />
              <span>{{ downloading ? 'Building…' : 'Download' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ SAVE TO MY STUDIO DIALOG ============ -->
    <div v-if="showSave" class="sm-modal-backdrop" @click.self="closeSave">
      <div class="sm-modal" role="dialog" aria-modal="true" aria-labelledby="sm-save-title">
        <div class="sm-modal-head">
          <span class="sm-modal-tile"><AppIcon name="save" :size="18" /></span>
          <h2 id="sm-save-title" class="sm-modal-title">Save to My Studio</h2>
          <button type="button" class="sm-close" aria-label="Close" @click="closeSave">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <!-- Guests cannot save, so they get a login prompt instead of the form -->
        <div v-if="!isAccount" class="sm-modal-body">
          <p class="sm-hint mt-0 mb-3">You need an account to save stickers to My Studio.</p>
          <RouterLink :to="{ path: '/login', query: { redirect: '/sticker-maker' } }" class="btn btn-primary">
            Log in to save
          </RouterLink>
        </div>

        <div v-else class="sm-modal-body">
          <p class="sm-hint mt-0 mb-3">
            New stickers are private. Make one public in My Studio to share it on the Marketplace.
          </p>
          <p v-if="liveOnlyLayer" class="sm-live-note">
            <AppIcon name="sparkle" :size="14" />
            This saves as a live sticker: it keeps showing the current {{ liveOnlyLayer.dynamic.type }} on photostrips.
          </p>
          <p v-else-if="hasLiveLayer" class="sm-hint mt-0 mb-3">
            Your live sticker is mixed with other layers, so it saves as a picture of how it looks now.
          </p>

          <label class="sm-label" for="sm-save-name">Name</label>
          <input
            id="sm-save-name"
            v-model="stickerName"
            type="text"
            class="form-control"
            maxlength="40"
            placeholder="e.g. Main character energy"
          />

          <p class="sm-label mt-3">
            Categories
            <span class="sm-count">{{ pickedDefaults.length }}/{{ MAX_CATEGORIES }}</span>
          </p>
          <div class="sm-chip-row sm-chip-wrap">
            <button
              v-for="category in DEFAULT_CATEGORIES"
              :key="category.id"
              type="button"
              class="chip chip-sm"
              :class="{ active: pickedDefaults.includes(category.id) }"
              :aria-pressed="pickedDefaults.includes(category.id)"
              :disabled="!pickedDefaults.includes(category.id) && pickedDefaults.length >= MAX_CATEGORIES"
              @click="toggleDefault(category.id)"
            >{{ category.label }}</button>
          </div>

          <p class="sm-label mt-3">
            My folders
            <span class="sm-count">Only you see these</span>
          </p>
          <div class="sm-chip-row sm-chip-wrap">
            <div v-for="folder in folders" :key="folder.id" class="sm-folder">
              <template v-if="editingFolderId !== folder.id">
                <button
                  type="button"
                  class="chip chip-sm"
                  :class="{ active: pickedFolders.includes(folder.id) }"
                  :aria-pressed="pickedFolders.includes(folder.id)"
                  @click="toggleFolder(folder.id)"
                >{{ folder.name }}</button>
                <button type="button" class="sm-mini" :title="'Rename ' + folder.name" :aria-label="'Rename ' + folder.name" @click="startRename(folder)">
                  <AppIcon name="edit" :size="12" />
                </button>
                <button type="button" class="sm-mini sm-mini-danger" :title="'Delete ' + folder.name" :aria-label="'Delete ' + folder.name" @click="removeFolder(folder)">
                  <AppIcon name="close" :size="12" />
                </button>
              </template>
              <template v-else>
                <input
                  v-model="editName"
                  type="text"
                  class="form-control form-control-sm sm-folder-input"
                  :maxlength="MAX_FOLDER_NAME"
                  aria-label="Folder name"
                  @keyup.enter="confirmRename(folder)"
                />
                <button type="button" class="sm-mini" aria-label="Save name" @click="confirmRename(folder)">
                  <AppIcon name="check" :size="12" />
                </button>
                <button type="button" class="sm-mini" aria-label="Cancel" @click="editingFolderId = ''">
                  <AppIcon name="close" :size="12" />
                </button>
              </template>
            </div>

            <button v-if="!addingFolder" type="button" class="chip chip-sm sm-chip-add" @click="addingFolder = true">
              <AppIcon name="plus" :size="12" /> New folder
            </button>
            <div v-else class="sm-folder">
              <input
                v-model="newFolderName"
                type="text"
                class="form-control form-control-sm sm-folder-input"
                :maxlength="MAX_FOLDER_NAME"
                placeholder="Folder name"
                aria-label="New folder name"
                @keyup.enter="addFolder"
              />
              <button type="button" class="sm-mini" aria-label="Add folder" @click="addFolder">
                <AppIcon name="check" :size="12" />
              </button>
              <button type="button" class="sm-mini" aria-label="Cancel" @click="addingFolder = false">
                <AppIcon name="close" :size="12" />
              </button>
            </div>
          </div>

          <p v-if="errorMessage" class="sm-error" role="alert">{{ errorMessage }}</p>

          <div class="sm-modal-actions">
            <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="closeSave">Cancel</button>
            <button type="button" class="btn btn-primary sm-action" :disabled="saving" @click="saveToStudio">
              <AppIcon name="save" :size="16" />
              <span>{{ saving ? 'Saving…' : 'Save sticker' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast: one short confirmation after every action that changes something -->
    <div v-if="toastText" class="sm-toast" :class="'is-' + toastType" role="status">{{ toastText }}</div>
  </section>
</template>

<style scoped>
/* ------------------------------------------------------------------ */
/*  WHY: the colours, radii and motion all come from design.md through */
/*  the app-page variables (--brand, --ink, --line...). The layout is  */
/*  a "workbench": rounded floating cards on a soft grey page, and a   */
/*  dotted cutting mat behind a sticker-sheet canvas, so it feels like */
/*  Blue Studios rather than a copy of another editor.                 */
/* ------------------------------------------------------------------ */
.sm-page {
  --sm-navbar: 56px; /* the navbar height in App.vue */
  --sm-gap: 12px;
  --sm-float: 0 1px 2px rgba(20, 23, 43, 0.04), 0 12px 32px rgba(20, 23, 43, 0.06);
  --sm-faint: #9AA0AE;

  height: calc(100vh - var(--sm-navbar));
  height: calc(100dvh - var(--sm-navbar));
  min-height: 560px;
  display: flex;
  flex-direction: column;
  gap: var(--sm-gap);
  padding: var(--sm-gap);
  padding-bottom: var(--sm-gap); /* app-page adds 32px at the bottom; this editor fills the screen */
  overflow: hidden;
  background: var(--soft);
}

/* Every panel is one of these: white, 16px corners, a hairline and a soft lift */
.sm-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04);
}

.sm-local-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

/* ---------- top bar ---------- */
.sm-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 12px;
}
.sm-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
/* The icon tile from design.md, tilted a little for personality */
.sm-brand-tile {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border-radius: 10px;
  color: var(--brand);
  background: var(--brand-tint);
  transform: rotate(-4deg);
  flex-shrink: 0;
}
.sm-brand-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.sm-brand-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.sm-mode { margin-left: auto; }
.sm-topbar-actions { display: flex; align-items: center; gap: 6px; margin-left: 8px; }

/* Buttons: Bootstrap's btn from pages.css, plus room for an icon */
.sm-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.sm-square {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; padding: 0;
}
.app-page .btn-sm { display: inline-flex; align-items: center; justify-content: center; gap: 5px; }

/* ---------- body layout ---------- */
.sm-body { flex: 1 1 auto; min-height: 0; display: flex; gap: var(--sm-gap); }

.sm-rail {
  flex: 0 0 auto;
  width: 76px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 6px;
}
.sm-rail-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 6px 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  -webkit-tap-highlight-color: transparent;
  transition: color 150ms ease;
}
.sm-rail-tile {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px;
  border-radius: 12px;
  transition: background-color 150ms ease, color 150ms ease, transform 160ms var(--ease-out);
}
.sm-rail-btn.active { color: var(--brand); }
.sm-rail-btn.active .sm-rail-tile { color: var(--brand); background: var(--brand-tint); transform: rotate(-4deg); }
.sm-rail-btn:active .sm-rail-tile { transform: scale(0.94); }
.sm-mobile-only { display: none; }

.sm-panel {
  flex: 0 0 auto;
  width: 272px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.sm-props { width: 280px; }
.sm-panel-head {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px;
}
.sm-panel-title { margin: 0; font-size: 1.05rem; font-weight: 700; text-wrap: balance; }
.sm-panel-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 16px 16px; scrollbar-width: thin; }

/* ---------- small type ---------- */
.sm-section { margin-top: 18px; }
.sm-label {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin: 0 0 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ink);
}
.sm-count { font-size: 0.78rem; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.sm-hint { margin: 8px 0 0; font-size: 0.8rem; line-height: 1.5; color: var(--muted); text-wrap: pretty; }
.sm-error {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 0.85rem;
  color: #B42318;
  background: #FEF3F2;
}

/* Chip rows scroll sideways inside themselves on narrow panels (design.md: no page scroll) */
.sm-chip-row {
  display: flex; gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.sm-chip-row::-webkit-scrollbar { display: none; }
.sm-chip-wrap { flex-wrap: wrap; overflow: visible; }
.sm-chip-add { display: inline-flex; align-items: center; gap: 4px; color: var(--brand); border-style: dashed; }

/* ---------- sticker grid ---------- */
.sm-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.sm-grid-3 { grid-template-columns: repeat(3, 1fr); }
.sm-grid-2 { grid-template-columns: repeat(2, 1fr); }
.sm-cell {
  aspect-ratio: 1 / 1;
  display: flex; align-items: center; justify-content: center;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--soft);
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms ease, border-color 150ms ease, transform 160ms var(--ease-out);
}
.sm-cell:active { transform: scale(0.94); }
.sm-cell-wide { aspect-ratio: 2.2 / 1; }
.sm-thumb { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.sm-emoji { font-size: 26px; line-height: 1; }
.sm-cell-skeleton { aspect-ratio: 1 / 1; }
.sm-cell-style { flex-direction: column; gap: 2px; aspect-ratio: auto; padding: 12px 8px; }
.sm-style-sample { font-size: 1.3rem; line-height: 1.1; color: var(--ink); }
.sm-cell-caption { font-size: 0.78rem; font-weight: 600; color: var(--muted); }

.sm-empty-state { padding: 18px 14px; font-size: 0.85rem; }

/* ---------- font cards in the Text drawer ---------- */
.sm-font-cards { display: grid; grid-template-columns: 1fr; gap: 6px; }
.sm-font-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #ffffff;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 150ms ease, background-color 150ms ease, transform 160ms var(--ease-out);
}
.sm-font-card:active { transform: scale(0.97); }
.sm-font-card-sample {
  font-size: 1.35rem; line-height: 1.2; color: var(--ink);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sm-font-card-name { font-size: 0.72rem; font-weight: 600; color: var(--muted); }

/* ---------- draw tool ---------- */
.sm-brushes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.sm-brush {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #ffffff;
  color: var(--muted);
  font-size: 0.75rem; font-weight: 700;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease, transform 160ms var(--ease-out);
}
.sm-brush.active { color: var(--brand); border-color: var(--brand); background: var(--brand-tint); }
.sm-brush:active { transform: scale(0.96); }

/* Round swatches with a ring when picked */
.sm-swatches { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.sm-swatch {
  position: relative;
  width: 100%; aspect-ratio: 1 / 1;
  border: 1px solid rgba(20, 23, 43, 0.12);
  border-radius: 999px;
  padding: 0;
  transition: transform 160ms var(--ease-out), box-shadow 150ms ease;
}
.sm-swatch.active { box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px var(--brand); }
.sm-swatch:active { transform: scale(0.9); }
.sm-swatch-custom {
  display: flex; align-items: center; justify-content: center;
  margin: 0;
  color: var(--muted);
  background: conic-gradient(#f04438, #f79009, #fdffb6, #12b76a, #0ea5e9, #7a5af8, #f04438);
  cursor: pointer;
}
.sm-swatch-custom :deep(svg) { color: #ffffff; filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.5)); }
/* The real colour input sits invisibly on top, so the round button opens the picker */
.sm-swatch-custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }

/* ---------- slider ---------- */
/* WHY a custom slider: the browser one looks different on every device. --fill is set
   from the template so the part left of the thumb is brand blue. */
.sm-range {
  --fill: 50%;
  width: 100%;
  height: 22px;
  margin: 0;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
.sm-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--brand) var(--fill), var(--line) var(--fill));
}
.sm-range::-moz-range-track { height: 6px; border-radius: 999px; background: var(--line); }
.sm-range::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--brand); }
.sm-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px;
  margin-top: -6px;
  border: 3px solid #ffffff;
  border-radius: 999px;
  background: var(--brand);
  box-shadow: 0 1px 4px rgba(20, 23, 43, 0.3);
  transition: transform 160ms var(--ease-out);
}
.sm-range::-moz-range-thumb {
  width: 12px; height: 12px;
  border: 3px solid #ffffff;
  border-radius: 999px;
  background: var(--brand);
  box-shadow: 0 1px 4px rgba(20, 23, 43, 0.3);
}
.sm-range:active::-webkit-slider-thumb { transform: scale(1.15); }
.sm-range:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; border-radius: 999px; }

/* ---------- segmented controls stretched to full width ---------- */
.sm-seg-block { display: flex; width: 100%; }
.sm-seg-block .seg-tab { flex: 1; justify-content: center; padding: 6px 8px; font-size: 0.82rem; }
.seg-tab:disabled { opacity: 0.45; cursor: not-allowed; }

.sm-btn-row { display: flex; flex-wrap: wrap; gap: 6px; }
.sm-btn-row .btn { flex: 1 1 auto; }

/* ---------- live stickers ---------- */
.sm-cell-live { flex-direction: column; gap: 6px; aspect-ratio: auto; padding: 12px 8px 8px; }
.sm-cell-live .sm-thumb { height: 40px; }
.sm-toggles { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 0.85rem; }
.sm-toggles .form-check { margin: 0; }
.sm-city { font-size: 16px; } /* 16px so iPhones do not zoom in */
.sm-live-note {
  display: flex; align-items: center; gap: 6px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 0.85rem; font-weight: 600;
  color: var(--brand);
  background: var(--brand-tint);
}
.sm-btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

/* ---------- upload ---------- */
.sm-drop {
  width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 24px 16px;
  border: 1.5px dashed #D6DAE4;
  border-radius: 16px;
  background: #FBFCFE;
  transition: border-color 150ms ease, background-color 150ms ease, transform 160ms var(--ease-out);
}
.sm-drop:active { transform: scale(0.98); }
.sm-drop-title { font-weight: 700; color: var(--ink); }

/* ---------- canvas stage: a dotted cutting mat ---------- */
.sm-main { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--sm-gap); }
.sm-stage {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--line);
  border-radius: 20px;
  background-color: #FBFCFE;
  background-image: radial-gradient(circle, #D6DAE4 1px, transparent 1.2px);
  background-size: 18px 18px;
  overflow: hidden;
}
.sm-stage-pill {
  position: absolute; top: 12px;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  font-size: 0.75rem; font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.sm-stage-tag { left: 12px; }
.sm-stage-zoom { right: 12px; }

/* WHY overflow visible: the rotate handle sits above the layer, and clipping it
   would make a layer at the top edge impossible to rotate.
   WHY a checkerboard: the saved sticker is transparent, and this shows it honestly. */
.sm-canvas {
  position: relative;
  border-radius: 6px;
  background-color: #ffffff;
  background-image:
    linear-gradient(45deg, #F4F6FA 25%, transparent 25%),
    linear-gradient(-45deg, #F4F6FA 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #F4F6FA 75%),
    linear-gradient(-45deg, transparent 75%, #F4F6FA 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.06), 0 12px 32px rgba(20, 23, 43, 0.1);
  touch-action: none;
  overflow: visible;
}
.sm-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4px;
  padding: 16px;
  font-size: 0.85rem;
  color: var(--muted);
  text-align: center;
  pointer-events: none;
}
.sm-empty-tile {
  display: flex; align-items: center; justify-content: center;
  width: 48px; height: 48px;
  margin-bottom: 6px;
  border-radius: 14px;
  color: var(--brand);
  background: var(--brand-tint);
  transform: rotate(-4deg);
}
.sm-empty-title { font-size: 1rem; font-weight: 700; color: var(--ink); }

/* ---------- layers on the canvas ---------- */
.sm-layer { position: absolute; cursor: grab; user-select: none; touch-action: none; }
.sm-layer:active { cursor: grabbing; }
.sm-layer-img { display: block; width: 100%; height: 100%; pointer-events: none; }
.sm-text { line-height: 1.2; white-space: pre-wrap; word-break: break-word; min-height: 1.2em; }
.sm-text-view { text-shadow: 0 0 2px rgba(0, 0, 0, 0.45); }
.sm-text-edit { outline: none; cursor: text; caret-color: var(--brand); text-shadow: 0 0 2px rgba(0, 0, 0, 0.45); }
.sm-text.is-emoji .sm-text-view { text-shadow: none; }
.sm-layer.is-selected { outline: 1.5px solid var(--brand); outline-offset: 2px; border-radius: 4px; }

/* Round handles: easier to grab on a phone than tiny squares */
.sm-handle {
  position: absolute;
  width: 12px; height: 12px;
  border: 2px solid var(--brand);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(20, 23, 43, 0.2);
}
.sm-handle.nw { left: -8px; top: -8px; cursor: nwse-resize; }
.sm-handle.ne { right: -8px; top: -8px; cursor: nesw-resize; }
.sm-handle.se { right: -8px; bottom: -8px; cursor: nwse-resize; }
.sm-handle.sw { left: -8px; bottom: -8px; cursor: nesw-resize; }
.sm-rot-stem {
  position: absolute; left: 50%; top: -22px;
  width: 1.5px; height: 20px; margin-left: -0.75px;
  background: var(--brand);
}
.sm-rot {
  position: absolute; left: 50%; top: -34px; margin-left: -7px;
  width: 14px; height: 14px;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: var(--brand);
  box-shadow: 0 1px 3px rgba(20, 23, 43, 0.25);
  cursor: grab;
}

.sm-draw-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.sm-draw-overlay { position: absolute; inset: 0; z-index: 20; cursor: crosshair; touch-action: none; }

/* ---------- frame strip ---------- */
.sm-frames {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
}
.sm-frame-list {
  flex: 1 1 auto; min-width: 0;
  display: flex; align-items: flex-start; gap: 8px;
  overflow-x: auto;
  padding: 2px;
  scrollbar-width: thin;
}
.sm-frame-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
.sm-frame {
  position: relative;
  width: 60px; height: 60px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-out);
}
.sm-frame:active { transform: scale(0.95); }
.sm-frame.active { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-tint); }
.sm-frame-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.sm-frame-blank { display: block; width: 100%; height: 100%; background: var(--soft); }
.sm-frame-num {
  position: absolute; left: 4px; top: 4px;
  min-width: 18px; padding: 0 5px;
  border-radius: 999px;
  font-size: 0.68rem; font-weight: 700; line-height: 18px;
  color: #ffffff; background: rgba(20, 23, 43, 0.6);
  font-variant-numeric: tabular-nums;
}
.sm-frame.active .sm-frame-num { background: var(--brand); }
.sm-frame-add { display: flex; align-items: center; justify-content: center; color: var(--brand); border-style: dashed; }
.sm-frame-move { display: flex; gap: 2px; }
.sm-frame-move button {
  width: 26px; height: 20px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--ink);
  font-size: 0.9rem; line-height: 1;
}
.sm-frame-move button:disabled { opacity: 0.35; }
.sm-frame-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.sm-frame-speed { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.sm-frame-speed .sm-range { width: 110px; }
.sm-frame-fps { min-width: 44px; font-size: 0.85rem; font-weight: 600; font-variant-numeric: tabular-nums; }

/* ---------- properties ---------- */
.sm-textarea { resize: vertical; font-size: 16px; } /* 16px so iPhones do not zoom in */
.sm-rows { border-top: 1px solid var(--line); }
.sm-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.85rem;
}
.sm-row span:first-child { color: var(--muted); }
.sm-row span:last-child { font-weight: 600; font-variant-numeric: tabular-nums; }

.sm-font-list {
  max-height: 232px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  scrollbar-width: thin;
}
.sm-font-group {
  margin: 8px 8px 4px;
  font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted);
}
.sm-font-group:first-child { margin-top: 4px; }
.sm-font-item {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  transition: background-color 150ms ease, color 150ms ease;
}
.sm-font-item-name { font-size: 1.05rem; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sm-font-item-hint { font-size: 0.7rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; }
.sm-font-item.active { color: var(--brand); background: var(--brand-tint); }
.sm-font-item.active .sm-font-item-hint { color: var(--brand); }

.sm-layers { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--line); }
.sm-layer-list { display: flex; flex-direction: column; gap: 4px; }
.sm-layer-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 6px 6px 4px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease;
}
.sm-layer-row.active { border-color: var(--brand); background: var(--brand-tint); }
.sm-layer-row.drop-target { box-shadow: inset 0 2px 0 var(--brand); }
.sm-grip { width: 12px; height: 14px; color: var(--sm-faint); cursor: grab; }
.sm-layer-thumb {
  width: 30px; height: 30px;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 8px;
  background: var(--soft);
}
.sm-layer-icon {
  display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: 800; color: var(--muted);
}
.sm-layer-name {
  flex: 1; min-width: 0;
  font-size: 0.85rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sm-layer-row.active .sm-layer-name { color: var(--brand); font-weight: 600; }
.sm-row-del {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border: 0; border-radius: 8px;
  background: transparent;
  color: var(--sm-faint);
  transition: color 150ms ease, background-color 150ms ease;
}

.sm-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border: 0; border-radius: 999px;
  background: transparent; color: var(--muted);
  transition: background-color 150ms ease, color 150ms ease;
}

/* ---------- dialogs ---------- */
.sm-modal-backdrop {
  position: fixed; inset: 0; z-index: 1050;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  background: rgba(20, 23, 43, 0.4);
  animation: sm-fade 200ms ease;
}
.sm-modal {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  max-height: 90dvh;
  display: flex; flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(20, 23, 43, 0.18);
  overflow: hidden;
  animation: sm-pop 300ms var(--ease-out);
}
.sm-modal-head {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 10px;
  padding: 18px 20px 6px;
}
.sm-modal-tile {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border-radius: 10px;
  color: var(--brand);
  background: var(--brand-tint);
  flex-shrink: 0;
}
.sm-modal-title { flex: 1; margin: 0; font-size: 1.15rem; font-weight: 700; text-wrap: balance; }
.sm-modal-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px 20px 20px; }
.sm-modal-body .form-control { font-size: 16px; }
.sm-modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.sm-suffix { background: var(--soft); color: var(--muted); border-color: var(--line); }

.sm-dl-top { display: flex; gap: 16px; }
.sm-dl-preview {
  flex-shrink: 0;
  width: 112px; height: 112px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #ffffff;
  overflow: hidden;
}
.sm-dl-preview.is-clear {
  background-image:
    linear-gradient(45deg, #E3E6EE 25%, transparent 25%),
    linear-gradient(-45deg, #E3E6EE 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #E3E6EE 75%),
    linear-gradient(-45deg, transparent 75%, #E3E6EE 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0;
}
.sm-dl-preview img { max-width: 100%; max-height: 100%; display: block; }
.sm-dl-fields { flex: 1; min-width: 0; }

.sm-folder { display: flex; align-items: center; gap: 3px; }
.sm-folder-input { width: 130px; }
.sm-mini {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--muted);
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease;
}

/* ---------- toast ---------- */
.sm-toast {
  position: fixed; left: 50%; bottom: 20px; z-index: 1060;
  max-width: calc(100vw - 32px);
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 0.875rem; font-weight: 600;
  color: #ffffff;
  background: var(--ink);
  box-shadow: 0 12px 32px rgba(20, 23, 43, 0.2);
  transform: translateX(-50%);
  animation: sm-toast-in 300ms var(--ease-out);
}
.sm-toast.is-warn { background: #A15C07; }
.sm-toast.is-bad { background: #C2262B; }

@keyframes sm-fade { from { opacity: 0; } }
@keyframes sm-pop { from { opacity: 0; transform: scale(0.96); } }
@keyframes sm-toast-in { from { opacity: 0; transform: translate(-50%, 12px); } }

/* ---------- focus: always visible for keyboard users ---------- */
.sm-rail-btn:focus-visible,
.sm-cell:focus-visible,
.sm-font-card:focus-visible,
.sm-font-item:focus-visible,
.sm-brush:focus-visible,
.sm-swatch:focus-visible,
.sm-swatch-custom:focus-within,
.sm-frame:focus-visible,
.sm-drop:focus-visible,
.sm-close:focus-visible,
.sm-mini:focus-visible,
.sm-row-del:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

/* ---------- hover: only with a mouse, so taps on phones do not stick ---------- */
@media (hover: hover) and (pointer: fine) {
  .sm-rail-btn:not(.active):hover { color: var(--ink); }
  .sm-rail-btn:not(.active):hover .sm-rail-tile { background: var(--soft); }
  .sm-cell:hover { border-color: var(--brand); background: var(--brand-tint); }
  .sm-font-card:hover { border-color: var(--brand); background: var(--brand-tint); }
  .sm-font-item:not(.active):hover { background: var(--soft); }
  .sm-brush:not(.active):hover { color: var(--ink); background: var(--soft); }
  .sm-drop:hover { border-color: var(--brand); background: var(--brand-tint); }
  .sm-layer-row:not(.active):hover { background: var(--soft); }
  .sm-row-del:hover { color: var(--danger); background: #FDE4E5; }
  .sm-close:hover { color: var(--ink); background: var(--soft); }
  .sm-mini:hover { color: var(--brand); border-color: var(--brand); }
  .sm-mini-danger:hover { color: var(--danger); border-color: var(--danger); background: #FDE4E5; }
  .sm-frame:not(.active):hover { border-color: #C9CEDB; }
}

/* ---------- phones and small tablets ---------- */
/* WHY: below 992px the two side panels become bottom sheets, so the canvas keeps
   the whole screen and you never have to scroll to reach it. */
@media (max-width: 991.98px) {
  .sm-page {
    height: auto;
    min-height: calc(100vh - var(--sm-navbar));
    min-height: calc(100dvh - var(--sm-navbar));
    overflow: visible;
    padding: 8px;
    gap: 8px;
  }
  .sm-topbar { flex-wrap: wrap; }
  .sm-mode { order: 3; margin-left: 0; width: 100%; }
  .sm-mode .seg-tab { flex: 1; justify-content: center; }
  .sm-topbar-actions { margin-left: auto; }
  .sm-body { flex-direction: column; gap: 8px; }
  .sm-rail { width: 100%; flex-direction: row; padding: 4px; }
  .sm-rail-btn { flex: 1; }
  .sm-mobile-only { display: flex; }

  .sm-panel {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 1040;
    width: auto;
    max-height: 70vh;
    max-height: 70dvh;
    border-radius: 20px 20px 0 0;
    border-bottom: 0;
    box-shadow: 0 -12px 32px rgba(20, 23, 43, 0.12);
    transform: translateY(101%);
    transition: transform 300ms var(--ease-out);
  }
  .sm-panel.is-open { transform: translateY(0); }
  .sm-sheet-backdrop { position: fixed; inset: 0; z-index: 1030; background: rgba(20, 23, 43, 0.35); }

  .sm-stage { min-height: 62vh; min-height: 62dvh; }
  .sm-frames { flex-wrap: wrap; }
  .sm-frame-list { width: 100%; }
  .sm-frame-actions { flex-direction: row; }
  .sm-frame-speed { margin-left: auto; }
  .sm-dl-top { flex-direction: column; }
  .sm-dl-preview { width: 100%; height: 150px; }
}

/* Below ~400px: icon-only top buttons, and dialog buttons stack full width */
@media (max-width: 420px) {
  .sm-hide-xs { display: none; }
  .sm-action { width: 38px; height: 38px; padding: 0; }
  .sm-modal-actions .sm-action { width: auto; padding: 6px 12px; }
  .sm-modal-actions { flex-direction: column-reverse; }
  .sm-modal-actions .btn { width: 100%; }
  .sm-frame-speed { width: 100%; margin-left: 0; }
  .sm-frame-speed .sm-range { flex: 1; width: auto; }
  .sm-swatches { grid-template-columns: repeat(7, 1fr); gap: 6px; }
}

/* ---------- reduced motion: no movement, colour changes stay ---------- */
@media (prefers-reduced-motion: reduce) {
  .sm-rail-tile,
  .sm-cell,
  .sm-font-card,
  .sm-brush,
  .sm-swatch,
  .sm-drop,
  .sm-frame,
  .sm-range::-webkit-slider-thumb { transition: none; }
  .sm-rail-btn.active .sm-rail-tile,
  .sm-rail-btn:active .sm-rail-tile,
  .sm-cell:active,
  .sm-font-card:active,
  .sm-brush:active,
  .sm-swatch:active,
  .sm-drop:active,
  .sm-frame:active,
  .sm-range:active::-webkit-slider-thumb { transform: none; }
  .sm-panel { transition: none; }
  .sm-modal, .sm-toast { animation: sm-fade 200ms ease; }
}
</style>
