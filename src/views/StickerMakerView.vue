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
import { svgColors, recolorSvgUrl, matchesArt, STICKERS, SHAPES, TAPES, EMOJI, FONTS, FONT_GROUPS_READY, loadArtFonts } from '../stickerArt.js'
// Background removal goes through our server function, so the remove.bg key stays secret.
import { removeBackground } from '../removeBackground.js'
// The design guide says never use window.confirm(): it cannot be styled and some phones block it.
import { askConfirm, askText } from '../composables/useDialog.js'
// The Frame Editor's rulers and guides, so both editors measure the same way
import CanvasRulerOverlay from '../components/CanvasRulerOverlay.vue'
import GuideTips from '../components/GuideTips.vue'
// "Your uploads", shared with the Frame Editor (kept in this browser)
import { loadUploads, saveUpload, removeUpload, fileToUpload, UPLOAD_TYPES } from '../uploadsStore.js'
// The layers of saved stickers, so "My stickers" can open one again to keep editing it
import { saveStickerProject, loadStickerProject, stickerProjectIds, keepableFrames } from '../stickerProjects.js'
// The app's shared line icons, so this page matches every other page.
import AppIcon from '../components/AppIcon.vue'

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

// WHY: the browser only makes a web font available to <canvas> after it has loaded.
// Without this the first export after a page load draws the text in a fallback font.
// Only the fonts actually used on a layer are loaded, not all 29.
async function waitForFonts() {
  if (!document.fonts) return
  const wanted = new Set()
  for (const frame of frames.value) {
    for (const layer of frame.layers) {
      if (layer.type === 'text') wanted.add(textFont(layer, 56))
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
// Element search
// WHY a search box (like the Template Editor's): typing "heart" or "y2k" is quicker than
// scrolling. It matches the name and the tags ('Y2K', 'Doodles'...) of each item.
// ----
const artQuery = ref('')

function byTag(list) {
  return list.filter((item) => matchesArt(item, artQuery.value)) // name, search words and tags (stickerArt.js)
}

// One entry per section of the Stickers drawer, so the template is a single loop.
const artSections = computed(() => [
  { id: 'stickers', title: 'Stickers', items: byTag(STICKERS) },
  { id: 'shapes', title: 'Cute shapes', items: byTag(SHAPES) },
  { id: 'tapes', title: 'Washi tape', items: byTag(TAPES) },
  { id: 'emoji', title: 'Emoji', items: byTag(EMOJI) },
].filter((section) => section.items.length > 0))

// ----
// Rulers and snapping, like the Template Editor
// ----
// Rulers: marks every 100px of the 1000px sticker along the top and the left, and a light grid.
// Snapping: while you drag, a layer's centre clicks onto the middle of the canvas, the
// thirds and the centre of the other layers, and a red line shows what it lined up with.
const showRulers = ref(false)
// Where the canvas sits in the grey area, for the rulers (the same component as the Frame Editor)
const rulerView = ref({ scale: 1, panX: 0, panY: 0 })
const rulerCursor = ref({ screenX: -100, screenY: -100, canvasX: 0, canvasY: 0 })
// Guides dragged out of the rulers: { id, type: 'horizontal' | 'vertical', pos } in pixels of the 1000px sticker
const guides = ref([])
const draggedGuide = ref(null)
const SNAP_DISTANCE = 1.2 // percent of the canvas: close enough to click into place
const snapLines = ref({ x: null, y: null }) // the red lines while dragging, in percent

function snapTargets(axis, movingId) {
  const targets = [50, 100 / 3, 200 / 3]
  // Your own guides too (stored in pixels of the 1000px sticker, so /10 for percent)
  for (const guide of guides.value) {
    if ((axis === 'x') === (guide.type === 'vertical')) targets.push(guide.pos / 10)
  }
  for (const layer of layers.value) {
    if (layer.id !== movingId && layer.type !== 'draw') targets.push(layer[axis])
  }
  return targets
}

function snap(value, axis, movingId) {
  let best = null
  for (const target of snapTargets(axis, movingId)) {
    if (Math.abs(target - value) <= SNAP_DISTANCE && (best === null || Math.abs(target - value) < Math.abs(best - value))) best = target
  }
  snapLines.value = { ...snapLines.value, [axis]: best }
  return best === null ? value : best
}

// The text bar's alignment button steps through these.
const ALIGNS = ['left', 'center', 'right']

// ----
// Long chip rows (sticker tags, folders)
// WHY: the rows scroll sideways with no scroll bar (design.md), so a chip at the edge was just cut off.
// Now a soft fade at an edge says "more this way", tapping a half-hidden chip slides it into the
// middle, and a mouse wheel scrolls the row sideways. Used as v-chip-scroll on the row.
// ----
const vChipScroll = {
  mounted(el) {
    // Which edges have more chips behind them (the CSS fades those edges)
    const update = () => {
      el.classList.toggle('more-left', el.scrollLeft > 2)
      el.classList.toggle('more-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    }
    // Tapping a chip centres it, so the ones next to it come into view too
    const onClick = (event) => {
      const chip = event.target.closest('.chip')
      if (!chip || !el.contains(chip)) return
      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ left: chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2, behavior: still ? 'auto' : 'smooth' })
    }
    // An up/down mouse wheel scrolls the row sideways, until it reaches the end (then the panel scrolls)
    const onWheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const atStart = el.scrollLeft <= 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('click', onClick)
    el.addEventListener('wheel', onWheel, { passive: false })
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (resize) resize.observe(el)
    el._chipScroll = { update, onClick, onWheel, resize }
    update()
  },
  updated(el) {
    if (el._chipScroll) el._chipScroll.update() // chips added or removed (e.g. a new folder)
  },
  unmounted(el) {
    const saved = el._chipScroll
    if (!saved) return
    el.removeEventListener('scroll', saved.update)
    el.removeEventListener('click', saved.onClick)
    el.removeEventListener('wheel', saved.onWheel)
    if (saved.resize) saved.resize.disconnect()
  },
}

// WHY check first: the screen colour picker (EyeDropper) only exists in Chrome and Edge on
// computers. Elsewhere its button is simply not shown.
const canPickFromScreen = typeof window !== 'undefined' && 'EyeDropper' in window

// WHY: most icons come from the app's AppIcon component (design.md). AppIcon has no
// "text", "sticker", "grip" or "sliders" icon, so those four stay as local paths here
// rather than editing a component the whole team shares.
const LOCAL_ICONS = {
  sticker: 'M4 4h11l5 5v11H4z M15 4v5h5 M8 15c1.4-1.6 3-1.6 4.4 0',
  text: 'M5 6h14 M12 6v13 M8.5 19h7',
  sliders: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M14 5v4 M8 15v4',
  grip: 'M4 8h16 M4 16h16',
  stop: 'M7 7h10v10H7z',
  alignLeft: 'M4 6h16 M4 12h10 M4 18h14',
  alignCenter: 'M4 6h16 M7 12h10 M5 18h14',
  alignRight: 'M4 6h16 M10 12h10 M6 18h14',
  pipette: 'M19 5a2.1 2.1 0 0 0-3 0l-2 2 3 3 2-2a2.1 2.1 0 0 0 0-3z M14 7l-9 9v3h3l9-9',
}

// icon: an AppIcon name; local: a LOCAL_ICONS name.
const TOOLS = [
  { id: 'stickers', label: 'Elements', local: 'sticker' },
  { id: 'text', label: 'Text', local: 'text' },
  { id: 'draw', label: 'Draw', icon: 'pen' },
  { id: 'upload', label: 'Upload', icon: 'upload' },
]

const BRUSHES = [
  { id: 'pen', label: 'Pen', icon: 'pen' },
  { id: 'highlighter', label: 'Highlighter', icon: 'highlighter' },
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
const drawerFolded = ref(false)  // laptop only: the tool panel is folded away to give the canvas room

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

const currentColor = ref('#101828')   // the drawing colour
// WHY a separate text colour: with one shared colour, picking red to draw also turned the
// next text box red. Now each tool remembers its own.
const textColor = ref('#101828')
const brush = ref('pen')         // 'pen' | 'highlighter'
const brushSize = ref(1.2)       // percent of the canvas width
const drawLayerId = ref(null)    // the drawing layer new strokes are added to

const myStickers = ref([])
const loadingMine = ref(false)
const activeFolder = ref('all')  // 'all' or a folder id

// Remove Background
// WHY: the properties panel's "Remove background" button calls this. It goes through
// our server function so the remove.bg key stays secret, then swaps the layer's
// picture for the cut-out one.
// Remove background works on uploaded photos and on still stickers saved in My Studio.
// Not on the built-in stickers (already see-through drawings that remove.bg cannot read)
// or on anything already cut out.
const canCutOut = computed(() => {
  const layer = selectedLayer.value
  return !!layer && layer.type === 'image' && !layer.cutOut
    && (layer.source === 'photo' || layer.source === 'saved')
})

async function cutOutBackground(layer) {
  errorMessage.value = ''
  removingBg.value = true
  try {
    // Turn the layer's picture back into a Blob. This works for a photo (blob: link)
    // and a saved sticker (https link), so one function covers both.
    const original = await (await fetch(layer.url)).blob()
    const cutOut = await removeBackground(original)

    const url = tempUrl(cutOut)
    let img
    try {
      img = await loadImage(url)
    } catch (error) {
      throw new Error('The cut-out picture came back broken. Please try again.')
    }
    snapshot() // so Undo brings the original photo back
    layer.url = url
    layer.ratio = img.naturalHeight / img.naturalWidth // keep the shape correct
    layer.name = layer.name + ' (cut out)'
    // WHY: hides the button after a successful cut-out, so a second click does not spend
    // another remove.bg credit on a picture that has no background left.
    layer.cutOut = true
    showToast('Background removed. Undo brings it back.')
  } catch (error) {
    errorMessage.value = error.message || 'Could not remove the background.'
  } finally {
    removingBg.value = false // always re-enable the button
  }
}

// Save to My Studio pop-up
const showSave = ref(false)
// The sticker's name: shown in the top bar and filled in when you save (you can change it there too)
// Empty at the start: the box shows "Untitled" in grey, so it is clear the sticker has no name yet
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
const dlName = ref('untitled')
const dlBg = ref('white')        // 'white' | 'clear'
const dlFormat = ref('photo')    // 'photo' | 'gif'
const downloading = ref(false)
const previewUrl = ref('')       // a small PNG of the active frame, drawn by the export code
const previewFailed = ref(false) // the preview could not be drawn (the dialog says so instead of spinning)

const errorMessage = ref('')
const toastText = ref('')
const toastType = ref('ok')
let toastTimer = null

// WHY: errorMessage is only printed inside the Download and Save dialogs. A problem in the
// editor itself (remove background, upload, copy, loading stickers) used to be set and never
// seen. When no dialog is open, the message pops up as a red toast instead.
watch(errorMessage, (message) => {
  if (!message || dlOpen.value || showSave.value) return
  showToast(message, 'bad')
  errorMessage.value = '' // so it does not reappear later inside a dialog
})

const removingBg = ref(false)


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

// WHY decode(): Safari on iPhone can say an SVG has loaded before it is ready to draw, so
// the canvas (download preview, saved file) came out blank. decode() waits until it is.
async function loadImage(url) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image'))
    image.src = url
  })
  if (img.decode) {
    try {
      await img.decode()
    } catch (error) {
      // Some browsers refuse to decode an SVG but can still draw it, so carry on.
    }
  }
  return img
}

function showToast(text, type = 'ok') {
  toastText.value = text
  toastType.value = type
  clearTimeout(toastTimer)
  // Problems stay up longer: they usually say what to do next, which takes longer to read.
  toastTimer = setTimeout(() => { toastText.value = '' }, type === 'ok' ? 3000 : 6000)
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
  if (layer.type === 'image') return layer.source === 'photo' ? 'Photo' : 'Element'
  return 'Drawing'
})

// The text box the text tools act on (not an emoji, which is text too but has no font).
const selectedText = computed(() => {
  const layer = selectedLayer.value
  return layer && layer.type === 'text' && !layer.emoji ? layer : null
})

// Clicking a font: restyle the selected text box, or start a new one in that font.
function pickFont(font) {
  if (selectedText.value) {
    snapshot()
    selectedText.value.font = font.name
    // On a phone the sheet hides the canvas, so it closes to show the new font.
    closeSheetOnPhone()
    return
  }
  addText(font)
}

// ----
// Text style: bold, italic, underline, alignment and colour (the bar above the canvas)
// ----

function toggleTextStyle(key) {
  const layer = selectedText.value
  if (!layer) return
  snapshot()
  if (key === 'bold') layer.weight = layer.weight >= 600 ? 400 : 700
  else layer[key] = !layer[key] // 'italic', 'underline', 'strike' or 'caps'
}

// The words as they are drawn: ALL CAPS when the aA button is on
function shownText(layer) {
  const text = layer.text || ''
  return layer.caps ? text.toUpperCase() : text
}

// ----
// Curved text (an arch), the same idea as the Template Editor's Curve slider
// ----
// curve: -100 to 100. 0 is straight, 100 bends the words over half a circle (an arch, ∩),
// -100 bends them under (a smile, ∪). One line only: curved text does not wrap.
// The letters are placed one by one along the circle, the same way on screen and in the
// download, so what you see is what you get.
let measureCtx = null
const fontsVersion = ref(0) // goes up when a web font finishes loading, so curves are measured again

function curvedLetters(layer, fontPx) {
  void fontsVersion.value // re-measure when fonts arrive
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  return placeLetters(measureCtx, layer, fontPx)
}

// ctx: any 2D canvas context (it is only used to measure). Returns each letter's centre
// (x, y, in pixels, from the middle of the words) and its angle in degrees.
function placeLetters(ctx, layer, fontPx) {
  ctx.font = textFont(layer, fontPx)
  const spacing = ((layer.spacing || 0) / 100) * fontPx
  const letters = Array.from(shownText(layer).replace(/\n/g, ' '))
  const widths = letters.map((letter) => ctx.measureText(letter).width + spacing)
  const total = widths.reduce((sum, width) => sum + width, 0) || 1
  const sweep = (Math.abs(layer.curve || 0) / 100) * Math.PI // the angle the words cover
  const radius = total / Math.max(sweep, 0.0001)
  const up = (layer.curve || 0) > 0
  // How far the ends drop below (or rise above) the middle: half of it moves the whole arch
  // up or down, so it stays centred on its spot.
  const sag = radius * (1 - Math.cos(sweep / 2))
  let along = 0
  return letters.map((letter, i) => {
    const middle = along + widths[i] / 2
    along += widths[i]
    const angle = (middle - total / 2) / radius
    const x = radius * Math.sin(angle)
    const drop = radius * (1 - Math.cos(angle))
    return {
      letter: letter,
      x: x,
      y: up ? drop - sag / 2 : sag / 2 - drop,
      rotate: ((up ? angle : -angle) * 180) / Math.PI,
    }
  })
}

// The CSS / canvas font of a text layer at a size in pixels
function textFont(layer, fontPx) {
  return (layer.italic ? 'italic ' : '') + (layer.weight || 400) + ' ' + fontPx + 'px ' + fontStack(layer.font)
}

// ----
// Right-click menu (long-press on a phone): the order of the layers, duplicate, lock, delete
// ----
// WHY a menu: four Arrange buttons took a whole row of the panel, and you only need them now
// and then. Right-clicking the thing you want to move is where people look for them.
const layerMenu = ref(null) // { id, x, y } or null
// Touch screens get "press and hold" in the hint instead of "right-click"
const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

function openLayerMenu(event, layer) {
  event.preventDefault()
  selectedId.value = layer.id
  editingId.value = null
  const menuWidth = 210
  const menuHeight = 290
  layerMenu.value = {
    id: layer.id,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
  }
}

function closeLayerMenu() {
  layerMenu.value = null
}

const menuLayer = computed(() => layerMenu.value && layers.value.find((layer) => layer.id === layerMenu.value.id))
const menuIndex = computed(() => (menuLayer.value ? layers.value.indexOf(menuLayer.value) : -1))

function fromMenu(action) {
  const layer = menuLayer.value
  closeLayerMenu()
  if (layer) action(layer)
}

// The bar over the canvas for a selected photo or sticker (like the Template Editor's)
const imageAdjustOpen = ref(false)
// Photos, stickers and emoji (emoji have no font, so they get this bar, not the text bar)
const selectedImage = computed(() => {
  const layer = selectedLayer.value
  return layer && (layer.type === 'image' || layer.emoji) ? layer : null
})
watch(selectedId, () => { imageAdjustOpen.value = false })

// Change the colours of a drawing (stickers, shapes, tape and SVG uploads), like the Frame
// Editor: each colour of the drawing is a swatch on the bar; pick one to change it.
const recolorTarget = ref(null) // the drawing's original colour being changed
const imageColors = computed(() => (selectedImage.value && selectedImage.value.svg ? svgColors(selectedImage.value.svg) : []))
watch(selectedId, () => { recolorTarget.value = null })

function shownColor(layer, original) {
  return (layer.colorMap && layer.colorMap[original]) || original
}

function recolor(original, color) {
  const layer = selectedImage.value
  if (!layer || !layer.svg) return
  snapshot()
  layer.colorMap = { ...(layer.colorMap || {}), [original]: color }
  layer.url = recolorSvgUrl(layer.svg, layer.colorMap)
}

// "#F472B6" from "#F472B6", "#FFF" -> "#FFFFFF", "#FFFF" (with alpha) -> "#FFFFFF", for <input type="color">
function hexOnly(color) {
  const c = String(color || '').trim()
  if (/^#[0-9a-f]{3,4}$/i.test(c)) return '#' + c.slice(1, 4).split('').map((ch) => ch + ch).join('')
  if (/^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7)
  return '#000000'
}

// A colour typed into its box: only a real colour code is used (#RGB or #RRGGBB)
function setHexColor(original, input) {
  let value = input.value.trim()
  if (value && !value.startsWith('#')) value = '#' + value
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) recolor(original, value.toUpperCase())
  else input.value = shownColor(selectedLayer.value, original).toUpperCase() // put the old one back
}

// Width and height in pixels of the 1000px download. The layer stores its width in percent
// and its shape as height / width (ratio), so a new height changes the ratio (it stretches).
function layerPx(layer) {
  const w = Math.round((layer.width / 100) * DOWNLOAD_SIZE)
  return { w, h: Math.round(w * layer.ratio) }
}

function setLayerPx(side, value) {
  const layer = selectedLayer.value
  const px = Math.max(10, Math.min(2000, Number(value) || 0))
  if (!layer || !px) return
  snapshot()
  const now = layerPx(layer)
  if (side === 'w') {
    layer.width = (px / DOWNLOAD_SIZE) * 100
    layer.ratio = now.h / px // keep the height, so only the width changes
  } else {
    layer.ratio = px / now.w
  }
}

function toggleRecolor(original) {
  imageAdjustOpen.value = false
  recolorTarget.value = recolorTarget.value === original ? null : original
}

// Centre the selected layer left to right ('x') or top to bottom ('y')
function centreLayer(axis) {
  if (!selectedLayer.value) return
  snapshot()
  selectedLayer.value[axis] = 50
}

function toggleFlip(key) {
  if (!selectedLayer.value) return
  snapshot()
  selectedLayer.value[key] = !selectedLayer.value[key]
}

// Hide: the layer stays in the list but is not shown, and not in the download
function toggleHidden(layer) {
  snapshot()
  layer.hidden = !layer.hidden
}

function toggleLock(layer) {
  snapshot()
  layer.locked = !layer.locked
}

// Long-press on a phone opens the same menu (phones have no right-click)
let pressTimer = null
function startLongPress(event, layer) {
  if (event.pointerType !== 'touch' || event.target.closest('.sm-grip-handle, button')) return
  cancelLongPress()
  const start = { x: event.clientX, y: event.clientY }
  pressTimer = setTimeout(() => {
    pressTimer = null
    endGesture() // the finger stays down, so the layer must not move under it
    openLayerMenu({ preventDefault() {}, clientX: start.x, clientY: start.y }, layer)
  }, 550)
}

function cancelLongPress() {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
}

// The text bar's pop-ups (colour, spacing, curve): one at a time, closed when the selection changes
const textPop = ref(null)
function toggleTextPop(name) {
  textPop.value = textPop.value === name ? null : name
}
watch(selectedId, () => { textPop.value = null })

// Size on the text bar, in pixels of the 1000px sticker (stored as a percent of the canvas)
function setTextSize(px) {
  if (!selectedText.value) return
  snapshot()
  selectedText.value.size = clamp((Number(px) || 100) / 10, 3, 40)
}
function stepTextSize(step) {
  if (!selectedText.value) return
  setTextSize(Math.round(selectedText.value.size * 10) + step * 10)
}

function cycleAlign() {
  const layer = selectedText.value
  if (!layer) return
  snapshot()
  layer.align = ALIGNS[(ALIGNS.indexOf(layer.align) + 1) % ALIGNS.length]
}

function pickTextColor(color) {
  textColor.value = color // new text boxes start in it too
  if (selectedText.value) {
    snapshot()
    selectedText.value.color = color
  }
}

// Pick any colour on the screen (Chrome and Edge on computers). Pressing Escape cancels,
// which the browser reports as an error, so that is ignored on purpose.
async function pickFromScreen(apply) {
  try {
    const result = await new window.EyeDropper().open()
    apply(result.sRGBHex)
  } catch (error) {
    // cancelled
  }
}

// Open the Text tool to choose a font for the selected text (the "Aa" on the text bar).
function openFonts() {
  tool.value = 'text'
  if (isPhone()) mobilePanel.value = 'drawer'
  else drawerFolded.value = false
}

// WHY: every text setting lives under the Text tool, so selecting a text box switches the
// side panel there (on a laptop you see its fonts straight away). On a phone this only
// moves the highlight in the tool bar; no sheet pops up over your text.
watch(selectedText, (layer) => {
  if (layer && tool.value !== 'text' && !drawing.value) tool.value = 'text'
})

// Every slider edit goes through here, so undo works the same for all of them.
function setProp(key, value) {
  if (selectedLayer.value) selectedLayer.value[key] = value
}

const currentToolLabel = computed(() => {
  const found = TOOLS.find((item) => item.id === tool.value)
  return found ? found.label : 'Tools'
})


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

// The width where the side panels turn into bottom sheets (the same as the CSS below).
function isPhone() {
  return window.innerWidth < 992
}

// WHY: on a phone the sheet covers half the canvas. Once you have picked what you came for
// (a sticker, a photo, a colour), it gets out of the way so you see the result straight away.
function closeSheetOnPhone() {
  if (isPhone()) mobilePanel.value = null
}

function pickTool(id) {
  // On a phone, tapping the open tool again closes its sheet.
  if (isPhone() && tool.value === id && mobilePanel.value === 'drawer') {
    mobilePanel.value = null
    return
  }
  // On a laptop, clicking the open tool again folds its panel away, so the canvas and the
  // GIF frame strip get the width. Clicking any tool opens it again.
  if (!isPhone()) {
    if (tool.value === id && !drawerFolded.value) {
      drawerFolded.value = true
      return
    }
    drawerFolded.value = false
  }
  tool.value = id
  editingId.value = null
  // Keep a selected text box selected when opening Text, so tapping a font restyles it.
  const keepText = id === 'text' && selectedLayer.value && selectedLayer.value.type === 'text' && !selectedLayer.value.emoji
  if (!keepText) selectedId.value = null
  // Load the user's saved stickers the first time the panel opens (accounts only).
  if (id === 'stickers' && isAccount.value && myStickers.value.length === 0) loadMine()
  // On a phone the drawer is a sheet, so opening a tool opens the sheet too.
  if (isPhone()) mobilePanel.value = 'drawer'
}

function toggleEditSheet() {
  mobilePanel.value = mobilePanel.value === 'props' ? null : 'props'
}

// ----
// GIF tips: three small pop-ups the first time someone opens GIF mode
// WHY: frames are new to most people. Each tip points at the button it explains, and the
// "?" on the frame strip shows them again. Remembered per browser (localStorage), so they
// do not come back every visit; if storage is blocked they just show again, which is fine.
// ----
// First-visit tips (and the "?" in the top bar): where everything is, instead of grey text
const guide = ref(null)
const EDITOR_TIPS = [
  { target: '.sm-rail', title: 'Add things', text: 'Elements, text, drawing and your own photos (PNG, JPEG, WebP or SVG) are all here.' },
  { target: '.sm-canvas', title: 'Your sticker', text: 'Drag to move, pull a corner to resize, use the dot on top to rotate. Tap twice on an empty spot to type.' },
  { target: '.sm-props', title: 'Settings and layers', text: 'Change what you picked here. Drag a layer by its lines to put it in front or behind. Right-click it (or press and hold) for more.' },
  { target: '.sm-topbar-center', title: 'Sticker or GIF', text: 'Switch to GIF to make it move. Rulers help you line things up.' },
  { target: '.sm-topbar-actions', title: 'Keep it', text: 'Download it, or save it to My Studio. My stickers opens one you saved, to keep editing it.' },
]

const GIF_TIPS = [
  { target: 'add', title: 'Frames', text: 'A GIF is a few pictures shown one after another. Each square here is one picture, called a frame. Tap + to add the next one.' },
  { target: 'duplicate', title: 'Duplicate', text: 'Duplicate copies the frame you are on. Then move or change a little, like a flip book, so it moves smoothly.' },
  { target: 'play', title: 'Play and speed', text: 'Press Play to watch it move. Drag Speed to make it faster or slower.' },
]
const GIF_TIPS_KEY = 'sm-gif-tips-seen'
const gifTipIndex = ref(-1)
const gifTip = computed(() => GIF_TIPS[gifTipIndex.value] || null)

function showGifTips() {
  gifTipIndex.value = 0
}

function nextGifTip() {
  if (gifTipIndex.value < GIF_TIPS.length - 1) gifTipIndex.value++
  else closeGifTips()
}

function closeGifTips() {
  gifTipIndex.value = -1
  try {
    localStorage.setItem(GIF_TIPS_KEY, '1')
  } catch (error) {
    // storage blocked: the tips will show again next time
  }
}

function seenGifTips() {
  try {
    return localStorage.getItem(GIF_TIPS_KEY) === '1'
  } catch (error) {
    return false
  }
}

function setMode(next) {
  mode.value = next
  if (next === 'sticker') {
    stopPlaying()
    gifTipIndex.value = -1
  } else if (!seenGifTips()) {
    showGifTips()
  }
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
  // Tape is long and thin (90 x 20), so it starts a little narrower than a sticker is wide.
  // At the same width it looked far bigger than the stickers next to it.
  const width = item.kind === 'tape' ? 24 : 30
  addImageLayer(item.url, item.name, item.ratio, width, 'sticker')
  // Keep the drawing itself, so its colours can be changed on the bar
  const layer = layers.value[layers.value.length - 1]
  layer.svg = item.svg
  layer.colorMap = {}
  closeSheetOnPhone()
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
  closeSheetOnPhone()
}

function openFilePicker() {
  fileInput.value.click()
}

// Drag and drop: a photo dragged from the computer onto the Upload box (or the canvas) is added like an upload.
// dragDepth counts enter / leave, because moving over a child element fires a leave on its parent.
const dropActive = ref(false)
let dragDepth = 0

function isFileDrag(event) {
  return event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')
}

function onFileDragEnter(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth++
  dropActive.value = true
}

function onFileDragOver(event) {
  if (!isFileDrag(event)) return
  event.preventDefault() // without this the browser opens the photo instead of dropping it here
  event.dataTransfer.dropEffect = 'copy'
}

function onFileDragLeave(event) {
  if (!isFileDrag(event)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dropActive.value = false
}

async function onFileDrop(event) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth = 0
  dropActive.value = false
  // Dropped files go into "Your uploads" too, the same as choosing them
  const files = Array.from(event.dataTransfer.files || [])
  if (files.length) await uploadFiles(files)
}

// "Your uploads": every photo or SVG you upload is kept (in this browser, shared with the
// Frame Editor) and placed on the canvas. Tap one in the list to place it again.
const myUploads = ref([])
const uploadBusy = ref(false)

async function refreshUploads() {
  myUploads.value = await loadUploads()
}

async function uploadFiles(files) {
  errorMessage.value = ''
  uploadBusy.value = true
  for (const file of files) {
    try {
      const upload = await fileToUpload(file)
      myUploads.value.unshift(upload)
      await saveUpload(upload)
      await placeUpload(upload)
    } catch (error) {
      errorMessage.value = error.message
    }
  }
  uploadBusy.value = false
}

async function uploadPhoto(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = '' // so choosing the same file again still fires a change
  if (files.length) await uploadFiles(files)
}

async function placeUpload(upload) {
  try {
    const img = await loadImage(upload.dataUrl)
    // An SVG without a size has no natural shape, so read it from its viewBox
    const box = upload.isSvg && /viewBox="[\d.\s-]*?([\d.]+)[\s,]+([\d.]+)"/.exec(upload.svgContent || '')
    const ratio = box ? Number(box[2]) / Number(box[1]) : (img.naturalHeight / img.naturalWidth || 1)
    const fit = ratio <= 1 ? 80 : 80 / ratio
    addImageLayer(upload.dataUrl, upload.name, ratio, upload.isSvg ? Math.min(fit, 40) : fit)
    if (upload.isSvg) {
      const layer = layers.value[layers.value.length - 1]
      layer.svg = upload.svgContent
      layer.colorMap = {}
    }
    closeSheetOnPhone()
  } catch (error) {
    errorMessage.value = 'That image could not be opened.'
  }
}

async function deleteMyUpload(upload) {
  myUploads.value = myUploads.value.filter((item) => item.id !== upload.id)
  await removeUpload(upload.id)
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
    closeSheetOnPhone()
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
      align: 'center', color: textColor.value, rotation: 0,
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

// font: a font from the library, so clicking a font in the Text drawer starts a box already
// set in that font, with its sample word.
// at: where to put it ({ x, y } in percent), for a double-click on the canvas.
async function addText(font = null, at = null) {
  snapshot()
  const id = newId()
  layers.value.push({
    id: id,
    type: 'text',
    text: font ? font.preview : '',
    x: at ? at.x : 50,
    y: at ? at.y : 50,
    width: 70,             // percent of the canvas: the box the text wraps inside
    size: 10,              // bigger or smaller with the handles or the Size slider
    font: font ? font.name : APP_FONT,
    weight: 400,           // normal, so the B on the text bar starts off and bolds it
    italic: false,
    underline: false,
    align: 'center',
    color: textColor.value,
    rotation: 0,
  })
  selectedId.value = id
  // WHY on the canvas, on phones too: you type where the text will be, and see it in its
  // font while you type, instead of in a plain box in a pop-up.
  closeSheetOnPhone()
  await nextTick()
  startEditing(layers.value.find((layer) => layer.id === id))
}

// Double-click (double-tap on a phone) an empty spot on the canvas: a text box appears there.
// WHY counted by hand: phones do not send dblclick, so two quick taps close together are
// counted here, and the same code serves the mouse.
let lastCanvasTap = null
function onCanvasPointerDown(event) {
  if (drawing.value || playing.value) return
  const now = Date.now()
  const last = lastCanvasTap
  lastCanvasTap = { time: now, x: event.clientX, y: event.clientY }
  if (last && now - last.time < 400 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
    lastCanvasTap = null
    event.preventDefault()
    const [x, y] = pointInStage(event)
    addText(null, { x, y })
    return
  }
  // A single tap on empty canvas: finish typing and deselect.
  if (editingId.value) stopEditing()
  clearSelection()
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
  const layer = layers.value.find((item) => item.id === editingId.value)
  editingId.value = null
  // A box left empty would be an invisible layer, so it goes away.
  if (layer && !String(layer.text || '').trim()) {
    layers.value = layers.value.filter((item) => item.id !== layer.id)
    if (selectedId.value === layer.id) selectedId.value = null
  }
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

// ----
// "My stickers": open another of your saved stickers and keep editing it (like the Frame
// Editor's "My templates")
// ----
const myStickersOpen = ref(false)
const myStickersQuery = ref('')
const openStickerId = ref(null)       // the saved sticker on the canvas now, if any
const editableIds = ref(new Set())    // stickers whose layers are kept on this device

const shownMyStickers = computed(() => {
  const query = myStickersQuery.value.trim().toLowerCase()
  return myStickers.value.filter((sticker) => !sticker.saved && (!query || (sticker.name || '').toLowerCase().includes(query)))
})

async function openMyStickers() {
  myStickersOpen.value = true
  myStickersQuery.value = ''
  editableIds.value = await stickerProjectIds()
  if (isAccount.value && myStickers.value.length === 0 && !loadingMine.value) loadMine()
}

function hasWork() {
  return frames.value.some((frame) => frame.layers.length > 0)
}

// Start again with an empty canvas
async function newSticker() {
  if (hasWork() && !(await askConfirm({ title: 'Start a new sticker?', message: 'The sticker on the canvas will be cleared. Save it first if you want to keep it.', confirmLabel: 'Start new' }))) return
  stopPlaying()
  frames.value = [{ id: 'frame-1', layers: [] }]
  activeFrameId.value = 'frame-1'
  mode.value = 'sticker'
  selectedId.value = null
  undoStack.value = []
  redoStack.value = []
  stickerName.value = ''
  openStickerId.value = null
  myStickersOpen.value = false
  refreshThumbs()
}

async function editSavedSticker(sticker) {
  if (sticker.id === openStickerId.value) {
    myStickersOpen.value = false
    return
  }
  if (hasWork() && !(await askConfirm({ title: 'Open "' + sticker.name + '"?', message: 'The sticker on the canvas will be replaced. Save it first if you want to keep it.', confirmLabel: 'Open' }))) return
  errorMessage.value = ''
  try {
    stopPlaying()
    const project = await loadStickerProject(sticker.id)
    if (project && project.frames && project.frames.length) {
      // Every layer, as it was saved
      frames.value = project.frames
      mode.value = project.mode === 'gif' ? 'gif' : 'sticker'
      if (project.gifSpeed) gifSpeed.value = project.gifSpeed
    } else {
      // Only the finished picture is known (saved on another device, or before layers were kept)
      const response = await fetch(sticker.thumbUrl)
      if (!response.ok) throw new Error('Download failed')
      const url = tempUrl(await response.blob())
      const img = await loadImage(url)
      const ratio = img.naturalHeight / img.naturalWidth || 1
      const width = ratio <= 1 ? 90 : 90 / ratio
      frames.value = [{ id: 'frame-1', layers: [{ id: newId(), type: 'image', name: sticker.name, url, ratio, x: 50, y: 50, width, fitWidth: width, rotation: 0, source: sticker.kind === 'animated' ? 'sticker' : 'saved' }] }]
      mode.value = 'sticker'
    }
    activeFrameId.value = frames.value[0].id
    selectedId.value = null
    undoStack.value = []
    redoStack.value = []
    stickerName.value = sticker.name || ''
    openStickerId.value = sticker.id
    myStickersOpen.value = false
    refreshThumbs()
    showToast('Opened "' + sticker.name + '". Saving makes a new copy in My Studio.')
  } catch (error) {
    errorMessage.value = 'Could not open "' + sticker.name + '". Please try again.'
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
    const missing = items.length - myStickers.value.length
    if (missing > 0) {
      showToast(missing + (missing === 1 ? ' saved sticker' : ' saved stickers') + ' could not be loaded, so ' + (missing === 1 ? 'it is' : 'they are') + ' hidden.', 'warn')
    }
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
    if (!response.ok) throw new Error('Download failed') // fetch does not throw on a 403 or 404
    const blob = await response.blob()
    const url = tempUrl(blob)
    const img = await loadImage(url)
    // 'saved' lets you remove its background. Animated ones stay 'sticker': remove.bg would
    // keep only the first frame of the GIF.
    addImageLayer(url, sticker.name, img.naturalHeight / img.naturalWidth, 30, sticker.kind === 'animated' ? 'sticker' : 'saved')
    closeSheetOnPhone()
  } catch (error) {
    errorMessage.value = navigator.onLine === false
      ? 'No internet connection, so that sticker could not be added.'
      : 'Could not add that sticker. Ask Gabriel to check the Storage CORS settings.'
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
// Reordering the Layers list by dragging the grip
// WHY pointer events and not the browser's drag-and-drop: drag-and-drop does not work with
// a finger, so on phones the list could not be reordered at all.
// WHY move while dragging (not only on drop): the canvas restacks as you go and the layer
// stays selected, so you see which layer is moving and where it now sits.
// ----

const layerListEl = ref(null)
const draggingLayerId = ref(null)

// WHY listen on the window: the row moves in the list while you drag it, and a moved element
// stops receiving the finger's movements. The window always does (like moving a sticker).
function startRowDrag(event, layer) {
  event.preventDefault()
  snapshot() // one undo step for the whole drag
  selectedId.value = layer.id
  draggingLayerId.value = layer.id
  window.addEventListener('pointermove', moveRowDrag)
  window.addEventListener('pointerup', endRowDrag)
  window.addEventListener('pointercancel', endRowDrag)
}

function moveRowDrag(event) {
  if (!draggingLayerId.value || !layerListEl.value) return
  // The list is shown top layer first, so count the other rows whose middle is above the finger.
  const rows = [...layerListEl.value.querySelectorAll('.sm-layer-row')]
  let shownIndex = 0
  rows.forEach((row) => {
    if (row.dataset.id === draggingLayerId.value) return
    const box = row.getBoundingClientRect()
    if (event.clientY > box.top + box.height / 2) shownIndex++
  })
  const from = layers.value.findIndex((item) => item.id === draggingLayerId.value)
  const to = layers.value.length - 1 - shownIndex // back from "top first" to the layers order
  if (from === -1 || from === to) return
  const moved = layers.value.splice(from, 1)[0]
  layers.value.splice(to, 0, moved)
}

function endRowDrag() {
  draggingLayerId.value = null
  window.removeEventListener('pointermove', moveRowDrag)
  window.removeEventListener('pointerup', endRowDrag)
  window.removeEventListener('pointercancel', endRowDrag)
}

// ----
// Colours
// ----

// The drawing colour. Text has its own (pickTextColor), so drawing never recolours text.
function pickColor(color) {
  currentColor.value = color
}

// ----
// Moving, resizing and rotating on the canvas
// ----

// One object remembers the gesture in progress: 'move', 'resize' or 'rotate'.
let gesture = null
const rotatingId = ref(null) // the layer being turned: its angle shows above the rotate handle

function startGesture(event, layer, mode2) {
  // While typing, a drag on the text box must not move it.
  if (editingId.value === layer.id) return
  event.preventDefault() // stops the browser selecting text or dragging the image
  const wasSelected = selectedId.value === layer.id
  selectedId.value = layer.id
  closeLayerMenu()
  startLongPress(event, layer)
  // A locked layer can be picked (to unlock it from the menu) but not moved or resized
  if (layer.locked) {
    window.addEventListener('pointerup', cancelLongPress, { once: true })
    return
  }
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
    wasSelected: wasSelected,
  }
  if (mode2 === 'rotate') rotatingId.value = layer.id

  // Listen on the whole window so the gesture keeps working if the pointer leaves.
  window.addEventListener('pointermove', onGesture)
  window.addEventListener('pointerup', endGesture)
}

function onGesture(event) {
  if (!gesture) return
  const layer = layers.value.find((item) => item.id === gesture.id)
  if (!layer) return
  if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 6) cancelLongPress()

  if (gesture.mode === 'move') {
    // Pixels moved, turned into percentages of the canvas
    const movedX = ((event.clientX - gesture.startX) / gesture.rectWidth) * 100
    const movedY = ((event.clientY - gesture.startY) / gesture.rectHeight) * 100
    // Hold Alt to place freely without snapping
    layer.x = event.altKey ? clamp(gesture.originX + movedX, 0, 100) : snap(clamp(gesture.originX + movedX, 0, 100), 'x', layer.id)
    layer.y = event.altKey ? clamp(gesture.originY + movedY, 0, 100) : snap(clamp(gesture.originY + movedY, 0, 100), 'y', layer.id)
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

function endGesture(event) {
  cancelLongPress()
  rotatingId.value = null
  snapLines.value = { x: null, y: null }
  // WHY: phones have no double-click, so tapping text that is already selected (without
  // dragging it) starts typing, the same as double-clicking does with a mouse.
  if (gesture && event && gesture.mode === 'move' && gesture.wasSelected
      && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) {
    const layer = layers.value.find((item) => item.id === gesture.id)
    if (layer && layer.type === 'text' && !layer.emoji) startEditing(layer)
  }
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
  const width = brush.value === 'highlighter' ? brushSize.value * 3 : brushSize.value

  layer.strokes.push({
    brush: brush.value,
    color: currentColor.value,
    width: width,
    opacity: brush.value === 'highlighter' ? 0.4 : 1, // see-through, like a real highlighter
    // The second point is almost the same, so a single click still leaves a dot.
    points: [point, [point[0] + 0.01, point[1]]],
  })
  currentStroke = layer.strokes[layer.strokes.length - 1]
}

function moveStroke(event) {
  if (!currentStroke) return
  currentStroke.points.push(pointInStage(event))
}

function endStroke() {
  currentStroke = null
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

// A colour from the Draw sheet: on a phone the sheet closes so you can start drawing.
function pickDrawColor(color) {
  pickColor(color)
  closeSheetOnPhone()
}

// Leave drawing mode from the canvas toolbar (back to moving stickers around).
function finishDrawing() {
  tool.value = 'stickers'
  mobilePanel.value = null
}

// ----
// Stroke size: the long upside-down triangle beside the canvas
// WHY a triangle: wide at the top = thick line, thin at the bottom = fine line, so the shape
// says what it does without a label. Dragged with a finger or a mouse (pointer events).
// ----
const STROKE_MIN = 0.5
const STROKE_MAX = 5
const strokeEl = ref(null)

// Where the handle sits: 0% at the top (thickest) to 100% at the bottom (thinnest).
const strokeTop = computed(() => ((STROKE_MAX - brushSize.value) / (STROKE_MAX - STROKE_MIN)) * 100)

// The handle is a dot the size of the line you will draw, in your colour.
const strokeDot = computed(() => {
  const width = brush.value === 'highlighter' ? brushSize.value * 3 : brushSize.value
  return clamp((width / 100) * stageWidth.value, 6, 40)
})

function setStrokeFromPointer(event) {
  const rect = strokeEl.value.getBoundingClientRect()
  const share = clamp((event.clientY - rect.top) / rect.height, 0, 1)
  brushSize.value = Math.round((STROKE_MAX - share * (STROKE_MAX - STROKE_MIN)) * 10) / 10
}

function startStrokeDrag(event) {
  event.currentTarget.setPointerCapture(event.pointerId)
  setStrokeFromPointer(event)
}

function moveStrokeDrag(event) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) setStrokeFromPointer(event)
}

// Arrow keys for keyboard users (up = thicker).
function strokeKey(event) {
  const step = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1 }[event.key]
  if (!step) return
  event.preventDefault()
  brushSize.value = Math.round(clamp(brushSize.value + step, STROKE_MIN, STROKE_MAX) * 10) / 10
}

function clearDrawings() {
  snapshot()
  layers.value = layers.value.filter((item) => item.type !== 'draw')
  drawLayerId.value = null
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
    if (layer.hidden) continue
    ctx.save()

    if (layer.type === 'image') {
      const img = await loadImage(layer.url)
      const w = layer.width * k
      const h = w * layer.ratio
      ctx.globalAlpha = layer.opacity ?? 1
      ctx.translate(layer.x * k, layer.y * k)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
    } else if (layer.type === 'text') {
      const fontSize = layer.size * k
      const maxWidth = (layer.width || 70) * k
      ctx.globalAlpha = layer.opacity ?? 1
      ctx.translate(layer.x * k, layer.y * k)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.font = textFont(layer, fontSize)
      ctx.fillStyle = layer.color
      ctx.textAlign = layer.align || 'center'   // matches text-align in the preview
      ctx.textBaseline = 'middle'
      if (!layer.emoji) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)' // the same thin shadow as the preview
        ctx.shadowBlur = 2 * (S / EXPORT_SIZE)
      }
      // Curved text: each letter on its spot of the arch, worked out the same way as on screen
      if (layer.curve && !layer.emoji) {
        ctx.textAlign = 'center'
        for (const spot of placeLetters(ctx, layer, fontSize)) {
          ctx.save()
          ctx.translate(spot.x, spot.y)
          ctx.rotate((spot.rotate * Math.PI) / 180)
          ctx.fillText(spot.letter, 0, 0)
          ctx.restore()
        }
        ctx.restore()
        continue
      }
      // Letter spacing: newer browsers can space letters on a canvas; older ones draw them
      // at normal spacing, which is close enough
      if ('letterSpacing' in ctx) ctx.letterSpacing = ((layer.spacing || 0) / 100) * fontSize + 'px'
      const lines = wrapText(ctx, shownText(layer), maxWidth)
      const lineHeight = fontSize * (layer.lineHeight || 1.2)
      const startY = -((lines.length - 1) * lineHeight) / 2
      // Left-aligned text starts at the left edge of its box, right-aligned at the right.
      const startX = layer.align === 'left' ? -maxWidth / 2 : layer.align === 'right' ? maxWidth / 2 : 0
      lines.forEach((line, index) => ctx.fillText(line, startX, startY + index * lineHeight))
      // A canvas cannot underline text, so draw the line under each row by hand, where the
      // browser draws it on screen (just below the letters, about 1/16 of the size thick).
      // Strikethrough the same way, through the middle of the letters.
      const lineOffsets = [layer.underline && 0.42, layer.strike && 0.02].filter((offset) => offset !== false)
      for (const offset of lineOffsets) {
        lines.forEach((line, index) => {
          const lineWidth = ctx.measureText(line).width
          const left = layer.align === 'left' ? startX : layer.align === 'right' ? startX - lineWidth : startX - lineWidth / 2
          const thickness = Math.max(1, fontSize / 16)
          ctx.fillRect(left, startY + index * lineHeight + fontSize * offset, lineWidth, thickness)
        })
      }
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

// A small picture of the sticker, drawn by the same code that makes the file. For a GIF
// it is every frame, played at the chosen speed, so you see the animation before saving.
async function refreshPreview() {
  const background = dlBg.value === 'white' ? 'white' : 'transparent'
  previewFailed.value = false
  try {
    await waitForFonts() // otherwise the first preview shows text in a stand-in font
    if (dlFormat.value === 'gif') {
      await startPlaying(240, background)
    } else {
      stopPlaying()
      const canvas = await renderFrameCanvas(activeFrame.value, 240, background)
      previewUrl.value = canvas.toDataURL('image/png')
    }
  } catch (error) {
    previewUrl.value = ''
    previewFailed.value = true
  }
}

async function openDownload() {
  errorMessage.value = ''
  if (layers.value.length === 0) {
    showToast('Add a photo, text or drawing first.', 'warn')
    return
  }
  if (frames.value.length < 2 && dlFormat.value === 'gif') dlFormat.value = 'photo'
  // The file is named after the sticker: "Blue Studios" -> blue-studios
  dlName.value = stickerName.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled'
  stopPlaying() // the canvas preview and the dialog preview share one player
  previewUrl.value = ''
  dlOpen.value = true
  await nextTick()
  await refreshPreview()
}

// The background and the format both change the preview, so redraw it when they change.
watch([dlBg, dlFormat], () => {
  if (dlOpen.value) refreshPreview()
})

watch(dlOpen, (open) => {
  if (!open) stopPlaying()
})

// ----
// GIF preview
// WHY: the speed slider means nothing until you see it move. Every frame is drawn once
// (with the export code, so it matches the file), then a timer flips through them.
// Changing the speed while it plays restarts the timer at the new speed.
// ----

const playFrames = ref([])   // one image per frame, ready to show
const playIndex = ref(0)
const playing = ref(false)   // true while the canvas shows the animation
let playTimer = null

function startPlayTimer() {
  clearInterval(playTimer)
  playTimer = setInterval(() => {
    playIndex.value = (playIndex.value + 1) % playFrames.value.length
  }, Math.round(1000 / gifSpeed.value))
}

async function startPlaying(size, background) {
  const images = []
  for (const frame of frames.value) {
    const canvas = await renderFrameCanvas(frame, size, background)
    images.push(canvas.toDataURL('image/png'))
  }
  playFrames.value = images
  playIndex.value = 0
  startPlayTimer()
}

function stopPlaying() {
  clearInterval(playTimer)
  playTimer = null
  playing.value = false
  playFrames.value = []
}

// The Play button under the canvas.
async function togglePlay() {
  if (playing.value) {
    stopPlaying()
    return
  }
  if (frames.value.length < 2) {
    showToast('Add a second frame to see it move.', 'warn')
    return
  }
  selectedId.value = null
  editingId.value = null
  try {
    await waitForFonts()
    // The canvas is shown at stageWidth, so draw at that size (x2 for sharp phone screens).
    await startPlaying(Math.min(EXPORT_SIZE, Math.round(stageWidth.value * 2)), 'transparent')
    playing.value = true
  } catch (error) {
    stopPlaying()
    showToast('Could not play the preview. One of the pictures would not load.', 'bad')
  }
}

watch(gifSpeed, () => {
  if (playTimer) startPlayTimer()
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
  // No name yet: ask for one first (it can still be changed in the Save dialog)
  if (!stickerName.value.trim()) {
    const name = await askText({
      title: 'Name your sticker',
      message: 'Give it a name so you can find it in My Studio.',
      label: 'Name',
      placeholder: 'e.g. Main character energy',
      maxLength: 40,
      confirmLabel: 'Next',
      icon: 'save',
    })
    if (name === null || !name.trim()) return
    stickerName.value = name.trim()
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
      kind: animated ? 'animated' : 'static', // 'animated' is what My Studio expects for a GIF
      categories: publicCategories,
      image: blob,
    })

    // Step 2: add that ID to each of my chosen folders. The sticker is already safe at
    // this point, so a failure here only affects the folders.
    let folderFailed = false
    try {
      await addItemToFolders(stickerId, pickedFolders.value)
    } catch (error) {
      folderFailed = true
    }

    // Keep the layers too (on this device), so "My stickers" can open it again with every layer
    try {
      await saveStickerProject({ id: stickerId, name: name, mode: mode.value, gifSpeed: gifSpeed.value, frames: await keepableFrames(frames.value) })
      openStickerId.value = stickerId
    } catch (error) {
      console.warn('Could not keep the layers of the sticker:', error)
    }

    showSave.value = false
    pickedDefaults.value = []
    pickedFolders.value = []
    myStickers.value = []
    await loadMine() // reload so the new sticker shows up in its folder tabs
    showToast(folderFailed
      ? '"' + name + '" was saved, but it could not be added to your folders.'
      : '"' + name + '" was saved to My Studio.')
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
  if (playing.value && !dlOpen.value) stopPlaying() // the canvas preview would be out of date
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
    closeLayerMenu()
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

function onFontsLoaded() {
  fontsVersion.value++
}

// WHY: the canvas is square, so it must fit the smaller of the two sides of the grey
// area. The spare pixels leave room for the corner labels and a little breathing space.
// The top always keeps room for the text and drawing bars, so selecting text does not
// make the canvas jump. While drawing, the sides also keep room for the stroke triangle.
function measureStage() {
  const el = stageEl.value
  if (!el) return
  const box = el.getBoundingClientRect()
  const rulerRoom = showRulers.value ? 48 : 0 // the rulers take 24px on each of two sides
  const spareWidth = (drawing.value ? 104 : 56) + rulerRoom
  const spareHeight = 128 + rulerRoom
  stageWidth.value = Math.max(180, Math.floor(Math.min(box.width - spareWidth, box.height - spareHeight)))
  nextTick(measureRulers)
}
watch(drawing, () => nextTick(measureStage))
watch(showRulers, () => nextTick(measureStage))
// Uploads made in the Frame Editor show up here too
watch(tool, (name) => { if (name === 'upload') refreshUploads() })

// The rulers: where the canvas is inside the grey area, and how big
function measureRulers() {
  if (!stageEl.value || !canvasEl.value) return
  const stage = stageEl.value.getBoundingClientRect()
  const canvas = canvasEl.value.getBoundingClientRect()
  rulerView.value = { scale: canvas.width / DOWNLOAD_SIZE, panX: canvas.left - stage.left, panY: canvas.top - stage.top }
}

function onStageMove(event) {
  if (!showRulers.value || !stageEl.value) return
  const stage = stageEl.value.getBoundingClientRect()
  rulerCursor.value = { screenX: event.clientX - stage.left, screenY: event.clientY - stage.top, canvasX: 0, canvasY: 0 }
}

// Guides: drag one out of a ruler, drag it again to move it, drop it off the sticker to remove it
function guidePos(event, type) {
  const stage = stageEl.value.getBoundingClientRect()
  const view = rulerView.value
  return Math.round(type === 'vertical'
    ? (event.clientX - stage.left - view.panX) / view.scale
    : (event.clientY - stage.top - view.panY) / view.scale)
}

function startGuideDrag(type, event) {
  event.preventDefault()
  draggedGuide.value = { id: null, type: type, pos: guidePos(event, type) }
  window.addEventListener('pointermove', moveGuide)
  window.addEventListener('pointerup', dropGuide)
}

function startGuideMove(guide, event) {
  event.preventDefault()
  guides.value = guides.value.filter((item) => item.id !== guide.id)
  draggedGuide.value = { ...guide }
  window.addEventListener('pointermove', moveGuide)
  window.addEventListener('pointerup', dropGuide)
}

function moveGuide(event) {
  if (draggedGuide.value) draggedGuide.value = { ...draggedGuide.value, pos: guidePos(event, draggedGuide.value.type) }
}

function dropGuide() {
  const guide = draggedGuide.value
  if (guide && guide.pos >= 0 && guide.pos <= DOWNLOAD_SIZE) guides.value.push({ ...guide, id: guide.id || newId() })
  draggedGuide.value = null
  window.removeEventListener('pointermove', moveGuide)
  window.removeEventListener('pointerup', dropGuide)
}

function removeGuide(id) {
  guides.value = guides.value.filter((item) => item.id !== id)
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
  if (document.fonts) document.fonts.addEventListener('loadingdone', onFontsLoaded)
  refreshThumbs()
  refreshUploads()
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
  endRowDrag()
  dropGuide()
  clearTimeout(toastTimer)
  clearTimeout(thumbTimer)
  clearInterval(playTimer)
  window.removeEventListener('copy', onCopy)
  window.removeEventListener('cut', onCut)
  window.removeEventListener('paste', onPaste)
  if (document.fonts) document.fonts.removeEventListener('loadingdone', onFontsLoaded)
  cancelLongPress()
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
    fontStyle: layer.italic ? 'italic' : 'normal',
    textDecoration: [layer.underline && 'underline', layer.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    textTransform: layer.caps ? 'uppercase' : 'none',
    letterSpacing: (layer.spacing || 0) / 100 + 'em',
    lineHeight: layer.lineHeight || 1.2,
    textAlign: layer.align,
    color: layer.color,
    transform: 'translate(-50%, -50%) rotate(' + layer.rotation + 'deg)',
  }
}

// One letter of curved text, placed on its spot on the circle
function letterStyle(spot) {
  return { transform: 'translate(' + spot.x + 'px, ' + spot.y + 'px) translate(-50%, -50%) rotate(' + spot.rotate + 'deg)' }
}

// Curved text's box: one line, plus how far the ends of the arch reach up or down,
// so the selection box goes round all of it
function curvedHeight(layer) {
  const fontPx = screenFontPx(layer)
  const reach = Math.max(0, ...curvedLetters(layer, fontPx).map((spot) => Math.abs(spot.y)))
  return fontPx * 1.25 + reach * 2
}

// The text's size on screen in pixels (its size is stored as a percent of the canvas)
function screenFontPx(layer) {
  return (layer.size / 100) * stageWidth.value
}

// Opacity and flip go on the picture or words only, not the box, so the selection handles
// stay solid and the rotate handle stays on top.
function contentStyle(layer) {
  const flip = (layer.flipX ? ' scaleX(-1)' : '') + (layer.flipY ? ' scaleY(-1)' : '')
  return { opacity: layer.opacity ?? 1, transform: flip || null }
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
        <div class="sm-brand-text">
          <h1 class="sm-brand-title">Sticker Maker</h1>
        </div>
        <!-- The name: the same as the Template Editor's. Save to My Studio uses it. -->
        <input
          v-model="stickerName"
          class="sm-name"
          maxlength="40"
          placeholder="Untitled"
          title="Click to name the sticker"
          aria-label="Sticker name"
          @blur="stickerName = stickerName.trim()"
        />
      </div>

      <!-- In the middle: Sticker / GIF, and the rulers (the same place as the Frame Editor's) -->
      <div class="sm-topbar-center">
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

      <button
        type="button"
        class="sm-toggle"
        :class="{ active: showRulers }"
        :aria-pressed="showRulers"
        :title="showRulers ? 'Hide the rulers' : 'Show the rulers (drag from a ruler to add a guide)'"
        @click="showRulers = !showRulers"
      >
        <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path d="M3 8h18v8H3z M7 8v3 M11 8v4 M15 8v3 M19 8v4" /></svg>
        <span class="sm-hide-xs">Rulers</span>
      </button>
      </div>

      <div class="sm-topbar-actions">
        <button type="button" class="btn btn-outline-secondary sm-square" title="How it works" aria-label="How it works" @click="guide && guide.start()">?</button>
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
        <!-- My stickers: open another of your stickers and keep editing it -->
        <button type="button" class="btn btn-outline-secondary sm-action" title="My stickers: open another of your stickers" aria-label="My stickers" @click="openMyStickers">
          <AppIcon name="folder" :size="16" />
          <span class="sm-hide-xs sm-hide-lg">My stickers</span>
        </button>
        <button type="button" class="btn btn-outline-secondary sm-action" aria-label="Download" @click="openDownload">
          <AppIcon name="download" :size="16" />
          <span class="sm-hide-xs sm-hide-md">Download</span>
        </button>
        <button type="button" class="btn btn-primary sm-action" aria-label="Save to My Studio" @click="openSave">
          <AppIcon name="save" :size="16" />
          <span class="sm-hide-xs"><span class="sm-hide-md">Save to My Studio</span><span class="sm-show-md">Save</span></span>
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
          :class="{ active: tool === item.id && mobilePanel !== 'props', folded: tool === item.id && drawerFolded }"
          :title="tool === item.id && !drawerFolded ? 'Hide this panel' : item.label"
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
        <button
          type="button"
          class="sm-rail-btn sm-mobile-only"
          :class="{ active: mobilePanel === 'props', 'has-dot': selectedLayer && mobilePanel !== 'props' }"
          @click="toggleEditSheet"
        >
          <span class="sm-rail-tile">
            <svg viewBox="0 0 24 24" class="sm-local-icon"><path :d="LOCAL_ICONS.sliders" /></svg>
          </span>
          <span>Edit</span>
        </button>
      </nav>

      <!-- Drawer: the contents of the open tool -->
      <aside class="sm-panel sm-drawer sm-card" :class="{ 'is-open': mobilePanel === 'drawer', 'is-folded': drawerFolded }">
        <div class="sm-panel-head">
          <h2 class="sm-panel-title">{{ currentToolLabel }}</h2>
          <!-- Closes the sheet on a phone, folds the panel away on a laptop -->
          <button type="button" class="sm-close" aria-label="Hide this panel" title="Hide this panel" @click="isPhone() ? (mobilePanel = null) : (drawerFolded = true)">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="sm-panel-body">
          <!-- ---------- STICKERS ---------- -->
          <template v-if="tool === 'stickers'">
            <!-- Search: matches the names and tags of the shared library -->
            <div class="sm-search">
              <AppIcon name="search" :size="15" />
              <input
                v-model="artQuery"
                type="search"
                placeholder="Search stickers, shapes, washi…"
                aria-label="Search elements"
              />
              <button v-if="artQuery" type="button" class="sm-search-clear" aria-label="Clear search" @click="artQuery = ''">
                <AppIcon name="close" :size="13" />
              </button>
            </div>
            <p v-if="artSections.length === 0" class="sm-hint">Nothing matches "{{ artQuery }}".</p>

            <div v-for="section in artSections" :key="section.id" class="sm-section">
              <p class="sm-label">
                {{ section.title }}
                <span class="sm-count">{{ section.items.length }}</span>
              </p>
              <div class="sm-grid sm-art-grid" :class="{ 'sm-grid-2': section.id === 'tapes' }">
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
              <div v-else-if="loadingMine" class="sm-grid sm-grid-3 sm-art-grid" role="status" aria-label="Loading your stickers">
                <span v-for="n in 6" :key="n" class="skeleton sm-cell-skeleton"></span>
              </div>
              <div v-else-if="myStickers.length === 0" class="empty-state sm-empty-state">
                <span class="empty-icon"><AppIcon name="sparkle" :size="20" /></span>
                <span>Nothing saved yet. Make one and press "Save to My Studio".</span>
              </div>
              <template v-else>
                <!-- Folder tabs: "All" plus one per folder -->
                <div v-chip-scroll class="sm-chip-row" role="group" aria-label="Folders">
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
                <div v-else class="sm-grid sm-grid-3 sm-art-grid">
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
            <button type="button" class="btn btn-primary w-100 sm-action" @click="addText()">
              <AppIcon name="plus" :size="16" />
              <span>Add a text box</span>
            </button>

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
                  :class="{ active: selectedText && selectedText.font === font.name }"
                  :title="selectedText ? 'Change to ' + font.name : 'Add text in ' + font.name"
                  @pointerdown.prevent
                  @click="pickFont(font)"
                >
                  <span class="sm-font-card-sample" :style="{ fontFamily: font.stack }">{{ font.preview }}</span>
                  <span class="sm-font-card-name">{{ font.name }}</span>
                </button>
              </div>
            </div>
          </template>

          <!-- ---------- DRAW ---------- -->
          <template v-else-if="tool === 'draw'">
            <!-- Pick a colour to start. The pen, colours and stroke size are also on the canvas. -->
            <p class="sm-label">Pick a colour to start</p>
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
                @click="pickDrawColor(color)"
              ></button>
              <label class="sm-swatch sm-swatch-custom" title="Any colour">
                <input
                  type="color"
                  :value="currentColor"
                  aria-label="Any colour"
                  @change="pickDrawColor($event.target.value)"
                />
                <AppIcon name="plus" :size="14" />
              </label>
              <button
                v-if="canPickFromScreen"
                type="button"
                class="sm-swatch sm-pipette"
                title="Pick a colour from the screen"
                aria-label="Pick a colour from the screen"
                @click="pickFromScreen(pickDrawColor)"
              >
                <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path :d="LOCAL_ICONS.pipette" /></svg>
              </button>
            </div>

            <div class="sm-section sm-btn-row">
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="undoStroke">
                <AppIcon name="undo" :size="14" /> Last stroke
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="clearDrawings">
                <AppIcon name="eraser" :size="14" /> Clear all
              </button>
            </div>
          </template>

          <!-- ---------- UPLOAD (the same as the Frame Editor's Uploads) ---------- -->
          <template v-else-if="tool === 'upload'">
            <button
              type="button"
              class="sm-drop"
              :class="{ 'is-dragover': dropActive, 'is-busy': uploadBusy }"
              @click="openFilePicker"
              @dragenter="onFileDragEnter"
              @dragover="onFileDragOver"
              @dragleave="onFileDragLeave"
              @drop="onFileDrop"
            >
              <span class="empty-icon"><AppIcon name="upload" :size="20" /></span>
              <span class="sm-drop-title">{{ dropActive ? 'Drop to add them' : uploadBusy ? 'Adding…' : 'Choose or drop photos' }}</span>
            </button>
            <input
              ref="fileInput"
              type="file"
              class="d-none"
              multiple
              :accept="UPLOAD_TYPES"
              @change="uploadPhoto"
            />

            <div class="sm-section">
              <p class="sm-label">
                Your uploads
                <span class="sm-count">{{ myUploads.length }}</span>
              </p>
              <div v-if="myUploads.length" class="sm-grid sm-grid-3">
                <div v-for="upload in myUploads" :key="upload.id" class="sm-upload">
                  <button
                    type="button"
                    class="sm-cell"
                    :title="'Add ' + upload.name"
                    :aria-label="'Add ' + upload.name"
                    @click="placeUpload(upload)"
                  >
                    <img :src="upload.dataUrl" alt="" class="sm-thumb" draggable="false" />
                  </button>
                  <button type="button" class="sm-upload-del" title="Remove from your uploads" :aria-label="'Remove ' + upload.name" @click.stop="deleteMyUpload(upload)">
                    <AppIcon name="close" :size="12" />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </aside>

      <!-- ---------- CANVAS + FRAMES ---------- -->
      <main class="sm-main">
        <div
          ref="stageEl"
          class="sm-stage"
          :class="{ 'is-dragover': dropActive }"
          @dragenter="onFileDragEnter"
          @dragover="onFileDragOver"
          @dragleave="onFileDragLeave"
          @drop="onFileDrop"
          @pointermove="onStageMove"
        >
          <!-- Rulers and guides: the Frame Editor's. Only on screen, not in the download. -->
          <CanvasRulerOverlay
            :show-rulers="showRulers"
            :scale="rulerView.scale"
            :pan-x="rulerView.panX"
            :pan-y="rulerView.panY"
            :cursor-info="rulerCursor"
            :custom-guides="guides"
            :is-dragging-guide="!!draggedGuide"
            :dragged-guide="draggedGuide"
            :frame-width="DOWNLOAD_SIZE"
            :frame-height="DOWNLOAD_SIZE"
            @start-drag-guide="startGuideDrag"
            @start-move-guide="startGuideMove"
            @remove-guide="removeGuide"
            @toggle-rulers="showRulers = false"
          />
          <!-- Text bar: shows while a text box is selected. pointerdown.prevent on the buttons
               keeps you typing in the box while you press Bold or pick a colour. -->
          <div v-if="selectedText && !drawing && !playing" class="sm-drawbar" role="toolbar" aria-label="Text style">
            <div class="sm-drawbar-scroll">
            <button type="button" class="sm-drawbar-btn sm-textbar-font" title="Font" aria-label="Choose a font" @pointerdown.prevent @click="openFonts">
              <span :style="{ fontFamily: fontStack(selectedText.font) }">Aa</span>
            </button>
            <!-- Size in pixels of the 1000px sticker, the same as the Template Editor -->
            <div class="sm-textbar-size" title="Text size">
              <button type="button" class="sm-drawbar-btn" aria-label="Smaller" @pointerdown.prevent @click="stepTextSize(-1)">−</button>
              <input type="number" min="30" max="400" :value="Math.round(selectedText.size * 10)" aria-label="Text size" @change="setTextSize($event.target.value)" />
              <button type="button" class="sm-drawbar-btn" aria-label="Bigger" @pointerdown.prevent @click="stepTextSize(1)">+</button>
            </div>
            <span class="sm-drawbar-line" aria-hidden="true"></span>
            <button
              type="button"
              class="sm-drawbar-btn sm-textbar-letter"
              :class="{ active: selectedText.weight >= 600 }"
              :aria-pressed="selectedText.weight >= 600"
              aria-label="Bold"
              title="Bold"
              @pointerdown.prevent
              @click="toggleTextStyle('bold')"
            ><b>B</b></button>
            <button
              type="button"
              class="sm-drawbar-btn sm-textbar-letter"
              :class="{ active: selectedText.italic }"
              :aria-pressed="!!selectedText.italic"
              aria-label="Italic"
              title="Italic"
              @pointerdown.prevent
              @click="toggleTextStyle('italic')"
            ><i>I</i></button>
            <button
              type="button"
              class="sm-drawbar-btn sm-textbar-letter"
              :class="{ active: selectedText.underline }"
              :aria-pressed="!!selectedText.underline"
              aria-label="Underline"
              title="Underline"
              @pointerdown.prevent
              @click="toggleTextStyle('underline')"
            ><u>U</u></button>
            <button
              type="button"
              class="sm-drawbar-btn sm-textbar-letter"
              :class="{ active: selectedText.strike }"
              :aria-pressed="!!selectedText.strike"
              aria-label="Strikethrough"
              title="Strikethrough"
              @pointerdown.prevent
              @click="toggleTextStyle('strike')"
            ><s>S</s></button>
            <button
              type="button"
              class="sm-drawbar-btn sm-textbar-letter sm-textbar-caps"
              :class="{ active: selectedText.caps }"
              :aria-pressed="!!selectedText.caps"
              aria-label="All capitals"
              title="All capitals"
              @pointerdown.prevent
              @click="toggleTextStyle('caps')"
            >aA</button>
            <button
              type="button"
              class="sm-drawbar-btn"
              :aria-label="'Align: ' + selectedText.align"
              :title="'Align ' + selectedText.align + ' (tap to change)'"
              @pointerdown.prevent
              @click="cycleAlign"
            >
              <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true">
                <path :d="LOCAL_ICONS[selectedText.align === 'left' ? 'alignLeft' : selectedText.align === 'right' ? 'alignRight' : 'alignCenter']" />
              </svg>
            </button>
            <span class="sm-drawbar-line" aria-hidden="true"></span>
            <button
              type="button"
              class="sm-drawbar-btn"
              :class="{ active: textPop === 'color' }"
              title="Text colour"
              aria-label="Text colour"
              @pointerdown.prevent
              @click="toggleTextPop('color')"
            >
              <span class="sm-drawbar-swatch" :style="{ background: selectedText.color }"></span>
            </button>
            <button type="button" class="sm-drawbar-btn sm-drawbar-wide" :class="{ active: textPop === 'spacing' }" title="Letter and line spacing" @pointerdown.prevent @click="toggleTextPop('spacing')">Spacing</button>
            <button type="button" class="sm-drawbar-btn sm-drawbar-wide" :class="{ active: textPop === 'curve' || selectedText.curve }" title="Curve the text" @pointerdown.prevent @click="toggleTextPop('curve')">
              Curve<template v-if="selectedText.curve">&nbsp;{{ selectedText.curve }}%</template>
            </button>
            <button type="button" class="sm-drawbar-btn sm-drawbar-wide" :class="{ active: textPop === 'adjust' }" title="Opacity and rotation" @pointerdown.prevent @click="toggleTextPop('adjust')">Adjust</button>
            <span class="sm-drawbar-line" aria-hidden="true"></span>
            <button type="button" class="sm-drawbar-btn" title="Centre left to right" aria-label="Centre left to right" @pointerdown.prevent @click="centreLayer('x')"><svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path d="M12 2v20 M7 6h10v4H7z M9 14h6v4H9z" /></svg></button>
            <button type="button" class="sm-drawbar-btn" title="Centre top to bottom" aria-label="Centre top to bottom" @pointerdown.prevent @click="centreLayer('y')"><svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path d="M2 12h20 M6 7h4v10H6z M14 9h4v6h-4z" /></svg></button>
            </div>

            <!-- Pop-ups under the bar -->
            <div v-if="textPop === 'color'" class="sm-pop" @pointerdown.stop>
              <p class="sm-label">Text colour</p>
              <div class="sm-drawbar-colors sm-pop-colors">
                <button
                  v-for="color in [...SOLID_COLORS, ...PASTEL_COLORS]"
                  :key="color"
                  type="button"
                  class="sm-drawbar-swatch"
                  :class="{ active: selectedText.color === color }"
                  :style="{ background: color }"
                  :aria-label="'Text colour ' + color"
                  :aria-pressed="selectedText.color === color"
                  @pointerdown.prevent
                  @click="pickTextColor(color)"
                ></button>
                <label class="sm-drawbar-swatch sm-swatch-custom" title="Any colour">
                  <input type="color" :value="selectedText.color" aria-label="Any text colour" @change="pickTextColor($event.target.value)" />
                  <AppIcon name="plus" :size="12" />
                </label>
                <button
                  v-if="canPickFromScreen"
                  type="button"
                  class="sm-drawbar-swatch sm-pipette"
                  title="Pick a colour from the screen"
                  aria-label="Pick a colour from the screen"
                  @pointerdown.prevent
                  @click="pickFromScreen(pickTextColor)"
                >
                  <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path :d="LOCAL_ICONS.pipette" /></svg>
                </button>
              </div>
            </div>

            <div v-if="textPop === 'spacing'" class="sm-pop" @pointerdown.stop>
              <div>
                <p class="sm-label">Letter spacing <span class="sm-count">{{ selectedText.spacing || 0 }}</span></p>
                <input
                  type="range" class="sm-range" min="-10" max="60" step="1"
                  :value="selectedText.spacing || 0"
                  :style="{ '--fill': (((selectedText.spacing || 0) + 10) / 70) * 100 + '%' }"
                  aria-label="Letter spacing"
                  @pointerdown="snapshot"
                  @input="setProp('spacing', +$event.target.value)"
                />
              </div>
              <div>
                <p class="sm-label">Line spacing <span class="sm-count">{{ selectedText.lineHeight || 1.2 }}</span></p>
                <input
                  type="range" class="sm-range" min="0.8" max="2.5" step="0.05"
                  :value="selectedText.lineHeight || 1.2"
                  :style="{ '--fill': (((selectedText.lineHeight || 1.2) - 0.8) / 1.7) * 100 + '%' }"
                  aria-label="Line spacing"
                  @pointerdown="snapshot"
                  @input="setProp('lineHeight', +$event.target.value)"
                />
              </div>
            </div>

            <div v-if="textPop === 'curve'" class="sm-pop" @pointerdown.stop>
              <div>
                <p class="sm-label">Curve <span class="sm-count">{{ selectedText.curve ? selectedText.curve + '%' : 'Straight' }}</span></p>
                <input
                  type="range" class="sm-range" min="-100" max="100" step="1"
                  :value="selectedText.curve || 0"
                  :style="{ '--fill': (((selectedText.curve || 0) + 100) / 200) * 100 + '%' }"
                  aria-label="Curve"
                  @pointerdown="snapshot"
                  @input="setProp('curve', +$event.target.value)"
                />
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!selectedText.curve" @click="snapshot(); selectedText.curve = 0">Straighten</button>
            </div>

            <div v-if="textPop === 'adjust'" class="sm-pop" @pointerdown.stop>
              <div>
                <p class="sm-label">Opacity <span class="sm-count">{{ Math.round((selectedText.opacity ?? 1) * 100) }}%</span></p>
                <input
                  type="range" class="sm-range" min="0.1" max="1" step="0.05"
                  :value="selectedText.opacity ?? 1"
                  :style="{ '--fill': (((selectedText.opacity ?? 1) - 0.1) / 0.9) * 100 + '%' }"
                  aria-label="Opacity"
                  @pointerdown="snapshot"
                  @input="setProp('opacity', +$event.target.value)"
                />
              </div>
              <div>
                <p class="sm-label">Rotation <span class="sm-count">{{ Math.round(selectedText.rotation) }}°</span></p>
                <input
                  type="range" class="sm-range" min="-180" max="180" step="1"
                  :value="selectedText.rotation"
                  :style="{ '--fill': ((selectedText.rotation + 180) / 360) * 100 + '%' }"
                  aria-label="Rotation"
                  @pointerdown="snapshot"
                  @input="setProp('rotation', +$event.target.value)"
                />
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!selectedText.rotation" @click="snapshot(); selectedText.rotation = 0">Straighten (0°)</button>
            </div>
          </div>

          <span v-if="playing" class="sm-stage-pill sm-stage-zoom sm-stage-playing">Playing · tap to stop</span>

          <!-- Photo / sticker bar: opacity, rotation, flip and centring (like the Template Editor's) -->
          <div v-if="selectedImage && !drawing && !playing" class="sm-drawbar" role="toolbar" aria-label="Photo or sticker">
            <span class="sm-drawbar-title">{{ selectedImage.emoji ? 'Emoji ' + selectedImage.text : (selectedImage.name || selectedKind) }}</span>
            <template v-if="imageColors.length">
              <span class="sm-drawbar-line" aria-hidden="true"></span>
              <div class="sm-drawbar-colors">
                <button
                  v-for="original in imageColors"
                  :key="original"
                  type="button"
                  class="sm-drawbar-swatch"
                  :class="{ active: recolorTarget === original }"
                  :style="{ background: shownColor(selectedImage, original) }"
                  :title="'Change this colour (' + shownColor(selectedImage, original) + ')'"
                  :aria-label="'Change colour ' + shownColor(selectedImage, original)"
                  @click="toggleRecolor(original)"
                ></button>
              </div>
            </template>
            <span class="sm-drawbar-line" aria-hidden="true"></span>
            <button
              type="button"
              class="sm-drawbar-btn sm-drawbar-wide"
              :class="{ active: imageAdjustOpen }"
              :title="selectedImage.emoji ? 'Opacity and rotation' : 'Opacity, rotation and flip'"
              @click="recolorTarget = null; imageAdjustOpen = !imageAdjustOpen"
            >
              <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path :d="LOCAL_ICONS.sliders" /></svg>
              <span>Adjust</span>
            </button>
            <button type="button" class="sm-drawbar-btn" title="Centre left to right" aria-label="Centre left to right" @click="centreLayer('x')"><svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path d="M12 2v20 M7 6h10v4H7z M9 14h6v4H9z" /></svg></button>
            <button type="button" class="sm-drawbar-btn" title="Centre top to bottom" aria-label="Centre top to bottom" @click="centreLayer('y')"><svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path d="M2 12h20 M6 7h4v10H6z M14 9h4v6h-4z" /></svg></button>

            <div v-if="recolorTarget && selectedImage.svg" class="sm-pop" @pointerdown.stop>
              <p class="sm-label">Change colour</p>
              <div class="sm-drawbar-colors sm-pop-colors">
                <button
                  v-for="color in [...SOLID_COLORS, ...PASTEL_COLORS]"
                  :key="color"
                  type="button"
                  class="sm-drawbar-swatch"
                  :class="{ active: shownColor(selectedImage, recolorTarget).toLowerCase() === color }"
                  :style="{ background: color }"
                  :aria-label="'Colour ' + color"
                  @click="recolor(recolorTarget, color)"
                ></button>
                <label class="sm-drawbar-swatch sm-swatch-custom" title="Any colour">
                  <input type="color" :value="shownColor(selectedImage, recolorTarget).slice(0, 7)" aria-label="Any colour" @change="recolor(recolorTarget, $event.target.value)" />
                  <AppIcon name="plus" :size="12" />
                </label>
                <button
                  v-if="canPickFromScreen"
                  type="button"
                  class="sm-drawbar-swatch sm-pipette"
                  title="Pick a colour from the screen"
                  aria-label="Pick a colour from the screen"
                  @click="pickFromScreen((color) => recolor(recolorTarget, color))"
                >
                  <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path :d="LOCAL_ICONS.pipette" /></svg>
                </button>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="recolor(recolorTarget, recolorTarget)">Back to the original colour</button>
            </div>

            <div v-if="imageAdjustOpen" class="sm-pop" @pointerdown.stop>
              <div>
                <p class="sm-label">
                  Opacity
                  <span class="sm-count">{{ Math.round((selectedImage.opacity ?? 1) * 100) }}%</span>
                </p>
                <input
                  type="range"
                  class="sm-range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  :value="selectedImage.opacity ?? 1"
                  :style="{ '--fill': (((selectedImage.opacity ?? 1) - 0.1) / 0.9) * 100 + '%' }"
                  aria-label="Opacity"
                  @pointerdown="snapshot"
                  @input="setProp('opacity', +$event.target.value)"
                />
              </div>
              <div>
                <p class="sm-label">
                  Rotation
                  <span class="sm-count">{{ Math.round(selectedImage.rotation) }}°</span>
                </p>
                <input
                  type="range"
                  class="sm-range"
                  min="-180"
                  max="180"
                  step="1"
                  :value="selectedImage.rotation"
                  :style="{ '--fill': ((selectedImage.rotation + 180) / 360) * 100 + '%' }"
                  aria-label="Rotation"
                  @pointerdown="snapshot"
                  @input="setProp('rotation', +$event.target.value)"
                />
              </div>
              <div class="sm-btn-row">
                <button v-if="selectedImage.type === 'image'" type="button" class="btn btn-sm" :class="selectedImage.flipX ? 'btn-primary' : 'btn-outline-secondary'" :aria-pressed="!!selectedImage.flipX" @click="toggleFlip('flipX')">⇄ Flip</button>
                <button v-if="selectedImage.type === 'image'" type="button" class="btn btn-sm" :class="selectedImage.flipY ? 'btn-primary' : 'btn-outline-secondary'" :aria-pressed="!!selectedImage.flipY" @click="toggleFlip('flipY')">⇅ Flip</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!selectedImage.rotation" @click="snapshot(); selectedImage.rotation = 0">0°</button>
              </div>
            </div>
          </div>

          <!-- Drawing tools on the canvas itself: pen or highlighter, colours, undo, done -->
          <div v-if="drawing" class="sm-drawbar" role="toolbar" aria-label="Drawing tools">
            <button
              v-for="item in BRUSHES"
              :key="item.id"
              type="button"
              class="sm-drawbar-btn"
              :class="{ active: brush === item.id }"
              :aria-pressed="brush === item.id"
              :aria-label="item.label"
              :title="item.label"
              @click="brush = item.id"
            >
              <AppIcon :name="item.icon" :size="18" />
            </button>
            <!-- Colours here on phones only: on a laptop they are already in the Draw panel -->
            <span class="sm-drawbar-line sm-mobile-only" aria-hidden="true"></span>
            <div class="sm-drawbar-colors sm-mobile-only">
              <button
                v-for="color in [...SOLID_COLORS, ...PASTEL_COLORS]"
                :key="color"
                type="button"
                class="sm-drawbar-swatch"
                :class="{ active: currentColor === color }"
                :style="{ background: color }"
                :aria-label="'Colour ' + color"
                :aria-pressed="currentColor === color"
                @click="pickColor(color)"
              ></button>
              <label class="sm-drawbar-swatch sm-swatch-custom" title="Any colour">
                <input type="color" :value="currentColor" aria-label="Any colour" @input="pickColor($event.target.value)" />
                <AppIcon name="plus" :size="12" />
              </label>
              <button
                v-if="canPickFromScreen"
                type="button"
                class="sm-drawbar-swatch sm-pipette"
                title="Pick a colour from the screen"
                aria-label="Pick a colour from the screen"
                @click="pickFromScreen(pickColor)"
              >
                <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path :d="LOCAL_ICONS.pipette" /></svg>
              </button>
            </div>
            <span class="sm-drawbar-line" aria-hidden="true"></span>
            <button type="button" class="sm-drawbar-btn" aria-label="Undo last stroke" title="Undo last stroke" @click="undoStroke">
              <AppIcon name="undo" :size="18" />
            </button>
            <button type="button" class="sm-drawbar-done" @click="finishDrawing">Done</button>
          </div>

          <!-- Stroke size: drag up for thicker, down for thinner -->
          <div
            v-if="drawing"
            ref="strokeEl"
            class="sm-stroke"
            role="slider"
            tabindex="0"
            aria-label="Stroke size"
            aria-orientation="vertical"
            :aria-valuemin="STROKE_MIN"
            :aria-valuemax="STROKE_MAX"
            :aria-valuenow="brushSize"
            @pointerdown="startStrokeDrag"
            @pointermove="moveStrokeDrag"
            @keydown="strokeKey"
          >
            <svg class="sm-stroke-shape" viewBox="0 0 24 200" preserveAspectRatio="none" aria-hidden="true">
              <polygon points="1,1 23,1 12,199" />
            </svg>
            <span
              class="sm-stroke-dot"
              :style="{ top: strokeTop + '%', width: strokeDot + 'px', height: strokeDot + 'px', background: currentColor }"
            ></span>
          </div>

          <div
            ref="canvasEl"
            class="sm-canvas"
            :style="{ width: stageWidth + 'px', height: stageWidth + 'px' }"
            @pointerdown.self="onCanvasPointerDown"
          >
            <div v-if="layers.length === 0" class="sm-empty">
              <span class="sm-empty-tile"><AppIcon name="sparkle" :size="22" /></span>
              <span class="sm-empty-title">Your sticker starts here</span>
            </div>

            <!-- One element per layer. Later layers are drawn on top, because that is the list order. -->
            <!-- Hidden layers (the eye in the layers list) are left out -->
            <template v-for="item in layers.filter((layer) => !layer.hidden)" :key="item.id">
              <!-- PHOTO / STICKER -->
              <div
                v-if="item.type === 'image'"
                class="sm-layer"
                :class="{ 'is-selected': isSelected(item) }"
                :style="imageStyle(item)"
                @pointerdown.stop="startGesture($event, item, 'move')"
                @contextmenu="openLayerMenu($event, item)"
              >
                <img :src="item.url" :alt="item.name" class="sm-layer-img" :style="contentStyle(item)" draggable="false" />
                <template v-if="isSelected(item)">
                  <span class="sm-handle nw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle ne" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle se" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle sw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-rot-stem"></span>
                  <span class="sm-rot" title="Rotate (hold Shift to snap)" @pointerdown.stop.prevent="startGesture($event, item, 'rotate')"></span>
                  <span v-if="rotatingId === item.id" class="sm-rot-tip">{{ Math.round(item.rotation) }}°</span>
                  <!-- Small bar under the selected layer: duplicate, lock, delete (like the Template Editor) -->
                  <div class="sm-mini-bar" @pointerdown.stop>
                    <button type="button" class="sm-mini-btn" title="Duplicate (Ctrl+D)" aria-label="Duplicate" @click.stop="duplicateLayer(item)">
                      <AppIcon name="duplicate" :size="13" />
                    </button>
                    <button type="button" class="sm-mini-btn" :class="{ on: item.locked }" :title="item.locked ? 'Unlock' : 'Lock'" :aria-label="item.locked ? 'Unlock' : 'Lock'" @click.stop="toggleLock(item)">
                      <AppIcon :name="item.locked ? 'lock' : 'unlock'" :size="13" />
                    </button>
                    <button type="button" class="sm-mini-btn del" title="Delete (Del)" aria-label="Delete" @click.stop="deleteLayer(item)">
                      <AppIcon name="trash" :size="13" />
                    </button>
                  </div>
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
                @contextmenu="openLayerMenu($event, item)"
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
                <!-- Curved: one span per letter, placed along the arch -->
                <div
                  v-else-if="item.curve && !item.emoji"
                  class="sm-text-view sm-text-curved"
                  :style="[contentStyle(item), { height: curvedHeight(item) + 'px' }]"
                  :aria-label="item.text"
                >
                  <span
                    v-for="(spot, i) in curvedLetters(item, screenFontPx(item))"
                    :key="i"
                    class="sm-curve-letter"
                    aria-hidden="true"
                    :style="letterStyle(spot)"
                  >{{ spot.letter === ' ' ? ' ' : spot.letter }}</span>
                </div>
                <div v-else class="sm-text-view" :style="contentStyle(item)">{{ item.text || 'Text' }}</div>

                <template v-if="isSelected(item) && editingId !== item.id">
                  <span class="sm-handle nw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle ne" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle se" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-handle sw" @pointerdown.stop.prevent="startGesture($event, item, 'resize')"></span>
                  <span class="sm-rot-stem"></span>
                  <span class="sm-rot" title="Rotate (hold Shift to snap)" @pointerdown.stop.prevent="startGesture($event, item, 'rotate')"></span>
                  <span v-if="rotatingId === item.id" class="sm-rot-tip">{{ Math.round(item.rotation) }}°</span>
                  <!-- Small bar under the selected layer: duplicate, lock, delete (like the Template Editor) -->
                  <div class="sm-mini-bar" @pointerdown.stop>
                    <button type="button" class="sm-mini-btn" title="Duplicate (Ctrl+D)" aria-label="Duplicate" @click.stop="duplicateLayer(item)">
                      <AppIcon name="duplicate" :size="13" />
                    </button>
                    <button type="button" class="sm-mini-btn" :class="{ on: item.locked }" :title="item.locked ? 'Unlock' : 'Lock'" :aria-label="item.locked ? 'Unlock' : 'Lock'" @click.stop="toggleLock(item)">
                      <AppIcon :name="item.locked ? 'lock' : 'unlock'" :size="13" />
                    </button>
                    <button type="button" class="sm-mini-btn del" title="Delete (Del)" aria-label="Delete" @click.stop="deleteLayer(item)">
                      <AppIcon name="trash" :size="13" />
                    </button>
                  </div>
                </template>
              </div>

              <!-- DRAWING: an SVG over the whole canvas, 0-100 matches our percentages -->
              <svg
                v-else-if="item.type === 'draw'"
                class="sm-draw-layer"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polyline
                  v-for="(stroke, i) in item.strokes"
                  :key="i"
                  :points="pointsToString(stroke.points)"
                  fill="none"
                  :stroke="stroke.color"
                  :stroke-width="stroke.width"
                  :stroke-opacity="stroke.opacity"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </template>

            <!-- Red lines while dragging: what the layer clicked onto -->
            <span v-if="snapLines.x !== null" class="sm-snap sm-snap-x" :style="{ left: snapLines.x + '%' }" aria-hidden="true"></span>
            <span v-if="snapLines.y !== null" class="sm-snap sm-snap-y" :style="{ top: snapLines.y + '%' }" aria-hidden="true"></span>

            <!-- GIF preview: covers the canvas while it plays. Tapping it stops. -->
            <button
              v-if="playing && playFrames.length"
              type="button"
              class="sm-play"
              aria-label="Stop the preview"
              @pointerdown.stop
              @click="stopPlaying"
            >
              <img :src="playFrames[playIndex]" alt="" draggable="false" />
            </button>

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
          <!-- First-time tips: a small card above the strip, pointing at the button it explains -->
          <div v-if="gifTip" class="sm-tip" :class="'sm-tip-' + gifTip.target" role="dialog" aria-live="polite" :aria-label="gifTip.title">
            <div class="sm-tip-head">
              <span class="sm-tip-title">{{ gifTip.title }}</span>
              <span class="sm-tip-step">{{ gifTipIndex + 1 }} of {{ GIF_TIPS.length }}</span>
            </div>
            <p class="sm-tip-text">{{ gifTip.text }}</p>
            <div class="sm-tip-actions">
              <button type="button" class="sm-tip-skip" @click="closeGifTips">Skip</button>
              <button type="button" class="btn btn-primary btn-sm" @click="nextGifTip">
                {{ gifTipIndex === GIF_TIPS.length - 1 ? 'Got it' : 'Next' }}
              </button>
            </div>
          </div>

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
              <!-- Reorder arrows only on the frame you are on, so the strip stays calm.
                   WHY hidden and not removed: their row keeps its space, so the strip (and the
                   whiteboard above it) stays the same size when the second frame is added -->
              <div class="sm-frame-move" :class="{ 'is-hidden': frame.id !== activeFrameId || frames.length < 2 }">
                <button type="button" :disabled="index === 0" aria-label="Move frame left" @click="moveFrame(frame, -1)">‹</button>
                <button type="button" :disabled="index === frames.length - 1" aria-label="Move frame right" @click="moveFrame(frame, 1)">›</button>
              </div>
            </div>

            <button
              type="button"
              class="sm-frame sm-frame-add"
              :class="{ 'sm-tip-target': gifTip && gifTip.target === 'add' }"
              title="Add frame"
              aria-label="Add frame"
              @click="addFrame"
            >
              <AppIcon name="plus" :size="18" />
            </button>
          </div>

          <div class="sm-frame-actions">
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :class="{ 'sm-tip-target': gifTip && gifTip.target === 'duplicate' }"
              @click="duplicateFrame"
            >
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
            <button
              type="button"
              class="btn btn-sm sm-play-btn"
              :class="[playing ? 'btn-primary' : 'btn-outline-secondary', { 'sm-tip-target': gifTip && gifTip.target === 'play' }]"
              :disabled="frames.length < 2"
              :title="frames.length < 2 ? 'Add a second frame to see it move' : ''"
              :aria-pressed="playing"
              @click="togglePlay"
            >
              <svg v-if="playing" viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path :d="LOCAL_ICONS.stop" /></svg>
              <AppIcon v-else name="play" :size="14" />
              {{ playing ? 'Stop' : 'Play' }}
            </button>
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
            <button type="button" class="sm-tip-help" title="How to make a GIF" aria-label="How to make a GIF" @click="showGifTips">?</button>
          </div>
        </div>
      </main>

      <!-- ---------- PROPERTIES ---------- -->
      <aside class="sm-panel sm-props sm-card" :class="{ 'is-open': mobilePanel === 'props' }">
        <!-- No title for text: the panel only lists the layers then. The head stays on a phone for its close button. -->
        <div class="sm-panel-head" :class="{ 'sm-head-phone-only': selectedText }">
          <h2 v-if="!selectedText" class="sm-panel-title">{{ selectedLayer ? selectedKind : 'Canvas' }}</h2>
          <button type="button" class="sm-close sm-mobile-only" aria-label="Close" @click="mobilePanel = null">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="sm-panel-body" :class="{ 'is-layers-only': selectedText }">
          <!-- Nothing selected: canvas facts -->
          <template v-if="!selectedLayer">
            <div class="sm-rows">
              <div class="sm-row"><span>Size</span><span>{{ EXPORT_SIZE }} × {{ EXPORT_SIZE }}</span></div>
              <div class="sm-row"><span>Background</span><span>Transparent</span></div>
              <div class="sm-row"><span>Layers</span><span>{{ layers.length }}</span></div>
              <div class="sm-row"><span>Saves as</span><span>{{ mode === 'gif' && frames.length > 1 ? 'Animated' : 'Still' }}</span></div>
            </div>
          </template>

          <!-- Something selected -->
          <template v-else>
            <!-- PHOTO / STICKER properties: laid out exactly like the Frame Editor's element panel -->
            <template v-if="selectedLayer.type === 'image'">
              <div class="d-flex flex-column gap-3">
                <!-- What is selected -->
                <div class="d-flex align-items-center justify-content-between p-2 bg-light border rounded-3">
                  <div class="d-flex align-items-center gap-2 text-truncate">
                    <AppIcon name="sparkle" :size="16" />
                    <div class="text-truncate">
                      <span class="small fw-bold text-dark d-block text-truncate">{{ selectedLayer.name || selectedKind }}</span>
                      <span class="badge bg-primary bg-opacity-10 text-primary" style="font-size: 0.65rem;">
                        {{ selectedLayer.svg ? 'Vector SVG' : selectedKind }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Colours: each colour of the drawing, with its exact code and quick colours -->
                <div v-if="imageColors.length" class="d-flex flex-column gap-2">
                  <label class="form-label small fw-bold text-secondary mb-0">Colours</label>
                  <div
                    v-for="(original, i) in imageColors"
                    :key="original"
                    class="card p-2 bg-light border rounded-3 d-flex flex-column gap-2"
                  >
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="small fw-semibold text-dark">Colour {{ i + 1 }}</span>
                      <span class="font-monospace small text-muted">{{ shownColor(selectedLayer, original).toUpperCase() }}</span>
                    </div>
                    <div class="input-group input-group-sm">
                      <input
                        type="color"
                        :value="hexOnly(shownColor(selectedLayer, original))"
                        class="form-control form-control-color form-control-sm p-1"
                        style="max-width: 38px;"
                        :aria-label="'Colour ' + (i + 1)"
                        @change="recolor(original, $event.target.value)"
                      />
                      <input
                        type="text"
                        :value="shownColor(selectedLayer, original).toUpperCase()"
                        class="form-control form-control-sm text-uppercase font-monospace sm-hex"
                        maxlength="9"
                        spellcheck="false"
                        :aria-label="'Colour ' + (i + 1) + ' code'"
                        @change="setHexColor(original, $event.target)"
                      />
                    </div>
                    <div class="d-flex align-items-center gap-1 flex-wrap">
                      <button
                        v-for="c in [...SOLID_COLORS, ...PASTEL_COLORS]"
                        :key="c"
                        type="button"
                        class="btn p-0 rounded-circle border shadow-none"
                        :style="{
                          backgroundColor: c,
                          width: '18px',
                          height: '18px',
                          boxShadow: shownColor(selectedLayer, original).toLowerCase() === c.toLowerCase() ? '0 0 0 2px #fff, 0 0 0 3.5px #2563eb' : 'none'
                        }"
                        :title="c"
                        :aria-label="'Colour ' + c"
                        @click="recolor(original, c)"
                      ></button>
                    </div>
                  </div>
                </div>

                <!-- Dimensions in pixels of the 1000px download -->
                <div class="d-flex flex-column gap-1">
                  <label class="form-label small fw-bold text-secondary mb-0">Dimensions (px)</label>
                  <div class="d-flex gap-2">
                    <div class="input-group input-group-sm">
                      <span class="input-group-text bg-light">W</span>
                      <input type="number" min="10" max="2000" class="form-control text-center" :value="layerPx(selectedLayer).w" aria-label="Width in pixels" @change="setLayerPx('w', $event.target.value)" />
                    </div>
                    <div class="input-group input-group-sm">
                      <span class="input-group-text bg-light">H</span>
                      <input type="number" min="10" max="2000" class="form-control text-center" :value="layerPx(selectedLayer).h" aria-label="Height in pixels" @change="setLayerPx('h', $event.target.value)" />
                    </div>
                  </div>
                </div>
              </div>

              <button
                v-if="canCutOut"
                type="button"
                class="btn btn-outline-secondary w-100 sm-action mt-3"
                :disabled="removingBg"
                @click="cutOutBackground(selectedLayer)"
              >
                <AppIcon name="sparkle" :size="16" />
                <span>{{ removingBg ? 'Removing…' : 'Remove background' }}</span>
              </button>
            </template>

            <!-- Actions (photos and stickers). Forward / backward / front / back are in the right-click menu. -->
            <div v-if="selectedLayer.type === 'image'" class="sm-section">
              <div class="sm-btn-row">
                <button
                  v-if="selectedLayer.type === 'image'"
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  @click="resetLayer(selectedLayer)"
                >
                  <AppIcon name="refresh" :size="14" /> Reset
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
            <div v-if="layers.length" ref="layerListEl" class="sm-layer-list">
              <div
                v-for="layer in layersTopFirst"
                :key="layer.id"
                :data-id="layer.id"
                class="sm-layer-row"
                :class="{ active: layer.id === selectedId, 'is-dragging': layer.id === draggingLayerId, 'is-hidden': layer.hidden }"
                @click="selectLayer(layer)"
                @contextmenu="openLayerMenu($event, layer)"
                @pointerdown="startLongPress($event, layer)"
                @pointerup="cancelLongPress"
                @pointercancel="cancelLongPress"
                @pointerleave="cancelLongPress"
              >
                <span
                  class="sm-grip-handle"
                  title="Drag to move this layer up or down"
                  aria-label="Drag to reorder"
                  @pointerdown="startRowDrag($event, layer)"
                  @click.stop
                >
                  <svg class="sm-grip sm-local-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="LOCAL_ICONS.grip" /></svg>
                </span>
                <img v-if="layer.type === 'image'" :src="layer.url" alt="" class="sm-layer-thumb" />
                <span v-else class="sm-layer-thumb sm-layer-icon">
                  {{ layer.emoji ? layer.text : layer.type === 'text' ? 'T' : '' }}
                  <AppIcon v-if="layer.type === 'draw'" name="pen" :size="13" />
                </span>
                <span class="sm-layer-name">{{ layerLabel(layer) }}</span>
                <button
                  type="button"
                  class="sm-row-del sm-row-btn"
                  :title="layer.hidden ? 'Show' : 'Hide'"
                  :aria-label="layer.hidden ? 'Show layer' : 'Hide layer'"
                  @click.stop="toggleHidden(layer)"
                >
                  <AppIcon :name="layer.hidden ? 'eye-off' : 'eye'" :size="14" />
                </button>
                <button
                  type="button"
                  class="sm-row-del sm-row-btn"
                  :class="{ 'sm-row-lock': layer.locked }"
                  :title="layer.locked ? 'Unlock' : 'Lock'"
                  :aria-label="layer.locked ? 'Unlock layer' : 'Lock layer'"
                  @click.stop="toggleLock(layer)"
                >
                  <AppIcon :name="layer.locked ? 'lock' : 'unlock'" :size="14" />
                </button>
                <button type="button" class="sm-row-del" title="Delete layer" aria-label="Delete layer" @click.stop="deleteLayer(layer)">
                  <AppIcon name="trash" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- ============ RIGHT-CLICK MENU (long-press on a phone) ============ -->
    <div
      v-if="layerMenu && menuLayer"
      class="sm-menu-backdrop"
      @pointerdown.self="closeLayerMenu"
      @contextmenu.prevent="closeLayerMenu"
    >
      <div class="sm-menu" role="menu" :aria-label="layerLabel(menuLayer)" :style="{ left: layerMenu.x + 'px', top: layerMenu.y + 'px' }">
        <p class="sm-menu-title">{{ layerLabel(menuLayer) }}</p>
        <button type="button" class="sm-menu-item" role="menuitem" :disabled="menuIndex === layers.length - 1" @click="fromMenu(moveUp)">
          <AppIcon name="chevron-up" :size="15" /> Bring forward
        </button>
        <button type="button" class="sm-menu-item" role="menuitem" :disabled="menuIndex === layers.length - 1" @click="fromMenu(bringToFront)">
          <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path d="M6 11l6-6 6 6 M6 18l6-6 6 6" /></svg> Bring to front
        </button>
        <button type="button" class="sm-menu-item" role="menuitem" :disabled="menuIndex === 0" @click="fromMenu(moveDown)">
          <AppIcon name="chevron-down" :size="15" /> Send backward
        </button>
        <button type="button" class="sm-menu-item" role="menuitem" :disabled="menuIndex === 0" @click="fromMenu(sendToBack)">
          <svg viewBox="0 0 24 24" class="sm-local-icon" aria-hidden="true"><path d="M6 6l6 6 6-6 M6 13l6 6 6-6" /></svg> Send to back
        </button>
        <span class="sm-menu-line" aria-hidden="true"></span>
        <button type="button" class="sm-menu-item" role="menuitem" @click="fromMenu(duplicateLayer)">
          <AppIcon name="duplicate" :size="15" /> Duplicate
        </button>
        <button type="button" class="sm-menu-item" role="menuitem" @click="fromMenu(toggleLock)">
          <AppIcon :name="menuLayer.locked ? 'unlock' : 'lock'" :size="15" /> {{ menuLayer.locked ? 'Unlock' : 'Lock in place' }}
        </button>
        <span class="sm-menu-line" aria-hidden="true"></span>
        <button type="button" class="sm-menu-item is-danger" role="menuitem" @click="fromMenu(deleteLayer)">
          <AppIcon name="trash" :size="15" /> Delete
        </button>
      </div>
    </div>

    <!-- Backdrop for the phone sheets -->
    <div v-if="mobilePanel" class="sm-sheet-backdrop sm-mobile-only" @click="mobilePanel = null"></div>

    <!-- ============ DOWNLOAD DIALOG ============ -->
    <!-- First-visit tips (the "?" in the top bar shows them again) -->
    <GuideTips ref="guide" :steps="EDITOR_TIPS" storage-key="sm-guide-seen" />

    <!-- ============ MY STICKERS (like the Frame Editor's My templates) ============ -->
    <div v-if="myStickersOpen" class="sm-modal-backdrop" @click.self="myStickersOpen = false">
      <div class="sm-modal sm-modal-wide" role="dialog" aria-modal="true" aria-labelledby="sm-mine-title">
        <div class="sm-modal-head">
          <span class="sm-modal-tile"><AppIcon name="folder" :size="18" /></span>
          <h2 id="sm-mine-title" class="sm-modal-title">My stickers</h2>
          <button type="button" class="btn btn-outline-secondary btn-sm sm-action ms-auto" @click="newSticker">
            <AppIcon name="plus" :size="14" /> New sticker
          </button>
          <button type="button" class="sm-close" aria-label="Close" @click="myStickersOpen = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="sm-modal-body">
          <div v-if="!isAccount" class="empty-state sm-empty-state">
            <span class="empty-icon"><AppIcon name="lock" :size="20" /></span>
            <span>Log in to see the stickers you saved.</span>
          </div>
          <template v-else>
            <div class="sm-search mb-3">
              <AppIcon name="search" :size="15" />
              <input v-model="myStickersQuery" type="search" placeholder="Search your stickers" aria-label="Search your stickers" />
            </div>
            <div v-if="loadingMine" class="sm-mine-grid">
              <div v-for="n in 8" :key="n" class="skeleton sm-mine-card"></div>
            </div>
            <div v-else-if="shownMyStickers.length === 0" class="empty-state sm-empty-state">
              <span class="empty-icon"><AppIcon name="folder" :size="20" /></span>
              <span>{{ myStickersQuery ? 'No stickers match "' + myStickersQuery + '".' : 'No saved stickers yet. Make one and press Save to My Studio.' }}</span>
            </div>
            <div v-else class="sm-mine-grid">
              <button
                v-for="sticker in shownMyStickers"
                :key="sticker.id"
                type="button"
                class="sm-mine-card"
                :class="{ active: sticker.id === openStickerId }"
                :title="'Open ' + sticker.name"
                @click="editSavedSticker(sticker)"
              >
                <span class="sm-mine-thumb"><img :src="sticker.thumbUrl" alt="" draggable="false" /></span>
                <span class="sm-mine-name">{{ sticker.name }}</span>
                <span class="sm-mine-tags">
                  <span v-if="sticker.kind === 'animated'" class="sm-mine-tag">GIF</span>
                  <span v-if="editableIds.has(sticker.id)" class="sm-mine-tag is-layers">Layers</span>
                  <span v-if="sticker.id === openStickerId" class="sm-mine-tag is-open">Open now</span>
                </span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

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
              <img
                v-if="dlFormat === 'gif' && playFrames.length"
                :src="playFrames[playIndex]"
                alt="Preview of the GIF"
              />
              <img v-else-if="dlFormat !== 'gif' && previewUrl" :src="previewUrl" alt="Preview of the sticker" />
              <span v-else class="sm-dl-loading" role="status">{{ previewFailed ? 'No preview, but the download still works.' : 'Drawing preview…' }}</span>
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

              <!-- Speed here too, so you can tune it while watching the preview -->
              <div v-if="dlFormat === 'gif'" class="sm-frame-speed sm-dl-speed">
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
  /* App.vue puts the editors straight under the 57px Blue Studios bar (not in the centred
     column), the same as the Template Editor, so the page fills the rest of the screen. */
  --sm-navbar: 57px;
  --sm-gap: 12px;
  --sm-float: 0 1px 2px rgba(20, 23, 43, 0.04), 0 12px 32px rgba(20, 23, 43, 0.06);
  --sm-faint: #9AA0AE;

  width: 100%;
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
.sm-brand-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.sm-brand-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.sm-topbar-center { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.sm-topbar-actions { display: flex; align-items: center; gap: 6px; margin-left: 8px; }
/* Laptop: name on the left, Sticker / GIF and Rulers in the true middle, actions on the right */
@media (min-width: 992px) {
  .sm-topbar { display: grid; grid-template-columns: 1fr auto 1fr; }
  .sm-topbar-center { margin-left: 0; }
  .sm-topbar-actions { justify-self: end; }
}

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
/* A dot on "Edit" when something is selected, so phone users know where its settings are */
.sm-rail-btn.has-dot .sm-rail-tile { position: relative; }
.sm-rail-btn.has-dot .sm-rail-tile::after {
  content: '';
  position: absolute; top: 3px; right: 3px;
  width: 8px; height: 8px;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: var(--brand);
}
.sm-mobile-only { display: none; }

/* Laptop: the tool panel folded away (click the open tool again, or its ×). Only above the
   phone size, so a phone's sheet is never hidden by it. The tool's icon loses its blue tile,
   so it is clear the panel is closed. */
@media (min-width: 992px) {
  .sm-drawer.is-folded { display: none; }
  .sm-rail-btn.folded .sm-rail-tile { background: transparent; transform: none; }
}

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
@media (min-width: 992px) {
  .sm-head-phone-only { display: none; }
  /* Only the layers: no line above them, and room at the top where the title was */
  .sm-panel-body.is-layers-only { padding-top: 14px; }
  .sm-panel-body.is-layers-only .sm-layers { margin-top: 0; padding-top: 0; border-top: 0; }
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
  position: relative; /* so a chip's offsetLeft is measured from the row (v-chip-scroll) */
  display: flex; gap: 6px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.sm-chip-row::-webkit-scrollbar { display: none; }
/* A soft fade on an edge with more chips behind it, so the row clearly scrolls (v-chip-scroll sets these) */
.sm-chip-row.more-right { mask-image: linear-gradient(to right, #000 calc(100% - 36px), transparent); }
.sm-chip-row.more-left { mask-image: linear-gradient(to right, transparent, #000 36px); }
.sm-chip-row.more-left.more-right { mask-image: linear-gradient(to right, transparent, #000 36px, #000 calc(100% - 36px), transparent); }
.sm-chip-wrap { flex-wrap: wrap; overflow: visible; }
.sm-chip-add { display: inline-flex; align-items: center; gap: 4px; color: var(--brand); border-style: dashed; }

/* ---------- sticker grid ---------- */
/* WHY minmax(0, 1fr): a plain 1fr column never gets narrower than what is inside it, and the
   sticker and tape pictures carry their own width (90-100px). On a phone that pushed them past
   the edge of the screen while the emoji, which are just text, fitted. */
.sm-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.sm-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.sm-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
.sm-thumb { width: 100%; height: 100%; min-width: 0; object-fit: contain; pointer-events: none; }
.sm-emoji { font-size: 26px; line-height: 1; }
.sm-cell-skeleton { aspect-ratio: 1 / 1; }
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
/* The font of the selected text box */
.sm-font-card.active { border-color: var(--brand); background: var(--brand-tint); }
.sm-font-card.active .sm-font-card-name { color: var(--brand); }

/* ---------- draw tool ---------- */
/* The toolbar floats along the top of the cutting mat while drawing */
.sm-drawbar {
  position: absolute; top: 10px; left: 50%; z-index: 30;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 4px;
  max-width: calc(100% - 20px);
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 6px 20px rgba(20, 23, 43, 0.1);
}
.sm-drawbar-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  -webkit-tap-highlight-color: transparent;
  transition: color 150ms ease, background-color 150ms ease, transform 160ms var(--ease-out);
}
.sm-drawbar-btn.active { color: var(--brand); background: var(--brand-tint); }
.sm-drawbar-btn:active { transform: scale(0.92); }
.sm-drawbar-line { width: 1px; height: 22px; flex-shrink: 0; background: var(--line); }
.sm-drawbar-wide { width: auto; gap: 4px; padding: 0 10px; font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
.sm-drawbar-title {
  max-width: 140px; padding: 0 6px 0 10px;
  font-size: 0.85rem; font-weight: 700; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; min-width: 0;
}
/* A small card under a bar (Adjust) */
.sm-pop {
  position: absolute; top: calc(100% + 8px); left: 50%; z-index: 31;
  transform: translateX(-50%);
  width: 260px; max-width: calc(100vw - 32px);
  padding: 14px;
  border: 1px solid var(--line); border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(20, 23, 43, 0.16);
  display: flex; flex-direction: column; gap: 12px;
}
.sm-pop .sm-label { margin-bottom: 4px; }
.sm-pop .sm-btn-row .btn { flex: 1; }

/* Rulers switch: a pill, blue when on (the same as the Template Editor's) */
.sm-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  height: 38px; padding: 0 12px;
  border: 1px solid var(--line); border-radius: 999px;
  background: #ffffff; color: var(--muted);
  font-size: 0.85rem; font-weight: 600; white-space: nowrap;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease;
}
.sm-toggle .sm-local-icon { width: 15px; height: 15px; }
.sm-toggle.active { color: var(--brand); border-color: var(--brand); background: var(--brand-tint); }

/* Snap lines: red, the same as the Template Editor and Decorate */
.sm-snap { position: absolute; z-index: 26; background: #F04438; pointer-events: none; }
.sm-snap-x { top: 0; bottom: 0; width: 1px; }
.sm-snap-y { left: 0; right: 0; height: 1px; }

/* Search box in the Elements panel */
.sm-search {
  display: flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 10px;
  border: 1px solid var(--line); border-radius: 12px;
  background: var(--soft); color: var(--muted);
}
.sm-search:focus-within { border-color: var(--brand); background: #ffffff; }
.sm-search input {
  flex: 1; min-width: 0;
  border: 0; outline: none; background: transparent;
  color: var(--ink); font-size: 0.88rem;
}
.sm-search input::-webkit-search-cancel-button { -webkit-appearance: none; }
.sm-search-clear {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0;
  border: 0; border-radius: 999px;
  background: transparent; color: var(--muted);
}

/* The sticker's name in the top bar (the same as the Template Editor's) */
.sm-name {
  width: 170px; min-width: 0;
  padding: 4px 8px;
  border: 1px solid transparent; border-radius: 8px;
  background: transparent;
  color: var(--ink); font-size: 0.9rem; font-weight: 600;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.sm-name:focus { outline: none; border-color: var(--brand); background: #ffffff; }
.sm-name::placeholder { color: var(--sm-faint); font-weight: 500; }
/* The text bar's buttons scroll sideways on a narrow phone; its pop-ups sit outside the scroll */
.sm-drawbar-scroll {
  display: flex; align-items: center; gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.sm-drawbar-scroll::-webkit-scrollbar { display: none; }
.sm-textbar-size { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.sm-textbar-size input {
  width: 44px; height: 30px; padding: 0;
  border: 1px solid var(--line); border-radius: 8px;
  color: var(--ink); text-align: center; font-size: 0.85rem; font-weight: 600; font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}
.sm-textbar-size input::-webkit-inner-spin-button { -webkit-appearance: none; }
.sm-textbar-size input:focus { outline: none; border-color: var(--brand); }
.sm-pop-colors { flex-wrap: wrap; padding: 0; overflow: visible; }
/* A hidden layer: faded in the list */
.sm-layer-row.is-hidden .sm-layer-name,
.sm-layer-row.is-hidden .sm-layer-thumb { opacity: 0.45; }
.sm-row-btn { width: 26px; }
/* My stickers: a grid of your saved stickers */
.sm-modal.sm-modal-wide { width: min(920px, calc(100vw - 32px)); max-width: 920px; }
.sm-mine-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; max-height: 60vh; overflow-y: auto; padding: 2px; }
.sm-mine-card {
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px;
  border: 1px solid var(--line); border-radius: 14px;
  background: #ffffff;
  text-align: left;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 160ms var(--ease-out);
}
.skeleton.sm-mine-card { height: 190px; }
.sm-mine-card:active { transform: scale(0.98); }
.sm-mine-card.active { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-tint); }
.sm-mine-thumb {
  display: flex; align-items: center; justify-content: center;
  aspect-ratio: 1 / 1; padding: 8px;
  border-radius: 10px;
  background-color: #ffffff;
  background-image: linear-gradient(45deg, #F4F6FA 25%, transparent 25%), linear-gradient(-45deg, #F4F6FA 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #F4F6FA 75%), linear-gradient(-45deg, transparent 75%, #F4F6FA 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.sm-mine-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.sm-mine-name { font-size: 0.85rem; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-mine-tags { display: flex; flex-wrap: wrap; gap: 4px; min-height: 18px; }
.sm-mine-tag { padding: 1px 7px; border-radius: 999px; font-size: 0.68rem; font-weight: 700; color: var(--muted); background: var(--soft); }
.sm-mine-tag.is-layers { color: #027A48; background: #ECFDF3; }
.sm-mine-tag.is-open { color: var(--brand); background: var(--brand-tint); }
/* Laptops: the top bar keeps to one line. Below 1600px "My stickers" is just its icon
   (the tooltip names it); below 1366px Download is too, and Save to My Studio says "Save". */
.sm-topbar .sm-action { white-space: nowrap; }
.sm-show-md { display: none; }
@media (min-width: 992px) and (max-width: 1599.98px) { .sm-hide-lg { display: none; } }
@media (min-width: 992px) and (max-width: 1365.98px) { .sm-hide-md { display: none; } .sm-show-md { display: inline; } }
/* Dimensions: W and H boxes side by side */
.sm-dims { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sm-dim {
  display: flex; align-items: center; gap: 6px; margin: 0;
  padding: 0 4px 0 10px;
  border: 1px solid var(--line); border-radius: 10px;
  font-size: 0.78rem; font-weight: 700; color: var(--muted);
}
.sm-dim:focus-within { border-color: var(--brand); }
.sm-dim input {
  flex: 1; min-width: 0; height: 34px;
  border: 0; outline: none; background: transparent;
  color: var(--ink); font-size: 0.88rem; font-weight: 600; font-variant-numeric: tabular-nums;
}
/* One colour of a drawing: a round picker, its code, and "back to the original" */
.sm-color-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.sm-color-pick { position: relative; width: 30px; height: 30px; flex-shrink: 0; margin: 0; cursor: pointer; }
.sm-color-pick input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.sm-hex { flex: 1; min-width: 0; font-family: ui-monospace, monospace; }
.sm-row-del:disabled { opacity: 0.35; }
/* The small bar under a selected layer: duplicate, lock, delete */
.sm-mini-bar {
  position: absolute; top: calc(100% + 10px); left: 50%; z-index: 5;
  transform: translateX(-50%);
  display: flex; gap: 2px;
  padding: 3px;
  border: 1px solid var(--line); border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(20, 23, 43, 0.14);
  /* the layer's own font size and spacing must not change the bar */
  font-size: 1rem; letter-spacing: 0; line-height: 1; text-transform: none;
}
.sm-mini-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0;
  border: 0; border-radius: 999px;
  background: transparent; color: var(--muted);
}
.sm-mini-btn.on { color: var(--brand); background: var(--brand-tint); }
.sm-mini-btn.del { color: var(--danger); }
.sm-mini-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
/* The colours scroll sideways inside the bar on a narrow phone */
.sm-drawbar-colors {
  display: flex; align-items: center; gap: 6px;
  min-width: 0;
  padding: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.sm-drawbar-colors::-webkit-scrollbar { display: none; }
.sm-drawbar-swatch {
  position: relative;
  width: 24px; height: 24px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid rgba(20, 23, 43, 0.12);
  border-radius: 999px;
  transition: transform 160ms var(--ease-out), box-shadow 150ms ease;
}
.sm-drawbar-swatch.active { box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px var(--brand); }
.sm-drawbar-swatch:active { transform: scale(0.9); }
.sm-drawbar-done {
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--brand);
  color: #ffffff;
  font-size: 0.85rem; font-weight: 700;
  transition: transform 160ms var(--ease-out);
}
.sm-drawbar-done:active { transform: scale(0.97); }

/* Stroke size: a tall upside-down triangle at the side. The dot is the line you will draw. */
.sm-stroke {
  position: absolute; right: 14px; top: 50%; z-index: 30;
  width: 32px; height: min(220px, 50%);
  transform: translateY(-50%);
  cursor: ns-resize;
  touch-action: none;
  border-radius: 8px;
}
.sm-stroke-shape { display: block; width: 100%; height: 100%; }
.sm-stroke-shape polygon { fill: #E3E6EE; stroke: #C9CEDB; stroke-width: 1; vector-effect: non-scaling-stroke; }
.sm-stroke-dot {
  position: absolute; left: 50%;
  border: 2px solid #ffffff;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(20, 23, 43, 0.25), 0 2px 6px rgba(20, 23, 43, 0.2);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.sm-stroke:focus-visible { outline: 2px solid var(--brand); outline-offset: 4px; }
/* Phone-only parts of a bar (the drawing colours): hidden on a laptop, where the Draw
   panel already shows them. Shown again in the phone section below. */
.sm-drawbar .sm-mobile-only { display: none; }

/* Text bar: "Aa" in the text's own font, and B / I / U set in their own style */
.sm-textbar-font { width: auto; padding: 0 10px; font-size: 1.05rem; color: var(--ink); }
.sm-textbar-letter { font-size: 1rem; color: var(--ink); font-family: Georgia, 'Times New Roman', serif; }
.sm-textbar-letter.active { color: var(--brand); }
.sm-textbar-caps { font-family: inherit; font-size: 0.82rem; font-weight: 700; }
/* The screen colour picker: a pipette in a white circle, next to the colours */
.sm-pipette {
  display: flex; align-items: center; justify-content: center;
  background: #ffffff;
  color: var(--muted);
}
.sm-pipette .sm-local-icon { width: 14px; height: 14px; }
.sm-swatches .sm-pipette .sm-local-icon { width: 16px; height: 16px; }

/* ---------- GIF tips ---------- */
.sm-frames { position: relative; }
.sm-tip {
  position: absolute; left: 8px; bottom: calc(100% + 12px); z-index: 40;
  width: min(300px, calc(100% - 16px));
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: var(--ink);
  color: #ffffff;
  box-shadow: 0 16px 40px rgba(20, 23, 43, 0.25);
  animation: sm-pop 300ms var(--ease-out);
}
/* The little arrow under the card, roughly above the button it explains */
.sm-tip::after {
  content: '';
  position: absolute; bottom: -6px; left: 28px;
  width: 12px; height: 12px;
  background: var(--ink);
  transform: rotate(45deg);
}
.sm-tip-duplicate::after { left: 50%; }
.sm-tip-play::after { left: auto; right: 40px; }
.sm-tip-play { left: auto; right: 8px; }
.sm-tip-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sm-tip-title { font-size: 0.95rem; font-weight: 700; }
.sm-tip-step { font-size: 0.75rem; color: #B9BECC; font-variant-numeric: tabular-nums; }
.sm-tip-text { margin: 6px 0 10px; font-size: 0.85rem; line-height: 1.5; color: #E3E6EE; text-wrap: pretty; }
.sm-tip-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.sm-tip-skip { padding: 4px 8px; border: 0; background: transparent; color: #B9BECC; font-size: 0.85rem; font-weight: 600; }
/* The button a tip is about gets a soft pulsing ring */
.sm-tip-target { position: relative; z-index: 1; animation: sm-tip-pulse 1.6s ease-out infinite; }
@keyframes sm-tip-pulse {
  0% { box-shadow: 0 0 0 0 rgba(47, 91, 234, 0.45); }
  100% { box-shadow: 0 0 0 10px rgba(47, 91, 234, 0); }
}
.sm-tip-help {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--muted);
  font-size: 0.85rem; font-weight: 700;
}

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
.sm-drop.is-dragover { border-color: var(--brand); background: var(--brand-tint); }
.sm-stage.is-dragover { box-shadow: inset 0 0 0 2px var(--brand); }
.sm-drop-title { font-weight: 700; color: var(--ink); }
.sm-drop.is-busy { border-color: var(--brand); background: var(--brand-tint); }
/* Your uploads: a tile each, with a small remove button in the corner */
.sm-upload { position: relative; }
.sm-upload .sm-cell { width: 100%; }
.sm-upload-del {
  position: absolute; top: -6px; right: -6px;
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  border: 2px solid #ffffff; border-radius: 999px;
  background: var(--ink); color: #ffffff;
}
/* Small laptops: narrower panels, so the canvas keeps its room */
@media (min-width: 992px) and (max-width: 1279.98px) {
  .sm-panel, .sm-props { width: 256px; }
  .sm-rail { width: 68px; }
}

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
/* Curved text: the box is one line tall, each letter sits on its own spot of the arch */
.sm-text-curved { position: relative; }
.sm-curve-letter { position: absolute; left: 50%; top: 50%; white-space: pre; letter-spacing: 0; }
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

/* The angle while rotating, above the rotate handle (the same as the Template Editor) */
.sm-rot-tip {
  position: absolute; left: 50%; top: -62px;
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ink); color: #ffffff;
  font-family: 'Plus Jakarta Sans', sans-serif; font-size: 0.72rem; font-weight: 600; font-style: normal;
  letter-spacing: 0; line-height: 1.5; text-transform: none; text-shadow: none;
  font-variant-numeric: tabular-nums; white-space: nowrap;
  pointer-events: none;
}

/* GIF preview: sits over the layers with the same checkerboard, so it looks like the canvas moving */
.sm-play {
  position: absolute; inset: 0; z-index: 25;
  display: block;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: inherit;
  cursor: pointer;
}
.sm-play img { display: block; width: 100%; height: 100%; pointer-events: none; }
.sm-stage-playing { color: var(--brand); border-color: var(--brand-tint); }
.sm-play-btn { flex-shrink: 0; }

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
.sm-frame-move.is-hidden { visibility: hidden; }
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
.sm-rows { border-top: 1px solid var(--line); }
.sm-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.85rem;
}
.sm-row span:first-child { color: var(--muted); }
.sm-row span:last-child { font-weight: 600; font-variant-numeric: tabular-nums; }

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
/* The row being dragged lifts off the list, so it is clear what is moving */
.sm-layer-row.is-dragging {
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(20, 23, 43, 0.14);
  transform: scale(1.02);
  position: relative; z-index: 1;
}
/* The grip is the drag handle: a 32px target, big enough for a thumb, and touch-action none
   so dragging it moves the layer instead of scrolling the sheet. */
.sm-grip-handle {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  margin: -4px -4px -4px -2px;
  flex-shrink: 0;
  border-radius: 8px;
  color: var(--sm-faint);
  cursor: grab;
  touch-action: none;
}
.sm-grip-handle:active { cursor: grabbing; color: var(--brand); }
.sm-grip { width: 14px; height: 14px; }
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
/* A locked layer shows a lock in its row: tap it to unlock */
.sm-row-lock { color: var(--brand); }

/* ---------- right-click menu ---------- */
/* The backdrop is see-through: it only catches the click outside the menu that closes it */
.sm-menu-backdrop { position: fixed; inset: 0; z-index: 1060; }
.sm-menu {
  position: fixed;
  width: 210px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(20, 23, 43, 0.16);
  transform-origin: top left;
  animation: sm-menu-in 160ms var(--ease-out);
}
@keyframes sm-menu-in { from { opacity: 0; transform: scale(0.96); } }
.sm-menu-title {
  margin: 0; padding: 6px 10px 4px;
  font-size: 0.75rem; font-weight: 600; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sm-menu-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; min-height: 36px;
  padding: 0 10px;
  border: 0; border-radius: 9px;
  background: transparent; color: var(--ink);
  font-size: 0.88rem; font-weight: 500; text-align: left;
  transition: background-color 150ms ease;
}
.sm-menu-item .sm-local-icon { width: 15px; height: 15px; }
.sm-menu-item:disabled { opacity: 0.4; }
.sm-menu-item.is-danger { color: var(--danger); }
.sm-menu-item:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.sm-menu-line { display: block; height: 1px; margin: 4px 6px; background: var(--line); }

.sm-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border: 0; border-radius: 999px;
  background: transparent; color: var(--muted);
  transition: background-color 150ms ease, color 150ms ease;
}
/* The panels' close button only means something on a phone, where they are sheets */
.sm-close.sm-mobile-only { display: none; }

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
.sm-dl-loading { padding: 8px; font-size: 0.78rem; color: var(--muted); text-align: center; }
.sm-dl-speed { margin-top: 12px; }
.sm-dl-speed .sm-range { flex: 1; width: auto; min-width: 0; }
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
.sm-drawbar-btn:focus-visible,
.sm-drawbar-swatch:focus-visible,
.sm-drawbar-done:focus-visible,
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
  .sm-drawbar-btn:not(.active):hover { color: var(--ink); background: var(--soft); }
  .sm-grip-handle:hover { color: var(--ink); background: var(--soft); }
  .sm-drop:hover { border-color: var(--brand); background: var(--brand-tint); }
  .sm-layer-row:not(.active):hover { background: var(--soft); }
  .sm-row-del:hover { color: var(--danger); background: #FDE4E5; }
  .sm-toggle:not(.active):hover { color: var(--ink); background: var(--soft); }
  .sm-upload-del:hover { background: var(--danger); }
  .sm-mine-card:not(.active):hover { border-color: var(--brand); }
  .sm-mini-btn:not(.on):hover { color: var(--ink); background: var(--soft); }
  .sm-mini-btn.del:hover { color: var(--danger); background: #FDE4E5; }
  .sm-name:hover:not(:focus) { background: var(--soft); }
  .sm-row-lock:hover { color: var(--brand); background: var(--brand-tint); }
  .sm-menu-item:not(:disabled):hover { background: var(--soft); }
  .sm-menu-item.is-danger:not(:disabled):hover { background: #FDE4E5; }
  .sm-close:hover { color: var(--ink); background: var(--soft); }
  .sm-mini:hover { color: var(--brand); border-color: var(--brand); }
  .sm-mini-danger:hover { color: var(--danger); border-color: var(--danger); background: #FDE4E5; }
  .sm-frame:not(.active):hover { border-color: #C9CEDB; }
}

/* ---------- phones and small tablets ---------- */
/* WHY: below 992px the page fits the screen exactly, like a phone app:
   a short top bar, the canvas, and the tools pinned along the bottom. A tool opens as a
   short sheet just above the tools, so the canvas and every tool stay in view while you
   pick stickers. */
@media (max-width: 991.98px) {
  .sm-page {
    --sm-rail-h: calc(62px + env(safe-area-inset-bottom));
    height: calc(100vh - var(--sm-navbar));
    height: calc(100dvh - var(--sm-navbar));
    min-height: 0;
    padding: 8px 8px calc(var(--sm-rail-h) + 8px);
    gap: 8px;
  }

  /* Top bar: title and actions on one row, Sticker / GIF underneath */
  .sm-topbar { flex-wrap: wrap; gap: 6px; padding: 6px 6px 6px 10px; }
  .sm-topbar-center { order: 3; margin-left: 0; width: 100%; gap: 6px; }
  .sm-mode { flex: 1; }
  .sm-mode .seg-tab { flex: 1; justify-content: center; padding-top: 5px; padding-bottom: 5px; }
  .sm-topbar-actions { margin-left: auto; gap: 4px; }
  .sm-topbar .sm-square,
  .sm-topbar .sm-action { width: 36px; height: 36px; padding: 0; }
  .sm-topbar .sm-hide-xs { display: none; }
  .sm-brand { flex: 1 1 0; }
  .sm-brand-text { display: none; } /* the name is enough on a phone */
  .sm-name { width: 100%; }
  .sm-toggle { width: 36px; height: 36px; padding: 0; justify-content: center; }

  .sm-body { flex-direction: column; gap: 8px; }
  .sm-mobile-only,
  .sm-close.sm-mobile-only,
  .sm-drawbar .sm-mobile-only { display: flex; }

  /* Tools: a bar pinned to the bottom of the screen, above the sheets */
  .sm-rail {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 1045;
    width: auto;
    height: var(--sm-rail-h);
    flex-direction: row; gap: 0;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: 0 -4px 16px rgba(20, 23, 43, 0.06);
  }
  .sm-rail-btn { flex: 1; gap: 2px; padding: 0; font-size: 0.68rem; }
  .sm-rail-tile { width: 40px; height: 30px; border-radius: 10px; }

  /* Sheets: open just above the tool bar, under half the screen */
  .sm-panel {
    position: fixed; left: 0; right: 0; bottom: var(--sm-rail-h); z-index: 1040;
    width: auto;
    max-height: 46vh;
    max-height: 46dvh;
    border-radius: 20px 20px 0 0;
    border-bottom: 0;
    box-shadow: 0 -12px 32px rgba(20, 23, 43, 0.12);
    transform: translateY(calc(100% + var(--sm-rail-h)));
    transition: transform 300ms var(--ease-out);
  }
  .sm-panel.is-open { transform: translateY(0); }
  .sm-panel-head { padding: 10px 16px 6px; }
  .sm-panel-title { font-size: 0.95rem; }
  .sm-section { margin-top: 14px; }
  /* Light, so you can still see the sticker you just added */
  .sm-sheet-backdrop { position: fixed; inset: 0; z-index: 1030; background: rgba(20, 23, 43, 0.12); }

  /* Smaller sticker tiles: six in a row instead of four */
  .sm-art-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .sm-art-grid.sm-grid-2 { grid-template-columns: repeat(4, minmax(0, 1fr)); } /* the 4 washi tapes in one tidy row */
  .sm-art-grid .sm-cell { padding: 5px; border-radius: 10px; }
  .sm-art-grid .sm-emoji { font-size: 22px; }
  .sm-font-cards { grid-template-columns: 1fr 1fr; }
  .sm-font-card { padding: 8px 10px; }
  .sm-font-card-sample { font-size: 1.1rem; }

  .sm-stage { border-radius: 16px; }
  .sm-stage-pill { top: 8px; padding: 2px 8px; font-size: 0.7rem; }
  .sm-stage-tag { left: 8px; }
  .sm-stage-zoom { right: 8px; }

  /* Frame strip: frames on one scrolling row, buttons and speed on the next */
  .sm-frames { flex-wrap: wrap; gap: 8px; padding: 8px; }
  .sm-frame-list { width: 100%; }
  .sm-frame { width: 48px; height: 48px; border-radius: 10px; }
  .sm-frame-actions { flex-direction: row; }
  .sm-frame-speed { flex: 1 1 auto; justify-content: flex-end; }
  .sm-frame-speed .sm-range { flex: 1; width: auto; min-width: 60px; max-width: 140px; }

  .sm-dl-top { flex-direction: column; }
  .sm-dl-preview { width: 100%; height: 200px; }
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
  .sm-tip-target { animation: none; box-shadow: 0 0 0 3px rgba(47, 91, 234, 0.45); }
  .sm-rail-tile,
  .sm-cell,
  .sm-font-card,
  .sm-drawbar-btn,
  .sm-drawbar-swatch,
  .sm-swatch,
  .sm-drop,
  .sm-frame,
  .sm-range::-webkit-slider-thumb { transition: none; }
  .sm-rail-btn.active .sm-rail-tile,
  .sm-rail-btn:active .sm-rail-tile,
  .sm-cell:active,
  .sm-font-card:active,
  .sm-drawbar-btn:active,
  .sm-drawbar-swatch:active,
  .sm-swatch:active,
  .sm-drop:active,
  .sm-frame:active,
  .sm-range:active::-webkit-slider-thumb { transform: none; }
  .sm-panel { transition: none; }
  .sm-menu { animation: none; }
  .sm-modal, .sm-toast { animation: sm-fade 200ms ease; }
}
</style>
