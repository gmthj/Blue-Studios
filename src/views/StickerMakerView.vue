<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
// useAuth tells us if the user has an account (guests cannot load or save stickers).
import { useAuth } from '../composables/useAuth.js'
// listMyItems + getFileUrl are Gabriel's helpers in studio.js, so we do not rewrite Firebase code.
// saveSticker is Gabriel's function that uploads the image and creates the sticker's Firestore document.
import { listMyItems, getFileUrl, saveSticker, MAX_CATEGORIES } from '../studio.js'
// Our own new helpers for personal folders (src/stickerCategories.js)
import {
  DEFAULT_CATEGORIES, MAX_FOLDER_NAME, MAX_FOLDERS,
  listMyFolders, createFolder, renameFolder, deleteFolder, addStickerToFolders,
} from '../stickerCategories.js'

// Background removal goes through our own server function, so the remove.bg key stays secret.
import { removeBackground } from '../removeBackground.js'
// The design guide says never use the browser's confirm(): it cannot be styled and some
// phones block it. askConfirm shows our own dialog instead.
import { askConfirm } from '../composables/useDialog.js'

// True while the server is working, so the button can show "Removing…" and cannot be double-clicked.
const removingBg = ref(false)

const { isAccount } = useAuth()

// ----
// Constants
// ----

// The sticker is always exported at this size, whatever the preview size on screen.
const EXPORT_SIZE = 512

// Same font in the preview and the export, so the text does not shift when saved.
const FONT_FAMILY = 'Arial, Helvetica, sans-serif'

// 10 colours shared by text and drawing: 5 solid, then 5 pastel.
const SOLID_COLORS = ['#000000', '#ffffff', '#e63946', '#2a6fdb', '#2fb344']
const PASTEL_COLORS = ['#ffb3c6', '#ffd6a5', '#fdffb6', '#caffbf', '#a0c4ff']

// Built-in sticker packs. Emojis keep this simple: no API key or image files needed.
// Each emoji is turned into a picture when added, so it exports the same on every device.
const STICKER_PACKS = [
  { name: 'Party', stickers: ['🎉', '🎂', '🎈', '🎁', '✨'] },
  { name: 'Cute', stickers: ['🐱', '🐶', '🐰', '🌸', '💖'] },
  { name: 'Fun', stickers: ['😎', '🔥', '🌈', '⭐', '👑'] },
]

// ----
// State
// ----

const stageEl = ref(null)        // the square workspace (measured to turn pixels into percentages)
const fileInput = ref(null)      // the hidden <input type="file"> that the Photo button clicks
const textInputEl = ref(null)    // the text box in the toolbar (focused on double-click)
const stageWidth = ref(400)      // the workspace width in px, so text size scales with the preview
const errorMessage = ref('')
const successMessage = ref('')   // the green "saved" message

// ONE list holds every layer: 'image' (photos and stickers), 'text' and 'draw'.
// The ORDER of this list is the stacking order: the last item is drawn on top.
const layers = ref([])
const selectedId = ref(null)

// Which tools/panels are open
const drawing = ref(false)
const showStickers = ref(false)
const showLayers = ref(true)

// The colour used for new text and new strokes
const currentColor = ref('#000000')

// Drawing settings
const brush = ref('pen')         // 'pen' | 'highlighter' | 'sparkle'
const brushSize = ref(1.2)       // percent of the workspace width
const drawLayerId = ref(null)    // the drawing layer that new strokes are added to

// Stickers panel
const stickerTab = ref('packs')  // 'packs' | 'mine'
const myStickers = ref([])
const loadingMine = ref(false)

// ---- Save to My Studio pop-up ----
const showSave = ref(false)         // is the pop-up open?
const stickerName = ref('')         // name typed by the user (1-40 characters)
const pickedDefaults = ref([])      // ids of the 5 public pills picked (max 3)
const pickedFolders = ref([])       // ids of the user's own folders picked
const folders = ref([])             // all of the user's own folders, loaded from Firebase
const saving = ref(false)           // disables the buttons while uploading (no double-clicks)

// "+ Add" folder and rename state
const addingFolder = ref(false)     // is the little "new folder" input showing?
const newFolderName = ref('')
const editingFolderId = ref('')     // which folder is being renamed ('' = none)
const editName = ref('')

// Folder tabs in the "My stickers" panel
const activeFolder = ref('all')     // 'all' or a folder id

// The layer the toolbar is editing (null when nothing is selected)
const selectedLayer = computed(() => {
  return layers.value.find((item) => item.id === selectedId.value) || null
})

// The panel lists the TOP layer first, so we show a reversed copy.
// (The real list stays bottom-to-top, which is also the order the export draws in.)
const layersTopFirst = computed(() => [...layers.value].reverse())

// Which swatch should look "selected"
const activeColor = computed(() => {
  if (!drawing.value && selectedLayer.value && selectedLayer.value.type === 'text') {
    return selectedLayer.value.color
  }
  return currentColor.value
})

// Folder tabs: "All" shows everything, a folder tab shows only the stickers whose id is in that folder.
const visibleStickers = computed(() => {
  if (activeFolder.value === 'all') return myStickers.value
  const folder = folders.value.find((f) => f.id === activeFolder.value)
  if (!folder) return myStickers.value
  const ids = folder.stickerIds || []
  return myStickers.value.filter((sticker) => ids.includes(sticker.id))
})

// ----
// Small helpers
// ----

// A simple unique id so each layer can be found again.
function newId() {
  return Date.now() + '-' + Math.random().toString(16).slice(2)
}

// Keep a value inside a range (so layers cannot be dragged off the workspace).
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// Load an image URL and wait until its size is known.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

// Photos and stickers resize by "width"; text resizes by "size".
function sizeKey(layer) {
  return layer.type === 'image' ? 'width' : 'size'
}

function sizeLimits(layer) {
  return layer.type === 'image' ? [3, 200] : [3, 40]
}

// A short name for the layers panel
function layerLabel(layer) {
  if (layer.type === 'text') return layer.text || '(empty text)'
  return layer.name
}

// ----
// Adding layers
// ----
// "Remove background": send the picture to our server, then swap the layer's image for the cut-out.
async function cutOutBackground(layer) {
  errorMessage.value = ''
  removingBg.value = true
  try {
    // Turn the layer's picture back into a Blob. This works for a photo (blob: link),
    // an emoji (data: link) and a saved sticker (https link), so one function covers all three.
    const original = await (await fetch(layer.url)).blob()
    const cutOut = await removeBackground(original)

    const url = URL.createObjectURL(cutOut)
    const img = await loadImage(url)
    // Free the old picture only if it was a temporary browser link (an https link must not be revoked).
    if (layer.url.startsWith('blob:')) URL.revokeObjectURL(layer.url)
    layer.url = url
    layer.ratio = img.naturalHeight / img.naturalWidth // keep the shape correct
    layer.name = layer.name + ' (cut out)'
  } catch (error) {
    errorMessage.value = error.message || 'Could not remove the background.'
  } finally {
    removingBg.value = false // always re-enable the button
  }
}

// The Photo button just opens the hidden file picker.
function openFilePicker() {
  fileInput.value.click()
}

async function uploadPhoto(photo) {
  const file = photo.target.files[0]
  if (!file) return

  // Clear the input so choosing the same file again still triggers a change.
  photo.target.value = ''
  errorMessage.value = ''

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    errorMessage.value = 'Please upload a PNG, JPEG, or WebP image.'
    return
  }

  // A temporary browser link: the photo stays on this device, nothing is uploaded yet.
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const ratio = img.naturalHeight / img.naturalWidth
    // Fit the photo inside 80% of the workspace, whatever its shape.
    const fit = ratio <= 1 ? 80 : 80 / ratio
    addImageLayer(url, file.name, ratio, fit)
  } catch (error) {
    URL.revokeObjectURL(url)
    errorMessage.value = 'That image could not be opened.'
  }
}

// source records where the picture came from: 'photo' | 'sticker' | 'emoji'.
// Only a real photo gets the Remove background button, because the other two already have no background.
function addImageLayer(url, name, ratio, width, source = 'photo') {
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
    source: source, // remembered so the toolbar knows whether to offer background removal
  })
  drawing.value = false
  selectedId.value = id
}

async function addText() {
  const id = newId()
  layers.value.push({
    id: id,
    type: 'text',
    text: 'Your text',
    x: 50,
    y: 50,
    size: 12,           // percentage of the workspace width
    color: currentColor.value,
    bold: true,
    rotation: 0,
  })
  drawing.value = false
  selectedId.value = id
  // Wait for the toolbar to appear, then put the cursor in the text box.
  await nextTick()
  focusTextInput()
}

function focusTextInput() {
  if (textInputEl.value) {
    textInputEl.value.focus()
    textInputEl.value.select()
  }
}

// ----
// Stickers
// ----

// Draw an emoji on a small canvas and turn it into a picture, so it behaves like any image layer.
function emojiToDataUrl(emoji) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.font = '190px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 128, 140)
  return canvas.toDataURL('image/png')
}

// An emoji is already transparent, so it is not a photo and never needs cutting out.
function addPackSticker(emoji) {
  addImageLayer(emojiToDataUrl(emoji), emoji, 1, 30, 'emoji')
}

function toggleStickers() {
  showStickers.value = !showStickers.value
  // Load the user's saved stickers the first time the panel opens (accounts only).
  if (showStickers.value && isAccount.value && myStickers.value.length === 0) {
    loadMine()
  }
}

// Load my folders from Firebase. Only accounts have folders, so guests skip it.
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
    // Turn each stored file path into a link that an <img> can show.
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

// Download the saved sticker into the browser first, then use that local copy.
// A local copy is needed so the final PNG export is allowed to include it.
async function addMySticker(sticker) {
  errorMessage.value = ''
  try {
    const response = await fetch(sticker.thumbUrl)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const img = await loadImage(url)
    // A sticker saved in My Studio was already cut out when it was made, so mark it 'sticker'.
    addImageLayer(url, sticker.name, img.naturalHeight / img.naturalWidth, 30, 'sticker')
  } catch (error) {
    errorMessage.value = 'Could not add that sticker. Ask Gabriel to check the Storage CORS settings.'
  }
}

// ----
// Selecting, ordering and deleting layers
// ----

function selectLayer(layer) {
  drawing.value = false
  selectedId.value = layer.id
}

function deleteLayer(layer) {
  // Free the browser memory used by the temporary photo link.
  if (layer.type === 'image' && layer.url.startsWith('blob:')) {
    URL.revokeObjectURL(layer.url)
  }
  layers.value = layers.value.filter((item) => item.id !== layer.id)
  if (selectedId.value === layer.id) selectedId.value = null
  if (drawLayerId.value === layer.id) drawLayerId.value = null
}

// Later in the list = drawn on top.
function moveUp(layer) {
  const index = layers.value.indexOf(layer)
  if (index === -1 || index === layers.value.length - 1) return
  layers.value.splice(index, 1)
  layers.value.splice(index + 1, 0, layer)
}

function moveDown(layer) {
  const index = layers.value.indexOf(layer)
  if (index <= 0) return
  layers.value.splice(index, 1)
  layers.value.splice(index - 1, 0, layer)
}

function bringToFront(layer) {
  layers.value = layers.value.filter((item) => item.id !== layer.id)
  layers.value.push(layer)
}

function sendToBack(layer) {
  layers.value = layers.value.filter((item) => item.id !== layer.id)
  layers.value.unshift(layer)
}

// Put a photo or sticker back to the middle, upright and at its first size.
function resetLayer(layer) {
  layer.x = 50
  layer.y = 50
  layer.rotation = 0
  layer.width = layer.fitWidth
}

// ---- Drag and drop inside the Layers panel (the browser's built-in drag events) ----

let draggedId = null
const dropTargetId = ref(null) // highlights the row the dragged layer would land on

function onRowDragStart(layer) {
  draggedId = layer.id
}

function onRowDrop(target) {
  if (draggedId && draggedId !== target.id) {
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
  if (!drawing.value && selectedLayer.value && selectedLayer.value.type === 'text') {
    selectedLayer.value.color = color
  }
}

// ----
// Moving, resizing and rotating a layer on the canvas
// ----

// One object remembers the gesture in progress: 'move', 'resize' or 'rotate'.
let gesture = null

function startGesture(event, layer, mode) {
  event.preventDefault() // stops the browser from selecting text or dragging the image
  selectedId.value = layer.id

  const rect = stageEl.value.getBoundingClientRect()
  // The layer's centre in screen pixels: resizing and rotating are measured from here.
  const centerX = rect.left + (layer.x / 100) * rect.width
  const centerY = rect.top + (layer.y / 100) * rect.height

  gesture = {
    mode: mode,
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

  // Listen on the whole window so the gesture keeps working if the pointer leaves the element.
  window.addEventListener('pointermove', onGesture)
  window.addEventListener('pointerup', endGesture)
}

function onGesture(event) {
  if (!gesture) return
  const layer = layers.value.find((item) => item.id === gesture.id)
  if (!layer) return

  if (gesture.mode === 'move') {
    // Pixels moved, turned into percentages of the workspace
    const movedX = ((event.clientX - gesture.startX) / gesture.rectWidth) * 100
    const movedY = ((event.clientY - gesture.startY) / gesture.rectHeight) * 100
    layer.x = clamp(gesture.originX + movedX, 0, 100)
    layer.y = clamp(gesture.originY + movedY, 0, 100)
  } else if (gesture.mode === 'resize') {
    // Dragging the corner twice as far from the centre makes the layer twice as big.
    const distance = Math.hypot(event.clientX - gesture.centerX, event.clientY - gesture.centerY)
    const limits = sizeLimits(layer)
    layer[sizeKey(layer)] = clamp(gesture.startSize * (distance / gesture.startDistance), limits[0], limits[1])
  } else if (gesture.mode === 'rotate') {
    // The angle from the centre to the pointer. +90 because the handle sits straight above.
    let angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX) * 180 / Math.PI + 90
    if (angle > 180) angle -= 360
    layer.rotation = Math.round(angle)
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

function toggleDrawing() {
  drawing.value = !drawing.value
  selectedId.value = null
  drawLayerId.value = null // the next stroke starts a fresh drawing layer
}

// Mouse position -> percentage of the workspace (0 to 100)
function pointInStage(event) {
  const rect = stageEl.value.getBoundingClientRect()
  return [
    clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
  ]
}

// The stroke being drawn right now, and where the last sparkle was placed
let currentStroke = null
let lastStar = null

function startStroke(event) {
  // Keeps the move/up events coming to the overlay even if the pointer leaves it.
  event.currentTarget.setPointerCapture(event.pointerId)

  // Strokes go into one drawing layer, which is created on the first stroke.
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
    r: (1 + Math.random() * 1.2) * (0.7 + brushSize.value * 0.5), // a random size looks more natural
  })
}

// Remove the last stroke of the current drawing (an undo for drawing).
function undoStroke() {
  const layer = layers.value.find((item) => item.id === drawLayerId.value)
  if (!layer) return
  layer.strokes.pop()
  if (layer.strokes.length === 0) deleteLayer(layer) // an empty drawing is not worth keeping
}

// A 4-point star as an SVG path string. The preview uses it directly,
// and the export reuses the same string through Path2D, so both look identical.
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
// Exporting: ONE function draws the sticker, and both Download and Save reuse it,
// so the file on the laptop and the one in Firebase always look identical.
// ----

// Draw every layer, bottom to top, onto an off-screen canvas and return it as a PNG Blob.
// Returns null if it fails. Anything left undrawn stays transparent, which makes it a sticker.
async function renderPng() {
  errorMessage.value = ''
  if (layers.value.length === 0) {
    errorMessage.value = 'Add a photo, text or drawing first.'
    return null
  }

  const S = EXPORT_SIZE
  const k = S / 100 // converts "percent of the workspace" into export pixels
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')

  try {
    for (const layer of layers.value) {
      ctx.save()

      if (layer.type === 'image') {
        const img = await loadImage(layer.url)
        const w = layer.width * k
        const h = w * layer.ratio
        ctx.translate(layer.x * k, layer.y * k)
        ctx.rotate((layer.rotation * Math.PI) / 180)
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
      } else if (layer.type === 'text') {
        ctx.translate(layer.x * k, layer.y * k)
        ctx.rotate((layer.rotation * Math.PI) / 180)
        ctx.font = (layer.bold ? '700 ' : '400 ') + layer.size * k + 'px ' + FONT_FAMILY
        ctx.fillStyle = layer.color
        ctx.textAlign = 'center'     // matches translate(-50%, -50%) in the preview
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)' // the same thin shadow as the preview
        ctx.shadowBlur = 2 * (S / stageWidth.value)
        ctx.fillText(layer.text, 0, 0)
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
  } catch (error) {
    errorMessage.value = 'Could not create the PNG. If you added a saved sticker, check the Storage CORS settings.'
    return null
  }

  // toBlob uses a callback, so we wrap it in a Promise to be able to use await.
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Download button: saves the PNG to the user's device only. Nothing goes to Firebase.
async function downloadPng() {
  const blob = await renderPng()
  if (!blob) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'sticker.png'
  link.click()
  URL.revokeObjectURL(link.href) // tidy up the temporary link
}

// ----
// Saving to My Studio (Firebase). Nothing is downloaded to the device here.
// ----

// Click "Save to My Studio": open the pop-up (guests see a login prompt inside it instead)
async function openSave() {
  errorMessage.value = ''
  successMessage.value = ''
  if (layers.value.length === 0) {
    errorMessage.value = 'Add a photo, text or drawing first.'
    return
  }
  showSave.value = true
  await loadFolders() // fresh list every time, in case folders changed in another tab
}

function closeSave() {
  if (!saving.value) showSave.value = false // do not allow closing in the middle of an upload
}

// Tap a public pill to pick or unpick it. The cap is 3 because firestore.rules only allows 1-3 public categories.
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

// "+ Add": create a new folder and tick it straight away
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

// ✎ : start renaming a folder
function startRename(folder) {
  editingFolderId.value = folder.id
  editName.value = folder.name
}

// Save the new name
async function confirmRename(folder) {
  errorMessage.value = ''
  try {
    folder.name = await renameFolder(folder.id, editName.value)
    editingFolderId.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

// ✕ : delete a folder. The stickers inside are kept; only the folder is removed.
async function removeFolder(folder) {
  // askConfirm shows our own styled dialog and returns true/false, like confirm() but usable on phones.
  const sure = await askConfirm({
    title: 'Delete the folder "' + folder.name + '"?',
    message: 'Your stickers will not be deleted, only the folder.',
    confirmLabel: 'Delete folder',
    danger: true, // red button, and Cancel gets the focus
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

// The actual save. The sticker goes to Firebase (nothing downloads to the device).
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

  // Firebase needs 1-3 PUBLIC categories on every sticker. If the user only picked their own
  // folders, we quietly use 'other' so the rules accept it.
  const publicCategories = pickedDefaults.value.length > 0 ? pickedDefaults.value : ['other']

  saving.value = true
  try {
    const blob = await renderPng()
    if (!blob) return // renderPng already set the error message
    if (blob.size > 2 * 1024 * 1024) { // the storage rules reject files over 2 MB
      errorMessage.value = 'This sticker is over 2 MB. Try fewer or smaller photos.'
      return
    }

    // Step 1: upload the image + create the sticker document. Firebase makes the unique ID and returns it.
    const stickerId = await saveSticker({
      name: name,
      kind: 'static', // GIFs will use 'animated' later
      categories: publicCategories,
      image: blob,
    })

    // Step 2: add that ID to each of my chosen folders. The sticker is already safe at this point,
    // so a failure here only affects the folders.
    let folderFailed = false
    try {
      await addStickerToFolders(stickerId, pickedFolders.value)
    } catch (error) {
      folderFailed = true
    }

    successMessage.value = folderFailed
      ? '"' + name + '" was saved, but it could not be added to your folders.'
      : '"' + name + '" was saved to My Studio.'
    showSave.value = false
    stickerName.value = ''
    pickedDefaults.value = []
    pickedFolders.value = []
    myStickers.value = []
    await loadMine() // reload the My stickers list + folders so the new sticker shows up in its tabs
  } catch (error) {
    errorMessage.value = error.message || 'Could not save the sticker. Please try again.'
  } finally {
    saving.value = false // always re-enable the buttons, whether it worked or not
  }
}

// ----
// Lifecycle
// ----

// Watch the workspace size, so text stays proportional when the window is resized.
let resizeObserver = null

onMounted(() => {
  stageWidth.value = stageEl.value.clientWidth
  resizeObserver = new ResizeObserver(() => {
    stageWidth.value = stageEl.value.clientWidth
  })
  resizeObserver.observe(stageEl.value)
})

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect()
  endGesture() // remove the window listeners if the page is left mid-drag
  // Free every temporary photo link.
  layers.value.forEach((layer) => {
    if (layer.type === 'image' && layer.url.startsWith('blob:')) URL.revokeObjectURL(layer.url)
  })
})
</script>

<template>
  <section>
    <!-- Download = to this device only. Save = to Firebase only. -->
    <header class="mb-4 d-flex flex-wrap align-items-center justify-content-between gap-3">
      <div>
        <h1 class="h2 fw-bold">Sticker Maker</h1>
        <p class="text-secondary mb-0">
          Add a photo, text, drawings and stickers, then arrange the layers.
        </p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-success" @click="downloadPng">⬇ Download PNG</button>
        <button class="btn btn-primary" @click="openSave">💾 Save to My Studio</button>
      </div>
    </header>

    <div class="row g-4">
      <!-- LEFT: tools, contextual toolbar and the workspace -->
      <div class="col-lg-8">
        <!-- Round tool buttons. Each has a short label so nobody has to guess. -->
        <div class="d-flex flex-wrap gap-3 mb-3">
          <div class="tool text-center">
            <button class="btn btn-outline-primary rounded-circle tool-circle" title="Add a photo" @click="openFilePicker">🖼️</button>
            <div class="small">Photo</div>
          </div>
          <div class="tool text-center">
            <button class="btn btn-outline-primary rounded-circle tool-circle" title="Add text" @click="addText">T</button>
            <div class="small">Text</div>
          </div>
          <div class="tool text-center">
            <button
              class="btn rounded-circle tool-circle"
              :class="drawing ? 'btn-primary' : 'btn-outline-primary'"
              title="Draw"
              @click="toggleDrawing"
            >✏️</button>
            <div class="small">Draw</div>
          </div>
          <div class="tool text-center">
            <button
              class="btn rounded-circle tool-circle"
              :class="showStickers ? 'btn-primary' : 'btn-outline-primary'"
              title="Stickers"
              @click="toggleStickers"
            >⭐</button>
            <div class="small">Stickers</div>
          </div>
          <div class="tool text-center">
            <button
              class="btn rounded-circle tool-circle"
              :class="showLayers ? 'btn-primary' : 'btn-outline-primary'"
              title="Layers"
              @click="showLayers = !showLayers"
            >📚</button>
            <div class="small">Layers</div>
          </div>
        </div>

        <!-- Hidden: the Photo button clicks this for us. -->
        <input ref="fileInput" type="file" class="d-none" accept="image/png,image/jpeg,image/webp" @change="uploadPhoto" />

        <!-- While the pop-up is open, its own error line is shown instead, so this one is hidden. -->
        <div v-if="errorMessage && !showSave" class="alert alert-danger py-2" role="alert">{{ errorMessage }}</div>

        <div v-if="successMessage" class="alert alert-success py-2" role="alert">
          {{ successMessage }}
          <RouterLink to="/studio" class="alert-link">Open My Studio</RouterLink>
        </div>

        <!-- Contextual toolbar: only shows controls for what is selected right now -->
        <div v-if="drawing || selectedLayer" class="card mb-3">
          <div class="card-body py-2">
            <!-- DRAW controls -->
            <div v-if="drawing" class="d-flex flex-wrap align-items-center gap-2">
              <div class="btn-group btn-group-sm" role="group" aria-label="Brush">
                <button class="btn" :class="brush === 'pen' ? 'btn-primary' : 'btn-outline-primary'" @click="brush = 'pen'">🖊️ Pen</button>
                <button class="btn" :class="brush === 'highlighter' ? 'btn-primary' : 'btn-outline-primary'" @click="brush = 'highlighter'">🖍️ Highlighter</button>
                <button class="btn" :class="brush === 'sparkle' ? 'btn-primary' : 'btn-outline-primary'" @click="brush = 'sparkle'">✨ Sparkle</button>
              </div>
              <label for="brush-size" class="small mb-0 ms-2">Size</label>
              <input id="brush-size" v-model.number="brushSize" type="range" class="form-range w-auto" min="0.5" max="5" step="0.1" />
              <button class="btn btn-sm btn-outline-secondary ms-auto" @click="undoStroke">↩ Undo stroke</button>
              <button class="btn btn-sm btn-success" @click="toggleDrawing">Done</button>
            </div>

            <!-- TEXT controls -->
            <div v-else-if="selectedLayer.type === 'text'" class="d-flex flex-wrap align-items-center gap-2">
              <input
                ref="textInputEl"
                v-model="selectedLayer.text"
                type="text"
                class="form-control form-control-sm w-auto"
                maxlength="40"
                aria-label="Text"
              />
              <div class="form-check mb-0">
                <input id="text-bold" v-model="selectedLayer.bold" type="checkbox" class="form-check-input" />
                <label for="text-bold" class="form-check-label small">Bold</label>
              </div>
              <label for="text-size" class="small mb-0">Size</label>
              <input id="text-size" v-model.number="selectedLayer.size" type="range" class="form-range w-auto" min="3" max="40" step="0.5" />
              <label for="text-rotation" class="small mb-0">Rotate</label>
              <input id="text-rotation" v-model.number="selectedLayer.rotation" type="range" class="form-range w-auto" min="-180" max="180" step="1" />
            </div>

            <!-- PHOTO / STICKER controls -->
            <div v-else-if="selectedLayer.type === 'image'" class="d-flex flex-wrap align-items-center gap-2">
            <label for="image-size" class="small mb-0">Size</label>
            <input id="image-size" v-model.number="selectedLayer.width" type="range" class="form-range w-auto" min="5" max="150" step="1" />
            <label for="image-rotation" class="small mb-0">Rotate</label>
            <input id="image-rotation" v-model.number="selectedLayer.rotation" type="range" class="form-range w-auto" min="-180" max="180" step="1" />
            <button class="btn btn-sm btn-outline-secondary" @click="resetLayer(selectedLayer)">Reset</button>

            <!-- Only real photos get this: an emoji or a saved sticker already has no background,
                and every cut-out spends one of our remove.bg credits. -->
            <button
                v-if="selectedLayer.source === 'photo'"
                class="btn btn-sm btn-outline-primary"
                :disabled="removingBg"
                @click="cutOutBackground(selectedLayer)"
            >{{ removingBg ? 'Removing…' : '✂ Remove background' }}</button>
            </div>

            <!-- Colours: shared by text and drawing -->
            <div v-if="drawing || (selectedLayer && selectedLayer.type === 'text')" class="d-flex flex-wrap align-items-center gap-2 mt-2">
              <button
                v-for="color in SOLID_COLORS"
                :key="color"
                class="swatch"
                :class="{ active: activeColor === color }"
                :style="{ background: color }"
                :aria-label="'Colour ' + color"
                @click="pickColor(color)"
              ></button>
              <span class="swatch-gap"></span>
              <button
                v-for="color in PASTEL_COLORS"
                :key="color"
                class="swatch"
                :class="{ active: activeColor === color }"
                :style="{ background: color }"
                :aria-label="'Colour ' + color"
                @click="pickColor(color)"
              ></button>
              <input
                type="color"
                class="form-control form-control-color form-control-sm"
                :value="activeColor"
                title="Custom colour"
                @input="pickColor($event.target.value)"
              />
            </div>

            <!-- Quick layer actions: for any selected layer -->
            <div v-if="!drawing && selectedLayer" class="d-flex flex-wrap gap-2 mt-2">
              <button class="btn btn-sm btn-outline-secondary" @click="bringToFront(selectedLayer)">⬆ Bring to front</button>
              <button class="btn btn-sm btn-outline-secondary" @click="sendToBack(selectedLayer)">⬇ Send to back</button>
              <button class="btn btn-sm btn-outline-danger ms-auto" @click="deleteLayer(selectedLayer)">🗑 Delete</button>
            </div>
          </div>
        </div>

        <!-- THE WORKSPACE -->
        <div
          ref="stageEl"
          class="sticker-workspace border rounded position-relative"
          @pointerdown.self="selectedId = null"
        >
          <p v-if="layers.length === 0" class="empty-hint text-secondary text-center p-4 mb-0">
            Your sticker preview will appear here.<br />Start with the Photo or Text button.
          </p>

          <!-- One element per layer. Later layers are drawn on top, because that is the order in the list. -->
          <template v-for="item in layers" :key="item.id">
            <!-- Photo or sticker -->
            <div
              v-if="item.type === 'image'"
              class="layer-box"
              :class="{ 'is-selected': item.id === selectedId && !drawing }"
              :style="{
                left: item.x + '%',
                top: item.y + '%',
                width: item.width + '%',
                aspectRatio: '1 / ' + item.ratio,
                transform: 'translate(-50%, -50%) rotate(' + item.rotation + 'deg)',
              }"
              @pointerdown.stop="startGesture($event, item, 'move')"
            >
              <img :src="item.url" :alt="item.name" class="layer-image" draggable="false" />
            </div>

            <!-- Text -->
            <div
              v-else-if="item.type === 'text'"
              class="layer-box text-box"
              :class="{ 'is-selected': item.id === selectedId && !drawing }"
              :style="{
                left: item.x + '%',
                top: item.y + '%',
                fontSize: (item.size / 100) * stageWidth + 'px',
                color: item.color,
                fontWeight: item.bold ? 700 : 400,
                fontFamily: FONT_FAMILY,
                transform: 'translate(-50%, -50%) rotate(' + item.rotation + 'deg)',
              }"
              @pointerdown.stop="startGesture($event, item, 'move')"
              @dblclick="focusTextInput"
            >{{ item.text }}</div>

            <!-- Drawing: an SVG covering the whole workspace. 0-100 coordinates match our percentages. -->
            <svg
              v-else-if="item.type === 'draw'"
              class="draw-layer"
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

          <!-- Resize and rotate handles for the selected photo / sticker / text.
               They sit in the workspace (not inside the layer) so the layer's own style stays simple. -->
          <template v-if="selectedLayer && !drawing && selectedLayer.type !== 'draw'">
            <div
              class="handle-frame"
              :style="{
                left: selectedLayer.x + '%',
                top: selectedLayer.y + '%',
                width: selectedLayer.type === 'image' ? selectedLayer.width + '%' : 'auto',
                aspectRatio: selectedLayer.type === 'image' ? '1 / ' + selectedLayer.ratio : 'auto',
                transform: 'translate(-50%, -50%) rotate(' + selectedLayer.rotation + 'deg)',
              }"
            ></div>
          </template>

          <!-- While drawing, this transparent sheet catches the mouse so the layers underneath are not moved. -->
          <div
            v-if="drawing"
            class="draw-overlay"
            @pointerdown="startStroke"
            @pointermove="moveStroke"
            @pointerup="endStroke"
            @pointercancel="endStroke"
          ></div>
        </div>

        <p class="small text-secondary mt-3 mb-0">
          Downloads are a 512 × 512 PNG with a transparent background.
          Tip: drag to move. Use the Size and Rotate sliders to adjust the selected layer.
          Double-click text to edit it.
        </p>
      </div>

      <!-- RIGHT: stickers panel and layers panel -->
      <aside class="col-lg-4">
        <!-- Stickers -->
        <div v-if="showStickers" class="card mb-3">
          <div class="card-body">
            <h2 class="h5">Stickers</h2>
            <ul class="nav nav-pills nav-fill mb-3">
              <li class="nav-item">
                <button class="nav-link" :class="{ active: stickerTab === 'packs' }" @click="stickerTab = 'packs'">Sticker packs</button>
              </li>
              <li class="nav-item">
                <button
                  class="nav-link"
                  :class="{ active: stickerTab === 'mine' }"
                  @click="stickerTab = 'mine'; if (isAccount && myStickers.length === 0) loadMine()"
                >My stickers</button>
              </li>
            </ul>

            <!-- Built-in packs -->
            <div v-if="stickerTab === 'packs'">
              <div v-for="pack in STICKER_PACKS" :key="pack.name" class="mb-2">
                <div class="small fw-bold mb-1">{{ pack.name }}</div>
                <div class="d-flex flex-wrap gap-2">
                  <button
                    v-for="sticker in pack.stickers"
                    :key="sticker"
                    class="btn btn-light border sticker-pick"
                    @click="addPackSticker(sticker)"
                  >{{ sticker }}</button>
                </div>
              </div>
            </div>

            <!-- The user's saved stickers -->
            <div v-else>
              <p v-if="!isAccount" class="small text-secondary mb-0">
                <RouterLink :to="{ path: '/login', query: { redirect: '/sticker-maker' } }">Log in</RouterLink>
                to use the stickers you saved in My Studio.
              </p>
              <p v-else-if="loadingMine" class="small text-secondary mb-0">Loading…</p>
              <p v-else-if="myStickers.length === 0" class="small text-secondary mb-0">You have no saved stickers yet.</p>
              <div v-else>
                <!-- Tabs: "All" plus one per folder. Clicking one changes activeFolder, which filters the list. -->
                <div class="d-flex flex-wrap gap-1 mb-2">
                  <button type="button" class="btn btn-sm rounded-pill" :class="activeFolder === 'all' ? 'btn-primary' : 'btn-outline-primary'" @click="activeFolder = 'all'">All</button>
                  <button
                    v-for="folder in folders"
                    :key="folder.id"
                    type="button"
                    class="btn btn-sm rounded-pill"
                    :class="activeFolder === folder.id ? 'btn-primary' : 'btn-outline-primary'"
                    @click="activeFolder = folder.id"
                  >{{ folder.name }}</button>
                </div>

                <p v-if="visibleStickers.length === 0" class="small text-secondary mb-0">No stickers in this folder yet.</p>
                <div v-else class="d-flex flex-wrap gap-2">
                  <button
                    v-for="item in visibleStickers"
                    :key="item.id"
                    class="btn btn-light border sticker-pick p-1"
                    :title="item.name"
                    @click="addMySticker(item)"
                  >
                    <img :src="item.thumbUrl" :alt="item.name" class="sticker-thumb" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Layers: the top row is the front-most layer -->
        <div v-if="showLayers" class="card">
          <div class="card-body">
            <h2 class="h5">Layers</h2>
            <p class="small text-secondary">Drag a row to reorder. The top row is in front.</p>

            <ul v-if="layers.length > 0" class="list-group">
              <li
                v-for="layer in layersTopFirst"
                :key="layer.id"
                class="list-group-item d-flex align-items-center gap-2"
                :class="{
                  'bg-primary-subtle': layer.id === selectedId,
                  'drop-target': layer.id === dropTargetId,
                }"
                role="button"
                draggable="true"
                @click="selectLayer(layer)"
                @dragstart="onRowDragStart(layer)"
                @dragover.prevent="dropTargetId = layer.id"
                @dragleave="dropTargetId = null"
                @drop.prevent="onRowDrop(layer)"
                @dragend="onRowDragEnd"
              >
                <!-- A small picture so each layer is easy to recognise -->
                <img v-if="layer.type === 'image'" :src="layer.url" alt="" class="layer-thumb" />
                <span v-else class="layer-thumb d-inline-flex align-items-center justify-content-center bg-light">
                  {{ layer.type === 'text' ? 'T' : '✏️' }}
                </span>

                <span class="small text-truncate flex-grow-1">{{ layerLabel(layer) }}</span>

                <!-- Buttons work on phones too, where dragging rows is unreliable. .stop stops the row click. -->
                <button class="btn btn-sm btn-outline-secondary" title="Move up" @click.stop="moveUp(layer)">↑</button>
                <button class="btn btn-sm btn-outline-secondary" title="Move down" @click.stop="moveDown(layer)">↓</button>
                <button class="btn btn-sm btn-outline-danger" title="Delete" @click.stop="deleteLayer(layer)">✕</button>
              </li>
            </ul>
            <p v-else class="small text-secondary mb-0">No layers yet.</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- Save pop-up: only exists while showSave is true. The dark backdrop + .modal.d-block are plain Bootstrap CSS. -->
    <div v-if="showSave">
      <div class="modal-backdrop fade show"></div>
      <div class="modal d-block" tabindex="-1" role="dialog" @click.self="closeSave">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">

            <div class="modal-header">
              <h2 class="modal-title h5">Save to My Studio</h2>
              <button type="button" class="btn-close" aria-label="Close" @click="closeSave"></button>
            </div>

            <!-- Guests cannot save, so they get a login prompt instead of the form -->
            <div v-if="!isAccount" class="modal-body">
              <p class="mb-2">You need an account to save stickers to My Studio.</p>
              <RouterLink :to="{ path: '/login', query: { redirect: '/sticker-maker' } }" class="btn btn-primary btn-sm">Log in</RouterLink>
            </div>

            <div v-else>
              <div class="modal-body">
                <label for="sticker-name" class="form-label fw-bold">Sticker name</label>
                <input id="sticker-name" v-model="stickerName" type="text" class="form-control mb-3" maxlength="40" placeholder="e.g. My Favourites" />

                <!-- The 5 public categories. Max 3 can be picked, then the rest grey out. -->
                <div class="fw-bold mb-1">
                  Categories
                  <span class="text-secondary fw-normal small">(up to {{ MAX_CATEGORIES }})</span>
                </div>
                <div class="d-flex flex-wrap gap-2 mb-3">
                  <button
                    v-for="category in DEFAULT_CATEGORIES"
                    :key="category.id"
                    type="button"
                    class="btn btn-sm rounded-pill"
                    :class="pickedDefaults.includes(category.id) ? 'btn-primary' : 'btn-outline-primary'"
                    :disabled="!pickedDefaults.includes(category.id) && pickedDefaults.length >= MAX_CATEGORIES"
                    @click="toggleDefault(category.id)"
                  >
                    <span v-if="pickedDefaults.includes(category.id)">✓ </span>{{ category.label }}
                  </button>
                </div>

                <!-- The user's own folders -->
                <div class="fw-bold mb-1">My folders <span class="text-secondary fw-normal small">(only you see these)</span></div>
                <div class="d-flex flex-wrap gap-2 mb-2">
                  <div v-for="folder in folders" :key="folder.id">
                    <!-- Normal view: pill + ✎ + ✕ -->
                    <div v-if="editingFolderId !== folder.id" class="btn-group btn-group-sm">
                      <button type="button" class="btn" :class="pickedFolders.includes(folder.id) ? 'btn-success' : 'btn-outline-success'" @click="toggleFolder(folder.id)">
                        <span v-if="pickedFolders.includes(folder.id)">✓ </span>{{ folder.name }}
                      </button>
                      <button type="button" class="btn btn-outline-secondary" title="Rename" @click="startRename(folder)">✎</button>
                      <button type="button" class="btn btn-outline-danger" title="Delete" @click="removeFolder(folder)">✕</button>
                    </div>
                    <!-- Rename view: a small input with OK / cancel -->
                    <div v-else class="input-group input-group-sm">
                      <input v-model="editName" type="text" class="form-control" :maxlength="MAX_FOLDER_NAME" @keyup.enter="confirmRename(folder)" />
                      <button type="button" class="btn btn-success" @click="confirmRename(folder)">OK</button>
                      <button type="button" class="btn btn-outline-secondary" @click="editingFolderId = ''">✕</button>
                    </div>
                  </div>

                  <!-- "+ Add" pill turns into an input for the new folder's name -->
                  <button v-if="!addingFolder" type="button" class="btn btn-sm btn-outline-secondary rounded-pill" @click="addingFolder = true">+ Add</button>
                  <div v-else class="input-group input-group-sm w-auto">
                    <input v-model="newFolderName" type="text" class="form-control" :maxlength="MAX_FOLDER_NAME" placeholder="Folder name" @keyup.enter="addFolder" />
                    <button type="button" class="btn btn-success" @click="addFolder">Add</button>
                    <button type="button" class="btn btn-outline-secondary" @click="addingFolder = false">✕</button>
                  </div>
                </div>

                <p v-if="errorMessage" class="small text-danger mb-0">{{ errorMessage }}</p>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="closeSave">Cancel</button>
                <button type="button" class="btn btn-primary" :disabled="saving" @click="saveToStudio">
                  {{ saving ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Round tool buttons */
.tool-circle {
  width: 52px;
  height: 52px;
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1;
}

/* Colour swatches */
.swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid #adb5bd;
  padding: 0;
}
.swatch.active {
  outline: 3px solid #0d6efd;
  outline-offset: 1px;
}
.swatch-gap {
  width: 8px; /* a small gap between the solid and pastel colours */
}

/* A square workspace gives every sticker the same editing area. */
.sticker-workspace {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  touch-action: none;
  background-color: #ffffff;
  /* The checkerboard shows which parts of the sticker are transparent. */
  background-image:
    linear-gradient(45deg, #eeeeee 25%, transparent 25%),
    linear-gradient(-45deg, #eeeeee 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #eeeeee 75%),
    linear-gradient(-45deg, transparent 75%, #eeeeee 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
}

.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

/* Every photo, sticker and text sits at its percentage position, centred on that point. */
.layer-box {
  position: absolute;
  cursor: grab;
  user-select: none;
  touch-action: none; /* lets a finger drag the layer instead of scrolling the page */
}
.layer-image {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none; /* clicks go to the box, not the picture */
}
.text-box {
  white-space: nowrap;
  line-height: 1.1;
  /* A thin shadow keeps light text readable on light photos. */
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
}

/* A drawing covers the whole workspace but never blocks clicks on layers below it. */
.draw-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.draw-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  cursor: crosshair;
  touch-action: none;
}

/* The dashed frame around the selected layer */
.layer-box.is-selected {
  outline: 2px dashed #0d6efd;
  outline-offset: 2px;
}

/* The invisible frame that carries the handles (same size, position and angle as the layer) */
.handle-frame {
  position: absolute;
  pointer-events: none;
}

/* Sticker picker buttons and layer thumbnails */
.sticker-pick {
  width: 52px;
  height: 52px;
  font-size: 1.6rem;
  line-height: 1;
}
.sticker-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.layer-thumb {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 4px;
  flex-shrink: 0;
}

/* Shows where a dragged layer will land */
.drop-target {
  border-top: 3px solid #0d6efd;
}
</style>