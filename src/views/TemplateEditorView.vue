<script setup>
// =============================================================================
// Blue Studios Photobooth - Template Editor View
// =============================================================================
// TABLE OF CONTENTS:
// 1. Imports (Vue Core, Composables, Utilities, Data & Icons)
// 2. Core Reactive State & Model Definitions
//    - Viewport & Canvas Element Storage
//    - Template, Layout & Frame Geometry
//    - Frame Background, Texture & Border Properties
//    - Interactive Selection, Drag, Resize & Rotate States
//    - Typography & Inline Text Editing States
//    - Vector SVG Recoloring & Doodle Engine States
//    - User Uploads (IndexedDB) & Project Persistence
//    - Notification & Undo / Redo History
// 3. Computed Properties & Layer Helpers
// 4. Notification & Toast Engine
// 5. History Engine (Undo, Redo, Snapshot Management)
// 6. Template Presets & Layout Operations
// 7. Frame Background, Texture & Border Operations
// 8. Canvas Elements Operations (Adding Stickers, Washi, Shapes, Text)
// 9. Interactive Element Dragging & Smart Guide Snapping
// 10. Multi-Selection & Collective Transformations (Resize & Rotate)
// 11. Canvas Marquee / Rubberband Selection
// 12. Precision Transformations (Single Resize, Rotate, Nudge)
// 13. Layer Management, Ordering & Grouping
// 14. Typography & Double-Click Inline Text Editing
// 15. Canva-Style Vector SVG Dynamic Recoloring Engine
// 16. Freehand Doodle Drawing Engine & Eraser
// 17. User Media Uploads System (IndexedDB)
// 18. Saved Frames Storage & Editable PNG Export
// 19. Canvas Workspace Handlers (Pan, Zoom, Rulers & Mouse Events)
// 20. Global Keyboard Shortcuts & Event Listeners
// 21. Lifecycle Hooks (onMounted, onBeforeUnmount)
// =============================================================================

// =============================================================================
// 1. Imports
// =============================================================================
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

// Composables
import { useSmartGuides } from '../composables/useSmartGuides.js'
import { useCanvasViewport } from '../composables/useCanvasViewport.js'
import { useDoodleEngine } from '../composables/useDoodleEngine.js'

// Utilities & Engines
import {
  exportPhotostrip,
  MOCK_PORTRAIT_PHOTOS,
  sanitizeFilename
} from '../utils/exportEngine.js'
import {
  captureEditablePng,
  parseProjectFromFile,
  loadSavedFramesFromDB,
  saveFrameToDB,
  deleteSavedFrameFromDB,
  triggerFileDownload
} from '../utils/savedFrameEngine.js'

// Design Data & Presets
import {
  SVG_TEMPLATES,
  TEMPLATE_PRESETS,
  ELEMENT_CATEGORIES,
  ELEMENT_TAG_FILTERS,
  FONT_CATEGORIES,
  TEXT_PRESETS,
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  BACKGROUND_TEXTURES,
  BACKGROUND_PATTERNS,
  getTextureBackgroundImage,
  getTextureBackgroundSize
} from '../constants/templateEditorData.js'

// Components & Icons
import CanvasRulerOverlay from '../components/CanvasRulerOverlay.vue'
import SavedFramesModal from '../components/SavedFramesModal.vue'
import { IconFolder, IconSave, IconUsers, IconTrash, AppIcon } from '../components/icons/index.js'

// Aliases for template bindings
const templatePresets = TEMPLATE_PRESETS
const elementCategories = ELEMENT_CATEGORIES
const textPresets = TEXT_PRESETS
const bgColors = BACKGROUND_COLORS
const bgGradients = BACKGROUND_GRADIENTS
const bgTextures = BACKGROUND_TEXTURES
const bgPatterns = BACKGROUND_PATTERNS

// =============================================================================
// 2. Core Reactive State & Model Definitions
// =============================================================================

// --- DOM References ---
const stripRef = ref(null)
const canvasWorkspaceRef = ref(null)
const uploadInputRef = ref(null)
const captionInputRef = ref(null)
const textInputRefs = ref({})

// --- Notification System ---
const showNotification = ref(false)
const notificationMessage = ref('')

// --- History & Undo / Redo ---
const history = ref([])
const historyIndex = ref(-1)

// --- Viewport & Infinite Canvas Composable ---
const {
  scale: canvasScale,
  panX: canvasPanX,
  panY: canvasPanY,
  isPanning,
  isSpacePressed,
  isHandToolActive,
  showRulers,
  customGuides,
  cursorInfo,
  isDraggingGuide,
  draggedGuide,
  zoomPercentage,
  transformStyle,
  setZoom,
  zoomIn,
  zoomOut,
  fitToScreen,
  fillScreen,
  resetToActualSize,
  startPan,
  updatePan,
  endPan,
  handleWheel,
  updateCursorPos,
  startDraggingGuideFromRuler,
  startDraggingExistingGuide,
  finishDraggingGuide,
  removeGuide,
  clearAllGuides,
  toggleRulers
} = useCanvasViewport()

// --- Smart Magnetic Alignment Guides ---
const {
  activeGuides,
  activeDistanceBadges,
  initSnapTargets,
  computeSnapping,
  clearGuides
} = useSmartGuides()

// --- Freehand Doodle Brush Engine ---
const {
  isDrawMode,
  currentBrush,
  brushColor,
  brushWidth,
  isDrawing,
  currentPoints,
  activeStrokes,
  DOODLE_PALETTE,
  setBrush,
  pointsToSvgPath,
  computeBoundingBox,
  generateSparkles,
  createDoodleElement
} = useDoodleEngine()

// --- Editor Navigation & Toolbar State ---
const templateName = ref('Retro 4-cut')
const activeLayout = ref('1x4') // '1x4' | '2x2' | '3x1'
const slotCount = ref(4)
const slotShape = ref('Rounded') // 'Square' | 'Rounded' | 'Circle'
const activeTool = ref('elements') // 'templates' | 'elements' | 'text' | 'background' | 'layers'
const isDrawerOpen = ref(true)
const showCutouts = ref(true) // Toggle cutouts on/off
const cutoutsLayerPosition = ref('above') // 'above' (over elements) | 'below' (behind elements)
const activeBgTab = ref('colors') // 'colors' | 'gradients' | 'patterns'

// --- Frame Styling & Background Properties ---
const frameBg = ref({
  type: 'color', // 'color' | 'gradient'
  value: '#FEFBF6',
  baseColor: '#FEFBF6',
  texture: null,
  opacity: 0.85,
  blendMode: 'multiply',
  scale: 1
})
const selectedBgColor = ref('#FEFBF6')
const borderColor = ref('#2F5BEA')
const borderWidth = ref(6)
const captionText = ref('Exchange reunion · 16.10.26')
const isEditingCaption = ref(false)

// --- Canvas Elements & Selection State ---
const canvasElements = ref([])
const selectedElementIds = ref([])
const editingGroupId = ref(null)

// Proxy for single selection backwards-compatibility
const selectedElementId = computed({
  get: () => selectedElementIds.value[0] || null,
  set: (val) => {
    selectedElementIds.value = val === null ? [] : [val]
  }
})

// --- Dragging State ---
const isDragging = ref(false)
const hasDragged = ref(false)
const dragTarget = ref(null)
const dragData = ref({
  startX: 0,
  startY: 0,
  startElX: 0,
  startElY: 0,
  elementsInitial: [],
  stripWidth: 280,
  stripHeight: 556
})

// --- Marquee Rubberband Selection ---
const isMarqueeActive = ref(false)
const marqueeBoxStyle = ref(null)
let marqueeStart = null
let justFinishedMarquee = false

// --- Single Element Resize & Rotate States ---
const isResizing = ref(false)
const resizeTarget = ref(null)
const resizeData = ref({
  startX: 0,
  startY: 0,
  startW: 36,
  startH: 36,
  startFontSize: 24,
  handle: 'se'
})

const isRotating = ref(false)
const rotateTarget = ref(null)
const rotateCenter = ref({ x: 0, y: 0 })
const rotateStartAngle = ref(0)
const rotateInitialRotation = ref(0)

// --- Collective Multi-Selection Transform States ---
const isCollectiveResizing = ref(false)
const collectiveResizeData = ref({})
const isCollectiveRotating = ref(false)
const collectiveRotateData = ref({})

// --- Typography & Inline Text Editing ---
const editingTextId = ref(null)
const isFontDropdownOpen = ref(false)
const fontSearchQuery = ref('')
const isTextColorPickerOpen = ref(false)
const isTextSpacingOpen = ref(false)
const isTextEffectsOpen = ref(false)
let textHistoryTimer = null

// --- Vector SVG Dynamic Recoloring ---
const activeVectorColorTarget = ref(null)
const isVectorColorPickerOpen = ref(false)
const isDoodleColorPickerOpen = ref(false)

// --- UI Dropdown & Popover States ---
const isPositionPopoverOpen = ref(false)
const isZoomMenuOpen = ref(false)
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  targetElement: null
})

// --- Asset Search & Filtering ---
const elementSearchQuery = ref('')
const selectedElementTag = ref('All')

// --- User Uploads System (IndexedDB) ---
const userUploads = ref([])
const isUploading = ref(false)

// --- Saved Frames & Workspace Persistence ---
const isSavedFramesModalOpen = ref(false)
const savedFramesList = ref([])
const isSavingFrame = ref(false)
const currentSavedFrameId = ref(null)

// --- Export Configuration Fallbacks ---
const isExporting = ref(false)
const exportConfig = ref({
  includeMockPhotos: false,
  fileType: 'png'
})

// =============================================================================
// 3. Computed Properties & Layer Helpers
// =============================================================================

// Cutout Slots calculation (Width: 240px for single-column, 116px for 2x2)
const currentSlots = computed(() => {
  const count = slotCount.value
  const list = []
  const slotW = activeLayout.value === '2x2' ? 116 : 240
  for (let i = 0; i < count; i++) {
    list.push({
      id: i + 1,
      width: slotW,
      height: 116
    })
  }
  return list
})

const activeSelectedElement = computed(() => {
  if (selectedElementIds.value.length === 0) return null
  return canvasElements.value.find(el => el.id === selectedElementIds.value[0]) || null
})

const activeSelectedElements = computed(() => {
  return canvasElements.value.filter(el => selectedElementIds.value.includes(el.id))
})

const activeTextElement = computed(() => {
  if (selectedElementIds.value.length !== 1) return null
  const el = canvasElements.value.find(item => item.id === selectedElementIds.value[0])
  return el && el.type === 'text' ? el : null
})

const activeVectorElement = computed(() => {
  if (selectedElementIds.value.length !== 1) return null
  const el = canvasElements.value.find(item => item.id === selectedElementIds.value[0])
  if (!el) return null
  if (el.isSvg || el.type === 'shape' || el.type === 'tape') return el
  return null
})

const activeDoodleElement = computed(() => {
  if (selectedElementIds.value.length === 1) {
    const el = canvasElements.value.find(e => e.id === selectedElementIds.value[0])
    if (el && el.type === 'doodle') return el
  }
  return null
})

const canGroupSelected = computed(() => {
  if (selectedElementIds.value.length <= 1) return false
  const selected = activeSelectedElements.value
  const firstGroup = selected[0]?.groupId
  return !firstGroup || selected.some(el => el.groupId !== firstGroup)
})

const canUngroupSelected = computed(() => {
  if (selectedElementIds.value.length === 0) return false
  return activeSelectedElements.value.some(el => !!el.groupId)
})

// Reverse order for Layers drawer: Top-most element at index 0
const reversedElements = computed(() => {
  return [...canvasElements.value].reverse()
})

// Collective Bounding Box for multi-selection / groups
const collectiveBounds = computed(() => {
  if (selectedElementIds.value.length <= 1) return null
  const selected = activeSelectedElements.value
  if (selected.length <= 1) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  selected.forEach(el => {
    let w = 40
    let h = 40
    if (el.type === 'tape' || el.type === 'shape' || el.type === 'doodle') {
      w = el.width || 80
      h = el.height || 24
    } else if (el.type === 'sticker') {
      w = el.fontSize || 36
      h = el.fontSize || 36
    } else if (el.type === 'text') {
      const dom = stripRef.value?.querySelector(`[data-element-id="${el.id}"]`)
      if (dom) {
        w = dom.offsetWidth || (el.fontSize * (el.text ? el.text.length * 0.6 : 4))
        h = dom.offsetHeight || el.fontSize * 1.2
      } else {
        w = el.fontSize * (el.text ? el.text.length * 0.6 : 4)
        h = el.fontSize * 1.2
      }
    }
    const x = el.x || 0
    const y = el.y || 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  })

  const padding = 4
  minX = Math.round(minX - padding)
  minY = Math.round(minY - padding)
  maxX = Math.round(maxX + padding)
  maxY = Math.round(maxY + padding)

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(20, maxX - minX),
    height: Math.max(20, maxY - minY),
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2
  }
})

// Filtered Element Categories for Elements Drawer
const filteredElementCategories = computed(() => {
  const q = elementSearchQuery.value.trim().toLowerCase()
  const tag = selectedElementTag.value

  return elementCategories.map(cat => {
    let items = cat.items || []
    if (tag && tag !== 'All') {
      items = items.filter(it => it.tags && it.tags.includes(tag))
    }
    if (q) {
      items = items.filter(it => {
        const nameMatch = it.name && it.name.toLowerCase().includes(q)
        const tagMatch = it.tags && it.tags.some(t => t.toLowerCase().includes(q))
        return nameMatch || tagMatch
      })
    }
    return {
      ...cat,
      items
    }
  }).filter(cat => cat.items.length > 0)
})

// Sample Mock Photos Helper for Export
function getMockPhoto(index) {
  return MOCK_PORTRAIT_PHOTOS[index % MOCK_PORTRAIT_PHOTOS.length]
}

// =============================================================================
// 4. Notification & Toast Engine
// =============================================================================
function notify(msg) {
  notificationMessage.value = msg
  showNotification.value = true
  setTimeout(() => {
    showNotification.value = false
  }, 2200)
}

// =============================================================================
// 5. History Engine (Undo, Redo, Snapshot Management)
// =============================================================================
function saveHistoryState() {
  const snapshot = JSON.stringify({
    templateName: templateName.value,
    activeLayout: activeLayout.value,
    slotCount: slotCount.value,
    selectedBgColor: selectedBgColor.value,
    frameBg: frameBg.value,
    borderColor: borderColor.value,
    borderWidth: borderWidth.value,
    slotShape: slotShape.value,
    captionText: captionText.value,
    cutoutsLayerPosition: cutoutsLayerPosition.value,
    canvasElements: canvasElements.value
  })
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(snapshot)
  historyIndex.value = history.value.length - 1
}

function undo() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    const state = JSON.parse(history.value[historyIndex.value])
    applySnapshot(state)
    notify('Undo')
  }
}

function redo() {
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++
    const state = JSON.parse(history.value[historyIndex.value])
    applySnapshot(state)
    notify('Redo')
  }
}

function applySnapshot(state) {
  templateName.value = state.templateName
  activeLayout.value = state.activeLayout
  slotCount.value = state.slotCount
  selectedBgColor.value = state.selectedBgColor
  if (state.frameBg) {
    frameBg.value = { ...state.frameBg }
  } else {
    frameBg.value = {
      type: 'color',
      value: state.selectedBgColor || '#FEFBF6',
      baseColor: state.selectedBgColor || '#FEFBF6',
      texture: null,
      opacity: 0.85,
      blendMode: 'multiply',
      scale: 1
    }
  }
  borderColor.value = state.borderColor
  borderWidth.value = state.borderWidth
  slotShape.value = state.slotShape
  captionText.value = state.captionText
  if (state.cutoutsLayerPosition) cutoutsLayerPosition.value = state.cutoutsLayerPosition
  if (state.showCutouts !== undefined) showCutouts.value = state.showCutouts
  canvasElements.value = state.canvasElements || []
}

// =============================================================================
// 6. Template Presets & Layout Operations
// =============================================================================
function toggleDrawer(toolName) {
  if (isDrawMode.value && toolName !== 'draw') {
    finishDrawingSession()
  }
  if (activeTool.value === toolName && isDrawerOpen.value) {
    closeDrawer()
  } else {
    activeTool.value = toolName
    isDrawerOpen.value = true
    if (toolName === 'draw') {
      isDrawMode.value = true
      selectedElementIds.value = []
      notify('Draw Mode: pick a brush and doodle on the strip!')
    }
  }
}

async function closeDrawer() {
  if (isDrawMode.value) {
    finishDrawingSession()
  }
  isDrawerOpen.value = false
}

// Automatically refit photostrip to screen whenever drawer opens or closes
watch(isDrawerOpen, async () => {
  await nextTick()
  requestAnimationFrame(() => {
    fitToScreen(canvasWorkspaceRef.value, stripRef.value)
  })
})

function setLayout(layout) {
  activeLayout.value = layout
  if (layout === '1x4') slotCount.value = 4
  else if (layout === '2x2') slotCount.value = 4
  else if (layout === '3x1') slotCount.value = 3
  saveHistoryState()
}

function incrementSlots() {
  if (slotCount.value < 6) {
    slotCount.value++
    saveHistoryState()
  }
}

function decrementSlots() {
  if (slotCount.value > 1) {
    slotCount.value--
    saveHistoryState()
  }
}

function toggleCutouts() {
  showCutouts.value = !showCutouts.value
  notify(showCutouts.value ? 'Cutouts enabled' : 'Cutouts hidden')
}

function toggleCutoutsLayerPosition() {
  cutoutsLayerPosition.value = cutoutsLayerPosition.value === 'above' ? 'below' : 'above'
  notify(`Cutouts layer: ${cutoutsLayerPosition.value}`)
  saveHistoryState()
}

function applyTemplate(tpl) {
  templateName.value = tpl.name
  activeLayout.value = tpl.layout
  slotCount.value = tpl.slots
  selectedBgColor.value = tpl.bg
  frameBg.value.type = tpl.bgType || 'color'
  frameBg.value.value = tpl.gradient || tpl.bg
  frameBg.value.baseColor = tpl.bg
  frameBg.value.texture = tpl.texture || null
  borderColor.value = tpl.border
  borderWidth.value = tpl.borderWidth
  slotShape.value = tpl.shape
  captionText.value = tpl.caption

  if (tpl.elements && Array.isArray(tpl.elements)) {
    canvasElements.value = tpl.elements.map(el => {
      const id = 'el-' + Date.now() + '-' + Math.floor(Math.random() * 10000)
      return {
        id,
        type: el.type || 'sticker',
        name: el.name || 'Element',
        content: el.content || '',
        color: el.color || '#2F5BEA',
        strokeColor: el.strokeColor,
        strokeWidth: el.strokeWidth !== undefined ? el.strokeWidth : 0,
        shapeType: el.shapeType,
        patternColor: el.patternColor,
        isSvg: !!el.isSvg,
        svgRaw: el.svgRaw || '',
        colorMap: el.colorMap ? { ...el.colorMap } : {},
        fontSize: el.fontSize || 24,
        fontFamily: el.fontFamily || "'Montserrat', sans-serif",
        fontWeight: el.fontWeight || 'bold',
        text: el.text || '',
        width: el.width || 40,
        height: el.height || 40,
        x: el.x || 80,
        y: el.y || 80,
        rotation: el.rotation || 0,
        scaleX: 1,
        scaleY: 1,
        isLocked: false,
        isHidden: false
      }
    })
  } else {
    canvasElements.value = []
  }
  selectedElementIds.value = []
  notify(`Applied template "${tpl.name}"`)
  saveHistoryState()
}

// =============================================================================
// 7. Frame Background, Texture & Border Operations
// =============================================================================
function setFrameSolidColor(hex) {
  selectedBgColor.value = hex
  frameBg.value.type = 'color'
  frameBg.value.value = hex
  frameBg.value.baseColor = hex
  saveHistoryState()
}

function setFrameGradient(val) {
  frameBg.value.type = 'gradient'
  frameBg.value.value = val
  saveHistoryState()
}

function setFrameTexture(id) {
  frameBg.value.texture = id
  saveHistoryState()
}

function clearFrameTexture() {
  frameBg.value.texture = null
  saveHistoryState()
}

function getFrameStyle() {
  const isGradient = frameBg.value.type === 'gradient'
  return {
    background: isGradient ? frameBg.value.value : (frameBg.value.baseColor || selectedBgColor.value),
    border: 'none'
  }
}

function getFrameTextureStyle() {
  const tex = frameBg.value.texture
  if (!tex) return {}
  const bgImg = getTextureBackgroundImage(tex)
  const bgSize = getTextureBackgroundSize(tex, frameBg.value.scale || 1)
  return {
    backgroundImage: bgImg,
    backgroundSize: bgSize,
    opacity: frameBg.value.opacity !== undefined ? frameBg.value.opacity : 0.85,
    mixBlendMode: frameBg.value.blendMode || 'multiply'
  }
}

function incrementBorderWidth() {
  if (borderWidth.value < 10) {
    borderWidth.value++
    saveHistoryState()
  }
}

function decrementBorderWidth() {
  if (borderWidth.value > 0) {
    borderWidth.value--
    saveHistoryState()
  }
}

function onBorderWidthChange(val) {
  const num = Math.max(0, Math.min(10, parseInt(val, 10) || 0))
  borderWidth.value = num
  saveHistoryState()
}

// =============================================================================
// 8. Canvas Elements Operations (Adding Stickers, Washi, Shapes, Text)
// =============================================================================
function addElement(item) {
  const id = 'el-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
  const newEl = {
    id,
    type: item.type,
    name: item.name || 'Element',
    content: item.content || '',
    color: item.color || '#2F5BEA',
    strokeColor: item.strokeColor || (item.type === 'shape' ? '#0F172A' : undefined),
    strokeWidth: item.strokeWidth !== undefined ? item.strokeWidth : (item.type === 'shape' ? 2 : 0),
    shapeType: item.shapeType,
    patternColor: item.patternColor || (item.type === 'tape' ? '#FFFFFF' : undefined),
    isSvg: !!item.isSvg,
    svgRaw: item.svgRaw || '',
    colorMap: item.colorMap ? { ...item.colorMap } : {},
    fontSize: item.fontSize || 24,
    width: item.width || (item.isSvg ? 56 : (item.type === 'tape' ? 90 : 40)),
    height: item.height || (item.isSvg ? 56 : (item.type === 'tape' ? 20 : 40)),
    x: 80 + Math.floor(Math.random() * 40) - 20,
    y: 130 + Math.floor(Math.random() * 60) - 30,
    rotation: Math.floor(Math.random() * 16) - 8,
    isLocked: false,
    isHidden: false
  }
  canvasElements.value.push(newEl)
  selectedElementId.value = id
  notify(`Added ${item.name}`)
  saveHistoryState()
}

function addTextElement(preset) {
  const id = 'txt-' + Date.now()
  const newText = normalizeTextElement({
    id,
    type: 'text',
    name: preset.text ? `Text: ${preset.text.slice(0, 14)}` : 'Text block',
    text: preset.text || 'Add text here',
    fontFamily: preset.fontFamily || "'Montserrat', sans-serif",
    fontSize: preset.fontSize || 22,
    fontWeight: preset.fontWeight || 'normal',
    fontStyle: preset.fontStyle || 'normal',
    textDecoration: preset.textDecoration || 'none',
    textTransform: preset.textTransform || 'none',
    textAlign: preset.textAlign || 'center',
    letterSpacing: preset.letterSpacing || 0,
    lineHeight: preset.lineHeight || 1.2,
    color: preset.color || '#0F172A',
    effect: preset.effect || 'none',
    effectSettings: preset.effectSettings ? JSON.parse(JSON.stringify(preset.effectSettings)) : {
      shadow: { offsetX: 3, offsetY: 3, blur: 4, opacity: 0.6, color: '#000000', direction: 45 },
      stroke: { width: 3, color: preset.color && preset.color !== '#FFFFFF' ? preset.color : '#0F172A', isHollow: true },
      echo: { offset: 4, color: '#FF4081' },
      badge: { color: '#FFD166', padding: 8, borderRadius: 8 }
    },
    curveAmount: preset.curveAmount || 0,
    x: 40,
    y: 40,
    rotation: 0,
    isLocked: false,
    isHidden: false
  })
  canvasElements.value.push(newText)
  selectedElementIds.value = [id]
  notify(`Added ${preset.label || 'text block'}`)
  saveHistoryState()
}

// =============================================================================
// 9. Interactive Element Dragging & Smart Guide Snapping
// =============================================================================
function selectElement(el, event) {
  event.stopPropagation()
  isPositionPopoverOpen.value = false
  if (el.isLocked) {
    if (el.groupId) {
      selectedElementIds.value = canvasElements.value.filter(item => item.groupId === el.groupId).map(item => item.id)
    } else {
      selectedElementIds.value = [el.id]
    }
    notify('Element is locked (Unlock in Layers)', 'info')
    return
  }

  const isMultiModifier = event.shiftKey || event.metaKey || event.ctrlKey

  if (isMultiModifier) {
    if (el.groupId) {
      const groupItems = canvasElements.value.filter(item => item.groupId === el.groupId).map(item => item.id)
      const isEntireGroupSelected = groupItems.every(id => selectedElementIds.value.includes(id))
      if (isEntireGroupSelected) {
        selectedElementIds.value = selectedElementIds.value.filter(id => !groupItems.includes(id))
      } else {
        selectedElementIds.value = Array.from(new Set([...selectedElementIds.value, ...groupItems]))
      }
    } else {
      if (selectedElementIds.value.includes(el.id)) {
        selectedElementIds.value = selectedElementIds.value.filter(id => !id === el.id)
      } else {
        selectedElementIds.value = [...selectedElementIds.value, el.id]
      }
    }
    return
  }

  // Normal single click (no modifier)
  if (el.groupId) {
    const groupItems = canvasElements.value.filter(item => item.groupId === el.groupId).map(item => item.id)
    selectedElementIds.value = groupItems
    editingGroupId.value = null
  } else {
    if (!selectedElementIds.value.includes(el.id)) {
      selectedElementIds.value = [el.id]
      editingGroupId.value = null
    }
  }

  if (editingTextId.value === el.id) return

  if (event.type === 'mousedown') {
    startDrag(el, event)
  }
}

function onElementDblClick(el) {
  if (el.groupId) {
    editingGroupId.value = el.groupId
    selectedElementIds.value = [el.id]
    notify(`Editing child inside group (${el.name || 'item'})`, 'info')
  }
  if (el.type === 'text') {
    startEditingText(el)
  }
}

function startDrag(el, event) {
  if (event.button !== 0) return
  event.preventDefault()

  if (event.altKey) {
    duplicateSelectedElements()
  }

  isDragging.value = true
  hasDragged.value = false
  dragTarget.value = el
  const frameW = stripRef.value?.offsetWidth || 280
  const frameH = stripRef.value?.offsetHeight || 556

  const selectedItems = canvasElements.value.filter(item => selectedElementIds.value.includes(item.id))
  dragData.value = {
    startX: event.clientX,
    startY: event.clientY,
    startElX: el.x || 0,
    startElY: el.y || 0,
    elementsInitial: selectedItems.map(item => ({
      id: item.id,
      startX: item.x || 0,
      startY: item.y || 0
    })),
    stripWidth: frameW,
    stripHeight: frameH
  }

  initSnapTargets({
    stripEl: stripRef.value,
    activeElementId: el.id,
    showCutouts: showCutouts.value,
    customGuides: customGuides.value
  })

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(event) {
  if (!isDragging.value || !dragTarget.value) return
  const dx = (event.clientX - dragData.value.startX) / canvasScale.value
  const dy = (event.clientY - dragData.value.startY) / canvasScale.value
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    hasDragged.value = true
  }

  const rawX = dragData.value.startElX + dx
  const rawY = dragData.value.startElY + dy

  const snapped = computeSnapping(rawX, rawY)
  let newX = snapped.x
  let newY = snapped.y

  newX = Math.max(-50, Math.min(newX, dragData.value.stripWidth - 10))
  newY = Math.max(-50, Math.min(newY, dragData.value.stripHeight - 10))

  const finalDx = Math.round(newX - dragData.value.startElX)
  const finalDy = Math.round(newY - dragData.value.startElY)

  if (dragData.value.elementsInitial && dragData.value.elementsInitial.length > 0) {
    dragData.value.elementsInitial.forEach(initial => {
      const item = canvasElements.value.find(c => c.id === initial.id)
      if (item && !item.isLocked) {
        item.x = Math.round(initial.startX + finalDx)
        item.y = Math.round(initial.startY + finalDy)
      }
    })
  } else {
    dragTarget.value.x = Math.round(newX)
    dragTarget.value.y = Math.round(newY)
  }
}

function onMouseUp() {
  if (isDragging.value) {
    isDragging.value = false
    dragTarget.value = null
    clearGuides()
    if (hasDragged.value) {
      saveHistoryState()
    }
  }
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

// =============================================================================
// 10. Multi-Selection & Collective Transformations (Resize & Rotate)
// =============================================================================
function startCollectiveDrag(event) {
  if (event.button !== 0) return
  if (event.shiftKey || event.metaKey || event.ctrlKey) {
    const elements = activeSelectedElements.value
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      const dom = stripRef.value?.querySelector(`[data-element-id="${el.id}"]`)
      if (dom) {
        const r = dom.getBoundingClientRect()
        if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) {
          selectElement(el, event)
          return
        }
      }
    }
  }
  const primaryEl = activeSelectedElements.value[0]
  if (primaryEl) {
    startDrag(primaryEl, event)
  }
}

function onCollectiveDblClick(event) {
  const elements = activeSelectedElements.value
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    const dom = stripRef.value?.querySelector(`[data-element-id="${el.id}"]`)
    if (dom) {
      const r = dom.getBoundingClientRect()
      if (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      ) {
        onElementDblClick(el)
        return
      }
    }
  }
}

function startCollectiveResize(handle, event) {
  if (event.button !== 0) return
  event.preventDefault()
  isCollectiveResizing.value = true
  const bounds = collectiveBounds.value
  if (!bounds) return

  const selectedItems = activeSelectedElements.value.filter(el => !el.isLocked)
  collectiveResizeData.value = {
    handle,
    startX: event.clientX,
    startY: event.clientY,
    initialBounds: { ...bounds },
    elementsInitial: selectedItems.map(el => ({
      id: el.id,
      x: el.x || 0,
      y: el.y || 0,
      width: el.width || 40,
      height: el.height || 40,
      fontSize: el.fontSize || 36
    }))
  }

  window.addEventListener('mousemove', onCollectiveResizeMove)
  window.addEventListener('mouseup', onCollectiveResizeUp)
}

function onCollectiveResizeMove(event) {
  if (!isCollectiveResizing.value) return
  const { handle, startX, startY, initialBounds, elementsInitial } = collectiveResizeData.value
  const dx = (event.clientX - startX) / canvasScale.value
  const dy = (event.clientY - startY) / canvasScale.value

  let scale = 1
  if (handle === 'se') {
    const scaleX = (initialBounds.width + dx) / initialBounds.width
    const scaleY = (initialBounds.height + dy) / initialBounds.height
    scale = Math.max(0.2, (scaleX + scaleY) / 2)
  } else if (handle === 'sw') {
    const scaleX = (initialBounds.width - dx) / initialBounds.width
    const scaleY = (initialBounds.height + dy) / initialBounds.height
    scale = Math.max(0.2, (scaleX + scaleY) / 2)
  } else if (handle === 'ne') {
    const scaleX = (initialBounds.width + dx) / initialBounds.width
    const scaleY = (initialBounds.height - dy) / initialBounds.height
    scale = Math.max(0.2, (scaleX + scaleY) / 2)
  } else if (handle === 'nw') {
    const scaleX = (initialBounds.width - dx) / initialBounds.width
    const scaleY = (initialBounds.height - dy) / initialBounds.height
    scale = Math.max(0.2, (scaleX + scaleY) / 2)
  }

  elementsInitial.forEach(initial => {
    const item = canvasElements.value.find(c => c.id === initial.id)
    if (!item) return
    const relX = initial.x - initialBounds.minX
    const relY = initial.y - initialBounds.minY
    item.x = Math.round(initialBounds.minX + relX * scale)
    item.y = Math.round(initialBounds.minY + relY * scale)
    if (item.type === 'tape' || item.type === 'shape') {
      item.width = Math.max(16, Math.round(initial.width * scale))
      item.height = Math.max(10, Math.round(initial.height * scale))
    } else if (item.type === 'sticker' || item.type === 'text') {
      item.fontSize = Math.max(10, Math.round(initial.fontSize * scale))
    }
  })
}

function onCollectiveResizeUp() {
  if (isCollectiveResizing.value) {
    isCollectiveResizing.value = false
    saveHistoryState()
  }
  window.removeEventListener('mousemove', onCollectiveResizeMove)
  window.removeEventListener('mouseup', onCollectiveResizeUp)
}

function startCollectiveRotate(event) {
  if (event.button !== 0) return
  event.preventDefault()
  isCollectiveRotating.value = true
  const bounds = collectiveBounds.value
  if (!bounds) return

  const stripRect = stripRef.value.getBoundingClientRect()
  const collectiveClientCenterX = stripRect.left + bounds.centerX
  const collectiveClientCenterY = stripRect.top + bounds.centerY

  const startAngle = Math.atan2(event.clientY - collectiveClientCenterY, event.clientX - collectiveClientCenterX) * (180 / Math.PI)
  const selectedItems = activeSelectedElements.value.filter(el => !el.isLocked)

  collectiveRotateData.value = {
    centerX: bounds.centerX,
    centerY: bounds.centerY,
    clientCenterX: collectiveClientCenterX,
    clientCenterY: collectiveClientCenterY,
    startAngle,
    elementsInitial: selectedItems.map(el => ({
      id: el.id,
      x: el.x || 0,
      y: el.y || 0,
      rotation: el.rotation || 0
    }))
  }

  window.addEventListener('mousemove', onCollectiveRotateMove)
  window.addEventListener('mouseup', onCollectiveRotateUp)
}

function onCollectiveRotateMove(event) {
  if (!isCollectiveRotating.value) return
  const { centerX, centerY, clientCenterX, clientCenterY, startAngle, elementsInitial } = collectiveRotateData.value
  const currentAngle = Math.atan2(event.clientY - clientCenterY, event.clientX - clientCenterX) * (180 / Math.PI)
  let deltaDeg = Math.round(currentAngle - startAngle)

  const normalized = (deltaDeg % 360 + 360) % 360
  ;[0, 90, 180, 270, 360].forEach(snap => {
    if (Math.abs(normalized - snap) < 4) {
      deltaDeg += (snap - normalized)
    }
  })

  const rad = (deltaDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  elementsInitial.forEach(initial => {
    const item = canvasElements.value.find(c => c.id === initial.id)
    if (!item) return
    const relX = initial.x - centerX
    const relY = initial.y - centerY
    item.x = Math.round(centerX + (relX * cos - relY * sin))
    item.y = Math.round(centerY + (relX * sin + relY * cos))
    item.rotation = Math.round(((initial.rotation || 0) + deltaDeg) % 360)
  })
}

function onCollectiveRotateUp() {
  if (isCollectiveRotating.value) {
    isCollectiveRotating.value = false
    saveHistoryState()
  }
  window.removeEventListener('mousemove', onCollectiveRotateMove)
  window.removeEventListener('mouseup', onCollectiveRotateUp)
}

// =============================================================================
// 11. Canvas Marquee / Rubberband Selection
// =============================================================================
function startMarqueeSelection(event) {
  if (event.button !== 0) return
  const target = event.target
  if (
    target.closest('.canvas-element') ||
    target.closest('.collective-bounding-box') ||
    target.closest('.strip-caption') ||
    target.closest('button') ||
    target.closest('.resize-handle') ||
    target.closest('.element-rotate-handle')
  ) {
    return
  }

  const workspaceEl = canvasWorkspaceRef.value
  if (!workspaceEl) return

  const workspaceRect = workspaceEl.getBoundingClientRect()
  marqueeStart = {
    clientX: event.clientX,
    clientY: event.clientY,
    workspaceX: event.clientX - workspaceRect.left + workspaceEl.scrollLeft,
    workspaceY: event.clientY - workspaceRect.top + workspaceEl.scrollTop,
    shiftKey: event.shiftKey || event.metaKey || event.ctrlKey,
    initialSelected: [...selectedElementIds.value]
  }

  window.addEventListener('mousemove', onMarqueeMouseMove)
  window.addEventListener('mouseup', onMarqueeMouseUp)
}

function onMarqueeMouseMove(event) {
  if (!marqueeStart) return
  const dx = event.clientX - marqueeStart.clientX
  const dy = event.clientY - marqueeStart.clientY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    isMarqueeActive.value = true
  }
  if (!isMarqueeActive.value) return

  const workspaceEl = canvasWorkspaceRef.value
  if (!workspaceEl) return
  const workspaceRect = workspaceEl.getBoundingClientRect()
  const currentWorkspaceX = event.clientX - workspaceRect.left + workspaceEl.scrollLeft
  const currentWorkspaceY = event.clientY - workspaceRect.top + workspaceEl.scrollTop

  const left = Math.min(marqueeStart.workspaceX, currentWorkspaceX)
  const top = Math.min(marqueeStart.workspaceY, currentWorkspaceY)
  const width = Math.abs(currentWorkspaceX - marqueeStart.workspaceX)
  const height = Math.abs(currentWorkspaceY - marqueeStart.workspaceY)

  marqueeBoxStyle.value = {
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: height + 'px'
  }

  const clientMinX = Math.min(marqueeStart.clientX, event.clientX)
  const clientMaxX = Math.max(marqueeStart.clientX, event.clientX)
  const clientMinY = Math.min(marqueeStart.clientY, event.clientY)
  const clientMaxY = Math.max(marqueeStart.clientY, event.clientY)

  const intersectedIds = []
  canvasElements.value.forEach(el => {
    if (el.isLocked || el.isHidden) return
    const domEl = stripRef.value?.querySelector(`[data-element-id="${el.id}"]`)
    if (!domEl) return
    const r = domEl.getBoundingClientRect()
    const isIntersecting = !(r.right < clientMinX || r.left > clientMaxX || r.bottom < clientMinY || r.top > clientMaxY)
    if (isIntersecting) {
      intersectedIds.push(el.id)
    }
  })

  if (marqueeStart.shiftKey) {
    const unionSet = new Set([...marqueeStart.initialSelected, ...intersectedIds])
    selectedElementIds.value = Array.from(unionSet)
  } else {
    selectedElementIds.value = intersectedIds
  }
}

function onMarqueeMouseUp() {
  if (isMarqueeActive.value) {
    isMarqueeActive.value = false
    marqueeBoxStyle.value = null
    justFinishedMarquee = true
    setTimeout(() => {
      justFinishedMarquee = false
    }, 120)
  }
  marqueeStart = null
  window.removeEventListener('mousemove', onMarqueeMouseMove)
  window.removeEventListener('mouseup', onMarqueeMouseUp)
}

// =============================================================================
// 12. Precision Transformations (Single Resize, Rotate, Nudge)
// =============================================================================
function startResize(el, handle, event) {
  event.stopPropagation()
  event.preventDefault()
  isResizing.value = true
  resizeTarget.value = el
  resizeData.value = {
    startX: event.clientX,
    startY: event.clientY,
    startW: el.width || 36,
    startH: el.height || 36,
    startFontSize: el.fontSize || 24,
    handle: handle
  }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeUp)
}

function onResizeMove(event) {
  if (!isResizing.value || !resizeTarget.value) return
  const el = resizeTarget.value
  const { startX, startY, startW, startH, startFontSize, handle } = resizeData.value
  let dx = (event.clientX - startX) / canvasScale.value
  let dy = (event.clientY - startY) / canvasScale.value

  if (handle === 'nw') {
    dx = -dx
    dy = -dy
  } else if (handle === 'ne') {
    dy = -dy
  } else if (handle === 'sw') {
    dx = -dx
  }

  if (el.type === 'sticker' || el.type === 'text' || el.type === 'image' || el.type === 'doodle') {
    const delta = (dx + dy) / 2
    const scale = Math.max(0.25, (startW + delta) / startW)
    if (el.fontSize) el.fontSize = Math.max(12, Math.min(84, Math.round(startFontSize * scale)))
    el.width = Math.max(18, Math.min(500, Math.round(startW * scale)))
    el.height = Math.max(18, Math.min(500, Math.round(startH * scale)))
  } else {
    el.width = Math.max(25, Math.min(260, Math.round(startW + dx)))
    el.height = Math.max(10, Math.min(180, Math.round(startH + dy)))
  }
}

function onResizeUp() {
  if (isResizing.value) {
    isResizing.value = false
    resizeTarget.value = null
    saveHistoryState()
  }
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeUp)
}

function startRotate(el, event) {
  event.stopPropagation()
  event.preventDefault()
  isRotating.value = true
  rotateTarget.value = el

  const elElem = event.target.closest('.canvas-element')
  if (elElem) {
    const rect = elElem.getBoundingClientRect()
    rotateCenter.value = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }
  }

  rotateStartAngle.value = Math.atan2(
    event.clientY - rotateCenter.value.y,
    event.clientX - rotateCenter.value.x
  ) * (180 / Math.PI)

  rotateInitialRotation.value = el.rotation || 0

  window.addEventListener('mousemove', onRotateMove)
  window.addEventListener('mouseup', onRotateUp)
}

function onRotateMove(event) {
  if (!isRotating.value || !rotateTarget.value) return
  const currentAngle = Math.atan2(
    event.clientY - rotateCenter.value.y,
    event.clientX - rotateCenter.value.x
  ) * (180 / Math.PI)

  let newRot = Math.round(rotateInitialRotation.value + (currentAngle - rotateStartAngle.value))
  newRot = ((newRot + 180) % 360) - 180

  if (Math.abs(newRot) < 5) newRot = 0
  else if (Math.abs(newRot - 90) < 5) newRot = 90
  else if (Math.abs(newRot + 90) < 5) newRot = -90
  else if (Math.abs(Math.abs(newRot) - 180) < 5) newRot = 180

  rotateTarget.value.rotation = newRot
}

function onRotateUp() {
  if (isRotating.value) {
    isRotating.value = false
    rotateTarget.value = null
    saveHistoryState()
  }
  window.removeEventListener('mousemove', onRotateMove)
  window.removeEventListener('mouseup', onRotateUp)
}

let nudgeDebounceTimer = null
function nudgeSelectedElements(dx, dy) {
  const selected = canvasElements.value.filter(el => selectedElementIds.value.includes(el.id) && !el.isLocked)
  if (selected.length === 0) return
  selected.forEach(el => {
    el.x = (el.x || 0) + dx
    el.y = (el.y || 0) + dy
  })
  clearTimeout(nudgeDebounceTimer)
  nudgeDebounceTimer = setTimeout(() => {
    saveHistoryState()
  }, 400)
}

function selectAll() {
  const selectable = canvasElements.value.filter(el => !el.isLocked && !el.isHidden)
  selectedElementIds.value = selectable.map(el => el.id)
  if (selectedElementIds.value.length > 0) {
    notify(`Selected ${selectedElementIds.value.length} elements`)
  }
}

// =============================================================================
// 13. Layer Management, Ordering & Grouping
// =============================================================================
function groupSelectedElements() {
  if (selectedElementIds.value.length <= 1) return
  const newGroupId = 'grp-' + Date.now()
  canvasElements.value.forEach(el => {
    if (selectedElementIds.value.includes(el.id)) {
      el.groupId = newGroupId
    }
  })
  notify(`Grouped ${selectedElementIds.value.length} elements (⌘G)`)
  saveHistoryState()
}

function ungroupSelectedElements() {
  if (selectedElementIds.value.length === 0) return
  let count = 0
  canvasElements.value.forEach(el => {
    if (selectedElementIds.value.includes(el.id) && el.groupId) {
      delete el.groupId
      count++
    }
  })
  editingGroupId.value = null
  notify(`Ungrouped ${count} elements (⇧⌘G)`)
  saveHistoryState()
}

function removeSelectedElement() {
  removeSelectedElements()
}

function removeSelectedElements() {
  if (selectedElementIds.value.length === 0) return
  const idsToRemove = new Set(selectedElementIds.value)
  canvasElements.value = canvasElements.value.filter(el => !idsToRemove.has(el.id))
  selectedElementIds.value = []
  isPositionPopoverOpen.value = false
  closeContextMenu()
  notify('Deleted elements')
  saveHistoryState()
}

function removeElementById(id) {
  canvasElements.value = canvasElements.value.filter(item => item.id !== id)
  selectedElementIds.value = selectedElementIds.value.filter(selId => selId !== id)
  isPositionPopoverOpen.value = false
  closeContextMenu()
  notify('Layer deleted')
  saveHistoryState()
}

function bringForward(id = selectedElementId.value) {
  if (!id) return
  const idx = canvasElements.value.findIndex(el => el.id === id)
  if (idx < 0 || idx >= canvasElements.value.length - 1) return
  const temp = canvasElements.value[idx]
  canvasElements.value[idx] = canvasElements.value[idx + 1]
  canvasElements.value[idx + 1] = temp
  notify('Brought forward')
  saveHistoryState()
}

function bringToFront(id = selectedElementId.value) {
  if (!id) return
  const idx = canvasElements.value.findIndex(el => el.id === id)
  if (idx < 0 || idx === canvasElements.value.length - 1) return
  const [item] = canvasElements.value.splice(idx, 1)
  canvasElements.value.push(item)
  notify('Brought to front')
  saveHistoryState()
}

function sendBackward(id = selectedElementId.value) {
  if (!id) return
  const idx = canvasElements.value.findIndex(el => el.id === id)
  if (idx <= 0) return
  const temp = canvasElements.value[idx]
  canvasElements.value[idx] = canvasElements.value[idx - 1]
  canvasElements.value[idx - 1] = temp
  notify('Sent backward')
  saveHistoryState()
}

function sendToBack(id = selectedElementId.value) {
  if (!id) return
  const idx = canvasElements.value.findIndex(el => el.id === id)
  if (idx <= 0) return
  const [item] = canvasElements.value.splice(idx, 1)
  canvasElements.value.unshift(item)
  notify('Sent to back')
  saveHistoryState()
}

function bringToFrontSelected() {
  if (selectedElementIds.value.length === 0) return
  const selectedSet = new Set(selectedElementIds.value)
  const nonSelected = canvasElements.value.filter(el => !selectedSet.has(el.id))
  const selected = canvasElements.value.filter(el => selectedSet.has(el.id))
  canvasElements.value = [...nonSelected, ...selected]
  notify('Brought selection to front')
  saveHistoryState()
}

function sendToBackSelected() {
  if (selectedElementIds.value.length === 0) return
  const selectedSet = new Set(selectedElementIds.value)
  const nonSelected = canvasElements.value.filter(el => !selectedSet.has(el.id))
  const selected = canvasElements.value.filter(el => selectedSet.has(el.id))
  canvasElements.value = [...selected, ...nonSelected]
  notify('Sent selection to back')
  saveHistoryState()
}

function duplicateElement(id = selectedElementId.value) {
  duplicateSelectedElements()
}

function duplicateSelectedElements() {
  if (selectedElementIds.value.length === 0) return
  const selected = canvasElements.value.filter(el => selectedElementIds.value.includes(el.id))
  const newIds = []
  selected.forEach(el => {
    const newId = 'el-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    newIds.push(newId)
    const clone = {
      ...JSON.parse(JSON.stringify(el)),
      id: newId,
      name: `${el.name || 'Element'} (Copy)`,
      x: Math.min(220, (el.x || 0) + 16),
      y: Math.min(480, (el.y || 0) + 16),
      isLocked: false
    }
    canvasElements.value.push(clone)
  })
  selectedElementIds.value = newIds
  isPositionPopoverOpen.value = false
  notify(`Duplicated ${newIds.length} element${newIds.length > 1 ? 's' : ''}`)
  saveHistoryState()
}

function toggleLock(id = selectedElementId.value) {
  if (!id && selectedElementIds.value.length === 0) return
  const targets = selectedElementIds.value.length > 0 ? selectedElementIds.value : [id]
  canvasElements.value.forEach(el => {
    if (targets.includes(el.id)) {
      el.isLocked = !el.isLocked
    }
  })
  isPositionPopoverOpen.value = false
  notify('Updated lock state')
  saveHistoryState()
}

function toggleHide(id = selectedElementId.value) {
  if (!id) return
  const el = canvasElements.value.find(item => item.id === id)
  if (!el) return
  el.isHidden = !el.isHidden
  if (el.isHidden) {
    selectedElementIds.value = selectedElementIds.value.filter(selId => selId !== id)
    isPositionPopoverOpen.value = false
  }
  notify(el.isHidden ? 'Element hidden' : 'Element visible')
  saveHistoryState()
}

function getElementDisplayName(el) {
  if (!el) return 'Element'
  if (el.name) return el.name
  if (el.type === 'sticker') return `${el.content || 'Sticker'} Sticker`
  if (el.type === 'tape') return `${el.color || 'Colored'} Washi Tape`
  if (el.type === 'text') return el.text ? `"${el.text.slice(0, 14)}..."` : 'Text'
  if (el.type === 'shape') return 'Cute Shape'
  if (el.type === 'doodle') {
    const brush = el.brushType ? el.brushType.charAt(0).toUpperCase() + el.brushType.slice(1) : 'Hand'
    return `${brush} Doodle`
  }
  return 'Layer'
}

function selectLayer(el, event) {
  if (el.isHidden) {
    el.isHidden = false
  }
  if (event && (event.shiftKey || event.metaKey || event.ctrlKey)) {
    if (el.groupId) {
      const groupItems = canvasElements.value.filter(item => item.groupId === el.groupId).map(item => item.id)
      const isEntireGroupSelected = groupItems.every(id => selectedElementIds.value.includes(id))
      if (isEntireGroupSelected) {
        selectedElementIds.value = selectedElementIds.value.filter(id => !groupItems.includes(id))
      } else {
        selectedElementIds.value = Array.from(new Set([...selectedElementIds.value, ...groupItems]))
      }
    } else {
      if (selectedElementIds.value.includes(el.id)) {
        selectedElementIds.value = selectedElementIds.value.filter(id => id !== el.id)
      } else {
        selectedElementIds.value = [...selectedElementIds.value, el.id]
      }
    }
  } else {
    if (el.groupId) {
      selectedElementIds.value = canvasElements.value.filter(item => item.groupId === el.groupId).map(item => item.id)
      editingGroupId.value = null
    } else {
      selectedElementIds.value = [el.id]
      editingGroupId.value = null
    }
  }
  isPositionPopoverOpen.value = false
}

function togglePositionPopover() {
  isPositionPopoverOpen.value = !isPositionPopoverOpen.value
}

// =============================================================================
// 14. Typography & Double-Click Inline Text Editing
// =============================================================================
function debounceTextHistory() {
  clearTimeout(textHistoryTimer)
  textHistoryTimer = setTimeout(() => {
    saveHistoryState()
  }, 450)
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha})`
  let c = hex.replace('#', '')
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]
  const num = parseInt(c, 16)
  if (isNaN(num)) return `rgba(0,0,0,${alpha})`
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeTextElement(el) {
  if (!el) return el
  if (!el.fontFamily) el.fontFamily = "'Montserrat', sans-serif"
  if (!el.fontSize) el.fontSize = 22
  if (!el.fontWeight) el.fontWeight = 'normal'
  if (!el.fontStyle) el.fontStyle = 'normal'
  if (!el.textDecoration) el.textDecoration = 'none'
  if (!el.textTransform) el.textTransform = 'none'
  if (!el.textAlign) el.textAlign = 'center'
  if (el.letterSpacing === undefined) el.letterSpacing = 0
  if (el.lineHeight === undefined) el.lineHeight = 1.2
  if (!el.color) el.color = '#0F172A'
  if (!el.effect) el.effect = 'none'
  if (!el.effectSettings) {
    el.effectSettings = {
      shadow: { offsetX: 3, offsetY: 3, blur: 4, opacity: 0.6, color: '#000000', direction: 45 },
      stroke: { width: 3, color: '#0F172A', isHollow: true },
      echo: { offset: 4, color: '#FF4081' },
      badge: { color: '#FFD166', padding: 8, borderRadius: 8 }
    }
  }
  if (el.curveAmount === undefined) el.curveAmount = 0
  return el
}

function selectFontFamily(font) {
  if (!activeTextElement.value) return
  activeTextElement.value.fontFamily = font.family
  isFontDropdownOpen.value = false
  debounceTextHistory()
}

function getActiveFontDisplayName() {
  if (!activeTextElement.value) return 'Font'
  const fam = activeTextElement.value.fontFamily
  for (const cat of FONT_CATEGORIES) {
    const found = cat.fonts.find(f => f.family === fam)
    if (found) return found.label.split('(')[0].trim()
  }
  return fam.replace(/['",]/g, '').split(' ')[0] || 'Font'
}

function stepFontSize(delta) {
  if (!activeTextElement.value) return
  const cur = activeTextElement.value.fontSize || 22
  activeTextElement.value.fontSize = Math.max(10, Math.min(120, cur + delta))
  debounceTextHistory()
}

function toggleBold() {
  if (!activeTextElement.value) return
  const cur = activeTextElement.value.fontWeight
  activeTextElement.value.fontWeight = cur === 'bold' || cur === '700' ? 'normal' : 'bold'
  debounceTextHistory()
}

function toggleItalic() {
  if (!activeTextElement.value) return
  activeTextElement.value.fontStyle = activeTextElement.value.fontStyle === 'italic' ? 'normal' : 'italic'
  debounceTextHistory()
}

function toggleUnderline() {
  if (!activeTextElement.value) return
  activeTextElement.value.textDecoration = activeTextElement.value.textDecoration === 'underline' ? 'none' : 'underline'
  debounceTextHistory()
}

function toggleStrikethrough() {
  if (!activeTextElement.value) return
  activeTextElement.value.textDecoration = activeTextElement.value.textDecoration === 'line-through' ? 'none' : 'line-through'
  debounceTextHistory()
}

function toggleUppercase() {
  if (!activeTextElement.value) return
  activeTextElement.value.textTransform = activeTextElement.value.textTransform === 'uppercase' ? 'none' : 'uppercase'
  debounceTextHistory()
}

function setTextAlign(align) {
  if (!activeTextElement.value) return
  activeTextElement.value.textAlign = align
  debounceTextHistory()
}

function setTextColor(color) {
  if (!activeTextElement.value) return
  activeTextElement.value.color = color
  debounceTextHistory()
}

function openEffectsDrawer() {
  activeTool.value = 'effects'
  isDrawerOpen.value = true
}

function setEffect(effectName) {
  if (!activeTextElement.value) return
  activeTextElement.value.effect = effectName
  if (!activeTextElement.value.effectSettings) {
    activeTextElement.value.effectSettings = {
      shadow: { offsetX: 3, offsetY: 3, blur: 4, opacity: 0.6, color: '#000000', direction: 45 },
      stroke: { width: 3, color: '#0F172A', isHollow: true },
      echo: { offset: 4, color: '#FF4081' },
      badge: { color: '#FFD166', padding: 8, borderRadius: 8 }
    }
  }
  debounceTextHistory()
}

function toggleCurvature(enable) {
  if (!activeTextElement.value) return
  activeTextElement.value.curveAmount = enable ? 45 : 0
  debounceTextHistory()
}

function getTextStyle(el) {
  if (!el) return {}
  const s = {
    fontFamily: el.fontFamily || "'Montserrat', sans-serif",
    fontSize: (el.fontSize || 22) + 'px',
    fontWeight: el.fontWeight || 'normal',
    fontStyle: el.fontStyle || 'normal',
    textDecoration: el.textDecoration || 'none',
    textTransform: el.textTransform || 'none',
    textAlign: el.textAlign || 'center',
    letterSpacing: (el.letterSpacing || 0) + 'px',
    lineHeight: el.lineHeight || 1.2,
    color: el.color || '#0F172A'
  }

  const eff = el.effect || 'none'
  const cfg = el.effectSettings || {}

  if (eff === 'shadow') {
    const sh = cfg.shadow || { offsetX: 3, offsetY: 3, blur: 4, opacity: 0.6, color: '#000000' }
    const rgba = hexToRgba(sh.color || '#000000', sh.opacity || 0.6)
    s.textShadow = `${sh.offsetX || 3}px ${sh.offsetY || 3}px ${sh.blur || 4}px ${rgba}`
  } else if (eff === 'stroke') {
    const st = cfg.stroke || { width: 2, color: '#000000', isHollow: false }
    s.webkitTextStroke = `${st.width || 2}px ${st.color || '#000000'}`
    if (st.isHollow) s.color = 'transparent'
  } else if (eff === 'echo') {
    const ec = cfg.echo || { offset: 3, color: '#FF4081' }
    const d = ec.offset || 3
    s.textShadow = `${d}px ${d}px 0px ${ec.color || '#FF4081'}, ${d * 2}px ${d * 2}px 0px ${hexToRgba(ec.color || '#FF4081', 0.5)}`
  } else if (eff === 'glitch') {
    s.textShadow = `-2px 0 #00ffff, 2px 0 #ff00ff`
  } else if (eff === 'neon') {
    const col = el.color || '#38BDF8'
    s.textShadow = `0 0 5px #fff, 0 0 10px #fff, 0 0 20px ${col}, 0 0 35px ${col}`
  } else if (eff === 'badge') {
    const bg = cfg.badge?.color || '#FFD166'
    const pad = cfg.badge?.padding || 8
    const rad = cfg.badge?.borderRadius || 8
    s.backgroundColor = bg
    s.padding = `${pad / 2}px ${pad}px`
    s.borderRadius = `${rad}px`
    s.display = 'inline-block'
  }

  return s
}

function getCurvedSvgWidth(el) {
  const charWidth = (el.fontSize || 22) * 0.65 + (el.letterSpacing || 0)
  const len = el.text ? el.text.length : 8
  return Math.max(100, Math.round(len * charWidth + 50))
}

function getCurvedSvgHeight(el) {
  const curve = Math.abs(el.curveAmount || 0)
  const baseH = (el.fontSize || 22) * 1.5
  return Math.max(70, Math.round(baseH + curve * 0.9))
}

function getCurvedPathD(el) {
  const w = getCurvedSvgWidth(el)
  const h = getCurvedSvgHeight(el)
  const curve = el.curveAmount || 0
  const isUp = curve < 0
  const absCurve = Math.abs(curve)

  const sagitta = (absCurve / 100) * (h * 0.75)
  const startX = 20
  const endX = w - 20

  let startY, endY, controlY
  if (isUp) {
    startY = h - 20
    endY = h - 20
    controlY = Math.max(10, h - 20 - sagitta * 1.8)
  } else {
    startY = 20
    endY = 20
    controlY = Math.min(h - 10, 20 + sagitta * 1.8)
  }

  return `M ${startX} ${startY} Q ${w / 2} ${controlY} ${endX} ${endY}`
}

function setTextRef(el, id) {
  if (el) {
    textInputRefs.value[id] = el
  } else {
    delete textInputRefs.value[id]
  }
}

function startEditingText(el) {
  if (el.isLocked) {
    notify('Element is locked (Unlock in Layers to edit)', 'info')
    return
  }
  if (el.type !== 'text') return
  editingTextId.value = el.id
  selectedElementId.value = el.id
  isPositionPopoverOpen.value = false
  nextTick(() => {
    const domEl = textInputRefs.value[el.id]
    if (domEl) {
      domEl.innerText = el.text || ''
      domEl.focus()
      try {
        const range = document.createRange()
        range.selectNodeContents(domEl)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      } catch (e) {
        console.warn('Range selection error', e)
      }
    }
  })
}

function finishEditingText(el) {
  if (editingTextId.value !== el.id) return
  const domEl = textInputRefs.value[el.id]
  if (domEl) {
    const raw = domEl.innerText || ''
    const clean = raw.replace(/[\r\n]+/g, ' ').trim()
    el.text = clean || 'Your text'
  }
  editingTextId.value = null
  el.name = `Text: ${el.text.slice(0, 14)}`
  saveHistoryState()
}

function startEditingCaption() {
  isEditingCaption.value = true
  nextTick(() => {
    captionInputRef.value?.focus()
    captionInputRef.value?.select()
  })
}

function finishEditingCaption() {
  if (!isEditingCaption.value) return
  isEditingCaption.value = false
  saveHistoryState()
}

// =============================================================================
// 15. Canva-Style Vector SVG Dynamic Recoloring Engine
// =============================================================================
function extractSvgColors(svgString) {
  if (!svgString) return []
  const colors = new Set()
  const regex = /(?:fill|stroke)\s*=\s*["']([^"']+)["']/gi
  let match
  while ((match = regex.exec(svgString)) !== null) {
    const val = match[1].trim()
    if (isValidColor(val)) colors.add(normalizeHex(val))
  }
  const styleRegex = /(?:fill|stroke)\s*:\s*([^; "'()]+)/gi
  while ((match = styleRegex.exec(svgString)) !== null) {
    const val = match[1].trim()
    if (isValidColor(val)) colors.add(normalizeHex(val))
  }
  return Array.from(colors)
}

function isValidColor(c) {
  if (!c) return false
  const lower = c.toLowerCase()
  if (['none', 'transparent', 'currentcolor', 'inherit'].includes(lower)) return false
  if (lower.startsWith('url(')) return false
  return lower.startsWith('#') || lower.startsWith('rgb')
}

function normalizeHex(c) {
  c = c.trim()
  if (c.startsWith('#')) {
    if (c.length === 4) {
      return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase()
    }
    return c.toUpperCase()
  }
  return c
}

function getVectorSwatches(el) {
  if (!el) return []
  if (el.isSvg && el.svgRaw) {
    const rawColors = extractSvgColors(el.svgRaw)
    return rawColors.map((orig, idx) => ({
      type: 'svg',
      key: orig,
      orig: orig,
      current: el.colorMap?.[orig] || orig,
      label: `Layer Color ${idx + 1}`
    }))
  }
  if (el.type === 'shape') {
    return [
      {
        type: 'shape-fill',
        key: 'fill',
        current: el.color || '#2F5BEA',
        label: 'Shape Fill'
      },
      {
        type: 'shape-stroke',
        key: 'stroke',
        current: el.strokeColor || '#0F172A',
        label: 'Shape Border'
      }
    ]
  }
  if (el.type === 'tape') {
    return [
      {
        type: 'tape-body',
        key: 'tape-body',
        current: el.color || 'rgba(253, 224, 71, 0.85)',
        label: 'Tape Color'
      },
      {
        type: 'tape-pattern',
        key: 'tape-pattern',
        current: el.patternColor || '#FFFFFF',
        label: 'Tape Texture'
      }
    ]
  }
  return []
}

function openVectorColorPicker(swatch, event) {
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  if (activeVectorColorTarget.value?.key === swatch.key && isVectorColorPickerOpen.value) {
    isVectorColorPickerOpen.value = false
    activeVectorColorTarget.value = null
  } else {
    activeVectorColorTarget.value = swatch
    isVectorColorPickerOpen.value = true
  }
}

function setVectorColor(swatch, newColor) {
  const el = activeVectorElement.value
  if (!el) return
  if (swatch.type === 'svg') {
    if (!el.colorMap) el.colorMap = {}
    el.colorMap[swatch.orig] = newColor
    swatch.current = newColor
  } else if (swatch.type === 'shape-fill') {
    el.color = newColor
    swatch.current = newColor
  } else if (swatch.type === 'shape-stroke') {
    el.strokeColor = newColor
    if (!el.strokeWidth) el.strokeWidth = 2
    swatch.current = newColor
  } else if (swatch.type === 'tape-body') {
    el.color = newColor
    swatch.current = newColor
  } else if (swatch.type === 'tape-pattern') {
    el.patternColor = newColor
    swatch.current = newColor
  }
  debounceTextHistory()
}

function getVectorBarTitle(el) {
  if (!el) return 'Vector Colors'
  if (el.isSvg) return 'Graphic Colors'
  if (el.type === 'shape') return 'Shape Colors'
  if (el.type === 'tape') return 'Washi Colors'
  return 'Colors'
}

function getRenderedSvg(el) {
  if (!el || !el.svgRaw) return ''
  let svg = el.svgRaw
  if (el.colorMap) {
    for (const [orig, repl] of Object.entries(el.colorMap)) {
      if (!repl || orig === repl) continue
      const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const reg = new RegExp(escaped, 'gi')
      svg = svg.replace(reg, repl)
    }
  }
  return svg
}

function getShapePathD(shapeType) {
  switch (shapeType) {
    case 'heart':
      return 'M50 85 C20 60 5 40 5 25 A 20 20 0 0 1 50 20 A 20 20 0 0 1 95 25 C95 40 80 60 50 85 Z'
    case 'star':
      return 'M 50 5 L 63 35 L 95 38 L 71 60 L 78 92 L 50 75 L 22 92 L 29 60 L 5 38 L 37 35 Z'
    case 'circle':
      return 'M 50, 50 m -45, 0 a 45,45 0 1,0 90,0 a 45,45 0 1,0 -90,0'
    case 'diamond':
      return 'M 50 5 L 95 50 L 50 95 L 5 50 Z'
    case 'badge':
      return 'M50 5 L61 16 L77 12 L83 27 L98 34 L97 50 L108 62 L100 76 L105 91 L90 98 L87 114 L71 114 L61 127 L50 119 L39 127 L29 114 L13 114 L10 98 L-5 91 L0 76 L-8 62 L3 50 L2 34 L17 27 L23 12 L39 16 Z'
    default:
      return 'M 50 5 L 63 35 L 95 38 L 71 60 L 78 92 L 50 75 L 22 92 L 29 60 L 5 38 L 37 35 Z'
  }
}

function getTapePattern(el) {
  const col = el?.patternColor || '#FFFFFF'
  const rgba = hexToRgba(col, 0.35)
  return `repeating-linear-gradient(-45deg, ${rgba}, ${rgba} 6px, transparent 6px, transparent 12px)`
}

// =============================================================================
// 16. Freehand Doodle Drawing Engine & Eraser
// =============================================================================
function getStarPoints(cx, cy, outerR, innerR, points = 4) {
  let str = ''
  const inR = innerR !== undefined ? innerR : outerR * 0.22
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : inR
    const angle = (i * Math.PI) / points - Math.PI / 2
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    str += `${x.toFixed(1)},${y.toFixed(1)} `
  }
  return str.trim()
}

function getCrossPoints(cx, cy, size) {
  const w = size * 0.25
  const l = size
  return `${cx},${cy - l} ${cx + w},${cy - w} ${cx + l},${cy} ${cx + w},${cy + w} ${cx},${cy + l} ${cx - w},${cy + w} ${cx - l},${cy} ${cx - w},${cy - w}`
}

function handleEraserAtPoint(pt) {
  const eraserRadius = Math.max(14, brushWidth.value * 1.5)

  if (activeStrokes.value.length > 0) {
    const strokeIdx = activeStrokes.value.findIndex(s => {
      if (!s.points || s.points.length === 0) return false
      return s.points.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) <= Math.max(eraserRadius, (s.width || 6) * 1.5))
    })
    if (strokeIdx >= 0) {
      activeStrokes.value.splice(strokeIdx, 1)
      notify('Erased stroke')
      return
    }
  }

  const hitIdx = canvasElements.value.findIndex(el => {
    if (el.type !== 'doodle') return false
    return (
      pt.x >= el.x - eraserRadius &&
      pt.x <= el.x + el.width + eraserRadius &&
      pt.y >= el.y - eraserRadius &&
      pt.y <= el.y + el.height + eraserRadius
    )
  })

  if (hitIdx >= 0) {
    const removed = canvasElements.value.splice(hitIdx, 1)[0]
    selectedElementIds.value = selectedElementIds.value.filter(id => id !== removed.id)
    notify('Erased doodle')
    saveHistoryState()
  }
}

function getStripPoint(e) {
  if (!stripRef.value) return { x: 0, y: 0, pressure: 0.5 }
  const rect = stripRef.value.getBoundingClientRect()
  return {
    x: Math.round(((e.clientX - rect.left) / canvasScale.value) * 10) / 10,
    y: Math.round(((e.clientY - rect.top) / canvasScale.value) * 10) / 10,
    pressure: e.pressure || 0.5
  }
}

function onDrawPointerDown(event) {
  if (!isDrawMode.value) return
  if (event.button !== 0) return

  const pt = getStripPoint(event)

  if (currentBrush.value === 'eraser') {
    handleEraserAtPoint(pt)
    return
  }

  isDrawing.value = true
  currentPoints.value = [pt]
}

function onDrawPointerMove(event) {
  if (!isDrawMode.value) return

  const pt = getStripPoint(event)

  if (currentBrush.value === 'eraser') {
    if (event.buttons === 1) {
      handleEraserAtPoint(pt)
    }
    return
  }

  if (!isDrawing.value) return

  const last = currentPoints.value[currentPoints.value.length - 1]
  if (last) {
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y)
    if (dist < 1.5) return
  }

  currentPoints.value.push(pt)
}

function onDrawPointerUp() {
  if (!isDrawMode.value) return
  if (currentBrush.value === 'eraser') return

  if (!isDrawing.value) return
  isDrawing.value = false

  if (currentPoints.value.length > 1) {
    activeStrokes.value.push({
      points: [...currentPoints.value],
      pathData: pointsToSvgPath(currentPoints.value),
      brush: currentBrush.value,
      color: brushColor.value,
      width: brushWidth.value,
      opacity: currentBrush.value === 'highlighter' ? 0.45 : 1
    })
  }
  currentPoints.value = []
}

function undoDoodleStroke() {
  if (activeStrokes.value.length > 0) {
    activeStrokes.value.pop()
    notify('Undo stroke')
  }
}

function clearDoodleStrokes() {
  activeStrokes.value = []
  currentPoints.value = []
  notify('Cleared drawings')
}

function finishDrawingSession() {
  if (activeStrokes.value.length > 0) {
    const newEl = createDoodleElement(
      activeStrokes.value,
      currentBrush.value,
      brushColor.value,
      brushWidth.value,
      currentBrush.value === 'highlighter' ? 0.45 : 1
    )

    if (newEl) {
      canvasElements.value.push(newEl)
      selectedElementIds.value = [newEl.id]
      saveHistoryState()
      notify('Doodle converted to movable canvas element!')
    }
  }

  activeStrokes.value = []
  currentPoints.value = []
  isDrawMode.value = false
}

function toggleDrawMode() {
  toggleDrawer('draw')
}

function setDoodleColor(color) {
  if (activeDoodleElement.value) {
    activeDoodleElement.value.color = color
    saveHistoryState()
  }
}

function setDoodleStrokeWidth(w) {
  if (activeDoodleElement.value) {
    activeDoodleElement.value.strokeWidth = w
    saveHistoryState()
  }
}

// =============================================================================
// 17. User Media Uploads System (IndexedDB)
// =============================================================================
const DB_NAME = 'BlueStudiosUploadsDB'
const DB_VERSION = 1
const STORE_NAME = 'uploads'

function openUploadsDB() {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = e => resolve(e.target.result)
    request.onerror = e => {
      console.warn('IndexedDB open error:', e)
      resolve(null)
    }
  })
}

async function loadUploadsFromDB() {
  try {
    const db = await openUploadsDB()
    if (!db) {
      const cached = localStorage.getItem('blue_studios_uploads')
      return cached ? JSON.parse(cached) : []
    }
    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch (err) {
    console.warn('Error loading uploads:', err)
    return []
  }
}

async function saveUploadToDB(item) {
  try {
    const db = await openUploadsDB()
    if (!db) {
      const cached = localStorage.getItem('blue_studios_uploads')
      const arr = cached ? JSON.parse(cached) : []
      arr.unshift(item)
      localStorage.setItem('blue_studios_uploads', JSON.stringify(arr.slice(0, 15)))
      return
    }
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(item)
  } catch (err) {
    console.warn('Error saving upload:', err)
  }
}

async function deleteUploadFromDB(id) {
  try {
    const db = await openUploadsDB()
    if (!db) {
      const cached = localStorage.getItem('blue_studios_uploads')
      if (cached) {
        const arr = JSON.parse(cached).filter(x => x.id !== id)
        localStorage.setItem('blue_studios_uploads', JSON.stringify(arr))
      }
      return
    }
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
  } catch (err) {
    console.warn('Error deleting upload:', err)
  }
}

function triggerFileUpload() {
  if (uploadInputRef.value) {
    uploadInputRef.value.click()
  }
}

async function handleFileUpload(event) {
  const files = event?.target?.files
  if (!files || files.length === 0) return
  await processUploadedFiles(Array.from(files))
  if (uploadInputRef.value) uploadInputRef.value.value = ''
}

async function handleFileUploadDrop(event) {
  event.preventDefault()
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  await processUploadedFiles(Array.from(files))
}

async function processUploadedFiles(files) {
  isUploading.value = true
  for (const file of files) {
    const isSvg = file.type === 'image/svg+xml' || file.name.endsWith('.svg')
    const reader = new FileReader()

    await new Promise(resolve => {
      if (isSvg) {
        reader.onload = async e => {
          const svgContent = e.target.result
          const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgContent)
          const newUpload = {
            id: 'upl-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            name: file.name.replace(/\.[^/.]+$/, ''),
            type: 'svg',
            isSvg: true,
            svgContent: svgContent,
            dataUrl: dataUrl,
            size: file.size,
            createdAt: Date.now()
          }
          userUploads.value.unshift(newUpload)
          await saveUploadToDB(newUpload)
          resolve()
        }
        reader.readAsText(file)
      } else {
        reader.onload = async e => {
          const dataUrl = e.target.result
          const newUpload = {
            id: 'upl-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            name: file.name.replace(/\.[^/.]+$/, ''),
            type: 'image',
            isSvg: false,
            dataUrl: dataUrl,
            size: file.size,
            createdAt: Date.now()
          }
          userUploads.value.unshift(newUpload)
          await saveUploadToDB(newUpload)
          resolve()
        }
        reader.readAsDataURL(file)
      }
    })
  }
  isUploading.value = false
  notify(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}!`)
}

async function deleteUpload(id, event) {
  if (event) event.stopPropagation()
  userUploads.value = userUploads.value.filter(u => u.id !== id)
  await deleteUploadFromDB(id)
  notify('Upload removed')
}

function addUploadToCanvas(item, customX = null, customY = null) {
  const id = 'el-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
  const isSvg = item.isSvg || item.type === 'svg'
  const x = customX !== null ? customX : (80 + Math.floor(Math.random() * 40) - 20)
  const y = customY !== null ? customY : (140 + Math.floor(Math.random() * 50) - 25)

  if (isSvg) {
    const newEl = {
      id,
      type: 'sticker',
      name: item.name || 'Custom SVG',
      isSvg: true,
      svgRaw: item.svgContent || '',
      colorMap: {},
      width: 72,
      height: 72,
      x,
      y,
      rotation: 0,
      isLocked: false,
      isHidden: false
    }
    canvasElements.value.push(newEl)
  } else {
    const newEl = {
      id,
      type: 'image',
      name: item.name || 'Uploaded Photo',
      url: item.dataUrl,
      width: 110,
      height: 110,
      x,
      y,
      rotation: 0,
      isLocked: false,
      isHidden: false
    }
    canvasElements.value.push(newEl)
  }
  selectedElementId.value = id
  notify(`Placed "${item.name}" on strip`)
  saveHistoryState()
}

function onAssetDragStart(item, event) {
  if (event && event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

async function onCanvasDrop(event) {
  event.preventDefault()

  // 1. Files dropped from computer desktop / file browser
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    const file = event.dataTransfer.files[0]
    if (file.name.endsWith('.png') || file.type === 'image/png' || file.name.endsWith('.json')) {
      const project = await parseProjectFromFile(file)
      if (project && (project.canvasElements || project.templateName || project.slotCount)) {
        applySnapshot(project)
        currentSavedFrameId.value = project.id || `frame_${Date.now()}`
        notify(`Loaded template "${project.templateName || 'Template'}" from file!`)
        return
      }
    }
    handleFileUploadDrop(event)
    return
  }

  // 2. Internal drawer asset drag
  const rawData = event.dataTransfer?.getData('application/json')
  if (!rawData) return
  try {
    const item = JSON.parse(rawData)
    if (!stripRef.value) return
    const rect = stripRef.value.getBoundingClientRect()
    const dropX = Math.round((event.clientX - rect.left) / canvasScale.value - 40)
    const dropY = Math.round((event.clientY - rect.top) / canvasScale.value - 40)
    addUploadToCanvas(item, dropX, dropY)
  } catch (err) {
    console.warn('Canvas drop error:', err)
  }
}

// =============================================================================
// 18. Saved Frames Storage & Editable PNG Export
// =============================================================================
async function saveFrame() {
  if (isSavingFrame.value || !stripRef.value) return
  isSavingFrame.value = true
  notify('Saving template and generating editable PNG...')

  const prevSelected = [...selectedElementIds.value]
  const prevShowCutouts = showCutouts.value
  selectedElementIds.value = []
  showCutouts.value = false
  await nextTick()

  try {
    const frameId = currentSavedFrameId.value || `frame_${Date.now()}`
    currentSavedFrameId.value = frameId

    const projectData = {
      id: frameId,
      templateName: templateName.value,
      updatedAt: Date.now(),
      version: 1,
      activeLayout: activeLayout.value,
      slotCount: slotCount.value,
      selectedBgColor: selectedBgColor.value,
      frameBg: { ...frameBg.value },
      borderColor: borderColor.value,
      borderWidth: borderWidth.value,
      slotShape: slotShape.value,
      captionText: captionText.value,
      cutoutsLayerPosition: cutoutsLayerPosition.value,
      showCutouts: false,
      canvasElements: JSON.parse(JSON.stringify(canvasElements.value)),
      customGuides: JSON.parse(JSON.stringify(customGuides.value))
    }

    const { blob, thumbnail } = await captureEditablePng(stripRef.value, projectData)

    const record = {
      id: frameId,
      name: templateName.value,
      updatedAt: Date.now(),
      slotCount: slotCount.value,
      elementCount: canvasElements.value.length,
      thumbnail: thumbnail,
      projectData: projectData
    }
    await saveFrameToDB(record)
    savedFramesList.value = await loadSavedFramesFromDB()

    const filename = `${sanitizeFilename(templateName.value || 'photostrip')}.png`
    triggerFileDownload(blob, filename)

    notify(`Template "${templateName.value}" saved to folder & downloaded as editable PNG!`)
  } catch (err) {
    console.error('Failed to save frame:', err)
    notify('Failed to save frame. Please try again.')
  } finally {
    selectedElementIds.value = prevSelected
    showCutouts.value = prevShowCutouts
    isSavingFrame.value = false
  }
}

function openSavedFrame(frameRecord) {
  if (!frameRecord || !frameRecord.projectData) return
  applySnapshot(frameRecord.projectData)
  currentSavedFrameId.value = frameRecord.id
  isSavedFramesModalOpen.value = false
  notify(`Loaded "${frameRecord.name || 'Template'}"!`)
}

async function deleteFrame(id) {
  try {
    await deleteSavedFrameFromDB(id)
    savedFramesList.value = await loadSavedFramesFromDB()
    if (currentSavedFrameId.value === id) {
      currentSavedFrameId.value = null
    }
    notify('Template removed from saved folder')
  } catch (err) {
    console.error('Failed to delete frame:', err)
    notify('Could not delete frame')
  }
}

function confirmDeleteFrame(frame) {
  if (confirm(`Are you sure you want to delete "${frame.name || 'this template'}" from your saved frames?`)) {
    deleteFrame(frame.id)
  }
}

async function downloadSavedFrame(frameRecord) {
  try {
    const project = frameRecord.projectData
    if (!project) return
    if (!stripRef.value) return
    const prevShowCutouts = showCutouts.value
    showCutouts.value = false
    await nextTick()
    try {
      const { blob } = await captureEditablePng(stripRef.value, { ...project, showCutouts: false })
      const filename = `${sanitizeFilename(frameRecord.name || 'photostrip')}.png`
      triggerFileDownload(blob, filename)
      notify(`Downloaded "${filename}"`)
    } finally {
      showCutouts.value = prevShowCutouts
    }
  } catch (err) {
    console.error('Error downloading saved frame:', err)
    notify('Error generating frame PNG')
  }
}

async function importFrameFromFile(file) {
  if (!file) return
  try {
    const project = await parseProjectFromFile(file)
    if (!project || (!project.canvasElements && !project.templateName)) {
      notify('File does not contain valid Blue Studios template data')
      return
    }

    const frameId = project.id || `frame_${Date.now()}`
    const record = {
      id: frameId,
      name: project.templateName || file.name.replace(/\.[^/.]+$/, ''),
      updatedAt: Date.now(),
      slotCount: project.slotCount || 4,
      elementCount: project.canvasElements ? project.canvasElements.length : 0,
      thumbnail: null,
      projectData: { ...project, showCutouts: false }
    }
    await saveFrameToDB(record)
    savedFramesList.value = await loadSavedFramesFromDB()
    applySnapshot(record.projectData)
    currentSavedFrameId.value = frameId
    isSavedFramesModalOpen.value = false
    notify(`Imported & opened "${record.name}"!`)
  } catch (err) {
    console.error('Import frame failed:', err)
    notify('Could not import frame from file')
  }
}

// =============================================================================
// 19. Canvas Workspace Handlers (Pan, Zoom, Rulers & Mouse Events)
// =============================================================================
let isWorkspaceDragging = false
let workspaceDragStartPos = null

function onCanvasClick(event) {
  if (justFinishedMarquee) {
    justFinishedMarquee = false
    return
  }
  if (event && event.target) {
    const isDirectWorkspace = event.target === canvasWorkspaceRef.value || event.target.classList?.contains('canvas-viewport')
    const isDirectFrame = event.target === stripRef.value || event.target.closest('.strip-slots-container')
    if (!isDirectWorkspace && !isDirectFrame) {
      return
    }
  }
  if (editingTextId.value && activeSelectedElement.value) {
    finishEditingText(activeSelectedElement.value)
  }
  selectedElementIds.value = []
  editingGroupId.value = null
  editingTextId.value = null
  isEditingCaption.value = false
}

function onFrameClick(event) {
  if (justFinishedMarquee) {
    justFinishedMarquee = false
    return
  }
  const target = event.target
  if (target === stripRef.value || target.closest('.strip-slots-container') || target.classList?.contains('strip-caption')) {
    onCanvasClick(event)
  }
}

function onWorkspaceMouseDown(event) {
  if (
    event.target.closest('.rulers-overlay-container') ||
    event.target.closest('.canvas-zoom-dock') ||
    event.target.closest('.custom-guide-line')
  ) {
    return
  }

  if (event.button === 1 || isSpacePressed.value || isHandToolActive.value) {
    event.preventDefault()
    startPan(event)
    return
  }

  const isOutsideFrame = !event.target.closest('.photostrip-frame')

  if (isOutsideFrame && event.button === 0) {
    if (event.shiftKey) {
      startMarqueeSelection(event)
      return
    }

    event.preventDefault()
    isWorkspaceDragging = true
    workspaceDragStartPos = { x: event.clientX, y: event.clientY }
    startPan(event)
    return
  }

  startMarqueeSelection(event)
}

function onWorkspaceMouseMove(event) {
  updateCursorPos(event, canvasWorkspaceRef.value, stripRef.value)
  if (isPanning.value) {
    updatePan(event)
  }
}

function onWorkspaceMouseUp(event) {
  if (isPanning.value) {
    if (isWorkspaceDragging && workspaceDragStartPos && event) {
      const dist = Math.hypot(
        event.clientX - workspaceDragStartPos.x,
        event.clientY - workspaceDragStartPos.y
      )
      if (dist < 4) {
        onCanvasClick(event)
      }
    }
    endPan()
  }
  isWorkspaceDragging = false
  workspaceDragStartPos = null
  if (isDraggingGuide.value) {
    finishDraggingGuide(stripRef.value)
  }
}

function onWorkspaceMouseLeave() {
  if (isPanning.value) {
    endPan()
  }
  isWorkspaceDragging = false
  workspaceDragStartPos = null
}

function onWorkspaceWheel(event) {
  handleWheel(event, canvasWorkspaceRef.value)
}

function onStartDragGuideFromRuler(type, event) {
  startDraggingGuideFromRuler(type, event, canvasWorkspaceRef.value)
}

function onStartMoveExistingGuide(guide, event) {
  startDraggingExistingGuide(guide, event)
}

function openContextMenu(event, el = null) {
  event.preventDefault()
  event.stopPropagation()
  if (el) {
    if (!selectedElementIds.value.includes(el.id)) {
      if (el.groupId) {
        selectedElementIds.value = canvasElements.value.filter(item => item.groupId === el.groupId).map(item => item.id)
        editingGroupId.value = null
      } else {
        selectedElementIds.value = [el.id]
        editingGroupId.value = null
      }
    }
  }
  isPositionPopoverOpen.value = false

  const menuWidth = 220
  const menuHeight = 320
  const x = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, event.clientX))
  const y = Math.min(window.innerHeight - menuHeight - 12, Math.max(12, event.clientY))

  contextMenu.value = {
    visible: true,
    x,
    y,
    targetElement: el || activeSelectedElement.value
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
  isPositionPopoverOpen.value = false
}

function handleGlobalClick(event) {
  if (event && event.target) {
    if (
      event.target.closest('.font-picker-wrapper') ||
      event.target.closest('.text-color-wrapper') ||
      event.target.closest('.text-spacing-wrapper') ||
      event.target.closest('.position-btn-wrapper') ||
      event.target.closest('.vector-swatch-wrapper') ||
      event.target.closest('.vector-color-popover') ||
      event.target.closest('.zoom-dropdown-wrapper') ||
      event.target.closest('.zoom-popover-menu')
    ) {
      return
    }
  }
  isFontDropdownOpen.value = false
  isTextColorPickerOpen.value = false
  isTextSpacingOpen.value = false
  isPositionPopoverOpen.value = false
  isVectorColorPickerOpen.value = false
  isDoodleColorPickerOpen.value = false
  isZoomMenuOpen.value = false
  closeContextMenu()
}

// =============================================================================
// 20. Global Keyboard Shortcuts & Event Listeners
// =============================================================================
function onKeydown(e) {
  if (e.code === 'Space' && !e.repeat) {
    if (
      e.target.tagName !== 'INPUT' &&
      e.target.tagName !== 'TEXTAREA' &&
      !e.target.isContentEditable &&
      !isEditingCaption.value &&
      !editingTextId.value
    ) {
      e.preventDefault()
      isSpacePressed.value = true
    }
  }

  if (
    e.target.tagName === 'INPUT' ||
    e.target.tagName === 'TEXTAREA' ||
    e.target.isContentEditable ||
    isEditingCaption.value ||
    editingTextId.value
  ) {
    return
  }

  // Shift + R: Toggle Rulers & Guides
  if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
    e.preventDefault()
    toggleRulers()
    notify(showRulers.value ? 'Rulers & Guides shown' : 'Rulers & Guides hidden')
    return
  }

  if (e.key === 'Escape') {
    if (isSavedFramesModalOpen.value) {
      isSavedFramesModalOpen.value = false
      return
    }
    closeContextMenu()
    selectedElementIds.value = []
    editingGroupId.value = null
    isPositionPopoverOpen.value = false
    isVectorColorPickerOpen.value = false
    return
  }

  const isCmdOrCtrl = e.metaKey || e.ctrlKey

  // Cmd/Ctrl + S: Save Frame & Download Editable PNG
  if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveFrame()
    return
  }

  // Cmd/Ctrl + O: Open Saved Frames Folder
  if (isCmdOrCtrl && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    isSavedFramesModalOpen.value = true
    return
  }

  // Cmd/Ctrl + 0: Fit Photostrip to Screen
  if (isCmdOrCtrl && (e.key === '0' || e.code === 'Digit0')) {
    e.preventDefault()
    fitToScreen(canvasWorkspaceRef.value, stripRef.value)
    notify(`Zoom: Fit to screen (${zoomPercentage.value})`)
    return
  }

  // Cmd/Ctrl + 1: 100% Actual Size
  if (isCmdOrCtrl && (e.key === '1' || e.code === 'Digit1')) {
    e.preventDefault()
    resetToActualSize(canvasWorkspaceRef.value, stripRef.value)
    notify('Zoom: 100% (Actual size)')
    return
  }

  // Cmd/Ctrl + = or Cmd/Ctrl + +: Zoom In
  if (isCmdOrCtrl && (e.key === '=' || e.key === '+' || e.code === 'Equal')) {
    e.preventDefault()
    zoomIn(canvasWorkspaceRef.value)
    return
  }

  // Cmd/Ctrl + -: Zoom Out
  if (isCmdOrCtrl && (e.key === '-' || e.code === 'Minus')) {
    e.preventDefault()
    zoomOut(canvasWorkspaceRef.value)
    return
  }

  // Cmd/Ctrl + E: Save Frame Shortcut
  if (isCmdOrCtrl && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    saveFrame()
    return
  }

  // Select All: Cmd/Ctrl + A
  if (isCmdOrCtrl && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    selectAll()
    return
  }

  if (selectedElementIds.value.length === 0) return

  // Group / Ungroup: Cmd/Ctrl + G / Shift+Cmd+G
  if (isCmdOrCtrl && e.key.toLowerCase() === 'g') {
    e.preventDefault()
    if (e.shiftKey) {
      ungroupSelectedElements()
    } else {
      groupSelectedElements()
    }
    return
  }

  // Rich Text Shortcuts: Cmd/Ctrl + B, I, U
  if (isCmdOrCtrl && activeTextElement.value) {
    if (e.key.toLowerCase() === 'b') {
      e.preventDefault()
      toggleBold()
      return
    }
    if (e.key.toLowerCase() === 'i') {
      e.preventDefault()
      toggleItalic()
      return
    }
    if (e.key.toLowerCase() === 'u') {
      e.preventDefault()
      toggleUnderline()
      return
    }
  }

  // Keyboard Nudge (Arrow Keys)
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault()
    const step = e.shiftKey ? 10 : 1
    let dx = 0, dy = 0
    if (e.key === 'ArrowUp') dy = -step
    if (e.key === 'ArrowDown') dy = step
    if (e.key === 'ArrowLeft') dx = -step
    if (e.key === 'ArrowRight') dx = step
    nudgeSelectedElements(dx, dy)
    return
  }

  if (isCmdOrCtrl) {
    if (e.shiftKey && (e.key === ']' || e.code === 'BracketRight')) {
      e.preventDefault()
      bringToFrontSelected()
    } else if (!e.shiftKey && (e.key === ']' || e.code === 'BracketRight')) {
      e.preventDefault()
      bringForward()
    } else if (e.shiftKey && (e.key === '[' || e.code === 'BracketLeft')) {
      e.preventDefault()
      sendToBackSelected()
    } else if (!e.shiftKey && (e.key === '[' || e.code === 'BracketLeft')) {
      e.preventDefault()
      sendBackward()
    } else if (e.key.toLowerCase() === 'd') {
      e.preventDefault()
      duplicateSelectedElements()
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    removeSelectedElements()
  }
}

function onKeyup(e) {
  if (e.code === 'Space') {
    isSpacePressed.value = false
    if (isPanning.value) {
      endPan()
    }
  }
}

// =============================================================================
// 21. Lifecycle Hooks
// =============================================================================
onMounted(async () => {
  saveHistoryState()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
  window.addEventListener('click', handleGlobalClick)

  nextTick(() => {
    fitToScreen(canvasWorkspaceRef.value, stripRef.value)
  })

  const stored = await loadUploadsFromDB()
  if (stored && stored.length > 0) {
    userUploads.value = stored
  }

  const frames = await loadSavedFramesFromDB()
  if (frames && frames.length > 0) {
    savedFramesList.value = frames
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeUp)
  window.removeEventListener('mousemove', onRotateMove)
  window.removeEventListener('mouseup', onRotateUp)
})
</script>


<template>
  <div class="canva-editor d-flex flex-column vh-100 w-100 overflow-hidden bg-light text-dark">
    <!-- 1. Top Navbar (Bootstrap 5) -->
    <header class="navbar navbar-expand bg-white border-bottom px-3 py-2 justify-content-between flex-shrink-0">
      <div class="d-flex align-items-center gap-4">
        <router-link to="/" class="navbar-brand d-flex align-items-center gap-2 text-decoration-none m-0">
          <div style="width: 28px; height: 28px;">
            <svg viewBox="0 0 24 24" fill="none" class="w-100 h-100">
              <rect width="24" height="24" rx="7" fill="#2F5BEA" />
              <circle cx="12" cy="12" r="5" stroke="white" stroke-width="2.5" />
            </svg>
          </div>
          <span class="fw-bold text-dark fs-5">Blue Studios</span>
        </router-link>

        <nav class="nav gap-1">
          <router-link to="/" class="nav-link text-secondary py-1 px-2 rounded">My Studio</router-link>
          <span class="nav-link active text-primary fw-bold py-1 px-2 rounded">Templates</span>
          <span class="nav-link text-secondary py-1 px-2 rounded">Stickers</span>
        </nav>
      </div>

      <div class="d-flex align-items-center gap-2">
        <router-link to="/" class="btn btn-outline-secondary btn-sm rounded-pill d-flex align-items-center gap-1 text-decoration-none">
          <IconUsers :size="16" :stroke-width="2" />
          <span>Join room</span>
        </router-link>
        <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 13px;">G</div>
      </div>
    </header>

    <!-- 2. Subheader Toolbar -->
    <div class="d-flex align-items-center justify-content-between px-3 py-1 bg-white border-bottom position-relative" style="min-height: 44px; z-index: 100;">
      <!-- When a text element is selected: CANVA CONTEXTUAL TEXT FORMATTING TOOLBAR -->
      <div v-if="activeTextElement" class="d-flex align-items-center gap-1 flex-nowrap" @mousedown.stop>
        <!-- Font Family Selector Dropdown -->
        <div class="position-relative">
          <button
            class="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-between px-2 text-dark bg-white"
            style="min-width: 130px; max-width: 170px;"
            :class="{ 'border-primary shadow-sm': isFontDropdownOpen }"
            title="Font Family"
            @click.stop="isFontDropdownOpen = !isFontDropdownOpen; isTextColorPickerOpen = false; isTextSpacingOpen = false"
          >
            <span class="text-truncate me-1" :style="{ fontFamily: activeTextElement.fontFamily }">
              {{ getActiveFontDisplayName() }}
            </span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <!-- Font Picker Popover Menu -->
          <div v-if="isFontDropdownOpen" class="card shadow-lg position-absolute border overflow-hidden" style="top: calc(100% + 6px); left: 0; width: 280px; z-index: 1050;" @click.stop @mousedown.stop>
            <div class="p-2 border-bottom bg-light">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-white border-end-0">🔍</span>
                <input
                  v-model="fontSearchQuery"
                  type="text"
                  placeholder="Search fonts..."
                  class="form-control border-start-0"
                  @click.stop
                  @mousedown.stop
                />
              </div>
            </div>

            <div class="list-group list-group-flush overflow-y-auto" style="max-height: 320px;">
              <div v-for="cat in filteredFontCategories" :key="cat.name">
                <div class="d-flex justify-content-between align-items-center px-3 py-1 bg-light text-uppercase fw-bold text-muted" style="font-size: 0.65rem;">
                  <span>{{ cat.name }}</span>
                  <span class="badge bg-secondary-subtle text-secondary">{{ cat.tag }}</span>
                </div>
                <button
                  v-for="f in cat.fonts"
                  :key="f.name"
                  type="button"
                  class="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 px-3 border-0"
                  :class="{ 'bg-primary-subtle text-primary fw-bold': activeTextElement.fontFamily.toLowerCase().includes(f.name.toLowerCase()) }"
                  @click.stop="selectFontFamily(f)"
                >
                  <span class="text-truncate flex-grow-1" :style="{ fontFamily: f.family }">{{ f.name }}</span>
                  <span class="text-muted small ms-2 me-1" :style="{ fontFamily: f.family }">{{ f.sample }}</span>
                  <svg v-if="activeTextElement.fontFamily.toLowerCase().includes(f.name.toLowerCase())" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F5BEA" stroke-width="2.6">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="vr mx-1"></div>

        <!-- Font Size Stepper -->
        <div class="input-group input-group-sm" style="width: 105px;">
          <button class="btn btn-outline-secondary px-2" title="Decrease font size" @click="stepFontSize(-2)">−</button>
          <input
            v-model.number="activeTextElement.fontSize"
            type="number"
            min="8"
            max="120"
            class="form-control text-center p-0 fw-semibold"
            title="Font size (px)"
            @input="debounceTextHistory"
          />
          <button class="btn btn-outline-secondary px-2" title="Increase font size" @click="stepFontSize(2)">+</button>
        </div>

        <div class="vr mx-1"></div>

        <!-- Text Color Picker Popover -->
        <div class="position-relative">
          <button
            class="btn btn-sm btn-outline-secondary d-flex flex-column align-items-center justify-content-center p-1 bg-white"
            style="width: 32px; height: 31px;"
            :class="{ 'border-primary shadow-sm': isTextColorPickerOpen }"
            title="Text Color"
            @click.stop="isTextColorPickerOpen = !isTextColorPickerOpen; isFontDropdownOpen = false; isTextSpacingOpen = false"
          >
            <span class="fw-bold lh-1" style="font-size: 13px;">A</span>
            <span class="rounded-pill" style="width: 18px; height: 3px;" :style="{ backgroundColor: activeTextElement.color || '#0F172A' }"></span>
          </button>

          <!-- Text Color Dropdown -->
          <div v-if="isTextColorPickerOpen" class="card shadow-lg p-2 position-absolute border" style="top: calc(100% + 6px); left: 0; width: 220px; z-index: 1050;" @click.stop @mousedown.stop>
            <div class="text-uppercase fw-bold text-muted small mb-2" style="font-size: 0.65rem;">Text Color</div>
            <div class="d-flex flex-wrap gap-1 mb-2">
              <button
                v-for="c in TEXT_PALETTE_COLORS"
                :key="c"
                class="rounded-circle border"
                style="width: 24px; height: 24px;"
                :class="{ 'border-2 border-primary': activeTextElement.color === c }"
                :style="{ backgroundColor: c }"
                @click.stop="setTextColor(c)"
              ></button>
            </div>
            <div class="d-flex align-items-center gap-2 pt-2 border-top">
              <label class="small text-muted mb-0">Custom:</label>
              <input
                type="color"
                v-model="activeTextElement.color"
                class="form-control form-control-color form-control-sm p-0 border-0"
                style="width: 28px; height: 28px;"
                @input="setTextColor(activeTextElement.color)"
                @click.stop
                @mousedown.stop
              />
              <span class="font-monospace small fw-semibold">{{ activeTextElement.color }}</span>
            </div>
          </div>
        </div>

        <div class="vr mx-1"></div>

        <!-- Style Toggles: Bold, Italic, Underline, Strikethrough, Uppercase -->
        <div class="btn-group btn-group-sm">
          <button
            class="btn"
            :class="activeTextElement.fontWeight === 'bold' || activeTextElement.fontWeight >= 700 ? 'btn-primary' : 'btn-outline-secondary'"
            title="Bold (⌘B)"
            @click="toggleBold"
          >
            <strong>B</strong>
          </button>
          <button
            class="btn"
            :class="activeTextElement.fontStyle === 'italic' ? 'btn-primary' : 'btn-outline-secondary'"
            title="Italic (⌘I)"
            @click="toggleItalic"
          >
            <em>I</em>
          </button>
          <button
            class="btn"
            :class="activeTextElement.textDecoration === 'underline' ? 'btn-primary' : 'btn-outline-secondary'"
            title="Underline (⌘U)"
            @click="toggleUnderline"
          >
            <u>U</u>
          </button>
          <button
            class="btn"
            :class="activeTextElement.textDecoration === 'line-through' ? 'btn-primary' : 'btn-outline-secondary'"
            title="Strikethrough"
            @click="toggleStrikethrough"
          >
            <s>S</s>
          </button>
          <button
            class="btn"
            :class="activeTextElement.textTransform === 'uppercase' ? 'btn-primary' : 'btn-outline-secondary'"
            title="Uppercase (aA)"
            @click="toggleUppercase"
          >
            aA
          </button>
        </div>

        <div class="vr mx-1"></div>

        <!-- Alignment Controls -->
        <div class="btn-group btn-group-sm">
          <button
            class="btn"
            :class="activeTextElement.textAlign === 'left' ? 'btn-primary' : 'btn-outline-secondary'"
            title="Align Left"
            @click="setTextAlign('left')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="19" y2="18" />
            </svg>
          </button>
          <button
            class="btn"
            :class="activeTextElement.textAlign === 'center' || !activeTextElement.textAlign ? 'btn-primary' : 'btn-outline-secondary'"
            title="Align Center"
            @click="setTextAlign('center')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
          <button
            class="btn"
            :class="activeTextElement.textAlign === 'right' ? 'btn-primary' : 'btn-outline-secondary'"
            title="Align Right"
            @click="setTextAlign('right')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="5" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div class="vr mx-1"></div>

        <!-- Spacing Popover (Letter & Line Spacing) -->
        <div class="position-relative">
          <button
            class="btn btn-sm d-flex align-items-center gap-1"
            :class="isTextSpacingOpen ? 'btn-primary' : 'btn-outline-secondary'"
            title="Letter & Line Spacing"
            @click.stop="isTextSpacingOpen = !isTextSpacingOpen; isFontDropdownOpen = false; isTextColorPickerOpen = false"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
              <polyline points="8 10 12 14 16 10" />
            </svg>
            <span class="small">Spacing</span>
          </button>

          <!-- Spacing Dropdown Popover -->
          <div v-if="isTextSpacingOpen" class="card shadow-lg p-3 position-absolute border" style="top: calc(100% + 6px); left: 0; width: 230px; z-index: 1050;" @click.stop @mousedown.stop>
            <div class="text-uppercase fw-bold text-muted small mb-2" style="font-size: 0.65rem;">Text Spacing</div>
            
            <div class="mb-3">
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span>Letter spacing</span>
                <span class="fw-bold text-dark">{{ activeTextElement.letterSpacing || 0 }}px</span>
              </div>
              <input
                v-model.number="activeTextElement.letterSpacing"
                type="range"
                min="-10"
                max="50"
                step="1"
                class="form-range"
                @input="debounceTextHistory"
              />
            </div>

            <div>
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span>Line spacing</span>
                <span class="fw-bold text-dark">{{ activeTextElement.lineHeight || 1.2 }}</span>
              </div>
              <input
                v-model.number="activeTextElement.lineHeight"
                type="range"
                min="0.8"
                max="2.5"
                step="0.05"
                class="form-range"
                @input="debounceTextHistory"
              />
            </div>
          </div>
        </div>

        <div class="vr mx-1"></div>

        <!-- Canva-Style "Effects" Button -->
        <button
          class="btn btn-sm d-flex align-items-center gap-1 position-relative"
          :class="activeTool === 'effects' && isDrawerOpen ? 'btn-primary' : 'btn-outline-secondary'"
          title="Open Text Effects & Curve"
          @click="openEffectsDrawer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span class="small">Effects</span>
          <span v-if="activeTextElement.effect !== 'none' || (activeTextElement.curveAmount && activeTextElement.curveAmount !== 0)" class="position-absolute top-0 start-100 translate-middle p-1 bg-primary border border-light rounded-circle"></span>
        </button>

        <div class="vr mx-1"></div>

        <!-- Undo & Redo (also accessible while formatting text) -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Undo" :disabled="historyIndex <= 0" @click="undo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
          <button class="btn btn-outline-secondary" title="Redo" :disabled="historyIndex >= history.length - 1" @click="redo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- When a vector/shape/washi/svg element is selected: CANVA VECTOR RECOLORING TOOLBAR -->
      <div v-else-if="activeVectorElement" class="d-flex align-items-center gap-2 flex-nowrap" @mousedown.stop>
        <div class="badge bg-light text-dark border d-flex align-items-center gap-1 py-1 px-2 fw-semibold small">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a7 7 0 0 0 7 7c0 3-2 5-2 7a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2c0-2-2-4-2-7a7 7 0 0 0 7-7z" />
          </svg>
          <span>{{ getVectorBarTitle(activeVectorElement) }}</span>
        </div>

        <div class="d-flex align-items-center gap-1">
          <div
            v-for="(swatch, sIdx) in getVectorSwatches(activeVectorElement)"
            :key="sIdx"
            class="position-relative"
          >
            <button
              class="btn btn-sm btn-outline-secondary p-1 rounded-2"
              style="width: 28px; height: 28px;"
              :class="{ 'border-primary shadow-sm': activeVectorColorTarget?.key === swatch.key && isVectorColorPickerOpen }"
              :title="swatch.label + ': ' + swatch.current"
              @click.stop="openVectorColorPicker(swatch, $event)"
            >
              <span class="d-block w-100 h-100 rounded-1 border" :style="{ backgroundColor: swatch.current }"></span>
            </button>

            <!-- Canva-style Popover for this swatch -->
            <div
              v-if="activeVectorColorTarget?.key === swatch.key && isVectorColorPickerOpen"
              class="card shadow-lg p-2 position-absolute border"
              style="top: calc(100% + 6px); left: 0; width: 220px; z-index: 1050;"
              @click.stop
              @mousedown.stop
            >
              <div class="text-uppercase fw-bold text-muted small mb-2" style="font-size: 0.65rem;">{{ swatch.label || 'Change Color' }}</div>
              <div class="d-flex flex-wrap gap-1 mb-2">
                <button
                  v-for="c in TEXT_PALETTE_COLORS"
                  :key="c"
                  class="rounded-circle border"
                  style="width: 24px; height: 24px;"
                  :class="{ 'border-2 border-primary': swatch.current === c }"
                  :style="{ backgroundColor: c }"
                  @click.stop="setVectorColor(swatch, c)"
                ></button>
              </div>
              <div class="d-flex align-items-center gap-2 pt-2 border-top">
                <label class="small text-muted mb-0">Custom:</label>
                <input
                  type="color"
                  :value="swatch.current"
                  class="form-control form-control-color form-control-sm p-0 border-0"
                  style="width: 28px; height: 28px;"
                  @input="setVectorColor(swatch, $event.target.value)"
                  @click.stop
                  @mousedown.stop
                />
                <span class="font-monospace small fw-semibold">{{ swatch.current }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="vr mx-1"></div>

        <!-- Quick actions: Duplicate & Delete -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Duplicate (⌘D)" @click="duplicateSelectedElements">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="btn btn-outline-danger" title="Delete (Del)" @click="removeSelectedElements">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>

        <div class="vr mx-1"></div>

        <!-- Undo & Redo -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Undo" :disabled="historyIndex <= 0" @click="undo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
          <button class="btn btn-outline-secondary" title="Redo" :disabled="historyIndex >= history.length - 1" @click="redo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- When a doodle element is selected: CANVA DOODLE FORMATTING TOOLBAR -->
      <div v-else-if="activeDoodleElement" class="d-flex align-items-center gap-2 flex-nowrap" @mousedown.stop>
        <div class="badge bg-light text-dark border d-flex align-items-center gap-1 py-1 px-2 fw-semibold small text-capitalize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
            <path d="M2 2l7.586 7.586"></path>
            <circle cx="11" cy="11" r="2"></circle>
          </svg>
          <span>{{ activeDoodleElement.brushType || 'Doodle' }} Stroke</span>
        </div>

        <div class="d-flex align-items-center gap-1">
          <div class="position-relative">
            <button
              class="btn btn-sm btn-outline-secondary p-1 rounded-2"
              style="width: 28px; height: 28px;"
              :class="{ 'border-primary shadow-sm': isDoodleColorPickerOpen }"
              :title="'Doodle Color: ' + (activeDoodleElement.color || '#0F172A')"
              @click.stop="isDoodleColorPickerOpen = !isDoodleColorPickerOpen"
            >
              <span class="d-block w-100 h-100 rounded-1 border" :style="{ backgroundColor: activeDoodleElement.color || '#0F172A' }"></span>
            </button>

            <!-- Color Popover -->
            <div
              v-if="isDoodleColorPickerOpen"
              class="card shadow-lg p-2 position-absolute border"
              style="top: calc(100% + 6px); left: 0; width: 220px; z-index: 1050;"
              @click.stop
              @mousedown.stop
            >
              <div class="text-uppercase fw-bold text-muted small mb-2" style="font-size: 0.65rem;">Doodle Color</div>
              <div class="d-flex flex-wrap gap-1 mb-2">
                <button
                  v-for="c in TEXT_PALETTE_COLORS"
                  :key="c"
                  class="rounded-circle border"
                  style="width: 24px; height: 24px;"
                  :class="{ 'border-2 border-primary': activeDoodleElement.color === c }"
                  :style="{ backgroundColor: c }"
                  @click.stop="setDoodleColor(c)"
                ></button>
              </div>
              <div class="d-flex align-items-center gap-2 pt-2 border-top">
                <label class="small text-muted mb-0">Custom:</label>
                <input
                  type="color"
                  :value="activeDoodleElement.color || '#0F172A'"
                  class="form-control form-control-color form-control-sm p-0 border-0"
                  style="width: 28px; height: 28px;"
                  @input="setDoodleColor($event.target.value)"
                  @click.stop
                  @mousedown.stop
                />
                <span class="font-monospace small fw-semibold">{{ activeDoodleElement.color || '#0F172A' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="vr mx-1"></div>

        <!-- Stroke Width Adjuster -->
        <div class="d-flex align-items-center gap-2">
          <span class="text-muted small fw-semibold">Thickness</span>
          <input
            type="range"
            min="1"
            max="48"
            :value="activeDoodleElement.strokeWidth || 6"
            class="form-range"
            style="width: 80px;"
            @input="setDoodleStrokeWidth(Number($event.target.value))"
          />
          <span class="small fw-bold text-dark" style="width: 28px;">{{ activeDoodleElement.strokeWidth || 6 }}px</span>
        </div>

        <div class="vr mx-1"></div>

        <!-- Quick actions: Duplicate & Delete -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Duplicate (⌘D)" @click="duplicateSelectedElements">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="btn btn-outline-danger" title="Delete (Del)" @click="removeSelectedElements">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>

        <div class="vr mx-1"></div>

        <!-- Undo & Redo -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Undo" :disabled="historyIndex <= 0" @click="undo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
          <button class="btn btn-outline-secondary" title="Redo" :disabled="historyIndex >= history.length - 1" @click="redo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Otherwise: Standard Subheader Toolbar (Bootstrap 5) -->
      <template v-else>
        <div class="d-flex align-items-center gap-2 small">
          <span class="text-muted">Templates</span>
          <span class="text-muted">/</span>
          <span class="fw-bold text-dark">{{ templateName }}</span>
        </div>

        <div class="d-flex align-items-center gap-2">
          <!-- Undo & Redo -->
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" title="Undo (⌘Z)" :disabled="historyIndex <= 0" @click="undo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </button>
            <button class="btn btn-outline-secondary" title="Redo (⌘Y)" :disabled="historyIndex >= history.length - 1" @click="redo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
              </svg>
            </button>
          </div>

          <div class="vr my-1 mx-1"></div>

          <!-- Hand / Pan Tool Toggle -->
          <button
            class="btn btn-sm"
            :class="isHandToolActive ? 'btn-primary' : 'btn-outline-secondary'"
            title="Hand / Pan Tool (H or hold Spacebar)"
            @click="isHandToolActive = !isHandToolActive"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          </button>

          <!-- Zoom Stepper Controls -->
          <div class="input-group input-group-sm" style="width: auto;">
            <!-- Zoom Out (-) -->
            <button
              class="btn btn-outline-secondary"
              title="Zoom Out (⌘-)"
              :disabled="canvasScale <= 0.25"
              @click="zoomOut(canvasWorkspaceRef)"
            >
              −
            </button>

            <!-- Zoom Readout & Dropdown Menu -->
            <div class="zoom-dropdown-wrapper position-relative">
              <button
                class="btn btn-outline-secondary rounded-0 px-2 d-flex align-items-center gap-1 border-start-0 border-end-0"
                :class="{ active: isZoomMenuOpen }"
                title="Zoom Options"
                @click.stop="isZoomMenuOpen = !isZoomMenuOpen"
              >
                <span>{{ zoomPercentage }}</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <!-- Zoom Dropdown Popover -->
              <div v-if="isZoomMenuOpen" class="zoom-popover-menu shadow-lg" @click.stop @mousedown.stop>
                <div class="menu-header">Zoom & Navigation</div>

                <button class="menu-item" @click="fitToScreen(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
                  <span class="item-name">Fit to Screen</span>
                  <span class="item-shortcut">⌘0</span>
                </button>

                <button class="menu-item" @click="fillScreen(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
                  <span class="item-name">Fill Screen</span>
                  <span class="item-shortcut">Fit H</span>
                </button>

                <button class="menu-item" @click="resetToActualSize(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
                  <span class="item-name">100% Actual Size</span>
                  <span class="item-shortcut">⌘1</span>
                </button>

                <div class="menu-divider"></div>

                <button
                  v-for="preset in [0.5, 0.75, 1.0, 1.5, 2.0, 3.0]"
                  :key="preset"
                  class="menu-item"
                  :class="{ current: Math.abs(canvasScale - preset) < 0.01 }"
                  @click="setZoom(preset, null, canvasWorkspaceRef); isZoomMenuOpen = false"
                >
                  <span class="item-name">{{ Math.round(preset * 100) }}%</span>
                </button>

                <div class="menu-divider"></div>

                <button class="menu-item" @click="toggleRulers(); isZoomMenuOpen = false">
                  <span class="item-name">{{ showRulers ? 'Hide Rulers' : 'Show Rulers' }}</span>
                  <span class="item-shortcut">⇧R</span>
                </button>

                <button v-if="customGuides.length > 0" class="menu-item text-danger" @click="clearAllGuides(); isZoomMenuOpen = false">
                  <span class="item-name">Clear Guides</span>
                </button>
              </div>
            </div>

            <!-- Zoom In (+) -->
            <button
              class="btn btn-outline-secondary"
              title="Zoom In (⌘+)"
              :disabled="canvasScale >= 5.0"
              @click="zoomIn(canvasWorkspaceRef)"
            >
              +
            </button>
          </div>

          <!-- Fit to Screen Quick Action Button -->
          <button
            class="btn btn-sm btn-outline-secondary"
            title="Fit to Screen (⌘0)"
            @click="fitToScreen(canvasWorkspaceRef, stripRef)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>

          <div class="vr my-1 mx-1"></div>

          <!-- Cutouts Toggle -->
          <button
            class="btn btn-sm rounded-pill d-flex align-items-center gap-1"
            :class="showCutouts ? 'btn-primary' : 'btn-outline-secondary'"
            :title="showCutouts ? 'Click to hide photo cutouts' : 'Click to show photo cutouts'"
            @click="toggleCutouts"
          >
            <svg v-if="showCutouts" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span>Cutouts: {{ showCutouts ? 'On' : 'Off' }}</span>
          </button>
        </div>

        <div class="d-flex align-items-center gap-2">
          <!-- Saved Frames Folder Action Button -->
          <button class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" @click="isSavedFramesModalOpen = true" title="Saved Frames Folder (⌘O)">
            <IconFolder :size="14" :stroke-width="2.2" />
            <span>Saved Frames</span>
            <span v-if="savedFramesList.length > 0" class="badge rounded-pill bg-primary ms-1">{{ savedFramesList.length }}</span>
          </button>

          <!-- Save Frame Button (Editable PNG & Local Folder Storage) -->
          <button class="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-bold shadow-sm" :disabled="isSavingFrame" @click="saveFrame" title="Save Frame & Download Editable PNG (⌘S)">
            <IconSave :size="14" :stroke-width="2.3" />
            <span>{{ isSavingFrame ? 'Saving...' : 'Save Frame' }}</span>
          </button>
        </div>
      </template>
    </div>

    <!-- 3. Main Workspace Container -->
    <div class="editor-body d-flex flex-grow-1 overflow-hidden">
      <!-- Left Tool Rail (Bootstrap 5) -->
      <aside class="left-rail d-flex flex-column align-items-center bg-white border-end py-2 px-1 gap-1 flex-shrink-0" style="width: 72px;">
        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'templates' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('templates')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Templates</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'elements' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('elements')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8" cy="8" r="4" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <polygon points="12 14 16 21 8 21" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Elements</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'text' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('text')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Text</span>
        </button>

        <!-- Draw Mode Rail Tab -->
        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="((activeTool === 'draw' && isDrawerOpen) || isDrawMode) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          title="Draw (Freehand Doodles, Highlighter & Eraser)"
          @click="toggleDrawer('draw')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Draw</span>
          <span v-if="activeStrokes.length > 0" class="badge rounded-pill bg-primary position-absolute top-0 end-0 translate-middle-y me-1">{{ activeStrokes.length }}</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'effects' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('effects')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Effects</span>
          <span v-if="activeTextElement && (activeTextElement.effect !== 'none' || (activeTextElement.curveAmount && activeTextElement.curveAmount !== 0))" class="badge rounded-pill bg-primary position-absolute top-0 end-0 translate-middle-y me-1">★</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'uploads' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('uploads')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Uploads</span>
          <span v-if="userUploads.length > 0" class="badge rounded-pill bg-primary position-absolute top-0 end-0 translate-middle-y me-1">{{ userUploads.length }}</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'background' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('background')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Background</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'layers' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('layers')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Layers</span>
          <span v-if="canvasElements.length > 0" class="badge rounded-pill bg-primary position-absolute top-0 end-0 translate-middle-y me-1">{{ canvasElements.length }}</span>
        </button>
      </aside>

      <!-- Expandable Flyout Drawer (Bootstrap 5) -->
      <div v-if="isDrawerOpen" class="canva-drawer bg-white border-end d-flex flex-column flex-shrink-0 shadow-sm overflow-hidden" style="width: 310px; z-index: 15;">
        <div class="p-3 border-bottom d-flex align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2 flex-grow-1 px-1">
            <div class="p-1 rounded-2 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 28px; height: 28px;">
              <span v-if="activeTool === 'elements'" class="fs-6">🎀</span>
              <span v-else-if="activeTool === 'templates'" class="fs-6">🖼️</span>
              <span v-else-if="activeTool === 'text'" class="fs-6 fw-bold">T</span>
              <span v-else-if="activeTool === 'draw'" class="fs-6">✏️</span>
              <span v-else-if="activeTool === 'effects'" class="fs-6">✨</span>
              <span v-else-if="activeTool === 'uploads'" class="fs-6">📁</span>
              <span v-else-if="activeTool === 'background'" class="fs-6">🎨</span>
              <span v-else-if="activeTool === 'layers'" class="fs-6">📑</span>
            </div>
            <span class="fw-bold fs-6 text-dark text-capitalize">
              {{
                activeTool === 'elements' ? 'Stickers & Elements' :
                activeTool === 'templates' ? 'Templates Presets' :
                activeTool === 'text' ? 'Text & Typography' :
                activeTool === 'draw' ? 'Draw & Doodle' :
                activeTool === 'effects' ? 'Photo Effects' :
                activeTool === 'uploads' ? 'Upload Media' :
                activeTool === 'background' ? 'Background Styles' :
                activeTool === 'layers' ? 'Layers Stack' : activeTool
              }}
            </span>
          </div>
          <button class="btn btn-sm btn-light text-muted p-1 rounded d-flex align-items-center justify-content-center" style="width: 30px; height: 30px;" title="Collapse drawer" @click="closeDrawer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <!-- DRAWER CONTENT: TEMPLATES -->
        <div v-if="activeTool === 'templates'" class="drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">

          <div>
            <h6 class="fw-bold text-dark mb-1">Starter Layout Presets</h6>
            <p class="small text-muted mb-3">Click to load fresh layout, frame, and styles.</p>

            <div class="row row-cols-2 g-2">
              <div
                v-for="tpl in templatePresets"
                :key="tpl.id"
                class="col"
              >
                <div
                  class="card h-100 p-2 cursor-pointer border transition-all template-preset-card"
                  :class="{ 'border-primary shadow-sm bg-primary bg-opacity-10': templateName === tpl.name }"
                  @click="applyTemplate(tpl)"
                >
                  <div
                    class="tpl-card-preview rounded mb-2 d-flex align-items-center justify-content-center position-relative overflow-hidden"
                    :style="{
                      background: tpl.bgType === 'gradient' ? tpl.gradient : tpl.bg,
                      borderColor: tpl.border,
                      height: '92px',
                      borderWidth: (tpl.borderWidth > 0 ? Math.min(3, Math.max(1, Math.round(tpl.borderWidth / 2))) : 0) + 'px',
                      borderStyle: 'solid'
                    }"
                  >
                    <!-- Mini texture overlay preview if present -->
                    <div
                      v-if="tpl.texture"
                      class="position-absolute top-0 start-0 w-100 h-100 pointer-events-none opacity-50"
                      :style="{ backgroundImage: getTextureBackgroundImage(tpl.texture), backgroundSize: '12px 12px' }"
                    ></div>

                    <div class="mini-slots" :class="['mini-layout-' + tpl.layout]">
                      <span v-for="n in tpl.slots" :key="n" class="mini-slot" :class="['shape-' + tpl.shape.toLowerCase()]"></span>
                    </div>

                    <!-- Mini Decorative Sticker Badge in corner if preset has previewIcon -->
                    <span v-if="tpl.previewIcon" class="position-absolute top-0 end-0 m-1" style="font-size: 11px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));">
                      {{ tpl.previewIcon }}
                    </span>
                  </div>
                  <div class="d-flex flex-column">
                    <span class="small fw-bold text-dark text-truncate">{{ tpl.name }}</span>
                    <div class="d-flex align-items-center justify-content-between mt-1">
                      <span class="badge bg-secondary-subtle text-secondary" style="font-size: 0.65rem;">{{ tpl.tag }}</span>
                      <span class="text-muted" style="font-size: 0.65rem;">{{ tpl.layout }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: ELEMENTS (Stickers, Washi Tape, Shapes, Vectors) -->
        <div v-if="activeTool === 'elements'" class="drawer-content elements-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <!-- Instant Search Box & Category Filter Chips -->
          <div class="d-flex flex-column gap-2 mb-2">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light border-end-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                v-model="elementSearchQuery"
                type="text"
                class="form-control form-control-sm bg-light border-start-0 ps-1"
                placeholder="Search stickers, shapes, washi..."
              />
              <button v-if="elementSearchQuery" class="btn btn-outline-secondary border-start-0" title="Clear search" @click="elementSearchQuery = ''">×</button>
            </div>
          </div>

          <!-- Empty search state -->
          <div v-if="filteredElementCategories.length === 0" class="text-center py-5 text-muted">
            <div class="fs-1 mb-2">🔍</div>
            <h6 class="fw-bold text-dark mb-1">No elements found</h6>
            <p class="small text-muted mb-3">No stickers or graphics match "{{ elementSearchQuery }}".</p>
            <button class="btn btn-sm btn-primary rounded-pill px-3" @click="elementSearchQuery = ''; selectedElementTag = 'All'">Clear Search & Filters</button>
          </div>

          <!-- Filtered Elements Categories -->
          <div v-else class="d-flex flex-column gap-3">
            <div v-for="cat in filteredElementCategories" :key="cat.title">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="fw-bold text-dark mb-0 small">{{ cat.title }}</h6>
              </div>

              <div class="elements-grid">
                <button
                  v-for="item in cat.items"
                  :key="item.name"
                  class="btn btn-sm btn-light border p-1 d-flex align-items-center justify-content-center rounded-3 element-item-hover"
                  style="height: 52px;"
                  :title="item.name + (item.isSvg ? ' (Dynamic Recolorable)' : '')"
                  @click="addElement(item)"
                >
                  <!-- Vector SVG Preview -->
                  <div v-if="item.isSvg" class="element-drawer-svg" v-html="item.svgRaw"></div>

                  <!-- Sticker emoji content -->
                  <span v-else-if="item.type === 'sticker'" class="fs-4">{{ item.content }}</span>

                  <!-- Washi tape preview -->
                  <div
                    v-else-if="item.type === 'tape'"
                    class="washi-preview w-100 rounded-1 d-flex align-items-center justify-content-center shadow-sm"
                    style="height: 18px;"
                    :style="{
                      backgroundColor: item.color,
                      backgroundImage: getTapePattern(item)
                    }"
                  >
                    <span class="fw-bold text-dark" style="font-size: 0.6rem;">{{ item.name.split(' ')[0] }}</span>
                  </div>

                  <!-- Shape preview -->
                  <div
                    v-else-if="item.type === 'shape'"
                    class="d-flex align-items-center justify-content-center"
                  >
                    <svg viewBox="0 0 100 100" width="28" height="28">
                      <path
                        :d="getShapePathD(item.shapeType)"
                        :fill="item.color || '#2F5BEA'"
                        :stroke="item.strokeColor || '#0F172A'"
                        :stroke-width="item.strokeWidth || 2"
                      />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: UPLOADS -->
        <div v-if="activeTool === 'uploads'" class="drawer-content uploads-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <h6 class="fw-bold text-dark mb-1">Upload Media</h6>
            <p class="small text-muted mb-2">Add custom images, photos or SVGs to your photostrip.</p>
          </div>

          <!-- Hidden File Input -->
          <input
            ref="uploadInputRef"
            type="file"
            multiple
            accept="image/png, image/jpeg, image/webp, image/svg+xml"
            class="d-none"
            @change="handleFileUpload"
          />

          <!-- Drag and Drop Upload Dropzone -->
          <div
            class="card border-2 border-dashed p-4 text-center cursor-pointer mb-2 bg-light rounded-3 transition-all"
            :class="{ 'border-primary bg-primary bg-opacity-10': isUploading }"
            @dragover.prevent
            @drop="handleFileUploadDrop"
            @click="triggerFileUpload"
          >
            <div class="mb-2 text-primary">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <span class="fw-bold small text-dark d-block">{{ isUploading ? 'Processing assets...' : 'Upload files' }}</span>
            <span class="small text-muted d-block">Drag & drop or click to browse</span>
            <span class="badge bg-secondary-subtle text-secondary align-self-center mt-2" style="font-size: 0.65rem;">PNG, JPG, WEBP, or SVG</span>
          </div>

          <!-- Uploaded Media Grid -->
          <div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small fw-bold text-secondary text-uppercase">YOUR ASSETS ({{ userUploads.length }})</span>
            </div>

            <!-- Empty State -->
            <div v-if="userUploads.length === 0" class="text-center py-4 text-muted bg-light rounded-3 border">
              <div class="fs-2 mb-1">📁</div>
              <span class="fw-bold small text-dark d-block mb-1">No uploads yet</span>
              <p class="small text-muted mb-0 px-3">Your uploaded photos and vector stickers will appear here and persist across refreshes.</p>
            </div>

            <!-- Media Grid -->
            <div v-else class="row row-cols-2 g-2">
              <div
                v-for="item in userUploads"
                :key="item.id"
                class="col"
              >
                <div
                  class="card h-100 p-1 position-relative cursor-pointer border"
                  :title="'Click to add ' + item.name + ' to strip'"
                  draggable="true"
                  @dragstart="onAssetDragStart(item, $event)"
                  @click="addUploadToCanvas(item)"
                >
                  <!-- Thumbnail -->
                  <div class="bg-light rounded d-flex align-items-center justify-content-center overflow-hidden mb-1" style="height: 72px;">
                    <div v-if="item.isSvg" class="w-100 h-100 d-flex align-items-center justify-content-center p-2" v-html="item.svgContent"></div>
                    <img v-else :src="item.dataUrl" :alt="item.name" class="w-100 h-100 object-fit-cover" />
                  </div>
                  <span class="badge bg-primary position-absolute top-0 start-0 m-1" style="font-size: 0.6rem;">{{ item.isSvg ? 'SVG' : (item.type || 'IMG').toUpperCase() }}</span>
                  <span class="small fw-semibold text-truncate text-dark px-1">{{ item.name }}</span>

                  <!-- Delete Trash Button -->
                  <button
                    class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 p-0 rounded-circle d-flex align-items-center justify-content-center"
                    style="width: 22px; height: 22px;"
                    title="Delete from uploads"
                    @click.stop="deleteUpload(item.id, $event)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: TEXT -->
        <div v-if="activeTool === 'text'" class="drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <h6 class="fw-bold text-dark mb-1">Add text to strip</h6>
            <p class="small text-muted mb-2">Click to place typography anywhere on your frame.</p>
          </div>

          <div class="d-flex flex-column gap-2">
            <button
              v-for="preset in textPresets"
              :key="preset.label"
              class="btn btn-outline-light border text-dark text-start p-3 rounded-3 d-flex flex-column gap-1 w-100"
              @click="addTextElement(preset)"
            >
              <span class="small text-secondary fw-semibold">{{ preset.label }}</span>
              <span
                :style="{
                  fontSize: preset.fontSize + 'px',
                  fontWeight: preset.fontWeight,
                  fontStyle: preset.fontStyle || 'normal',
                  color: preset.color
                }"
              >
                {{ preset.text }}
              </span>
            </button>
          </div>
        </div>

        <!-- DRAWER CONTENT: DRAW (Freehand Brushes: Felt Pen, Highlighter, Eraser) -->
        <div v-if="activeTool === 'draw'" class="drawer-content draw-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <h6 class="fw-bold text-dark mb-1">Freehand Brushes</h6>
            <p class="small text-muted mb-2">Pick a tool and sketch directly on the photostrip.</p>
          </div>

          <!-- Brush Type Selection -->
          <div class="row row-cols-3 g-2 mb-3">
            <!-- Felt Pen -->
            <div class="col">
              <button
                class="btn w-100 p-2 d-flex flex-column align-items-center text-center rounded-3 border"
                :class="currentBrush === 'pen' ? 'btn-primary shadow-sm' : 'btn-outline-light border text-dark'"
                title="Felt Pen: solid, clean signature & sketch lines"
                @click="setBrush('pen')"
              >
                <div class="mb-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                    <path d="M2 2l7.586 7.586" />
                    <circle cx="11" cy="11" r="2" />
                  </svg>
                </div>
                <span class="small fw-bold">Felt Pen</span>
                <span class="small opacity-75" style="font-size: 0.7rem;">Solid line</span>
              </button>
            </div>

            <!-- Highlighter -->
            <div class="col">
              <button
                class="btn w-100 p-2 d-flex flex-column align-items-center text-center rounded-3 border"
                :class="currentBrush === 'highlighter' ? 'btn-primary shadow-sm' : 'btn-outline-light border text-dark'"
                title="Highlighter: transparent multiply marker"
                @click="setBrush('highlighter')"
              >
                <div class="mb-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m9 11-6 6v3h3l6-6" />
                    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
                  </svg>
                </div>
                <span class="small fw-bold">Highlighter</span>
                <span class="small opacity-75" style="font-size: 0.7rem;">Translucent</span>
              </button>
            </div>

            <!-- Eraser -->
            <div class="col">
              <button
                class="btn w-100 p-2 d-flex flex-column align-items-center text-center rounded-3 border"
                :class="currentBrush === 'eraser' ? 'btn-primary shadow-sm' : 'btn-outline-light border text-dark'"
                title="Eraser: tap or drag over strokes to remove"
                @click="setBrush('eraser')"
              >
                <div class="mb-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                    <path d="M22 21H7" />
                    <path d="m5 11 9 9" />
                  </svg>
                </div>
                <span class="small fw-bold">Eraser</span>
                <span class="small opacity-75" style="font-size: 0.7rem;">Erase lines</span>
              </button>
            </div>
          </div>

          <!-- Stroke Thickness Section -->
          <div class="card p-2 bg-light border rounded-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="small fw-bold text-secondary text-uppercase m-0">{{ currentBrush === 'eraser' ? 'Eraser Size' : 'Stroke Thickness' }}</span>
              <div class="d-flex align-items-center gap-2">
                <span
                  class="rounded-circle d-inline-block"
                  :style="{
                    width: Math.min(20, Math.max(4, brushWidth)) + 'px',
                    height: Math.min(20, Math.max(4, brushWidth)) + 'px',
                    backgroundColor: currentBrush === 'eraser' ? '#94A3B8' : brushColor,
                    opacity: currentBrush === 'highlighter' ? 0.5 : 1
                  }"
                ></span>
                <span class="badge bg-secondary-subtle text-secondary">{{ brushWidth }}px</span>
              </div>
            </div>

            <input
              type="range"
              min="1"
              max="48"
              step="1"
              :value="brushWidth"
              class="form-range"
              @input="brushWidth = Number($event.target.value)"
            />

            <!-- Quick Thickness Preset Chips -->
            <div class="d-flex gap-1 justify-content-between mt-2">
              <button
                v-for="preset in [3, 6, 12, 24, 36]"
                :key="preset"
                class="btn btn-sm py-0 px-2 rounded-pill"
                :class="brushWidth === preset ? 'btn-primary' : 'btn-outline-secondary'"
                style="font-size: 0.75rem;"
                @click="brushWidth = preset"
              >
                {{ preset }}px
              </button>
            </div>
          </div>

          <!-- Color Palette Section (Hidden when eraser selected) -->
          <div v-if="currentBrush !== 'eraser'" class="card p-2 bg-light border rounded-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="small fw-bold text-secondary text-uppercase m-0">Ink Color</span>
              <span class="badge bg-white text-secondary border font-monospace">{{ brushColor.toUpperCase() }}</span>
            </div>

            <div class="d-flex flex-wrap gap-1">
              <button
                v-for="c in DOODLE_PALETTE"
                :key="c"
                class="rounded-circle border"
                style="width: 26px; height: 26px;"
                :class="{ 'border-2 border-primary': brushColor.toLowerCase() === c.toLowerCase() }"
                :style="{ backgroundColor: c }"
                :title="c"
                @click="brushColor = c"
              ></button>

              <!-- Native Custom Color Picker Button -->
              <label class="btn btn-sm btn-outline-secondary p-0 rounded-circle position-relative overflow-hidden d-flex align-items-center justify-content-center" style="width: 26px; height: 26px;" title="Custom color picker">
                <input
                  type="color"
                  :value="brushColor"
                  class="position-absolute top-0 start-0 w-100 h-100 opacity-0"
                  style="cursor: pointer;"
                  @input="brushColor = $event.target.value"
                />
                <span class="fw-bold text-muted lh-1 small">+</span>
              </label>
            </div>
          </div>

          <!-- Actions: Undo, Clear, Done -->
          <div class="card p-2 bg-light border rounded-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="small text-muted">
                {{ activeStrokes.length }} stroke{{ activeStrokes.length === 1 ? '' : 's' }}
              </span>
              <div class="d-flex align-items-center gap-1">
                <button
                  class="btn btn-sm btn-outline-secondary py-1 px-2 d-flex align-items-center gap-1"
                  :disabled="activeStrokes.length === 0"
                  title="Undo last stroke (⌘Z)"
                  @click="undoDoodleStroke"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                  <span>Undo</span>
                </button>
                <button
                  class="btn btn-sm btn-outline-danger py-1 px-2 d-flex align-items-center gap-1"
                  :disabled="activeStrokes.length === 0"
                  title="Clear all in-progress strokes"
                  @click="clearDoodleStrokes"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: TEXT EFFECTS -->
        <div v-if="activeTool === 'effects'" class="drawer-content effects-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <h6 class="fw-bold text-dark mb-1">Text Effects</h6>
            <p class="small text-muted mb-2">Transform typography with shadow, stroke, badges and curve.</p>
          </div>

          <!-- If no text element is currently selected, show a friendly prompt -->
          <div v-if="!activeTextElement" class="card p-4 text-center text-muted bg-light border rounded-3">
            <div class="fs-1 mb-2">✨</div>
            <h6 class="fw-bold text-dark mb-1">No text selected</h6>
            <p class="small text-muted mb-0">Select any text block on your photostrip to customize its typography effects and curvature.</p>
          </div>

          <!-- When a text element is selected, show modular visual presets and sliders -->
          <div v-else class="d-flex flex-column gap-3">
            <!-- Active Text Preview Chip -->
            <div class="card p-2 bg-light border rounded-3 d-flex flex-row align-items-center justify-content-between">
              <span class="small fw-bold text-secondary text-uppercase" style="font-size: 0.7rem;">ACTIVE TEXT</span>
              <span class="small fw-semibold text-dark text-truncate ms-2">"{{ activeTextElement.text.slice(0, 24) }}{{ activeTextElement.text.length > 24 ? '...' : '' }}"</span>
            </div>

            <!-- STYLE EFFECTS SECTION -->
            <div>
              <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">STYLE</label>
              <div class="row row-cols-3 g-2 mb-2">
                <!-- None -->
                <div class="col">
                  <button
                    class="btn btn-outline-light border text-dark p-2 d-flex flex-column align-items-center w-100 rounded-3"
                    :class="{ 'border-primary bg-primary bg-opacity-10 shadow-sm': activeTextElement.effect === 'none' }"
                    @click="setEffect('none')"
                  >
                    <div class="effect-card-preview effect-preview-none mb-1">Ag</div>
                    <span class="small fw-semibold">None</span>
                  </button>
                </div>

                <!-- Shadow -->
                <div class="col">
                  <button
                    class="btn btn-outline-light border text-dark p-2 d-flex flex-column align-items-center w-100 rounded-3"
                    :class="{ 'border-primary bg-primary bg-opacity-10 shadow-sm': activeTextElement.effect === 'shadow' }"
                    @click="setEffect('shadow')"
                  >
                    <div class="effect-card-preview effect-preview-shadow mb-1">Ag</div>
                    <span class="small fw-semibold">Shadow</span>
                  </button>
                </div>

                <!-- Hollow / Stroke -->
                <div class="col">
                  <button
                    class="btn btn-outline-light border text-dark p-2 d-flex flex-column align-items-center w-100 rounded-3"
                    :class="{ 'border-primary bg-primary bg-opacity-10 shadow-sm': activeTextElement.effect === 'stroke' }"
                    @click="setEffect('stroke')"
                  >
                    <div class="effect-card-preview effect-preview-stroke mb-1">Ag</div>
                    <span class="small fw-semibold">Hollow</span>
                  </button>
                </div>

                <!-- Echo / Splice -->
                <div class="col">
                  <button
                    class="btn btn-outline-light border text-dark p-2 d-flex flex-column align-items-center w-100 rounded-3"
                    :class="{ 'border-primary bg-primary bg-opacity-10 shadow-sm': activeTextElement.effect === 'echo' }"
                    @click="setEffect('echo')"
                  >
                    <div class="effect-card-preview effect-preview-echo mb-1">Ag</div>
                    <span class="small fw-semibold">Echo</span>
                  </button>
                </div>

                <!-- Background Highlight Badge -->
                <div class="col">
                  <button
                    class="btn btn-outline-light border text-dark p-2 d-flex flex-column align-items-center w-100 rounded-3"
                    :class="{ 'border-primary bg-primary bg-opacity-10 shadow-sm': activeTextElement.effect === 'badge' }"
                    @click="setEffect('badge')"
                  >
                    <div class="effect-card-preview effect-preview-badge mb-1">Ag</div>
                    <span class="small fw-semibold">Background</span>
                  </button>
                </div>
              </div>

              <!-- SLIDERS & CONTROLS FOR ACTIVE STYLE EFFECT -->
              <!-- Shadow Controls -->
              <div v-if="activeTextElement.effect === 'shadow'" class="card p-3 bg-light border rounded-3 mb-2">
                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-muted">Offset</span>
                    <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.effectSettings.shadow.offsetX }}px</span>
                  </div>
                  <input
                    v-model.number="activeTextElement.effectSettings.shadow.offsetX"
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    class="form-range"
                    @input="debounceTextHistory"
                  />
                </div>

                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-muted">Blur</span>
                    <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.effectSettings.shadow.blur }}</span>
                  </div>
                  <input
                    v-model.number="activeTextElement.effectSettings.shadow.blur"
                    type="range"
                    min="0"
                    max="25"
                    step="1"
                    class="form-range"
                    @input="debounceTextHistory"
                  />
                </div>

                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-muted">Transparency</span>
                    <span class="badge bg-secondary-subtle text-secondary">{{ Math.round((activeTextElement.effectSettings.shadow.opacity || 0.6) * 100) }}%</span>
                  </div>
                  <input
                    v-model.number="activeTextElement.effectSettings.shadow.opacity"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    class="form-range"
                    @input="debounceTextHistory"
                  />
                </div>

                <div>
                  <span class="small text-muted d-block mb-1">Shadow Color</span>
                  <div class="d-flex align-items-center gap-2">
                    <input
                      v-model="activeTextElement.effectSettings.shadow.color"
                      type="color"
                      class="form-control form-control-color"
                      style="width: 36px; height: 32px;"
                      @input="debounceTextHistory"
                    />
                    <div class="d-flex gap-1">
                      <button
                        v-for="c in ['#000000', '#1E293B', '#2F5BEA', '#E11D48', '#FFD166', '#FFFFFF']"
                        :key="c"
                        class="btn p-0 rounded-circle border shadow-sm"
                        :style="{ backgroundColor: c, width: '22px', height: '22px' }"
                        @click="activeTextElement.effectSettings.shadow.color = c; debounceTextHistory()"
                      ></button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Hollow / Stroke Controls -->
              <div v-else-if="activeTextElement.effect === 'stroke'" class="card p-3 bg-light border rounded-3 mb-2">
                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-muted">Thickness</span>
                    <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.effectSettings.stroke.width }}px</span>
                  </div>
                  <input
                    v-model.number="activeTextElement.effectSettings.stroke.width"
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    class="form-range"
                    @input="debounceTextHistory"
                  />
                </div>

                <div class="form-check mb-2">
                  <input
                    id="stroke-hollow-check"
                    v-model="activeTextElement.effectSettings.stroke.isHollow"
                    type="checkbox"
                    class="form-check-input"
                    @change="debounceTextHistory"
                  />
                  <label for="stroke-hollow-check" class="form-check-label small text-muted">Hollow center (transparent fill)</label>
                </div>

                <div>
                  <span class="small text-muted d-block mb-1">Stroke Color</span>
                  <div class="d-flex align-items-center gap-2">
                    <input
                      v-model="activeTextElement.effectSettings.stroke.color"
                      type="color"
                      class="form-control form-control-color"
                      style="width: 36px; height: 32px;"
                      @input="debounceTextHistory"
                    />
                    <div class="d-flex gap-1">
                      <button
                        v-for="c in ['#0F172A', '#2F5BEA', '#F43F5E', '#10B981', '#F59E0B', '#8B5CF6', '#FFFFFF']"
                        :key="c"
                        class="btn p-0 rounded-circle border shadow-sm"
                        :style="{ backgroundColor: c, width: '22px', height: '22px' }"
                        @click="activeTextElement.effectSettings.stroke.color = c; debounceTextHistory()"
                      ></button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Echo Controls -->
              <div v-else-if="activeTextElement.effect === 'echo'" class="card p-3 bg-light border rounded-3 mb-2">
                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-muted">Offset</span>
                    <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.effectSettings.echo.offset }}px</span>
                  </div>
                  <input
                    v-model.number="activeTextElement.effectSettings.echo.offset"
                    type="range"
                    min="1"
                    max="18"
                    step="1"
                    class="form-range"
                    @input="debounceTextHistory"
                  />
                </div>

                <div>
                  <span class="small text-muted d-block mb-1">Echo Color</span>
                  <div class="d-flex align-items-center gap-2">
                    <input
                      v-model="activeTextElement.effectSettings.echo.color"
                      type="color"
                      class="form-control form-control-color"
                      style="width: 36px; height: 32px;"
                      @input="debounceTextHistory"
                    />
                    <div class="d-flex gap-1">
                      <button
                        v-for="c in ['#FF4081', '#2F5BEA', '#10B981', '#F59E0B', '#8B5CF6', '#0F172A']"
                        :key="c"
                        class="btn p-0 rounded-circle border shadow-sm"
                        :style="{ backgroundColor: c, width: '22px', height: '22px' }"
                        @click="activeTextElement.effectSettings.echo.color = c; debounceTextHistory()"
                      ></button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Background Badge Controls -->
              <div v-else-if="activeTextElement.effect === 'badge'" class="card p-3 bg-light border rounded-3 mb-2">
                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-muted">Roundness</span>
                    <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.effectSettings.badge.borderRadius }}px</span>
                  </div>
                  <input
                    v-model.number="activeTextElement.effectSettings.badge.borderRadius"
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    class="form-range"
                    @input="debounceTextHistory"
                  />
                </div>

                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-muted">Spread / Padding</span>
                    <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.effectSettings.badge.padding }}px</span>
                  </div>
                  <input
                    v-model.number="activeTextElement.effectSettings.badge.padding"
                    type="range"
                    min="2"
                    max="24"
                    step="1"
                    class="form-range"
                    @input="debounceTextHistory"
                  />
                </div>

                <div>
                  <span class="small text-muted d-block mb-1">Badge Color</span>
                  <div class="d-flex align-items-center gap-2">
                    <input
                      v-model="activeTextElement.effectSettings.badge.color"
                      type="color"
                      class="form-control form-control-color"
                      style="width: 36px; height: 32px;"
                      @input="debounceTextHistory"
                    />
                    <div class="d-flex gap-1">
                      <button
                        v-for="c in ['#FFD166', '#EFF4FE', '#FCE7F3', '#D1FAE5', '#FEF08A', '#0F172A']"
                        :key="c"
                        class="btn p-0 rounded-circle border shadow-sm"
                        :style="{ backgroundColor: c, width: '22px', height: '22px' }"
                        @click="activeTextElement.effectSettings.badge.color = c; debounceTextHistory()"
                      ></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <hr class="my-1 opacity-25" />

            <!-- SHAPE / CURVE SECTION -->
            <div>
              <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">SHAPE</label>
              <div class="row row-cols-2 g-2 mb-2">
                <!-- None (Straight) -->
                <div class="col">
                  <button
                    class="btn btn-outline-light border text-dark p-2 d-flex flex-column align-items-center w-100 rounded-3"
                    :class="{ 'border-primary bg-primary bg-opacity-10 shadow-sm': !activeTextElement.curveAmount || activeTextElement.curveAmount === 0 }"
                    @click="toggleCurvature(false)"
                  >
                    <div class="shape-card-preview shape-preview-none mb-1">ABC</div>
                    <span class="small fw-semibold">None</span>
                  </button>
                </div>

                <!-- Curve / Arch -->
                <div class="col">
                  <button
                    class="btn btn-outline-light border text-dark p-2 d-flex flex-column align-items-center w-100 rounded-3"
                    :class="{ 'border-primary bg-primary bg-opacity-10 shadow-sm': activeTextElement.curveAmount && activeTextElement.curveAmount !== 0 }"
                    @click="toggleCurvature(true)"
                  >
                    <div class="shape-card-preview shape-preview-curve mb-1">
                      <svg width="34" height="20" viewBox="0 0 34 20" fill="none">
                        <path d="M3 17 Q 17 3 31 17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" />
                      </svg>
                    </div>
                    <span class="small fw-semibold">Curve</span>
                  </button>
                </div>
              </div>

              <!-- Curve Slider -->
              <div v-if="activeTextElement.curveAmount && activeTextElement.curveAmount !== 0" class="card p-3 bg-light border rounded-3 mb-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="small text-muted">Curve amount</span>
                  <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.curveAmount }}%</span>
                </div>
                <input
                  v-model.number="activeTextElement.curveAmount"
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  class="form-range"
                  @input="debounceTextHistory"
                />
                <div class="d-flex justify-content-between align-items-center mt-1">
                  <span class="text-muted" style="font-size: 0.7rem;">−100 (Smile)</span>
                  <button class="btn btn-sm btn-link text-decoration-none p-0" style="font-size: 0.7rem;" @click="activeTextElement.curveAmount = 0; debounceTextHistory()">0° (Flat)</button>
                  <span class="text-muted" style="font-size: 0.7rem;">+100 (Arch)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: BACKGROUND (Colors, Gradients, Textures & Patterns) -->
        <div v-if="activeTool === 'background'" class="drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <h6 class="fw-bold text-dark mb-1">Strip Background</h6>
            <p class="small text-muted mb-2">Aesthetic solid colors, gradients, and tactile paper grains.</p>
          </div>

          <!-- Segmented Navigation Tabs (Single Row 3-Tab Segmented Control) -->
          <div class="btn-group btn-group-sm w-100 mb-2 p-1 bg-light border rounded-3" role="group">
            <button
              type="button"
              class="btn btn-sm py-1 px-1 fw-semibold text-truncate"
              :class="activeBgTab === 'colors' ? 'btn-white bg-white text-dark shadow-sm' : 'btn-light text-secondary border-0'"
              @click="activeBgTab = 'colors'"
            >
              Colors
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-1 fw-semibold text-truncate"
              :class="activeBgTab === 'gradients' ? 'btn-white bg-white text-dark shadow-sm' : 'btn-light text-secondary border-0'"
              @click="activeBgTab = 'gradients'"
            >
              Gradients
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-1 fw-semibold text-truncate position-relative"
              :class="activeBgTab === 'patterns' ? 'btn-white bg-white text-dark shadow-sm' : 'btn-light text-secondary border-0'"
              @click="activeBgTab = 'patterns'"
            >
              Textures
              <span v-if="frameBg.texture" class="badge bg-primary rounded-circle p-1 ms-1" style="width: 6px; height: 6px;"></span>
            </button>
          </div>

          <!-- SUBSECTION 1: SOLID COLORS -->
          <div v-if="activeBgTab === 'colors'">
            <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">CURATED PALETTE</label>
            <div class="row row-cols-2 g-2 mb-3">
              <div
                v-for="col in bgColors"
                :key="col.value"
                class="col"
              >
                <div
                  class="card p-2 text-center cursor-pointer border rounded-2 position-relative shadow-none"
                  :class="{ 'border-primary shadow-sm': frameBg.type === 'color' && frameBg.baseColor === col.value }"
                  :style="{ backgroundColor: col.value, height: '48px' }"
                  @click="setFrameSolidColor(col.value)"
                >
                  <span class="small fw-bold m-auto" :class="{ 'text-white': col.value === '#111827' || col.value === '#2F5BEA' || col.value === '#4A3B32' }">
                    {{ col.name }}
                  </span>
                  <span v-if="frameBg.type === 'color' && frameBg.baseColor === col.value" class="badge bg-primary position-absolute top-0 end-0 m-1 p-1 rounded-circle" style="width: 16px; height: 16px; font-size: 9px;">✓</span>
                </div>
              </div>
            </div>

            <!-- Custom Hex Color Input -->
            <div class="card p-2 bg-light border rounded-3 mb-2">
              <div class="mb-1">
                <span class="small fw-bold text-secondary">Custom Frame Color</span>
              </div>
              <div class="input-group input-group-sm">
                <input
                  type="color"
                  :value="frameBg.baseColor || selectedBgColor"
                  class="form-control form-control-color"
                  style="width: 42px;"
                  @input="setFrameSolidColor($event.target.value)"
                />
                <input
                  type="text"
                  :value="frameBg.baseColor || selectedBgColor"
                  class="form-control form-control-sm font-monospace text-uppercase"
                  placeholder="#FFFFFF"
                  @change="setFrameSolidColor($event.target.value)"
                />
              </div>
            </div>
          </div>

          <!-- SUBSECTION 2: AESTHETIC GRADIENTS -->
          <div v-if="activeBgTab === 'gradients'">
            <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">STUDIO GRADIENTS</label>
            <div class="row row-cols-2 g-2 mb-3">
              <div
                v-for="grad in bgGradients"
                :key="grad.id"
                class="col"
              >
                <div
                  class="card p-2 text-center cursor-pointer border rounded-2 position-relative shadow-none"
                  :class="{ 'border-primary shadow-sm': frameBg.type === 'gradient' && frameBg.value === grad.value }"
                  :style="{ background: grad.value, height: '54px' }"
                  @click="setFrameGradient(grad.value)"
                >
                  <span class="small fw-bold text-white text-shadow m-auto">{{ grad.name }}</span>
                  <span v-if="frameBg.type === 'gradient' && frameBg.value === grad.value" class="badge bg-primary position-absolute top-0 end-0 m-1 p-1 rounded-circle" style="width: 16px; height: 16px; font-size: 9px;">✓</span>
                </div>
              </div>
            </div>
          </div>

          <!-- SUBSECTION 3: TEXTURES & PATTERNS -->
          <div v-if="activeBgTab === 'patterns'">
            <!-- Active Texture Status / Clear Button -->
            <div v-if="frameBg.texture" class="d-flex align-items-center justify-content-between p-2 bg-light border rounded-3 mb-3">
              <span class="small fw-semibold text-dark">Active: {{ bgTextures.concat(bgPatterns).find(t => t.id === frameBg.texture)?.name || 'Custom Texture' }}</span>
              <button class="btn btn-sm btn-outline-danger py-0 px-2 small" @click="clearFrameTexture">Remove</button>
            </div>

            <!-- Tactile Textures -->
            <div class="mb-3">
              <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">TACTILE PAPER GRAINS</label>
              <div class="d-flex flex-column gap-1">
                <button
                  v-for="tex in bgTextures"
                  :key="tex.id"
                  class="btn btn-outline-light border text-dark text-start p-2 rounded-3 d-flex align-items-center gap-2 w-100"
                  :class="{ 'border-primary bg-primary bg-opacity-10': frameBg.texture === tex.id }"
                  @click="setFrameTexture(tex.id)"
                >
                  <span class="fs-5">{{ tex.icon }}</span>
                  <div class="d-flex flex-column">
                    <span class="small fw-bold">{{ tex.name }}</span>
                    <span class="text-muted" style="font-size: 0.7rem;">{{ tex.desc }}</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Graphic Patterns -->
            <div class="mb-3">
              <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">GRAPHIC PATTERNS</label>
              <div class="d-flex flex-column gap-1">
                <button
                  v-for="pat in bgPatterns"
                  :key="pat.id"
                  class="btn btn-outline-light border text-dark text-start p-2 rounded-3 d-flex align-items-center gap-2 w-100"
                  :class="{ 'border-primary bg-primary bg-opacity-10': frameBg.texture === pat.id }"
                  @click="setFrameTexture(pat.id)"
                >
                  <span class="fs-5">{{ pat.icon }}</span>
                  <div class="d-flex flex-column">
                    <span class="small fw-bold">{{ pat.name }}</span>
                    <span class="text-muted" style="font-size: 0.7rem;">{{ pat.desc }}</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Texture Controls (Intensity, Scale, Blend Mode) when a texture is selected -->
            <div v-if="frameBg.texture" class="card p-3 bg-light border rounded-3 mb-2">
              <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">TEXTURE ADJUSTMENTS</label>

              <!-- Opacity / Intensity Slider -->
              <div class="mb-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="small text-muted">Intensity / Opacity</span>
                  <span class="badge bg-secondary-subtle text-secondary">{{ Math.round((frameBg.opacity || 0.85) * 100) }}%</span>
                </div>
                <input
                  v-model.number="frameBg.opacity"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  class="form-range"
                  @input="debounceTextHistory"
                />
              </div>

              <!-- Tile Scale Slider -->
              <div class="mb-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <span class="small text-muted">Tile Scale</span>
                  <span class="badge bg-secondary-subtle text-secondary">{{ (frameBg.scale || 1).toFixed(1) }}x</span>
                </div>
                <input
                  v-model.number="frameBg.scale"
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  class="form-range"
                  @input="debounceTextHistory"
                />
              </div>

              <!-- Blend Mode Selector -->
              <div class="mb-2">
                <span class="small text-muted d-block mb-1">Blend Mode</span>
                <div class="btn-group btn-group-sm w-100">
                  <button
                    class="btn"
                    :class="frameBg.blendMode === 'multiply' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                    @click="frameBg.blendMode = 'multiply'; debounceTextHistory()"
                  >
                    Multiply
                  </button>
                  <button
                    class="btn"
                    :class="frameBg.blendMode === 'normal' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                    @click="frameBg.blendMode = 'normal'; debounceTextHistory()"
                  >
                    Normal
                  </button>
                  <button
                    class="btn"
                    :class="frameBg.blendMode === 'overlay' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                    @click="frameBg.blendMode = 'overlay'; debounceTextHistory()"
                  >
                    Overlay
                  </button>
                </div>
              </div>

              <!-- Underlay Base Color -->
              <div class="mt-3">
                <span class="small text-muted d-block mb-1">Base Underlay Color</span>
                <div class="d-flex gap-1">
                  <button
                    v-for="c in ['#FEFBF6', '#FFFFFF', '#111827', '#F43F5E', '#EDE9FE', '#FDE68A', '#D1FAE5']"
                    :key="c"
                    class="btn p-0 rounded-circle border shadow-sm"
                    :class="{ 'ring-2 ring-primary': frameBg.baseColor === c }"
                    :style="{ backgroundColor: c, width: '24px', height: '24px' }"
                    @click="setFrameSolidColor(c)"
                  ></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: LAYERS -->
        <div v-if="activeTool === 'layers'" class="drawer-content layers-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <div>
              <h6 class="fw-bold text-dark mb-0">Layers Stack</h6>
              <p class="small text-muted mb-0">Visual depth from top to bottom.</p>
            </div>
            <span class="badge bg-primary-subtle text-primary rounded-pill">{{ canvasElements.length }} items</span>
          </div>

          <!-- Empty State when canvasElements is empty -->
          <div v-if="canvasElements.length === 0" class="text-center py-5 text-muted bg-light rounded-3 border">
            <div class="fs-1 mb-2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.8">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span class="fw-bold small text-dark d-block mb-1">No canvas elements yet</span>
            <p class="small text-muted mb-0 px-3">Add stickers, washi tapes, or text from the Elements tab to manage their visual stacking order here.</p>
          </div>

          <!-- Visual Layers List (Reversed: Top layer at top of list) -->
          <div v-else class="list-group list-group-flush gap-1">
            <!-- Cutouts Fixed Indicator when toggled on -->
            <div v-if="showCutouts" class="list-group-item d-flex align-items-center justify-content-between p-2 border rounded-2 bg-light">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-primary rounded-pill" style="font-size: 0.65rem;">FRAME</span>
                <span class="small fw-bold text-dark">Photo Cutouts Layer</span>
              </div>
              <span class="badge bg-secondary-subtle text-secondary small">Upmost (Covering)</span>
            </div>

            <!-- Draggable / Reorderable Layer Items -->
            <div
              v-for="(el, revIndex) in reversedElements"
              :key="el.id"
              class="list-group-item d-flex align-items-center justify-content-between p-2 border rounded-2 cursor-pointer transition-all"
              :class="{
                'border-primary bg-primary bg-opacity-10 shadow-sm': selectedElementIds.includes(el.id),
                'border-dashed bg-light': el.isLocked,
                'opacity-50': el.isHidden
              }"
              @click="selectLayer(el, $event)"
            >
              <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                <!-- Up / Down Reorder buttons -->
                <div class="btn-group-vertical btn-group-sm" @click.stop>
                  <button
                    class="btn btn-sm btn-light border p-0 px-1"
                    style="font-size: 8px; line-height: 1;"
                    title="Bring Forward"
                    :disabled="revIndex === 0"
                    @click="bringForward(el.id)"
                  >
                    ▲
                  </button>
                  <button
                    class="btn btn-sm btn-light border p-0 px-1"
                    style="font-size: 8px; line-height: 1;"
                    title="Send Backward"
                    :disabled="revIndex === reversedElements.length - 1"
                    @click="sendBackward(el.id)"
                  >
                    ▼
                  </button>
                </div>

                <!-- Layer Preview Icon / Content -->
                <div class="rounded bg-light border d-flex align-items-center justify-content-center flex-shrink-0" style="width: 32px; height: 32px;">
                  <span v-if="el.type === 'sticker'" class="fs-5">{{ el.content }}</span>
                  <span
                    v-else-if="el.type === 'tape'"
                    class="rounded-1 d-inline-block"
                    style="width: 20px; height: 8px;"
                    :style="{ backgroundColor: el.color }"
                  ></span>
                  <span v-else-if="el.type === 'text'" class="fw-bold text-primary small">T</span>
                  <span
                    v-else-if="el.type === 'shape'"
                    class="rounded-1 d-inline-block"
                    style="width: 14px; height: 14px;"
                    :style="{ backgroundColor: el.color }"
                  ></span>
                  <span
                    v-else-if="el.type === 'doodle'"
                    :style="{ color: el.color || '#0F172A' }"
                    title="Doodle"
                  >✏️</span>
                </div>

                <!-- Layer Label & Depth Info -->
                <div class="d-flex flex-column text-truncate">
                  <span class="small fw-semibold text-truncate text-dark">{{ getElementDisplayName(el) }}</span>
                  <div class="d-flex align-items-center gap-1">
                    <span class="text-muted" style="font-size: 0.68rem;">Depth {{ canvasElements.length - revIndex }} of {{ canvasElements.length }}</span>
                    <span v-if="el.groupId" class="badge bg-primary-subtle text-primary p-0 px-1" style="font-size: 0.6rem;">Group</span>
                  </div>
                </div>
              </div>

              <!-- Quick Action Icons (Visibility, Lock, Delete) -->
              <div class="d-flex align-items-center gap-1 flex-shrink-0" @click.stop>
                <!-- Visibility Toggle -->
                <button
                  class="btn btn-sm p-1 rounded-circle"
                  :class="el.isHidden ? 'btn-primary' : 'btn-light border text-muted'"
                  :title="el.isHidden ? 'Show element' : 'Hide element'"
                  @click="toggleHide(el.id)"
                >
                  <svg v-if="!el.isHidden" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>

                <!-- Lock Toggle -->
                <button
                  class="btn btn-sm p-1 rounded-circle"
                  :class="el.isLocked ? 'btn-primary' : 'btn-light border text-muted'"
                  :title="el.isLocked ? 'Unlock element' : 'Lock element'"
                  @click="toggleLock(el.id)"
                >
                  <svg v-if="!el.isLocked" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </button>

                <!-- Delete button -->
                <button
                  class="btn btn-sm btn-light border text-danger p-1 rounded-circle"
                  title="Delete layer"
                  @click="removeElementById(el.id)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Center Canvas Workspace -->
      <main
        ref="canvasWorkspaceRef"
        class="canvas-workspace"
        :class="{
          'is-hand-mode': isSpacePressed || isHandToolActive,
          'is-panning': isPanning,
          'has-rulers': showRulers
        }"
        @mousedown="onWorkspaceMouseDown"
        @mousemove="onWorkspaceMouseMove"
        @mouseup="onWorkspaceMouseUp"
        @mouseleave="onWorkspaceMouseLeave"
        @wheel.prevent="onWorkspaceWheel"
        @click="onCanvasClick"
      >
        <!-- Canvas Marquee / Rubberband Selection Box -->
        <div
          v-if="isMarqueeActive && marqueeBoxStyle"
          class="canvas-marquee-box"
          :style="marqueeBoxStyle"
        ></div>

        <!-- Live Pixel Rulers & Custom Draggable Guides Overlay -->
        <CanvasRulerOverlay
          :show-rulers="showRulers"
          :scale="canvasScale"
          :pan-x="canvasPanX"
          :pan-y="canvasPanY"
          :cursor-info="cursorInfo"
          :custom-guides="customGuides"
          :is-dragging-guide="isDraggingGuide"
          :dragged-guide="draggedGuide"
          :frame-width="stripRef?.offsetWidth || 280"
          :frame-height="stripRef?.offsetHeight || 556"
          @start-drag-guide="onStartDragGuideFromRuler"
          @start-move-guide="onStartMoveExistingGuide"
          @remove-guide="removeGuide"
          @toggle-rulers="toggleRulers"
        />

        <div class="canvas-viewport" :style="transformStyle">
          <!-- The Photostrip Frame -->
          <div
            ref="stripRef"
            class="photostrip-frame"
            :class="[
              'layout-' + activeLayout,
              { 'in-draw-mode': isDrawMode }
            ]"
            :style="getFrameStyle()"
            @click.stop="onFrameClick"
            @contextmenu.prevent.stop="openContextMenu($event, null)"
            @dragover.prevent
            @drop="onCanvasDrop"
          >
            <!-- Active Freehand Doodle Drawing Surface Layer (Top Z-Index when in Draw Mode) -->
            <svg
              v-if="isDrawMode"
              class="active-doodle-drawing-surface"
              :class="{
                'is-pen': currentBrush === 'pen',
                'is-highlighter': currentBrush === 'highlighter',
                'is-eraser': currentBrush === 'eraser'
              }"
              @pointerdown.prevent.stop="onDrawPointerDown"
              @pointermove.prevent="onDrawPointerMove"
              @pointerup="onDrawPointerUp"
              @pointerleave="onDrawPointerLeave"
            >
              <!-- Completed strokes in current drawing session -->
              <g v-for="(stroke, sIdx) in activeStrokes" :key="'stroke-' + sIdx">
                <path
                  :d="stroke.pathData"
                  :stroke="stroke.color"
                  :stroke-width="stroke.width"
                  :stroke-linecap="stroke.brush === 'highlighter' ? 'square' : 'round'"
                  :stroke-linejoin="stroke.brush === 'highlighter' ? 'bevel' : 'round'"
                  fill="none"
                  :style="{
                    opacity: stroke.opacity || 1,
                    mixBlendMode: stroke.brush === 'highlighter' ? 'multiply' : 'normal'
                  }"
                />
              </g>

              <!-- Currently active in-progress stroke -->
              <path
                v-if="isDrawing && currentPoints.length > 0 && currentBrush !== 'eraser'"
                :d="pointsToSvgPath(currentPoints)"
                :stroke="brushColor"
                :stroke-width="brushWidth"
                :stroke-linecap="currentBrush === 'highlighter' ? 'square' : 'round'"
                :stroke-linejoin="currentBrush === 'highlighter' ? 'bevel' : 'round'"
                fill="none"
                :style="{
                  opacity: currentBrush === 'highlighter' ? 0.45 : 1,
                  mixBlendMode: currentBrush === 'highlighter' ? 'multiply' : 'normal'
                }"
              />
            </svg>
            <!-- Background Texture / Pattern Overlay Layer -->
            <div
              v-if="frameBg.texture"
              class="frame-texture-overlay"
              :style="getFrameTextureStyle()"
            ></div>

            <!-- Photostrip Frame Border Overlay (Preserves exact cutout & frame size) -->
            <div
              v-if="borderWidth > 0"
              class="photostrip-border-overlay"
              :style="{
                borderColor: borderColor,
                borderWidth: borderWidth + 'px',
                borderStyle: 'solid'
              }"
            ></div>

            <!-- Slot Layout Container (EMPTY CUTOUTS - UP-MOST LAYER) -->
            <div
              class="strip-slots-container"
              :class="['layout-' + activeLayout, { 'cutouts-hidden': !showCutouts }]"
              :style="{ zIndex: showCutouts ? 80 : 0 }"
            >
              <div
                v-for="(slot, index) in currentSlots"
                :key="slot.id"
                class="photostrip-slot cutout-slot"
                :class="['shape-' + slotShape.toLowerCase(), { 'slot-hidden': !showCutouts }]"
              >
                <!-- Empty Cutout Inner Aesthetic: Clean Photo Window or Mock Portrait -->
                <div class="cutout-window">
                  <img
                    v-if="(showCutouts && isExporting && exportConfig.includeMockPhotos && exportConfig.fileType !== 'photobooth_overlay') && getMockPhoto(index)"
                    :src="getMockPhoto(index)"
                    class="mock-photo-img"
                    alt="Mock portrait"
                    crossorigin="anonymous"
                    draggable="false"
                  />
                  <div v-else class="cutout-indicator">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="cutout-cam-icon">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span class="cutout-label">Photo Cutout {{ index + 1 }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Photostrip Caption / Footer (Double-click to edit) -->
            <div
              class="strip-caption"
              :class="{ 'is-empty': !captionText || !captionText.trim() }"
              title="Double-click to edit caption"
              @dblclick="startEditingCaption"
            >
              <input
                v-if="isEditingCaption"
                ref="captionInputRef"
                v-model="captionText"
                type="text"
                class="strip-caption-input"
                placeholder="Enter caption..."
                @blur="finishEditingCaption"
                @keydown.enter.prevent="finishEditingCaption"
                @keydown.esc.prevent="finishEditingCaption"
                @click.stop
                @mousedown.stop
              />
              <span v-else class="strip-caption-text">
                {{ (captionText && captionText.trim()) ? captionText : '\u00A0' }}
              </span>
            </div>

            <!-- FREEFORM DRAGGABLE ELEMENTS ON CANVAS (Stickers, Text, Tape, Shapes) -->
            <div
              v-for="(el, elIdx) in canvasElements"
              :key="el.id"
              :data-element-id="el.id"
              class="canvas-element"
              :class="{
                selected: selectedElementIds.includes(el.id),
                'multi-selected': selectedElementIds.length > 1 && selectedElementIds.includes(el.id),
                locked: el.isLocked
              }"
              :style="{
                left: el.x + 'px',
                top: el.y + 'px',
                transform: `rotate(${el.rotation || 0}deg)`,
                zIndex: showCutouts ? (selectedElementIds.includes(el.id) ? 90 : (elIdx + 10)) : (selectedElementIds.includes(el.id) ? 99 : (elIdx + 10)),
                display: el.isHidden ? 'none' : 'block'
              }"
              @mousedown.stop="selectElement(el, $event)"
              @click.stop
              @dblclick.stop="onElementDblClick(el)"
              @contextmenu="openContextMenu($event, el)"
            >
              <!-- Vector SVG Sticker -->
              <div
                v-if="el.type === 'sticker' && el.isSvg"
                class="element-svg-wrapper"
                :style="{
                  width: el.width + 'px',
                  height: el.height + 'px'
                }"
                v-html="getRenderedSvg(el)"
              ></div>

              <!-- Sticker Emoji -->
              <span
                v-else-if="el.type === 'sticker'"
                class="element-sticker"
                :style="{ fontSize: el.fontSize + 'px' }"
              >
                {{ el.content }}
              </span>

              <!-- User Uploaded Image -->
              <img
                v-else-if="el.type === 'image'"
                class="element-image-content"
                :src="el.url"
                :alt="el.name"
                :style="{
                  width: el.width + 'px',
                  height: el.height + 'px',
                  objectFit: 'contain',
                  pointerEvents: 'none'
                }"
                draggable="false"
              />

              <!-- Washi Tape -->
              <div
                v-else-if="el.type === 'tape'"
                class="element-tape"
                :style="{
                  backgroundColor: el.color,
                  backgroundImage: getTapePattern(el),
                  width: el.width + 'px',
                  height: el.height + 'px'
                }"
              ></div>

              <!-- Text Element (Direct In-Place Canvas Editing) -->
              <div
                v-else-if="el.type === 'text'"
                class="element-text-container"
              >
                <!-- Direct Inline Editable Text Node (During Active Editing) -->
                <div
                  v-if="editingTextId === el.id"
                  :ref="(domEl) => setTextRef(domEl, el.id)"
                  class="element-text is-editing"
                  contenteditable="plaintext-only"
                  spellcheck="false"
                  :style="getTextStyle(el)"
                  @blur="finishEditingText(el)"
                  @keydown.enter.prevent="finishEditingText(el)"
                  @keydown.esc.prevent="finishEditingText(el)"
                  @mousedown.stop
                  @click.stop
                ></div>

                <!-- Curved / Arched SVG Text -->
                <svg
                  v-else-if="el.curveAmount && el.curveAmount !== 0"
                  class="element-curved-svg"
                  :width="getCurvedSvgWidth(el)"
                  :height="getCurvedSvgHeight(el)"
                  :viewBox="`0 0 ${getCurvedSvgWidth(el)} ${getCurvedSvgHeight(el)}`"
                  title="Double-click to edit text directly"
                  @dblclick.stop="startEditingText(el)"
                >
                  <defs>
                    <path :id="'curve-path-' + el.id" :d="getCurvedPathD(el)" fill="none" />
                    <filter v-if="el.effect === 'shadow'" :id="'curved-shadow-' + el.id" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow
                        :dx="el.effectSettings?.shadow?.offsetX || 3"
                        :dy="el.effectSettings?.shadow?.offsetY || 3"
                        :stdDeviation="(el.effectSettings?.shadow?.blur || 4) / 2"
                        :flood-color="el.effectSettings?.shadow?.color || '#000000'"
                        :flood-opacity="el.effectSettings?.shadow?.opacity !== undefined ? el.effectSettings?.shadow?.opacity : 0.6"
                      />
                    </filter>
                  </defs>
                  <!-- Background highlight badge when curved -->
                  <path
                    v-if="el.effect === 'badge'"
                    :d="getCurvedPathD(el)"
                    fill="none"
                    :stroke="el.effectSettings?.badge?.color || '#FFD166'"
                    :stroke-width="(el.fontSize || 22) + (el.effectSettings?.badge?.padding || 8) * 1.5"
                    stroke-linecap="round"
                  />
                  <!-- Text Along Curved Path -->
                  <text
                    :fill="el.effect === 'stroke' && el.effectSettings?.stroke?.isHollow !== false ? 'transparent' : (el.color || '#0F172A')"
                    :stroke="el.effect === 'stroke' ? (el.effectSettings?.stroke?.color || el.color || '#0F172A') : (el.effect === 'echo' ? (el.effectSettings?.echo?.color || '#FF4081') : 'none')"
                    :stroke-width="el.effect === 'stroke' ? (el.effectSettings?.stroke?.width || 3) : (el.effect === 'echo' ? 2 : 0)"
                    :style="{
                      fontFamily: el.fontFamily || `'Montserrat', sans-serif`,
                      fontSize: (el.fontSize || 22) + 'px',
                      fontWeight: el.fontWeight || 'normal',
                      fontStyle: el.fontStyle || 'normal',
                      letterSpacing: (el.letterSpacing || 0) + 'px'
                    }"
                    text-anchor="middle"
                    :filter="el.effect === 'shadow' ? `url(#curved-shadow-${el.id})` : undefined"
                    dominant-baseline="central"
                  >
                    <textPath :href="'#curve-path-' + el.id" startOffset="50%">
                      {{ el.textTransform === 'uppercase' ? (el.text || '').toUpperCase() : (el.textTransform === 'lowercase' ? (el.text || '').toLowerCase() : el.text) }}
                    </textPath>
                  </text>
                </svg>

                <!-- Normal Element Display -->
                <div
                  v-else
                  class="element-text"
                  :style="getTextStyle(el)"
                  title="Double-click to edit text directly"
                  @dblclick.stop="startEditingText(el)"
                >
                  {{ el.text }}
                </div>
              </div>

              <!-- Shape Element -->
              <div
                v-else-if="el.type === 'shape'"
                class="element-shape"
                :style="{
                  width: el.width + 'px',
                  height: el.height + 'px'
                }"
              >
                <svg viewBox="0 0 100 100" width="100%" height="100%" class="shape-svg-inner">
                  <path
                    :d="getShapePathD(el.shapeType)"
                    :fill="el.color || '#2F5BEA'"
                    :stroke="el.strokeColor || 'none'"
                    :stroke-width="el.strokeWidth || 0"
                  />
                </svg>
              </div>

              <!-- Freehand Doodle Element (Converted Vector Element) -->
              <div
                v-else-if="el.type === 'doodle'"
                class="element-doodle-wrapper"
                :style="{
                  width: el.width + 'px',
                  height: el.height + 'px'
                }"
              >
                <svg
                  :viewBox="`0 0 ${el.originalWidth || el.width} ${el.originalHeight || el.height}`"
                  :width="el.width"
                  :height="el.height"
                  class="doodle-svg-inner"
                  style="overflow: visible; display: block;"
                >
                  <!-- Vector Path -->
                  <path
                    :d="el.pathData"
                    :stroke="el.color || '#0F172A'"
                    :stroke-width="el.strokeWidth || 6"
                    :stroke-linecap="el.brushType === 'highlighter' ? 'square' : 'round'"
                    :stroke-linejoin="el.brushType === 'highlighter' ? 'bevel' : 'round'"
                    fill="none"
                    :style="{
                      opacity: el.opacity !== undefined ? el.opacity : (el.brushType === 'highlighter' ? 0.45 : 1),
                      mixBlendMode: el.brushType === 'highlighter' ? 'multiply' : 'normal'
                    }"
                  />
                </svg>
              </div>

              <!-- Multi-Select Sub-Element Dashed Indicator (when part of a collective selection) -->
              <div
                v-if="selectedElementIds.length > 1 && selectedElementIds.includes(el.id)"
                class="sub-element-selection-indicator"
              ></div>

              <!-- Single Element Selection Ring, Resize Handles, Rotate Knob & Floating Action Bar -->
              <template v-if="selectedElementIds.length === 1 && selectedElementIds[0] === el.id">
                <div class="element-bounding-box" :class="{ 'is-editing-text': editingTextId === el.id }">
                  <!-- Canva-Style Floating Action Toolbar above selected element (hidden during direct text typing) -->
                  <div v-if="editingTextId !== el.id" class="element-floating-bar" @mousedown.stop>
                    <!-- Quick Edit Text Button if text type -->
                    <button
                      v-if="el.type === 'text'"
                      class="floating-tool-btn text-edit-btn"
                      title="Edit Text (or Double-Click)"
                      @click.stop="startEditingText(el)"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <span>Edit</span>
                    </button>
                    <div v-if="el.type === 'text'" class="floating-divider"></div>

                    <!-- Quick Effects Button if text type -->
                    <button
                      v-if="el.type === 'text'"
                      class="floating-tool-btn text-effects-btn"
                      title="Text Effects & Curve"
                      @click.stop="openEffectsDrawer"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      <span>Effects</span>
                    </button>
                    <div v-if="el.type === 'text'" class="floating-divider"></div>

                    <!-- Ungroup Button if this single element is in a group -->
                    <button
                      v-if="el.groupId"
                      class="floating-tool-btn group-btn"
                      title="Ungroup Element (⇧⌘G)"
                      @click.stop="ungroupSelectedElements"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      </svg>
                      <span>Ungroup</span>
                    </button>
                    <div v-if="el.groupId" class="floating-divider"></div>

                    <!-- Position / Layers Popover Button -->
                    <div class="position-btn-wrapper">
                      <button
                        class="floating-tool-btn"
                        :class="{ active: isPositionPopoverOpen }"
                        title="Layer Depth & Ordering"
                        @click.stop="togglePositionPopover"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                          <polygon points="12 2 2 7 12 12 22 7 12 2" />
                          <polyline points="2 17 12 22 22 17" />
                          <polyline points="2 12 12 17 22 12" />
                        </svg>
                        <span>Position</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron-icon">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      <!-- Position Popover Menu -->
                      <div v-if="isPositionPopoverOpen" class="position-popover" @click.stop>
                        <div class="popover-header">Layer Ordering</div>
                        <button class="popover-item" @click="bringForward(el.id)">
                          <span class="item-icon">▲</span>
                          <span class="item-label">Bring Forward</span>
                          <span class="item-shortcut">⌘]</span>
                        </button>
                        <button class="popover-item" @click="bringToFront(el.id)">
                          <span class="item-icon">⇪▲</span>
                          <span class="item-label">Bring to Front</span>
                          <span class="item-shortcut">⇧⌘]</span>
                        </button>
                        <button class="popover-item" @click="sendBackward(el.id)">
                          <span class="item-icon">▼</span>
                          <span class="item-label">Send Backward</span>
                          <span class="item-shortcut">⌘[</span>
                        </button>
                        <button class="popover-item" @click="sendToBack(el.id)">
                          <span class="item-icon">⇪▼</span>
                          <span class="item-label">Send to Back</span>
                          <span class="item-shortcut">⇧⌘[</span>
                        </button>
                      </div>
                    </div>

                    <div class="floating-divider"></div>

                    <!-- Duplicate Button -->
                    <button class="floating-tool-btn icon-only" title="Duplicate (⌘D)" @click.stop="duplicateElement(el.id)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>

                    <!-- Lock / Unlock Button -->
                    <button
                      class="floating-tool-btn icon-only"
                      :class="{ 'is-locked': el.isLocked }"
                      :title="el.isLocked ? 'Unlock element' : 'Lock element'"
                      @click.stop="toggleLock(el.id)"
                    >
                      <svg v-if="!el.isLocked" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                      </svg>
                      <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </button>

                    <!-- Delete Button -->
                    <button class="floating-tool-btn icon-only del" title="Delete (Del)" @click.stop="removeSelectedElement">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  <!-- Handles & Rotate Controls (Hidden during text typing to avoid blocking caret) -->
                  <template v-if="editingTextId !== el.id">
                    <!-- 4 Corner Resize Handles -->
                    <div
                      class="resize-handle handle-nw"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'nw', $event)"
                    ></div>
                    <div
                      class="resize-handle handle-ne"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'ne', $event)"
                    ></div>
                    <div
                      class="resize-handle handle-sw"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'sw', $event)"
                    ></div>
                    <div
                      class="resize-handle handle-se"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'se', $event)"
                    ></div>

                    <!-- Rotate Handle Stem & Knob (bottom center) -->
                    <div class="rotate-stem"></div>
                    <div
                      class="element-rotate-handle"
                      title="Drag to rotate"
                      @mousedown.stop="startRotate(el, $event)"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2F5BEA" stroke-width="2.6">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
                      </svg>
                    </div>

                    <!-- Angle Tooltip when rotating -->
                    <div v-if="isRotating && rotateTarget && rotateTarget.id === el.id" class="rotation-tooltip">
                      {{ el.rotation || 0 }}°
                    </div>
                  </template>
                </div>
              </template>
            </div>

            <!-- UNIFIED COLLECTIVE BOUNDING BOX FOR MULTI-SELECTION / GROUP -->
            <div
              v-if="collectiveBounds && selectedElementIds.length > 1"
              class="collective-bounding-box"
              :style="{
                left: collectiveBounds.minX + 'px',
                top: collectiveBounds.minY + 'px',
                width: collectiveBounds.width + 'px',
                height: collectiveBounds.height + 'px',
                zIndex: showCutouts ? 90 : 99
              }"
              @mousedown.stop="startCollectiveDrag($event)"
              @click.stop
              @dblclick.stop="onCollectiveDblClick($event)"
            >
              <!-- Collective Floating Action Toolbar -->
              <div class="element-floating-bar collective-floating-bar" @mousedown.stop>
                <!-- Group / Ungroup Button -->
                <button
                  v-if="canUngroupSelected"
                  class="floating-tool-btn group-btn"
                  title="Ungroup Elements (⇧⌘G)"
                  @click.stop="ungroupSelectedElements"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  </svg>
                  <span>Ungroup</span>
                  <span class="shortcut-tag">⇧⌘G</span>
                </button>
                <button
                  v-else
                  class="floating-tool-btn group-btn"
                  title="Group Elements (⌘G)"
                  @click.stop="groupSelectedElements"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  <span>Group</span>
                  <span class="shortcut-tag">⌘G</span>
                </button>

                <div class="floating-divider"></div>

                <!-- Position Popover Button for Multi-Select -->
                <div class="position-btn-wrapper">
                  <button
                    class="floating-tool-btn"
                    :class="{ active: isPositionPopoverOpen }"
                    title="Layer Depth & Ordering"
                    @click.stop="togglePositionPopover"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    <span>Position</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron-icon">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  <!-- Position Popover Menu -->
                  <div v-if="isPositionPopoverOpen" class="position-popover" @click.stop>
                    <div class="popover-header">Layer Ordering</div>
                    <button class="popover-item" @click="bringToFrontSelected">
                      <span class="item-icon">⇪▲</span>
                      <span class="item-label">Bring to Front</span>
                      <span class="item-shortcut">⇧⌘]</span>
                    </button>
                    <button class="popover-item" @click="sendToBackSelected">
                      <span class="item-icon">⇪▼</span>
                      <span class="item-label">Send to Back</span>
                      <span class="item-shortcut">⇧⌘[</span>
                    </button>
                  </div>
                </div>

                <div class="floating-divider"></div>

                <!-- Duplicate Multi-Selection -->
                <button class="floating-tool-btn icon-only" title="Duplicate (⌘D)" @click.stop="duplicateSelectedElements">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>

                <!-- Delete Multi-Selection -->
                <button class="floating-tool-btn icon-only del" title="Delete (Del)" @click.stop="removeSelectedElements">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>

              <!-- Collective 4-Corner Resize Handles -->
              <div class="resize-handle handle-nw" title="Scale Selection" @mousedown.stop="startCollectiveResize('nw', $event)"></div>
              <div class="resize-handle handle-ne" title="Scale Selection" @mousedown.stop="startCollectiveResize('ne', $event)"></div>
              <div class="resize-handle handle-sw" title="Scale Selection" @mousedown.stop="startCollectiveResize('sw', $event)"></div>
              <div class="resize-handle handle-se" title="Scale Selection" @mousedown.stop="startCollectiveResize('se', $event)"></div>

              <!-- Collective Rotate Handle Stem & Knob -->
              <div class="rotate-stem"></div>
              <div class="element-rotate-handle" title="Rotate Selection" @mousedown.stop="startCollectiveRotate($event)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2F5BEA" stroke-width="2.6">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
                </svg>
              </div>
            </div>

            <!-- SMART GUIDES & MAGNETIC ALIGNMENT OVERLAY -->
            <svg
              v-if="isDragging && (activeGuides.length > 0 || activeDistanceBadges.length > 0)"
              class="smart-guides-overlay"
              xmlns="http://www.w3.org/2000/svg"
            >
              <!-- Guide Lines -->
              <template v-for="g in activeGuides" :key="g.id">
                <!-- High-contrast crisp backing line for visibility on both dark and light frames -->
                <line
                  v-if="g.orientation === 'vertical'"
                  :x1="g.x"
                  :y1="g.y1"
                  :x2="g.x"
                  :y2="g.y2"
                  stroke="rgba(255, 255, 255, 0.9)"
                  stroke-width="3"
                  stroke-linecap="round"
                />
                <line
                  v-else
                  :x1="g.x1"
                  :y1="g.y"
                  :x2="g.x2"
                  :y2="g.y"
                  stroke="rgba(255, 255, 255, 0.9)"
                  stroke-width="3"
                  stroke-linecap="round"
                />

                <!-- Canva Vibrant Magenta/Pink Snapping Guide Line -->
                <line
                  v-if="g.orientation === 'vertical'"
                  :x1="g.x"
                  :y1="g.y1"
                  :x2="g.x"
                  :y2="g.y2"
                  stroke="#FF007A"
                  stroke-width="1.5"
                  :stroke-dasharray="g.type === 'edge' ? '4 3' : 'none'"
                  stroke-linecap="round"
                />
                <line
                  v-else
                  :x1="g.x1"
                  :y1="g.y"
                  :x2="g.x2"
                  :y2="g.y"
                  stroke="#FF007A"
                  stroke-width="1.5"
                  :stroke-dasharray="g.type === 'edge' ? '4 3' : 'none'"
                  stroke-linecap="round"
                />

                <!-- Center Alignment Indicator Marker -->
                <circle
                  v-if="g.type === 'center' && g.orientation === 'vertical'"
                  :cx="g.x"
                  :cy="dragTarget ? dragTarget.y + (dragTarget.height || 36) / 2 : (g.y1 + g.y2) / 2"
                  r="3.5"
                  fill="#FF007A"
                  stroke="#ffffff"
                  stroke-width="1.5"
                />
                <circle
                  v-if="g.type === 'center' && g.orientation === 'horizontal'"
                  :cx="dragTarget ? dragTarget.x + (dragTarget.width || 36) / 2 : (g.x1 + g.x2) / 2"
                  :cy="g.y"
                  r="3.5"
                  fill="#FF007A"
                  stroke="#ffffff"
                  stroke-width="1.5"
                />
              </template>

              <!-- Equal Spacing & Distribution Indicators -->
              <g v-for="b in activeDistanceBadges" :key="b.id">
                <line
                  :x1="b.x"
                  :y1="b.y1"
                  :x2="b.x"
                  :y2="b.y2"
                  stroke="#8B5CF6"
                  stroke-width="1.5"
                  stroke-dasharray="3 2"
                />
                <line :x1="b.x - 4" :y1="b.y1" :x2="b.x + 4" :y2="b.y1" stroke="#8B5CF6" stroke-width="1.5" />
                <line :x1="b.x - 4" :y1="b.y2" :x2="b.x + 4" :y2="b.y2" stroke="#8B5CF6" stroke-width="1.5" />
                <rect
                  :x="b.x - 14"
                  :y="(b.y1 + b.y2) / 2 - 8"
                  width="28"
                  height="16"
                  rx="4"
                  fill="#8B5CF6"
                />
                <text
                  :x="b.x"
                  :y="(b.y1 + b.y2) / 2 + 3.5"
                  fill="#ffffff"
                  font-size="9"
                  font-weight="700"
                  text-anchor="middle"
                >
                  {{ b.distance }}
                </text>
              </g>
            </svg>
          </div>
        </div>
      </main>

      <!-- Right Properties Panel (Bootstrap 5) -->
      <aside class="properties-panel bg-white border-start p-3 d-flex flex-column gap-3 overflow-y-auto flex-shrink-0" style="width: 320px;">
        <!-- Text Typography & Effects Card when Text Element Selected -->
        <template v-if="activeTextElement">
          <div class="d-flex align-items-center justify-content-between border-bottom pb-2">
            <h6 class="fw-bold text-dark m-0 fs-6">Typography</h6>
            <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">Text Block</span>
          </div>

          <div class="d-flex flex-column gap-1">
            <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Text Content</label>
            <input
              v-model="activeTextElement.text"
              type="text"
              class="form-control form-control-sm"
              placeholder="Enter text..."
              @input="debounceTextHistory"
            />
          </div>

          <div class="d-flex flex-column gap-1">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Effect & Style</label>
              <button class="btn btn-link btn-sm p-0 text-decoration-none text-primary fw-bold" style="font-size: 0.76rem;" @click="openEffectsDrawer">
                Effects Drawer ✨
              </button>
            </div>
            <div class="d-flex gap-1 flex-wrap">
              <button
                v-for="eff in ['none', 'shadow', 'stroke', 'echo', 'badge']"
                :key="eff"
                class="btn btn-sm py-1 px-2 rounded-pill"
                :class="activeTextElement.effect === eff ? 'btn-primary' : 'btn-outline-secondary'"
                style="font-size: 0.72rem;"
                @click="setEffect(eff)"
              >
                {{ eff === 'none' ? 'Flat' : eff.charAt(0).toUpperCase() + eff.slice(1) }}
              </button>
            </div>
          </div>

          <div class="d-flex flex-column gap-1">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Curve / Arch</label>
              <span class="badge bg-secondary rounded-pill">{{ activeTextElement.curveAmount || 0 }}%</span>
            </div>
            <input
              v-model.number="activeTextElement.curveAmount"
              type="range"
              min="-100"
              max="100"
              step="1"
              class="form-range"
              @input="debounceTextHistory"
            />
          </div>

          <hr class="my-1 border-secondary border-opacity-25" />
        </template>

        <h6 class="fw-bold text-dark m-0 fs-6">Frame Properties</h6>

        <!-- TEMPLATE NAME -->
        <div class="d-flex flex-column gap-1">
          <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Template Name</label>
          <input
            v-model="templateName"
            type="text"
            class="form-control form-control-sm"
            placeholder="Template name"
          />
        </div>

        <!-- LAYOUT PRESETS -->
        <div class="d-flex flex-column gap-1">
          <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Layout Presets</label>
          <div class="btn-group btn-group-sm w-100" role="group">
            <button
              type="button"
              class="btn"
              :class="activeLayout === '1x4' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="setLayout('1x4')"
            >
              1×4
            </button>
            <button
              type="button"
              class="btn"
              :class="activeLayout === '2x2' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="setLayout('2x2')"
            >
              2×2
            </button>
            <button
              type="button"
              class="btn"
              :class="activeLayout === '3x1' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="setLayout('3x1')"
            >
              3×1
            </button>
          </div>
        </div>

        <!-- SLOTS -->
        <div class="d-flex flex-column gap-1">
          <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Slots</label>
          <div class="input-group input-group-sm">
            <button class="btn btn-outline-secondary" @click="decrementSlots">&minus;</button>
            <span class="form-control text-center bg-white user-select-none">{{ slotCount }}</span>
            <button class="btn btn-outline-secondary" @click="incrementSlots">&plus;</button>
          </div>
        </div>

        <!-- SHAPE -->
        <div class="d-flex flex-column gap-1">
          <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Shape of cutouts</label>
          <div class="btn-group btn-group-sm w-100" role="group">
            <button
              type="button"
              class="btn"
              :class="slotShape === 'Square' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="slotShape = 'Square'"
            >
              Square
            </button>
            <button
              type="button"
              class="btn"
              :class="slotShape === 'Rounded' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="slotShape = 'Rounded'"
            >
              Rounded
            </button>
            <button
              type="button"
              class="btn"
              :class="slotShape === 'Circle' ? 'btn-primary' : 'btn-outline-secondary'"
              @click="slotShape = 'Circle'"
            >
              Circle
            </button>
          </div>
        </div>

        <!-- BORDER -->
        <div class="d-flex flex-column gap-1">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <label class="form-label small fw-bold text-secondary text-uppercase m-0">Border</label>
            <span class="badge bg-primary rounded-pill">{{ borderWidth }}px</span>
          </div>

          <div class="d-flex gap-2">
            <!-- Color Box -->
            <div class="input-group input-group-sm" style="flex: 1.2;">
              <input type="color" v-model="borderColor" class="form-control form-control-color form-control-sm p-1" style="max-width: 38px;" @change="saveHistoryState" />
              <input type="text" v-model="borderColor" class="form-control form-control-sm text-uppercase font-monospace" maxlength="7" spellcheck="false" @change="saveHistoryState" />
            </div>

            <!-- Stepper Box -->
            <div class="input-group input-group-sm" style="flex: 1;">
              <button class="btn btn-outline-secondary" title="Decrease border width" :disabled="borderWidth <= 0" @click="decrementBorderWidth">&minus;</button>
              <input
                type="number"
                v-model.number="borderWidth"
                min="0"
                max="10"
                class="form-control form-control-sm text-center px-1"
                title="Border width (px)"
                @change="onBorderWidthChange($event.target.value)"
              />
              <button class="btn btn-outline-secondary" title="Increase border width" :disabled="borderWidth >= 10" @click="incrementBorderWidth">&plus;</button>
            </div>
          </div>
        </div>

        <!-- CAPTION -->
        <div class="d-flex flex-column gap-1">
          <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Caption</label>
          <input
            v-model="captionText"
            type="text"
            class="form-control form-control-sm"
            placeholder="Enter caption text"
          />
        </div>
      </aside>
    </div>

    <!-- Custom Canva-Style Right-Click Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="custom-context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <template v-if="contextMenu.targetElement || selectedElementIds.length > 0">
        <div class="context-menu-header">
          {{ selectedElementIds.length > 1 ? `${selectedElementIds.length} Elements Selected` : getElementDisplayName(contextMenu.targetElement) }}
        </div>
        <div class="context-divider"></div>

        <!-- Group / Ungroup Context Options -->
        <button v-if="canGroupSelected" class="context-item" @click="groupSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span class="context-label">Group Elements</span>
          <span class="context-shortcut">⌘G</span>
        </button>
        <button v-if="canUngroupSelected" class="context-item" @click="ungroupSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          </svg>
          <span class="context-label">Ungroup</span>
          <span class="context-shortcut">⇧⌘G</span>
        </button>
        <div v-if="canGroupSelected || canUngroupSelected" class="context-divider"></div>

        <button class="context-item" @click="bringForward(); closeContextMenu()">
          <span class="context-icon">▲</span>
          <span class="context-label">Bring Forward</span>
          <span class="context-shortcut">⌘]</span>
        </button>
        <button class="context-item" @click="bringToFrontSelected(); closeContextMenu()">
          <span class="context-icon">⇪▲</span>
          <span class="context-label">Bring to Front</span>
          <span class="context-shortcut">⇧⌘]</span>
        </button>
        <button class="context-item" @click="sendBackward(); closeContextMenu()">
          <span class="context-icon">▼</span>
          <span class="context-label">Send Backward</span>
          <span class="context-shortcut">⌘[</span>
        </button>
        <button class="context-item" @click="sendToBackSelected(); closeContextMenu()">
          <span class="context-icon">⇪▼</span>
          <span class="context-label">Send to Back</span>
          <span class="context-shortcut">⇧⌘[</span>
        </button>
        <div class="context-divider"></div>
        <button
          v-if="selectedElementIds.length === 1 && contextMenu.targetElement?.type === 'text'"
          class="context-item"
          @click="startEditingText(contextMenu.targetElement); closeContextMenu()"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span class="context-label">Edit Text</span>
          <span class="context-shortcut">dbl-click</span>
        </button>
        <button class="context-item" @click="duplicateSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span class="context-label">Duplicate</span>
          <span class="context-shortcut">⌘D</span>
        </button>
        <button class="context-item" @click="toggleLock(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path v-if="contextMenu.targetElement?.isLocked" d="M7 11V7a5 5 0 0 1 10 0v4" />
            <path v-else d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
          <span class="context-label">{{ contextMenu.targetElement?.isLocked ? 'Unlock' : 'Lock' }}</span>
        </button>
        <div class="context-divider"></div>
        <button class="context-item text-danger" @click="removeSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span class="context-label">Delete</span>
          <span class="context-shortcut">Del</span>
        </button>
      </template>
      <template v-else>
        <div class="context-menu-header">Canvas Frame</div>
        <div class="context-divider"></div>
        <button class="context-item" @click="toggleCutouts(); closeContextMenu()">
          <span class="context-label">{{ showCutouts ? 'Hide Photo Cutouts' : 'Show Photo Cutouts' }}</span>
        </button>
      </template>
    </div>

    <!-- Saved Frames Folder Modal -->
    <SavedFramesModal
      :is-open="isSavedFramesModalOpen"
      :saved-frames="savedFramesList"
      :current-frame-id="currentSavedFrameId"
      @close="isSavedFramesModalOpen = false"
      @open-frame="openSavedFrame"
      @delete-frame="deleteFrame"
      @download-frame="downloadSavedFrame"
      @import-file="importFrameFromFile"
      @save-current="saveFrame"
    />

    <!-- Toast Notification -->
    <div v-if="showNotification" class="toast-toast">
      {{ notificationMessage }}
    </div>
  </div>
</template>

<style scoped>
/* ============================================================
   CANVAS & CUSTOM POPOVER MECHANICS (CANNOT BE DONE BY BOOTSTRAP 5)
   ============================================================ */

/* Zoom Popover Dropdown */
.zoom-popover-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.18), 0 4px 6px -2px rgba(15, 23, 42, 0.05);
  padding: 6px;
  width: 190px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1000;
  animation: slideDownZoom 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideDownZoom {
  from { opacity: 0; transform: translate(-50%, -6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.zoom-popover-menu .menu-header {
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  padding: 6px 10px 4px 10px;
}

.zoom-popover-menu .menu-item {
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}

.zoom-popover-menu .menu-item:hover {
  background: #f8fafc;
}

.zoom-popover-menu .menu-item.current {
  background: #eff6ff;
  color: #2563eb;
}

.zoom-popover-menu .item-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
}

.zoom-popover-menu .menu-item.current .item-name {
  color: #2563eb;
  font-weight: 700;
}

.zoom-popover-menu .item-shortcut {
  font-size: 0.7rem;
  font-weight: 600;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 2px 5px;
  border-radius: 4px;
}

.zoom-popover-menu .menu-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 4px 6px;
}

/* Expandable Canva Flyout Drawer */
.canva-drawer {
  width: 310px;
  box-shadow: 4px 0 16px rgba(15, 23, 42, 0.04);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.template-preset-card {
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.template-preset-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  border-color: #3b82f6 !important;
}

.mini-slots {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 45px;
  z-index: 2;
}

.mini-layout-2x2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  width: 48px;
}

.mini-layout-3x1 {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 45px;
}

.mini-layout-3x1 .mini-slot {
  height: 18px;
}

.mini-slot {
  height: 13px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px dashed rgba(100, 116, 139, 0.65);
  border-radius: 2px;
}

.mini-slot.shape-rounded {
  border-radius: 4px;
}

.mini-slot.shape-square {
  border-radius: 0px;
}

.mini-slot.shape-circle {
  border-radius: 50%;
  height: 15px;
  width: 15px;
  margin: 0 auto;
}

/* Elements Grid */
.elements-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.element-item-hover:hover {
  transform: scale(1.08);
  transition: transform 0.15s ease;
}

.washi-preview {
  width: 100%;
  height: 18px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.tape-label {
  font-size: 0.6rem;
  font-weight: 700;
  color: #334155;
}

.shape-preview {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

/* Canvas Workspace */
.canvas-workspace {
  flex: 1;
  background-color: #eef2f6;
  position: relative;
  overflow: hidden; /* Infinite pan/zoom viewport */
  user-select: none;
  cursor: grab;
}

.canvas-workspace.is-hand-mode {
  cursor: grab !important;
}

.canvas-workspace.is-hand-mode * {
  cursor: grab !important;
}

.canvas-workspace.is-panning,
.canvas-workspace.is-panning * {
  cursor: grabbing !important;
}

.canvas-viewport {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
  pointer-events: none;
  will-change: transform;
}

.canvas-viewport * {
  pointer-events: auto;
}

/* Photostrip Frame */
.photostrip-frame {
  cursor: default;
  width: 280px;
  min-width: 280px;
  max-width: 280px;
  background-color: #fefbf6;
  border-radius: 18px;
  padding: 12px 12px 18px 12px;
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  transition: box-shadow 0.2s ease;
}

.photostrip-frame.layout-1x4 {
  min-height: 556px;
  height: 556px;
}

.photostrip-frame.layout-3x1 {
  min-height: 432px;
  height: 432px;
}

.photostrip-frame.layout-2x2 {
  min-height: 308px;
  height: 308px;
}

.photostrip-border-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  border-radius: 18px;
  pointer-events: none !important;
  box-sizing: border-box;
  z-index: 85;
  transition: border-color 0.2s ease, border-width 0.2s ease;
}

.strip-slots-container {
  width: 240px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none !important;
  box-sizing: border-box;
}

.strip-slots-container * {
  pointer-events: none !important;
}

.strip-slots-container.layout-2x2 {
  display: grid;
  grid-template-columns: repeat(2, 116px);
  gap: 8px;
  justify-content: center;
}

/* Empty Cutout Slots - Solid Opaque Photo Windows */
.cutout-slot {
  width: 240px;
  height: 116px;
  flex-shrink: 0;
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  background: #ffffff;
  border: 1.5px dashed #94a3b8;
  pointer-events: none !important;
  transition: opacity 0.25s ease, background 0.25s ease, border-color 0.25s ease;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.strip-slots-container.layout-2x2 .cutout-slot {
  width: 116px;
  height: 116px;
}

/* Toggled OFF: Cutouts disappear completely while preserving the full strip height & layout */
.strip-slots-container.cutouts-hidden {
  pointer-events: none !important;
}

.strip-slots-container.cutouts-hidden .cutout-slot,
.cutout-slot.slot-hidden {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.strip-slots-container.cutouts-hidden .cutout-window {
  opacity: 0 !important;
  visibility: hidden !important;
}

.cutout-window {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.cutout-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #94a3b8;
}

.cutout-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* Shapes */
.shape-square {
  border-radius: 0;
}

.shape-rounded {
  border-radius: 12px;
}

.shape-circle {
  border-radius: 50%;
}

/* Strip Caption */
.strip-caption {
  margin-top: 18px;
  height: 20px;
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #2f5bea;
  letter-spacing: -0.01em;
  box-sizing: border-box;
  flex-shrink: 0;
  cursor: pointer;
  position: relative;
  transition: outline 0.15s ease;
}

.strip-caption.is-empty:hover {
  outline: 1.5px dashed rgba(47, 91, 234, 0.35);
  border-radius: 4px;
}

.strip-caption-text {
  display: inline-block;
  min-height: 1.25em;
  line-height: 1.25;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Freeform Canvas Elements (Draggable Stickers, Tape, Text) */
.canvas-element {
  position: absolute;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  touch-action: none;
  z-index: 12;
  transition: box-shadow 0.1s;
}

.canvas-element:active {
  cursor: grabbing;
}

.element-sticker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  pointer-events: auto;
}

.element-tape {
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;
}

.element-text {
  white-space: nowrap;
  letter-spacing: -0.01em;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  cursor: grab;
  pointer-events: auto;
}

.element-shape {
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;
}

.canvas-element.selected {
  z-index: 14;
}

.canvas-element.selected .element-bounding-box {
  position: absolute;
  top: -6px;
  left: -6px;
  right: -6px;
  bottom: -6px;
  border: 1.5px solid #2f5bea;
  border-radius: 4px;
  background-color: rgba(47, 91, 234, 0.04);
  cursor: grab;
  pointer-events: auto;
}

.canvas-element.selected .element-bounding-box:active {
  cursor: grabbing;
}

/* Corner Resize Handles */
.resize-handle {
  position: absolute;
  width: 9px;
  height: 9px;
  background-color: #ffffff;
  border: 2px solid #2f5bea;
  border-radius: 2px;
  pointer-events: auto;
  z-index: 15;
}

.handle-nw { top: -5px; left: -5px; cursor: nwse-resize; }
.handle-ne { top: -5px; right: -5px; cursor: nesw-resize; }
.handle-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
.handle-se { bottom: -5px; right: -5px; cursor: nwse-resize; }

/* Rotation Handle Stem & Knob */
.rotate-stem {
  position: absolute;
  bottom: -16px;
  left: 50%;
  width: 1.5px;
  height: 16px;
  background-color: #2f5bea;
  transform: translateX(-50%);
  pointer-events: none;
}

.element-rotate-handle {
  position: absolute;
  bottom: -28px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 22px;
  background-color: #ffffff;
  border: 1.5px solid #2f5bea;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  box-shadow: 0 2px 6px rgba(47, 91, 234, 0.25);
  pointer-events: auto;
  z-index: 15;
  transition: transform 0.1s, background-color 0.1s;
}

.element-rotate-handle:hover {
  background-color: #eff4fe;
  transform: translateX(-50%) scale(1.15);
}

.element-rotate-handle:active {
  cursor: grabbing;
}

/* Tooltip displaying rotation angle in degrees */
.rotation-tooltip {
  position: absolute;
  bottom: -54px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #0f172a;
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
}

.element-del-btn {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ef4444;
  color: #ffffff;
  border: 1.5px solid #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  z-index: 16;
}

/* 3.5. Smart Alignment Guides & Snapping Overlay */
.smart-guides-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 50;
  overflow: visible;
}

/* 4. Right Properties Panel (Dimensions only) */
.properties-panel {
  width: 320px;
}

/* Background Color Palette */
.color-palette {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  padding: 0;
}

.color-swatch:hover {
  transform: scale(1.1);
}

.color-swatch.selected {
  outline: 2px solid #2f5bea;
  outline-offset: 2px;
}

/* Border controls */
.border-badge-pill {
  font-size: 0.72rem;
  font-weight: 700;
  color: #2563eb;
  background-color: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 9999px;
  padding: 1px 7px;
}

.border-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.border-color-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background-color: #ffffff;
  height: 38px;
}

.border-color-picker {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  flex-shrink: 0;
}

.border-hex-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  font-family: monospace;
  text-transform: uppercase;
  outline: none;
}

.border-stepper-box {
  display: flex;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  height: 38px;
}

.border-stepper-box .step-btn {
  width: 32px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border: none;
  font-size: 1.05rem;
  color: #475569;
  cursor: pointer;
  transition: background 0.15s;
}

.border-stepper-box .step-btn:hover:not(:disabled) {
  background-color: #f1f5f9;
  color: #0f172a;
}

.border-stepper-box .step-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.border-number-input {
  width: 44px;
  height: 36px;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
  border: none;
  outline: none;
  background: transparent;
  -moz-appearance: textfield;
}

.border-number-input::-webkit-outer-spin-button,
.border-number-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.border-slider-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 4px 2px 4px;
}

.border-slider {
  width: 100%;
  accent-color: #2563eb;
  cursor: pointer;
  height: 4px;
}

.border-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  font-weight: 600;
  color: #94a3b8;
}

/* Caption and Name Inputs */
.prop-input {
  width: 100%;
  padding: 9px 12px;
  font-size: 0.88rem;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.prop-input:focus {
  border-color: #2f5bea;
  box-shadow: 0 0 0 3px rgba(47, 91, 234, 0.15);
}

.template-name-input {
  border-color: #2f5bea;
  font-weight: 500;
}

/* Save Frame Button */
.save-frame-btn {
  width: 100%;
  padding: 11px 0;
  background-color: #2f5bea;
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.05s;
}

.save-frame-btn:hover {
  background-color: #2548c7;
}

.save-frame-btn:active {
  transform: scale(0.99);
}

/* Toast Notification */
.toast-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #0f172a;
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 500;
  padding: 10px 20px;
  border-radius: 9999px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translate(-50%, 10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ===================================================
   CANVA-STYLE LAYER MANAGEMENT & FLOATING CONTROLS
   =================================================== */

/* Left Rail Badge */
.rail-badge {
  position: absolute;
  top: 6px;
  right: 12px;
  background: #2f5bea;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 999px;
  line-height: 1.2;
}

/* Layers Drawer Panel */
.layers-drawer-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

.layers-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.layers-count-badge {
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  white-space: nowrap;
}

/* Cutouts Stack Layer Switcher */
.cutout-stack-control {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cutout-stack-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cutout-stack-title {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
}

.cutout-stack-desc {
  font-size: 10.5px;
  color: #64748b;
  line-height: 1.2;
}

.cutout-stack-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.cutout-stack-btn:hover {
  background: #eff4fe;
  border-color: #2f5bea;
  color: #2f5bea;
}

.cutout-stack-btn.stack-below {
  background: #eff4fe;
  border-color: #2f5bea;
  color: #2f5bea;
}

/* Layers Empty State */
.layers-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 16px;
  background: #f8fafc;
  border: 1.5px dashed #cbd5e1;
  border-radius: 12px;
  gap: 8px;
  margin-top: 8px;
}

.layers-empty-icon {
  margin-bottom: 4px;
}

.layers-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.layers-empty-desc {
  font-size: 11.5px;
  color: #64748b;
  line-height: 1.4;
}



/* ===================================================
   CANVA-STYLE FLOATING CONTROL TOOLBAR
   =================================================== */

.element-floating-bar {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 3px 6px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.16);
  z-index: 120;
  white-space: nowrap;
  pointer-events: auto;
}

.position-btn-wrapper {
  position: relative;
}

.floating-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  border-radius: 14px;
  padding: 4px 8px;
  font-size: 11.5px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
  height: 26px;
}

.floating-tool-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.floating-tool-btn.active {
  background: #eff4fe;
  color: #2f5bea;
}

.floating-tool-btn .chevron-icon {
  margin-left: -1px;
}

.floating-tool-btn.icon-only {
  padding: 0;
  width: 26px;
  height: 26px;
  justify-content: center;
}

.floating-tool-btn.icon-only.del:hover {
  background: #fee2e2;
  color: #ef4444;
}

.floating-tool-btn.icon-only.is-locked {
  background: #eff4fe;
  color: #2f5bea;
}

.floating-divider {
  width: 1px;
  height: 15px;
  background: #e2e8f0;
  margin: 0 2px;
}

/* Position Popover Menu */
.position-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 180px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15);
  padding: 6px;
  z-index: 130;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.popover-header {
  font-size: 10.5px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 8px 3px 8px;
}

.popover-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  color: #1e293b;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}

.popover-item:hover {
  background: #f1f5f9;
  color: #2f5bea;
}

.item-icon {
  width: 20px;
  font-size: 10px;
  color: #64748b;
  font-weight: 700;
}

.item-label {
  flex: 1;
}

.item-shortcut {
  font-size: 10.5px;
  color: #94a3b8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", monospace;
  background: #f8fafc;
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid #e2e8f0;
}

/* ===================================================
   CANVA-STYLE RIGHT-CLICK CONTEXT MENU
   =================================================== */

.custom-context-menu {
  position: fixed;
  z-index: 9999;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
  padding: 6px;
  min-width: 205px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: contextFadeIn 0.12s ease-out;
}

@keyframes contextFadeIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

.context-menu-header {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  padding: 5px 8px 3px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 3px 0;
}

.context-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  color: #1e293b;
  cursor: pointer;
  text-align: left;
  transition: all 0.1s ease;
}

.context-item:hover {
  background: #f1f5f9;
}

.context-item.text-danger {
  color: #ef4444;
}

.context-item.text-danger:hover {
  background: #fee2e2;
}

.context-icon {
  width: 18px;
  font-size: 10px;
  color: #64748b;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}

.context-icon-svg {
  color: #64748b;
  flex-shrink: 0;
}

.context-label {
  flex: 1;
}

.context-shortcut {
  font-size: 10.5px;
  color: #94a3b8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", monospace;
  background: #f8fafc;
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid #e2e8f0;
}

/* ===================================================
   CANVA-STYLE INLINE DIRECT TEXT EDITING
   =================================================== */

.element-text-container {
  display: inline-flex;
  align-items: center;
  user-select: none;
}

.element-text.is-editing {
  cursor: text !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  outline: none !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  min-width: 20px;
  min-height: 1em;
  caret-color: currentColor;
  padding: 0;
  margin: 0;
  display: inline-block;
  white-space: pre;
  line-height: inherit;
}

.element-bounding-box.is-editing-text {
  border: 1.5px dashed rgba(47, 91, 234, 0.7) !important;
  background: transparent !important;
  pointer-events: none;
  border-radius: 4px;
}

.strip-caption-input {
  background: transparent;
  border: none;
  border-bottom: 1.5px dashed rgba(47, 91, 234, 0.5);
  border-radius: 0;
  padding: 0 4px;
  font-size: 0.88rem;
  font-weight: 700;
  color: inherit;
  text-align: center;
  outline: none;
  box-shadow: none;
  width: 90%;
  height: 20px;
  line-height: 20px;
  margin: 0 auto;
  pointer-events: auto;
  box-sizing: border-box;
}

.floating-tool-btn.text-edit-btn {
  color: #2f5bea;
  font-weight: 600;
}

.floating-tool-btn.text-edit-btn:hover {
  background: #eff4fe;
}

/* ===================================================
   CANVA-STYLE MULTI-SELECTION, MARQUEE & GROUPING
   =================================================== */

/* Canvas Marquee / Rubberband Selection Box */
.canvas-marquee-box {
  position: absolute;
  background-color: rgba(59, 130, 246, 0.15);
  border: 1px dashed #3B82F6;
  border-radius: 2px;
  pointer-events: none;
  z-index: 999;
}

/* Multi-select Sub-Element Dashed Indicator */
.sub-element-selection-indicator {
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border: 1.5px dashed rgba(47, 91, 234, 0.55);
  border-radius: 4px;
  pointer-events: none;
}

/* Unified Collective Bounding Box */
.collective-bounding-box {
  position: absolute;
  border: 1.5px solid #2f5bea;
  background-color: rgba(47, 91, 234, 0.04);
  cursor: grab;
  pointer-events: auto;
  border-radius: 4px;
  box-sizing: border-box;
}

.collective-bounding-box:active {
  cursor: grabbing;
}

.collective-floating-bar {
  z-index: 125;
}

.floating-tool-btn.group-btn {
  color: #2f5bea;
}

.floating-tool-btn .shortcut-tag {
  font-size: 9.5px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 500;
  margin-left: 2px;
}





.thickness-preview-dot {
  display: inline-block;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.12);
  transition: all 0.12s ease;
}

/* Text Effect Card Previews (Custom text-shadow and webkit-text-stroke) */
.effect-preview-none {
  color: #1e293b;
}

.effect-preview-shadow {
  color: #1e293b;
  text-shadow: 2px 2px 3px rgba(0, 0, 0, 0.4);
}

.effect-preview-stroke {
  color: transparent !important;
  -webkit-text-stroke: 1.5px #1e293b;
  -webkit-text-fill-color: transparent;
}

.effect-preview-echo {
  color: #2f5bea;
  text-shadow: 2px 2px 0 #ff4081;
}

.effect-preview-badge {
  background-color: #ffd166;
  color: #0f172a;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

/* Canvas Text Elements & Curved SVG */
.element-text-container {
  display: inline-block;
  position: relative;
}

.element-curved-svg {
  display: block;
  overflow: visible;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
}

.element-text {
  cursor: grab;
  user-select: none;
  transition: outline 0.1s ease;
}

.element-text.is-editing {
  cursor: text;
  user-select: text;
  outline: 2px solid #2f5bea;
  border-radius: 3px;
  min-width: 20px;
  white-space: pre;
}

/* Elements Drawer SVG sizing constraint */
.element-drawer-svg {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

:deep(.element-drawer-svg svg),
.element-drawer-svg svg {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  max-width: 100% !important;
  max-height: 100% !important;
}

/* Canvas Frame Texture Overlay & Shape SVGs */
.frame-texture-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  border-radius: inherit;
}

.element-svg-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

:deep(.element-svg-wrapper svg),
.element-svg-wrapper svg {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
}

.element-image-content {
  display: block;
  max-width: 100%;
  max-height: 100%;
  user-select: none;
}

.shape-svg-inner {
  display: block;
  overflow: visible;
}

/* Mock Photo In Cutout Slot */
.mock-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  border-radius: inherit;
}

/* Doodle Drawing Surface & Freehand Canvas */

.active-doodle-drawing-surface {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  pointer-events: auto;
  touch-action: none;
  overflow: visible;
}

.active-doodle-drawing-surface.is-pen {
  cursor: crosshair;
}

.active-doodle-drawing-surface.is-highlighter {
  cursor: crosshair;
}

.active-doodle-drawing-surface.is-eraser {
  cursor: cell;
}

.photostrip-frame.in-draw-mode {
  user-select: none;
  -webkit-user-select: none;
}

.element-doodle-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.doodle-svg-inner {
  pointer-events: none;
}

.layer-doodle-preview {
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>

