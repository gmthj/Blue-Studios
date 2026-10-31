import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, provide, inject } from "vue"
import { useRoute, useRouter } from "vue-router"

// Composables & Auth
import { useSmartGuides } from "./useSmartGuides.js"
import { useCanvasViewport } from "./useCanvasViewport.js"
import { useAuth, getUid } from "./useAuth.js"
import { askConfirm } from "./useDialog.js"

// Studio & Marketplace Integrations
import {
  saveTemplate,
  loadTemplateProject,
  listMyItems,
  deleteItem,
  CATEGORIES,
  MAX_CATEGORIES,
  categoryLabel
} from "../studio.js"
import { getItem } from "../marketplace.js"

// Utilities & Engines
import {
  MOCK_PORTRAIT_PHOTOS,
  sanitizeFilename
} from "../utils/exportEngine.js"
import {
  captureEditablePng,
  parseProjectFromFile,
  readFileAsDataUrl,
  loadSavedFramesFromDB,
  saveFrameToDB,
  deleteSavedFrameFromDB,
  triggerFileDownload
} from "../utils/savedFrameEngine.js"

// Design Data & Presets
import {
  SVG_TEMPLATES,
  TEMPLATE_PRESETS,
  LAYOUTS,
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
} from "../constants/frameEditorData.js"

export const FRAME_EDITOR_KEY = Symbol("FRAME_EDITOR_KEY")
export const TEMPLATE_EDITOR_KEY = FRAME_EDITOR_KEY


export function useFrameEditor() {
const templatePresets = TEMPLATE_PRESETS
const elementCategories = ELEMENT_CATEGORIES
const textPresets = TEXT_PRESETS
const bgColors = BACKGROUND_COLORS
const bgGradients = BACKGROUND_GRADIENTS
const bgTextures = BACKGROUND_TEXTURES
const bgPatterns = BACKGROUND_PATTERNS

// Cross-platform OS detection (Mac vs Windows / Linux)
const isMac = typeof navigator !== 'undefined' && (
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || '') ||
  (navigator.userAgentData?.platform === 'macOS')
)

// Platform-appropriate keyboard shortcut labels
const shortcuts = {
  isMac,
  mod: isMac ? '⌘' : 'Ctrl+',
  shiftMod: isMac ? '⇧⌘' : 'Ctrl+Shift+',
  undo: isMac ? '⌘Z' : 'Ctrl+Z',
  redo: isMac ? '⌘Y' : 'Ctrl+Y',
  save: isMac ? '⌘S' : 'Ctrl+S',
  duplicate: isMac ? '⌘D' : 'Ctrl+D',
  group: isMac ? '⌘G' : 'Ctrl+G',
  ungroup: isMac ? '⇧⌘G' : 'Ctrl+Shift+G',
  selectAll: isMac ? '⌘A' : 'Ctrl+A',
  zoomIn: isMac ? '⌘+' : 'Ctrl++',
  zoomOut: isMac ? '⌘-' : 'Ctrl+-',
  fit: isMac ? '⌘0' : 'Ctrl+0',
  actualSize: isMac ? '⌘1' : 'Ctrl+1',
  bold: isMac ? '⌘B' : 'Ctrl+B',
  italic: isMac ? '⌘I' : 'Ctrl+I',
  underline: isMac ? '⌘U' : 'Ctrl+U',
  bringForward: isMac ? '⌘]' : 'Ctrl+]',
  bringToFront: isMac ? '⇧⌘]' : 'Ctrl+Shift+]',
  sendBackward: isMac ? '⌘[' : 'Ctrl+[',
  sendToBack: isMac ? '⇧⌘[' : 'Ctrl+Shift+[',
  delete: isMac ? 'Delete / ⌫' : 'Delete / Backspace'
}

// =============================================================================
// 2. Core Reactive State & Model Definitions
// =============================================================================

// --- DOM References ---
const stripRef = ref(null)
const canvasWorkspaceRef = ref(null)
const uploadInputRef = ref(null)
const captionInputRef = ref(null)
const textInputRefs = ref({})

// --- Router & Auth Context ---
const route = useRoute()
const router = useRouter()
const { user, isAccount } = useAuth()

// --- Cloud Template & My Studio / Marketplace State ---
const cloudId = ref(null) // Firestore document ID if saved to account or loaded from cloud
const loadedTemplateOwnerId = ref(null) // ownerId of template loaded from Firestore
const chosenCategories = ref(['other']) // 1 to 3 categories from CATEGORIES
const isSaveModalOpen = ref(false)
const isSavingFrame = ref(false)
const isSaveSuccess = ref(false)
const cloudErrorMessage = ref('')

// --- My Saved Templates Drawer & Template Switching State ---
const isMyTemplatesDrawerOpen = ref(false)
const userCloudTemplates = ref([])
const isLoadingUserTemplates = ref(false)
const pendingSwitchTemplate = ref(null)
const isSwitchPromptOpen = ref(false)
const isSwitchingWorkspace = ref(false)

// --- Workspace Loading State (prevents stock design flash when opening saved template) ---
const getInitialTemplateQuery = () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    return params.get('template') || null
  }
  return null
}
const initialTemplateParam = getInitialTemplateQuery()
const isWorkspaceLoading = ref(Boolean(initialTemplateParam || route?.query?.template))
const workspaceLoadingMessage = ref(
  (initialTemplateParam || route?.query?.template) ? 'Loading saved template...' : ''
)

const isOwner = computed(() => {
  if (!cloudId.value || !loadedTemplateOwnerId.value) return true
  return loadedTemplateOwnerId.value === getUid()
})

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



// --- Editor Navigation & Toolbar State ---
const templateName = ref('my-templates-1')
const activeLayout = ref('retro-4-cut') // 'retro-4-cut' | 'polaroid-2x2' | 'film-3-cut'
const slotShape = ref('Rounded') // 'Square' | 'Rounded' | 'Circle'
const isMobileInitial = typeof window !== 'undefined' && window.innerWidth < 992
const activeTool = ref('templates') // 'templates' (Presets) | 'elements' | 'text' | 'background' | 'layers'
const isDrawerOpen = ref(!isMobileInitial)
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
const captionColor = ref('#2F5BEA')
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
let textHistoryTimer = null

// --- Vector SVG Dynamic Recoloring ---
const activeVectorColorTarget = ref(null)
const isVectorColorPickerOpen = ref(false)

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

// Active Layout definition matching stripData.js convention
const currentLayoutDef = computed(() => {
  const id = activeLayout.value
  return (
    LAYOUTS.find((l) => l.id === id) ||
    (id === '1x4' && LAYOUTS.find((l) => l.id === 'retro-4-cut')) ||
    (id === '2x2' && LAYOUTS.find((l) => l.id === 'polaroid-2x2')) ||
    (id === '3x1' && LAYOUTS.find((l) => l.id === 'film-3-cut')) ||
    LAYOUTS[0]
  )
})

// Cutout Slots calculation using percentage coordinates { x, y, w, h } directly from layout or loaded template
const customSlots = ref(null)
const currentSlots = computed(() => {
  if (customSlots.value && customSlots.value.length) {
    return customSlots.value.map((s, idx) => ({
      id: s.id || idx + 1,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h
    }))
  }
  const layout = currentLayoutDef.value
  return (layout.slots || []).map((s, idx) => ({
    id: idx + 1,
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h
  }))
})

// Slot count is fixed by the selected layout cut
const slotCount = computed(() => currentSlots.value.length)

function getLayoutSlots(layoutId) {
  const l =
    LAYOUTS.find((item) => item.id === layoutId) ||
    (layoutId === '1x4' && LAYOUTS.find((item) => item.id === 'retro-4-cut')) ||
    (layoutId === '2x2' && LAYOUTS.find((item) => item.id === 'polaroid-2x2')) ||
    (layoutId === '3x1' && LAYOUTS.find((item) => item.id === 'film-3-cut')) ||
    LAYOUTS[0]
  return l ? l.slots : []
}

function getLayoutAspect(layoutId) {
  const l =
    LAYOUTS.find((item) => item.id === layoutId) ||
    (layoutId === '1x4' && LAYOUTS.find((item) => item.id === 'retro-4-cut')) ||
    (layoutId === '2x2' && LAYOUTS.find((item) => item.id === 'polaroid-2x2')) ||
    (layoutId === '3x1' && LAYOUTS.find((item) => item.id === 'film-3-cut')) ||
    LAYOUTS[0]
  return l ? l.aspect : 3 / 10
}

function formatAspect(aspect) {
  if (!aspect) return '3:10'
  if (Math.abs(aspect - 3 / 10) < 0.01) return '3:10'
  if (Math.abs(aspect - 3 / 4) < 0.01) return '3:4'
  if (Math.abs(aspect - 3 / 8) < 0.01) return '3:8'
  return Math.round(aspect * 100) / 100
}

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
    if (el.type === 'tape' || el.type === 'shape') {
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
    captionColor: captionColor.value,
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
  if (state.templateName) templateName.value = state.templateName
  if (state.activeLayout || state.stripLayoutId) activeLayout.value = state.stripLayoutId || state.activeLayout
  if (state.slots && state.slots.length) {
    customSlots.value = state.slots
  } else {
    customSlots.value = null
  }
  if (state.categories && Array.isArray(state.categories) && state.categories.length) {
    chosenCategories.value = [...state.categories]
  }
  if (state.selectedBgColor) selectedBgColor.value = state.selectedBgColor
  if (state.frameBg) {
    frameBg.value = { ...state.frameBg }
  } else if (state.background) {
    const isGrad = state.background.includes('gradient')
    frameBg.value = {
      type: isGrad ? 'gradient' : 'color',
      value: state.background,
      baseColor: isGrad ? '#FEFBF6' : state.background,
      texture: null,
      opacity: 0.85,
      blendMode: 'multiply',
      scale: 1
    }
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
  if (state.borderColor !== undefined) borderColor.value = state.borderColor
  if (state.borderWidth !== undefined) borderWidth.value = state.borderWidth
  if (state.slotShape || state.shape) {
    const shapeStr = state.slotShape || state.shape
    slotShape.value = shapeStr.charAt(0).toUpperCase() + shapeStr.slice(1).toLowerCase()
  }
  if (state.captionText !== undefined || state.caption !== undefined) {
    captionText.value = state.captionText !== undefined ? state.captionText : state.caption
  }
  if (state.captionColor !== undefined) captionColor.value = state.captionColor
  if (state.cutoutsLayerPosition) cutoutsLayerPosition.value = state.cutoutsLayerPosition
  if (state.showCutouts !== undefined) showCutouts.value = state.showCutouts
  canvasElements.value = state.canvasElements ? JSON.parse(JSON.stringify(state.canvasElements)) : []
  selectedElementIds.value = []
  if (state.customGuides) customGuides.value = state.customGuides || []
}

// =============================================================================
// 6. Template Presets & Layout Operations
// =============================================================================
const isMobileEditSheetOpen = ref(false)

function openMobileEditSheet() {
  isDrawerOpen.value = false
  isMobileEditSheetOpen.value = true
}

function toggleMobileEditSheet() {
  if (isMobileEditSheetOpen.value) {
    isMobileEditSheetOpen.value = false
  } else {
    isDrawerOpen.value = false
    isMobileEditSheetOpen.value = true
  }
}

function closeMobileSheets() {
  isDrawerOpen.value = false
  isMobileEditSheetOpen.value = false
}

function toggleDrawer(toolName) {
  if (activeTool.value === toolName && isDrawerOpen.value) {
    closeDrawer()
  } else {
    isMobileEditSheetOpen.value = false
    activeTool.value = toolName
    isDrawerOpen.value = true
  }
}

async function closeDrawer() {
  isDrawerOpen.value = false
}

// Fit photostrip to screen helper
function triggerFitToScreen() {
  fitToScreen(canvasWorkspaceRef.value, stripRef.value)
}

let refitRafId = null
function refitDuringTransition(duration = 280) {
  if (refitRafId) cancelAnimationFrame(refitRafId)
  const startTime = performance.now()
  function step(now) {
    triggerFitToScreen()
    if (now - startTime < duration) {
      refitRafId = requestAnimationFrame(step)
    } else {
      triggerFitToScreen()
      refitRafId = null
    }
  }
  refitRafId = requestAnimationFrame(step)
}

// Automatically refit photostrip to screen whenever drawer opens or closes
watch(isDrawerOpen, async () => {
  await nextTick()
  triggerFitToScreen()
  refitDuringTransition(280)
})

function setLayout(layout) {
  customSlots.value = null
  activeLayout.value = layout
  saveHistoryState()
  nextTick(() => {
    triggerFitToScreen()
  })
}

function setSlotShape(shape) {
  slotShape.value = shape
  if (!showCutouts.value) {
    showCutouts.value = true
  }
  saveHistoryState()
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
  selectedBgColor.value = tpl.bg
  frameBg.value.type = tpl.bgType || 'color'
  frameBg.value.value = tpl.gradient || tpl.bg
  frameBg.value.baseColor = tpl.bg
  frameBg.value.texture = tpl.texture || null
  borderColor.value = tpl.border
  borderWidth.value = tpl.borderWidth
  slotShape.value = tpl.shape
  captionText.value = tpl.caption
  captionColor.value = tpl.captionColor || tpl.border || '#2F5BEA'

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
  nextTick(() => {
    triggerFitToScreen()
  })
}

// =============================================================================
// 7. Frame Background, Texture & Border Operations
// =============================================================================
const customGradient = ref({
  type: 'linear', // 'linear' | 'radial'
  angle: 135,
  color1: '#A8EDEA',
  color2: '#FED6E3',
  color3: ''
})

let isInternalGradUpdate = false

function extractColorsFromGradient(gradStr) {
  const colors = []
  if (!gradStr || typeof gradStr !== 'string') return colors
  const hexes = gradStr.match(/#(?:[0-9a-fA-F]{3,8})/g)
  if (hexes && hexes.length) {
    hexes.forEach(h => {
      if (h.length === 4) {
        colors.push('#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3])
      } else {
        colors.push(h.slice(0, 7))
      }
    })
  } else {
    const rgbRegex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi
    let match
    while ((match = rgbRegex.exec(gradStr)) !== null) {
      const hex = '#' + [match[1], match[2], match[3]].map(x => {
        const h = parseInt(x, 10).toString(16)
        return h.length === 1 ? '0' + h : h
      }).join('')
      colors.push(hex)
    }
  }
  return colors
}

function parseGradientToCustom(gradStr) {
  if (!gradStr || typeof gradStr !== 'string') return
  const isRadial = /radial-gradient/i.test(gradStr)
  let angle = 135
  if (!isRadial) {
    const angleMatch = gradStr.match(/(\d+)deg/i)
    if (angleMatch) {
      angle = parseInt(angleMatch[1], 10)
    } else if (/to\s+bottom/i.test(gradStr)) {
      angle = 180
    } else if (/to\s+right/i.test(gradStr)) {
      angle = 90
    } else if (/to\s+top/i.test(gradStr)) {
      angle = 0
    } else if (/to\s+left/i.test(gradStr)) {
      angle = 270
    }
  }

  const colors = extractColorsFromGradient(gradStr)
  let c1 = colors[0] || '#A8EDEA'
  let c2 = colors.length > 1 ? colors[colors.length - 1] : '#FED6E3'
  let c3 = colors.length > 2 ? colors[1] : ''

  customGradient.value = {
    type: isRadial ? 'radial' : 'linear',
    angle,
    color1: c1,
    color2: c2,
    color3: c3
  }
}

function updateCustomGradient(triggerSave = true) {
  const g = customGradient.value
  let gradStr = ''
  if (g.type === 'radial') {
    gradStr = g.color3
      ? `radial-gradient(circle at center, ${g.color1} 0%, ${g.color3} 55%, ${g.color2} 100%)`
      : `radial-gradient(circle at center, ${g.color1} 0%, ${g.color2} 100%)`
  } else {
    gradStr = g.color3
      ? `linear-gradient(${g.angle}deg, ${g.color1} 0%, ${g.color3} 55%, ${g.color2} 100%)`
      : `linear-gradient(${g.angle}deg, ${g.color1} 0%, ${g.color2} 100%)`
  }
  isInternalGradUpdate = true
  frameBg.value.type = 'gradient'
  frameBg.value.value = gradStr
  frameBg.value.baseColor = g.color1
  nextTick(() => {
    isInternalGradUpdate = false
  })
  if (triggerSave) {
    debounceTextHistory()
  }
}

function setGradientAngle(angle) {
  customGradient.value.type = 'linear'
  customGradient.value.angle = angle
  updateCustomGradient(true)
}

function setGradientType(type) {
  customGradient.value.type = type
  updateCustomGradient(true)
}

function swapGradientColors() {
  const tmp = customGradient.value.color1
  customGradient.value.color1 = customGradient.value.color2
  customGradient.value.color2 = tmp
  updateCustomGradient(true)
}

function addGradientStop() {
  if (!customGradient.value.color3) {
    customGradient.value.color3 = '#FFE57F'
    updateCustomGradient(true)
  }
}

function removeGradientStop() {
  customGradient.value.color3 = ''
  updateCustomGradient(true)
}

function switchToGradientMode() {
  if (frameBg.value.type !== 'gradient') {
    const base = frameBg.value.baseColor || '#A8EDEA'
    customGradient.value.color1 = base
    if (!customGradient.value.color2 || customGradient.value.color2 === base) {
      customGradient.value.color2 = '#FED6E3'
    }
    updateCustomGradient(true)
  }
}

function switchToColorMode() {
  frameBg.value.type = 'color'
  const solid = frameBg.value.baseColor || customGradient.value.color1 || '#FFFFFF'
  frameBg.value.value = solid
  frameBg.value.baseColor = solid
  selectedBgColor.value = solid
  saveHistoryState()
}

watch(
  () => [frameBg.value.type, frameBg.value.value],
  ([type, val]) => {
    if (type === 'gradient' && val && !isInternalGradUpdate) {
      parseGradientToCustom(val)
    }
  },
  { immediate: true }
)

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
  parseGradientToCustom(val)
  saveHistoryState()
}

function setFrameTexture(id) {
  if (frameBg.value.texture === id) {
    frameBg.value.texture = null
  } else {
    frameBg.value.texture = id
  }
  saveHistoryState()
}

function clearFrameTexture() {
  frameBg.value.texture = null
  saveHistoryState()
}

function resetFrameBackground() {
  selectedBgColor.value = '#FFFFFF'
  frameBg.value = {
    type: 'color',
    value: '#FFFFFF',
    baseColor: '#FFFFFF',
    texture: null,
    opacity: 0.85,
    blendMode: 'multiply',
    scale: 1
  }
  customGradient.value = {
    type: 'linear',
    color1: '#FFFFFF',
    color2: '#F1F5F9',
    color3: '',
    angle: 180
  }
  activeBgTab.value = 'colors'
  saveHistoryState()
  notify('Background reset to clean white')
}

function getFrameStyle() {
  const isGradient = frameBg.value.type === 'gradient'
  const baseBg = isGradient ? frameBg.value.value : (frameBg.value.baseColor || selectedBgColor.value)
  const aspect = currentLayoutDef.value.aspect
  const frameHeight = Math.round(280 / aspect)

  const baseStyle = {
    width: '280px',
    height: frameHeight + 'px',
    minHeight: frameHeight + 'px',
    aspectRatio: String(aspect),
    border: 'none',
    position: 'relative'
  }

  if (frameBg.value.type === 'image' && frameBg.value.value) {
    return {
      ...baseStyle,
      backgroundImage: `url(${frameBg.value.value})`,
      backgroundPosition: 'center',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundColor: frameBg.value.baseColor || '#ffffff',
    }
  }
  return {
    ...baseStyle,
    background: baseBg,
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
  const defaultWidth = preset.width || 200
  const defaultHeight = preset.height || 40
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
    curveAmount: preset.curveAmount || 0,
    width: defaultWidth,
    height: defaultHeight,
    x: Math.round((280 - defaultWidth) / 2),
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

  if (event.type === 'mousedown' || event.type === 'touchstart') {
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
  const isTouch = Boolean(event.touches && event.touches.length > 0)
  if (!isTouch && event.button !== 0) return
  if (event.cancelable) event.preventDefault()

  if (event.altKey) {
    duplicateSelectedElements()
  }

  isDragging.value = true
  hasDragged.value = false
  dragTarget.value = el
  const frameW = stripRef.value?.offsetWidth || 280
  const frameH = stripRef.value?.offsetHeight || 556

  const clientX = isTouch ? event.touches[0].clientX : event.clientX
  const clientY = isTouch ? event.touches[0].clientY : event.clientY

  const selectedItems = canvasElements.value.filter(item => selectedElementIds.value.includes(item.id))
  dragData.value = {
    startX: clientX,
    startY: clientY,
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
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
}

function onTouchMove(event) {
  if (!event.touches || event.touches.length === 0) return
  if (event.cancelable) event.preventDefault()
  onMouseMove({
    clientX: event.touches[0].clientX,
    clientY: event.touches[0].clientY
  })
}

function onTouchEnd() {
  onMouseUp()
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
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
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

  if (el.type === 'sticker' || el.type === 'text' || el.type === 'image') {
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
  notify(`Grouped ${selectedElementIds.value.length} elements (${shortcuts.group})`)
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
  notify(`Ungrouped ${count} elements (${shortcuts.ungroup})`)
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

function flipElementH(el = activeSelectedElement.value) {
  if (!el || el.isLocked) return
  el.flipX = !el.flipX
  saveHistoryState()
}

function flipElementV(el = activeSelectedElement.value) {
  if (!el || el.isLocked) return
  el.flipY = !el.flipY
  saveHistoryState()
}

function alignElementCenterH(el = activeSelectedElement.value) {
  if (!el || el.isLocked) return
  const frameWidth = stripRef.value?.offsetWidth || 280
  const dom = stripRef.value?.querySelector(`[data-element-id="${el.id}"]`)
  const elW = el.width || dom?.offsetWidth || (el.type === 'text' ? 200 : 60)
  el.x = Math.max(0, Math.round((frameWidth - elW) / 2))
  saveHistoryState()
}

function alignElementCenterV(el = activeSelectedElement.value) {
  if (!el || el.isLocked) return
  const aspect = currentLayoutDef.value?.aspect || (3 / 10)
  const frameHeight = stripRef.value?.offsetHeight || Math.round(280 / aspect)
  const dom = stripRef.value?.querySelector(`[data-element-id="${el.id}"]`)
  const elH = el.height || dom?.offsetHeight || (el.type === 'text' ? 40 : 60)
  el.y = Math.max(0, Math.round((frameHeight - elH) / 2))
  saveHistoryState()
}

function handleToggleRulers() {
  toggleRulers()
  notify(showRulers.value ? 'Rulers & Guides shown' : 'Rulers & Guides hidden')
}

function lockAllElements() {
  canvasElements.value.forEach(el => { el.isLocked = true })
  saveHistoryState()
  notify('All elements locked')
}

function unlockAllElements() {
  canvasElements.value.forEach(el => { el.isLocked = false })
  saveHistoryState()
  notify('All elements unlocked')
}

// Responsive breakpoint tracking: lg is 992px in Bootstrap 5
const isScreenLg = ref(typeof window !== 'undefined' ? window.innerWidth >= 992 : true)
const isTextCurveOpen = ref(false)
const isElementTransformOpen = ref(false)

function updateScreenSize() {
  isScreenLg.value = window.innerWidth >= 992
}

function getElementDisplayName(el) {
  if (!el) return 'Element'
  if (el.name) return el.name
  if (el.type === 'sticker') return `${el.content || 'Sticker'} Sticker`
  if (el.type === 'tape') return `${el.color || 'Colored'} Washi Tape`
  if (el.type === 'text') return el.text ? `"${el.text.slice(0, 14)}..."` : 'Text'
  if (el.type === 'shape') return 'Cute Shape'
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
  if (el.curveAmount === undefined) el.curveAmount = 0
  if (!el.width && el.type === 'text') el.width = 200
  if (!el.height && el.type === 'text') el.height = 40
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
  if (!activeTextElement.value.width) {
    activeTextElement.value.width = 200
  }
  activeTextElement.value.textAlign = align
  debounceTextHistory()
}

function setTextColor(color) {
  if (!activeTextElement.value) return
  activeTextElement.value.color = color
  debounceTextHistory()
}

function toggleCurvature(enable) {
  if (!activeTextElement.value) return
  activeTextElement.value.curveAmount = enable ? 45 : 0
  debounceTextHistory()
}

function getTextStyle(el) {
  if (!el) return {}
  return {
    fontFamily: el.fontFamily || "'Montserrat', sans-serif",
    fontSize: (el.fontSize || 22) + 'px',
    fontWeight: el.fontWeight || 'normal',
    fontStyle: el.fontStyle || 'normal',
    textDecoration: el.textDecoration || 'none',
    textTransform: el.textTransform || 'none',
    textAlign: el.textAlign || 'center',
    letterSpacing: (el.letterSpacing || 0) + 'px',
    lineHeight: el.lineHeight || 1.2,
    color: el.color || '#0F172A',
    width: '100%',
    display: 'block'
  }
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
  selectedElementIds.value = [el.id]
  isPositionPopoverOpen.value = false
  if (typeof window !== 'undefined' && window.innerWidth < 992) {
    activeTool.value = 'text'
    isDrawerOpen.value = true
  }
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
// 16. User Media Uploads System (IndexedDB)
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
    const cleanItem = JSON.parse(JSON.stringify(item))
    const db = await openUploadsDB()
    if (!db) {
      const cached = localStorage.getItem('blue_studios_uploads')
      const arr = cached ? JSON.parse(cached) : []
      arr.unshift(cleanItem)
      localStorage.setItem('blue_studios_uploads', JSON.stringify(arr.slice(0, 15)))
      return
    }
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(cleanItem)
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

const ALLOWED_UPLOAD_EXTS = ['.png', '.jpg', '.jpeg', '.svg']
const ALLOWED_UPLOAD_MIMES = ['image/png', 'image/jpeg', 'image/svg+xml']
const isInternalDragging = ref(false)

function isAllowedUploadFile(file) {
  if (!file) return false
  const name = (file.name || '').toLowerCase()
  const matchesExt = ALLOWED_UPLOAD_EXTS.some(ext => name.endsWith(ext))
  const matchesMime = ALLOWED_UPLOAD_MIMES.includes(file.type)
  return matchesExt || matchesMime
}

async function handleFileUpload(event) {
  const files = event?.target?.files
  if (!files || files.length === 0) return
  await processUploadedFiles(Array.from(files))
  if (uploadInputRef.value) uploadInputRef.value.value = ''
}

function onDropzoneDragOver(event) {
  if (isInternalDragging.value) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    return
  }
  event.preventDefault()
}

async function handleFileUploadDrop(event) {
  event.preventDefault()

  // Prevent re-uploading/duplicating an already existing asset dragged from the drawer
  if (isInternalDragging.value) {
    isInternalDragging.value = false
    return
  }

  if (event.dataTransfer) {
    const types = Array.from(event.dataTransfer.types || [])
    if (types.includes('application/x-blue-asset') || types.includes('application/json')) {
      return
    }
  }

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  await processUploadedFiles(Array.from(files))
}

async function processUploadedFiles(files) {
  if (!files || files.length === 0) return

  const validFiles = files.filter(isAllowedUploadFile)
  const rejectedCount = files.length - validFiles.length

  if (validFiles.length === 0) {
    notify('Only PNG, JPG, and SVG files are supported.')
    return
  }

  isUploading.value = true
  let addedCount = 0
  let duplicateCount = 0

  for (const file of validFiles) {
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
    const reader = new FileReader()

    await new Promise(resolve => {
      if (isSvg) {
        reader.onload = async e => {
          const svgContent = e.target.result
          const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgContent)

          // Deduplicate: check if this SVG is already in userUploads
          const isDuplicate = userUploads.value.some(u =>
            u.isSvg && (u.svgContent === svgContent || (u.name === fileNameWithoutExt && u.size === file.size))
          )

          if (isDuplicate) {
            duplicateCount++
            resolve()
            return
          }

          const newUpload = {
            id: 'upl-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            name: fileNameWithoutExt,
            type: 'svg',
            isSvg: true,
            svgContent: svgContent,
            dataUrl: dataUrl,
            size: file.size,
            createdAt: Date.now()
          }
          userUploads.value.unshift(newUpload)
          await saveUploadToDB(newUpload)
          addedCount++
          resolve()
        }
        reader.readAsText(file)
      } else {
        reader.onload = async e => {
          const dataUrl = e.target.result

          // Deduplicate: check if this raster image is already in userUploads
          const isDuplicate = userUploads.value.some(u =>
            !u.isSvg && (u.dataUrl === dataUrl || (u.name === fileNameWithoutExt && u.size === file.size))
          )

          if (isDuplicate) {
            duplicateCount++
            resolve()
            return
          }

          const newUpload = {
            id: 'upl-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            name: fileNameWithoutExt,
            type: 'image',
            isSvg: false,
            dataUrl: dataUrl,
            size: file.size,
            createdAt: Date.now()
          }
          userUploads.value.unshift(newUpload)
          await saveUploadToDB(newUpload)
          addedCount++
          resolve()
        }
        reader.readAsDataURL(file)
      }
    })
  }
  isUploading.value = false

  if (duplicateCount > 0 && addedCount === 0) {
    notify(`Asset${duplicateCount > 1 ? 's' : ''} already in your uploads!`)
  } else if (rejectedCount > 0) {
    notify(`Uploaded ${addedCount} file${addedCount > 1 ? 's' : ''} (${rejectedCount} unsupported skipped)`)
  } else if (addedCount > 0) {
    notify(`Uploaded ${addedCount} file${addedCount > 1 ? 's' : ''}!`)
  }
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
  isInternalDragging.value = true
  if (event && event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(item))
    event.dataTransfer.setData('application/x-blue-asset', item.id || 'true')
    event.dataTransfer.effectAllowed = 'copy'
  }
}

function onAssetDragEnd() {
  isInternalDragging.value = false
}

async function onCanvasDrop(event) {
  event.preventDefault()

  // 1. Internal drawer asset drag (Prioritize internal drag to avoid synthetic file creation)
  const rawData = event.dataTransfer?.getData('application/json')
  if (rawData) {
    try {
      const item = JSON.parse(rawData)
      if (item && (item.id || item.svgContent || item.dataUrl)) {
        isInternalDragging.value = false
        if (!stripRef.value) return
        const rect = stripRef.value.getBoundingClientRect()
        const dropX = Math.round((event.clientX - rect.left) / canvasScale.value - 40)
        const dropY = Math.round((event.clientY - rect.top) / canvasScale.value - 40)
        addUploadToCanvas(item, dropX, dropY)
        return
      }
    } catch (err) {
      console.warn('Canvas drop parse error:', err)
    }
  }

  // 2. Files dropped from computer desktop / file browser
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
}

// =============================================================================
// 18. Saved Frames Storage, Account/Cloud Sync & Editable PNG Export
// =============================================================================

// Make a PNG Blob no taller/wider than maxSide pixels (under 2 MB for Firebase Storage)
async function shrinkPng(blob, maxSide = 1400) {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Where each photo slot is, in percent of the strip, so Germaine's Pick page can place photos without the editor
function measureSlots(stripEl) {
  if (!stripEl) return []
  const box = stripEl.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return []
  return Array.from(stripEl.querySelectorAll('.cutout-slot')).map((el) => {
    const r = el.getBoundingClientRect()
    return {
      x: ((r.left - box.left) / box.width) * 100,
      y: ((r.top - box.top) / box.height) * 100,
      w: (r.width / box.width) * 100,
      h: (r.height / box.height) * 100,
    }
  })
}

function toggleCategory(id) {
  if (chosenCategories.value.includes(id)) {
    if (chosenCategories.value.length > 1) {
      chosenCategories.value = chosenCategories.value.filter((other) => other !== id)
    }
  } else if (chosenCategories.value.length < MAX_CATEGORIES) {
    chosenCategories.value = chosenCategories.value.concat(id)
  }
}

function getNextDefaultTemplateName() {
  let highestNum = 0
  const sources = [
    ...(allUserTemplates.value || []),
    ...(savedFramesList.value || []),
    ...(userCloudTemplates.value || [])
  ]

  for (const item of sources) {
    const name = (item.name || item.templateName || '').trim()
    const match = name.match(/^my-templates-(\d+)$/i) || name.match(/^my-template-(\d+)$/i)
    if (match) {
      const num = parseInt(match[1], 10)
      if (!isNaN(num) && num > highestNum) {
        highestNum = num
      }
    }
  }

  return `my-templates-${highestNum + 1}`
}

function saveFrame() {
  if (!isAccount.value) {
    router.push('/login?redirect=' + encodeURIComponent(route.fullPath))
    return
  }
  cloudErrorMessage.value = ''

  // If first time saving (no cloudId yet, or not owner of loaded template),
  // prompt user with "Save Frame As" dialog so they can name their frame
  if (!cloudId.value || !isOwner.value) {
    if (!templateName.value || templateName.value.trim() === '' || templateName.value === 'Untitled frame' || templateName.value === 'Retro 4-cut') {
      templateName.value = getNextDefaultTemplateName()
    }
    isSaveModalOpen.value = true
    return
  }

  // If already saved to cloud and owned by user:
  // Open save modal and save, which triggers the loading animation -> success animation -> redirect
  isSaveModalOpen.value = true
  executeSave({ asCopy: false, redirectOnSuccess: true })
}

async function executeSave({ asCopy = false, redirectOnSuccess = true } = {}) {
  if (isSavingFrame.value || !stripRef.value) return
  if (!isAccount.value) {
    isSaveModalOpen.value = false
    router.push('/login?redirect=' + encodeURIComponent(route.fullPath))
    return
  }
  isSavingFrame.value = true
  isSaveSuccess.value = false
  cloudErrorMessage.value = ''

  const prevSelected = [...selectedElementIds.value]
  const prevShowCutouts = showCutouts.value
  selectedElementIds.value = []

  // Ensure cutouts are visible during slot measurement for accurate coordinates
  showCutouts.value = true
  await nextTick()

  try {
    const frameId = currentSavedFrameId.value || `frame_${Date.now()}`
    currentSavedFrameId.value = frameId

    // Layout, slot rects and aspect ratio following stripData convention
    const layoutDef = currentLayoutDef.value
    const slotList = currentSlots.value.map((s) => ({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h
    }))
    const aspect = layoutDef.aspect

    const safeName = templateName.value.trim().slice(0, 40) || 'Untitled frame'
    const safeCategories = (chosenCategories.value && chosenCategories.value.length >= 1)
      ? chosenCategories.value
      : ['other']

    const isGradient = frameBg.value.type === 'gradient'
    const bgVal = isGradient ? frameBg.value.value : (frameBg.value.baseColor || selectedBgColor.value)

    const projectData = JSON.parse(JSON.stringify({
      id: frameId,
      templateName: safeName,
      updatedAt: Date.now(),
      version: 1,
      activeLayout: layoutDef.id,
      stripLayoutId: layoutDef.id,
      slotCount: Math.min(12, Math.max(1, slotCount.value || 4)),
      categories: safeCategories,
      slots: slotList,
      slotRects: slotList,
      aspect,
      shape: slotShape.value.toLowerCase(),
      slotShape: slotShape.value,
      background: bgVal,
      border: borderColor.value,
      caption: captionText.value,
      captionText: captionText.value,
      captionColor: captionColor.value,
      selectedBgColor: selectedBgColor.value,
      frameBg: frameBg.value,
      borderColor: borderColor.value,
      borderWidth: borderWidth.value,
      cutoutsLayerPosition: cutoutsLayerPosition.value,
      showCutouts: false,
      canvasElements: canvasElements.value,
      customGuides: customGuides.value
    }))

    const { blob, rawBlob, thumbnail } = await captureEditablePng(stripRef.value, projectData)

    // Save to user's account in Firebase (My Studio) if signed in as account
    if (isAccount.value) {
      let targetBlob = rawBlob
      if (!targetBlob) {
        try {
          targetBlob = await (await fetch(thumbnail)).blob()
        } catch (_) {
          targetBlob = blob
        }
      }
      const thumbnailBlob = await shrinkPng(targetBlob, 1400)

      // If user requested a copy or doesn't own original template, save without id to create new
      const targetCloudId = (asCopy || !isOwner.value) ? undefined : (cloudId.value || undefined)

      const savedId = await saveTemplate({
        id: targetCloudId,
        name: safeName,
        slotCount: Math.min(12, Math.max(1, slotCount.value || 4)),
        categories: safeCategories,
        thumbnail: thumbnailBlob,
        projectData: projectData
      })
      cloudId.value = savedId
      loadedTemplateOwnerId.value = getUid()
    }

    // Always update local IndexedDB record for offline / browser backup (isolated in try/catch)
    try {
      const record = {
        id: frameId,
        cloudId: cloudId.value,
        name: safeName,
        updatedAt: Date.now(),
        slotCount: slotCount.value,
        elementCount: canvasElements.value.length,
        thumbnail: thumbnail,
        projectData: projectData
      }
      await saveFrameToDB(record)
      savedFramesList.value = await loadSavedFramesFromDB()
    } catch (idbErr) {
      console.warn('Local IndexedDB backup skipped/failed:', idbErr)
    }

    if (!isAccount.value) {
      const filename = `${sanitizeFilename(safeName)}.png`
      triggerFileDownload(blob, filename)
    }

    isSavingFrame.value = false
    isSaveSuccess.value = true

    // If redirectOnSuccess: show success animation, then redirect back to My Studio
    if (redirectOnSuccess && isAccount.value) {
      await new Promise((resolve) => setTimeout(resolve, 1100))
      isSaveModalOpen.value = false
      isSaveSuccess.value = false
      router.push('/studio')
    }
  } catch (err) {
    console.error('Failed to save frame:', err)
    cloudErrorMessage.value = err.message || 'Failed to save frame. Please try again.'
    isSavingFrame.value = false
    isSaveSuccess.value = false
  } finally {
    selectedElementIds.value = prevSelected
    showCutouts.value = prevShowCutouts
  }
}

const allUserTemplates = computed(() => {
  const list = []
  const seenIds = new Set()

  // 1. Cloud templates from My Studio (newest first)
  for (const t of userCloudTemplates.value) {
    seenIds.add(t.id)
    list.push({
      id: t.id,
      cloudId: t.id,
      name: t.name || 'Untitled Template',
      slotCount: t.slotCount || 4,
      updatedAt: t.updatedAt || t.createdAt || Date.now(),
      cardUrl: t.cardUrl || null,
      thumbnailPath: t.thumbnailPath || null,
      dataPath: t.dataPath || null,
      thumbnail: null,
      isCloud: true,
      isLocal: false,
      categories: t.categories || [],
      ownerId: t.ownerId || null,
      raw: t
    })
  }

  // 2. Locally saved frames in IndexedDB
  for (const f of savedFramesList.value) {
    if (f.cloudId && seenIds.has(f.cloudId)) {
      const existing = list.find((item) => item.id === f.cloudId)
      if (existing) {
        if (!existing.thumbnail && f.thumbnail) existing.thumbnail = f.thumbnail
        if (!existing.projectData && f.projectData) existing.projectData = f.projectData
        existing.isLocal = true
      }
      continue
    }
    if (seenIds.has(f.id)) continue
    seenIds.add(f.id)

    list.push({
      id: f.id,
      cloudId: f.cloudId || null,
      name: f.name || 'Untitled Frame',
      slotCount: f.slotCount || 4,
      updatedAt: f.updatedAt || Date.now(),
      cardUrl: null,
      thumbnailPath: null,
      thumbnail: f.thumbnail || null,
      isCloud: !!f.cloudId,
      isLocal: true,
      projectData: f.projectData || null,
      raw: f
    })
  }

  return list
})

const allUserTemplatesCount = computed(() => allUserTemplates.value.length)

async function loadAllUserTemplates() {
  isLoadingUserTemplates.value = true
  try {
    const localFrames = await loadSavedFramesFromDB()
    savedFramesList.value = localFrames || []

    if (isAccount.value) {
      try {
        const cloudItems = await listMyItems('templates')
        userCloudTemplates.value = cloudItems || []
      } catch (err) {
        console.warn('Could not load user cloud templates:', err)
        userCloudTemplates.value = []
      }
    } else {
      userCloudTemplates.value = []
    }
  } catch (err) {
    console.error('Failed to load user templates:', err)
  } finally {
    isLoadingUserTemplates.value = false
  }
}

function openMyTemplatesDrawer() {
  isMyTemplatesDrawerOpen.value = true
  loadAllUserTemplates()
}

function closeMyTemplatesDrawer() {
  isMyTemplatesDrawerOpen.value = false
}

function promptSwitchTemplate(template) {
  if (!template) return
  const isActive = (
    (cloudId.value && (cloudId.value === template.id || cloudId.value === template.cloudId)) ||
    (currentSavedFrameId.value && currentSavedFrameId.value === template.id)
  )
  if (isActive) {
    notify(`"${template.name}" is already open in your editor.`)
    return
  }

  pendingSwitchTemplate.value = template
  isSwitchPromptOpen.value = true
}

async function confirmSaveAndSwitch() {
  if (!pendingSwitchTemplate.value) return
  const target = pendingSwitchTemplate.value
  isSwitchingWorkspace.value = true

  try {
    // Save current frame without leaving the editor
    await executeSave({ redirectOnSuccess: false })
  } catch (err) {
    console.error('Error saving current frame prior to template switch:', err)
  }

  isSwitchPromptOpen.value = false
  await loadTemplateWorkspace(target)
  isSwitchingWorkspace.value = false
}

async function confirmSwitchWithoutSaving() {
  if (!pendingSwitchTemplate.value) return
  const target = pendingSwitchTemplate.value
  isSwitchingWorkspace.value = true
  isSwitchPromptOpen.value = false
  await loadTemplateWorkspace(target)
  isSwitchingWorkspace.value = false
}

async function loadTemplateWorkspace(targetTemplate) {
  if (!targetTemplate) return
  isWorkspaceLoading.value = true
  workspaceLoadingMessage.value = `Loading "${targetTemplate.name || 'template'}"...`
  try {
    notify(`Loading "${targetTemplate.name}"...`)
    let project = targetTemplate.projectData

    if (!project && targetTemplate.dataPath) {
      project = await loadTemplateProject(targetTemplate.raw || targetTemplate)
    }

    if (!project && targetTemplate.id) {
      const localFrames = await loadSavedFramesFromDB()
      const match = (localFrames || []).find((f) => f.id === targetTemplate.id || f.cloudId === targetTemplate.id)
      if (match?.projectData) {
        project = match.projectData
      }
    }

    if (!project) {
      const cloudItem = await getItem('templates', targetTemplate.id)
      if (cloudItem) {
        project = await loadTemplateProject(cloudItem)
      }
    }

    if (project) {
      applySnapshot(project)
      templateName.value = targetTemplate.name || project.templateName || 'Untitled frame'
      currentSavedFrameId.value = targetTemplate.id || project.id
      cloudId.value = targetTemplate.cloudId || (targetTemplate.isCloud ? targetTemplate.id : null)
      loadedTemplateOwnerId.value = targetTemplate.ownerId || (targetTemplate.isCloud ? getUid() : null)

      if (targetTemplate.categories && targetTemplate.categories.length) {
        chosenCategories.value = [...targetTemplate.categories]
      }

      history.value = [JSON.stringify(project)]
      historyIndex.value = 0

      // Update URL query param so it redirects to the new workspace route
      const targetQueryId = targetTemplate.cloudId || targetTemplate.id
      router.replace({ path: '/frame-editor', query: { template: targetQueryId } })

      await nextTick()
      triggerFitToScreen()
      await new Promise((r) => setTimeout(r, 120))
      isMyTemplatesDrawerOpen.value = false
      pendingSwitchTemplate.value = null
      notify(`Loaded "${targetTemplate.name}"!`)
    } else {
      notify('Could not load template data.')
    }
  } catch (err) {
    console.error('Error switching to template workspace:', err)
    notify('Failed to load template')
  } finally {
    isWorkspaceLoading.value = false
  }
}

async function deleteUserTemplate(template) {
  if (!template) return false
  const name = template.name || 'this template'
  const sure = await askConfirm({
    title: `Delete "${name}"?`,
    message: 'This cannot be undone. This template will be permanently removed.',
    confirmLabel: 'Delete',
    danger: true,
    icon: 'trash'
  })
  if (!sure) return false

  try {
    const targetCloudId = template.cloudId || (template.isCloud ? template.id : null)

    // 1. Delete from Firestore & Cloud Storage if cloud item
    if (targetCloudId) {
      try {
        await deleteItem({
          type: 'templates',
          id: targetCloudId,
          thumbnailPath: template.thumbnailPath || template.raw?.thumbnailPath,
          dataPath: template.dataPath || template.raw?.dataPath,
          cardPath: template.cardPath || template.raw?.cardPath
        })
      } catch (cloudErr) {
        console.warn('Cloud delete error (may be local-only or already removed):', cloudErr)
      }
      userCloudTemplates.value = userCloudTemplates.value.filter(
        (t) => t.id !== targetCloudId && t.id !== template.id
      )
    }

    // 2. Delete from local IndexedDB & LocalStorage
    const localMatches = savedFramesList.value.filter(
      (f) => f.id === template.id || (targetCloudId && f.cloudId === targetCloudId)
    )
    for (const match of localMatches) {
      await deleteSavedFrameFromDB(match.id)
    }
    await deleteSavedFrameFromDB(template.id)
    savedFramesList.value = savedFramesList.value.filter(
      (f) => f.id !== template.id && (!targetCloudId || f.cloudId !== targetCloudId)
    )

    // 3. If currently open template was deleted, reset workspace state & URL
    if (
      currentSavedFrameId.value === template.id ||
      cloudId.value === template.id ||
      (targetCloudId && cloudId.value === targetCloudId)
    ) {
      cloudId.value = null
      loadedTemplateOwnerId.value = null
      currentSavedFrameId.value = null
      templateName.value = getNextDefaultTemplateName()
      router.replace({ path: '/frame-editor' })
    }

    notify(`Deleted "${name}"`)
    return true
  } catch (err) {
    console.error('Failed to delete template:', err)
    notify('Could not delete template')
    return false
  }
}

async function startNewBlankFrame() {
  cloudId.value = null
  loadedTemplateOwnerId.value = null
  currentSavedFrameId.value = null
  templateName.value = getNextDefaultTemplateName()
  chosenCategories.value = ['other']
  canvasElements.value = []
  selectedElementIds.value = []
  router.replace({ path: '/frame-editor' })
  saveHistoryState()
  nextTick(() => {
    triggerFitToScreen()
  })
  isMyTemplatesDrawerOpen.value = false
  isSwitchPromptOpen.value = false
  pendingSwitchTemplate.value = null
  notify('Started new blank frame')
}

function openSavedFrame(frameRecord) {
  if (!frameRecord || !frameRecord.projectData) return
  isWorkspaceLoading.value = true
  workspaceLoadingMessage.value = `Opening "${frameRecord.name || 'template'}"...`
  try {
    applySnapshot(frameRecord.projectData)
    currentSavedFrameId.value = frameRecord.id
    if (frameRecord.cloudId) {
      cloudId.value = frameRecord.cloudId
    }
    templateName.value = frameRecord.name || templateName.value
    history.value = [JSON.stringify(frameRecord.projectData)]
    historyIndex.value = 0
    isSavedFramesModalOpen.value = false
    nextTick(() => {
      triggerFitToScreen()
      setTimeout(() => {
        isWorkspaceLoading.value = false
      }, 100)
    })
    notify(`Loaded "${frameRecord.name || 'Template'}"!`)
  } catch (err) {
    console.error('Failed to open saved frame:', err)
    isWorkspaceLoading.value = false
  }
}

async function loadTemplateFromQuery(templateId) {
  if (!templateId) return
  isWorkspaceLoading.value = true
  workspaceLoadingMessage.value = 'Loading saved template...'
  try {
    let projectData = null
    let template = null

    // Try cloud first if logged in
    try {
      template = await getItem('templates', templateId)
      if (template) {
        projectData = await loadTemplateProject(template)
      }
    } catch (err) {
      console.warn('Could not load from cloud, checking local storage:', err)
    }

    // Fallback to local IndexedDB
    if (!projectData) {
      const localFrames = await loadSavedFramesFromDB()
      const localMatch = (localFrames || []).find((f) => f.id === templateId || f.cloudId === templateId)
      if (localMatch && localMatch.projectData) {
        projectData = localMatch.projectData
        template = { name: localMatch.name, id: localMatch.cloudId || localMatch.id }
      }
    }

    if (projectData) {
      applySnapshot(projectData)
      if (template?.name) templateName.value = template.name
      if (template?.categories && template.categories.length) {
        chosenCategories.value = [...template.categories]
      }
      loadedTemplateOwnerId.value = template?.ownerId || getUid()
      if (template?.ownerId === getUid() || !template?.ownerId) {
        cloudId.value = template.id
      } else {
        cloudId.value = null // Different owner -> save will create user's own copy
      }
      currentSavedFrameId.value = projectData.id || templateId
      history.value = [JSON.stringify(projectData)]
      historyIndex.value = 0
      await nextTick()
      triggerFitToScreen()
      await new Promise((r) => setTimeout(r, 120))
      notify(`Loaded template "${template?.name || templateName.value}"!`)
    } else {
      notify('Template not found or private.')
    }
  } catch (err) {
    console.error('Error loading template from cloud:', err)
    notify('Could not load template from cloud.')
  } finally {
    isWorkspaceLoading.value = false
  }
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

async function confirmDeleteFrame(frame) {
  if (!frame) return
  const sure = await askConfirm({
    title: `Delete "${frame.name || 'this template'}"?`,
    message: 'This will remove the template from your saved browser frames.',
    confirmLabel: 'Delete',
    danger: true,
    icon: 'trash'
  })
  if (sure) {
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
    const isDifferent = currentSavedFrameId.value !== frameRecord.id
    if (isDifferent) {
      applySnapshot(project)
      currentSavedFrameId.value = frameRecord.id
    }
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
    if (!project || (!project.canvasElements && !project.templateName && !project.frameBg)) {
      notify('File does not contain valid frame or image data')
      return
    }

    // Generate or preserve thumbnail
    let thumbnail = project.thumbnail || null
    if (!thumbnail && (file.type?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name))) {
      try {
        thumbnail = await readFileAsDataUrl(file)
      } catch (_) {}
    }

    const frameId = project.id || `frame_${Date.now()}`
    const cleanProject = JSON.parse(JSON.stringify({ ...project, showCutouts: false }))
    const record = {
      id: frameId,
      name: project.templateName || file.name.replace(/\.[^/.]+$/, ''),
      updatedAt: Date.now(),
      slotCount: project.slotCount || slotCount.value || 4,
      elementCount: project.canvasElements ? project.canvasElements.length : 0,
      thumbnail: thumbnail,
      projectData: cleanProject
    }
    try {
      await saveFrameToDB(record)
      savedFramesList.value = await loadSavedFramesFromDB()
    } catch (idbErr) {
      console.warn('Local save failed during import:', idbErr)
    }
    applySnapshot(record.projectData)
    currentSavedFrameId.value = frameId
    isSavedFramesModalOpen.value = false
    nextTick(() => {
      triggerFitToScreen()
    })
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
      event.target.closest('.text-curve-wrapper') ||
      event.target.closest('.element-transform-wrapper') ||
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
  isTextCurveOpen.value = false
  isElementTransformOpen.value = false
  isPositionPopoverOpen.value = false
  isVectorColorPickerOpen.value = false
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

  // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows)
  if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault()
    if (historyIndex.value > 0) {
      undo()
    }
    return
  }

  // Redo: Cmd+Shift+Z or Cmd+Y (Mac), Ctrl+Y or Ctrl+Shift+Z (Windows)
  if (
    isCmdOrCtrl &&
    ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')
  ) {
    e.preventDefault()
    if (historyIndex.value < history.value.length - 1) {
      redo()
    }
    return
  }

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
  window.addEventListener('resize', updateScreenSize)
  updateScreenSize()

  if (typeof window !== 'undefined' && window.innerWidth < 992) {
    isDrawerOpen.value = false
    isMobileEditSheetOpen.value = false
  } else {
    activeTool.value = 'templates'
    isDrawerOpen.value = true
  }

  nextTick(() => {
    fitToScreen(canvasWorkspaceRef.value, stripRef.value)
  })

  const templateToLoad = route?.query?.template || initialTemplateParam

  if (templateToLoad) {
    isWorkspaceLoading.value = true
    workspaceLoadingMessage.value = 'Loading saved template...'

    // Prioritize loading the target template, running uploads & saved frames loads in parallel
    await Promise.all([
      loadTemplateFromQuery(templateToLoad),
      (async () => {
        try {
          const [stored, frames] = await Promise.all([
            loadUploadsFromDB(),
            loadSavedFramesFromDB()
          ])
          if (stored && stored.length > 0) userUploads.value = stored
          if (frames && frames.length > 0) savedFramesList.value = frames
          await loadAllUserTemplates()
        } catch (bgErr) {
          console.warn('Background data preload error:', bgErr)
        }
      })()
    ])
  } else {
    const stored = await loadUploadsFromDB()
    if (stored && stored.length > 0) {
      userUploads.value = stored
    }

    const frames = await loadSavedFramesFromDB()
    if (frames && frames.length > 0) {
      savedFramesList.value = frames
    }

    // Load all user templates (cloud + local) for My Templates drawer & counter
    await loadAllUserTemplates()

    // If opening fresh without a loaded template, ensure frame title reflects the next sequence
    if (!cloudId.value && !currentSavedFrameId.value) {
      if (!templateName.value || templateName.value === 'Retro 4-cut' || templateName.value === 'my-templates-1') {
        templateName.value = getNextDefaultTemplateName()
      }
    }
  }
})

watch(() => route.query.template, async (newId) => {
  if (newId && newId !== cloudId.value) {
    await loadTemplateFromQuery(newId)
  }
})

onBeforeUnmount(() => {
  if (refitRafId) cancelAnimationFrame(refitRafId)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('resize', updateScreenSize)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeUp)
  window.removeEventListener('mousemove', onRotateMove)
  window.removeEventListener('mouseup', onRotateUp)
})


  
    return {
    isWorkspaceLoading,
    workspaceLoadingMessage,
    templatePresets,
    elementCategories,
    textPresets,
    bgColors,
    bgGradients,
    bgTextures,
    bgPatterns,
    stripRef,
    canvasWorkspaceRef,
    uploadInputRef,
    captionInputRef,
    textInputRefs,
    route,
    router,
    user,
    isAccount,
    getUid,
    cloudId,
    loadedTemplateOwnerId,
    chosenCategories,
    isSaveModalOpen,
    cloudErrorMessage,
    isOwner,
    showNotification,
    notificationMessage,
    history,
    historyIndex,
    canvasScale,
    canvasPanX,
    canvasPanY,
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
    toggleRulers,
    activeGuides,
    activeDistanceBadges,
    initSnapTargets,
    computeSnapping,
    clearGuides,
    templateName,
    activeLayout,
    slotShape,
    activeTool,
    isDrawerOpen,
    isMobileEditSheetOpen,
    openMobileEditSheet,
    toggleMobileEditSheet,
    closeMobileSheets,
    showCutouts,
    cutoutsLayerPosition,
    activeBgTab,
    frameBg,
    selectedBgColor,
    borderColor,
    borderWidth,
    captionText,
    captionColor,
    isEditingCaption,
    canvasElements,
    selectedElementIds,
    editingGroupId,
    isDragging,
    hasDragged,
    dragTarget,
    dragData,
    isMarqueeActive,
    marqueeBoxStyle,
    isResizing,
    resizeTarget,
    resizeData,
    isRotating,
    rotateTarget,
    rotateCenter,
    rotateStartAngle,
    rotateInitialRotation,
    isCollectiveResizing,
    collectiveResizeData,
    isCollectiveRotating,
    collectiveRotateData,
    editingTextId,
    isFontDropdownOpen,
    fontSearchQuery,
    isTextColorPickerOpen,
    isTextSpacingOpen,
    activeVectorColorTarget,
    isVectorColorPickerOpen,
    isPositionPopoverOpen,
    isZoomMenuOpen,
    contextMenu,
    elementSearchQuery,
    selectedElementTag,
    userUploads,
    isUploading,
    isSavedFramesModalOpen,
    savedFramesList,
    isSavingFrame,
    isSaveSuccess,
    isMyTemplatesDrawerOpen,
    userCloudTemplates,
    isLoadingUserTemplates,
    allUserTemplates,
    allUserTemplatesCount,
    pendingSwitchTemplate,
    isSwitchPromptOpen,
    isSwitchingWorkspace,
    currentSavedFrameId,
    isExporting,
    exportConfig,
    customSlots,
    customGradient,
    isScreenLg,
    isTextCurveOpen,
    isElementTransformOpen,
    selectedElementId,
    currentLayoutDef,
    currentSlots,
    slotCount,
    activeSelectedElement,
    activeSelectedElements,
    activeTextElement,
    activeVectorElement,
    canGroupSelected,
    canUngroupSelected,
    reversedElements,
    collectiveBounds,
    filteredElementCategories,
    getLayoutSlots,
    getLayoutAspect,
    formatAspect,
    getMockPhoto,
    notify,
    saveHistoryState,
    undo,
    redo,
    applySnapshot,
    toggleDrawer,
    closeDrawer,
    triggerFitToScreen,
    refitDuringTransition,
    setLayout,
    setSlotShape,
    toggleCutouts,
    toggleCutoutsLayerPosition,
    applyTemplate,
    extractColorsFromGradient,
    parseGradientToCustom,
    updateCustomGradient,
    setGradientAngle,
    setGradientType,
    swapGradientColors,
    addGradientStop,
    removeGradientStop,
    switchToGradientMode,
    switchToColorMode,
    setFrameSolidColor,
    setFrameGradient,
    setFrameTexture,
    clearFrameTexture,
    resetFrameBackground,
    getFrameStyle,
    getFrameTextureStyle,
    incrementBorderWidth,
    decrementBorderWidth,
    onBorderWidthChange,
    addElement,
    addTextElement,
    selectElement,
    onElementDblClick,
    startDrag,
    onMouseMove,
    onMouseUp,
    startCollectiveDrag,
    onCollectiveDblClick,
    startCollectiveResize,
    onCollectiveResizeMove,
    onCollectiveResizeUp,
    startCollectiveRotate,
    onCollectiveRotateMove,
    onCollectiveRotateUp,
    startMarqueeSelection,
    onMarqueeMouseMove,
    onMarqueeMouseUp,
    startResize,
    onResizeMove,
    onResizeUp,
    startRotate,
    onRotateMove,
    onRotateUp,
    nudgeSelectedElements,
    selectAll,
    groupSelectedElements,
    ungroupSelectedElements,
    removeSelectedElement,
    removeSelectedElements,
    removeElementById,
    bringForward,
    bringToFront,
    sendBackward,
    sendToBack,
    bringToFrontSelected,
    sendToBackSelected,
    duplicateElement,
    duplicateSelectedElements,
    toggleLock,
    toggleHide,
    flipElementH,
    flipElementV,
    alignElementCenterH,
    alignElementCenterV,
    handleToggleRulers,
    lockAllElements,
    unlockAllElements,
    updateScreenSize,
    getElementDisplayName,
    selectLayer,
    togglePositionPopover,
    debounceTextHistory,
    hexToRgba,
    normalizeTextElement,
    selectFontFamily,
    getActiveFontDisplayName,
    stepFontSize,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    toggleStrikethrough,
    toggleUppercase,
    setTextAlign,
    setTextColor,
    toggleCurvature,
    getTextStyle,
    getCurvedSvgWidth,
    getCurvedSvgHeight,
    getCurvedPathD,
    setTextRef,
    startEditingText,
    finishEditingText,
    startEditingCaption,
    finishEditingCaption,
    extractSvgColors,
    isValidColor,
    normalizeHex,
    getVectorSwatches,
    openVectorColorPicker,
    setVectorColor,
    getVectorBarTitle,
    getRenderedSvg,
    getShapePathD,
    getTapePattern,
    openUploadsDB,
    loadUploadsFromDB,
    saveUploadToDB,
    deleteUploadFromDB,
    triggerFileUpload,
    handleFileUpload,
    handleFileUploadDrop,
    processUploadedFiles,
    deleteUpload,
    addUploadToCanvas,
    onAssetDragStart,
    onAssetDragEnd,
    onDropzoneDragOver,
    onCanvasDrop,
    shrinkPng,
    measureSlots,
    toggleCategory,
    saveFrame,
    executeSave,
    loadAllUserTemplates,
    openMyTemplatesDrawer,
    closeMyTemplatesDrawer,
    promptSwitchTemplate,
    confirmSaveAndSwitch,
    confirmSwitchWithoutSaving,
    loadTemplateWorkspace,
    deleteUserTemplate,
    startNewBlankFrame,
    getNextDefaultTemplateName,
    openSavedFrame,
    loadTemplateFromQuery,
    deleteFrame,
    confirmDeleteFrame,
    downloadSavedFrame,
    importFrameFromFile,
    onCanvasClick,
    onFrameClick,
    onWorkspaceMouseDown,
    onWorkspaceMouseMove,
    onWorkspaceMouseUp,
    onWorkspaceMouseLeave,
    onWorkspaceWheel,
    onStartDragGuideFromRuler,
    onStartMoveExistingGuide,
    openContextMenu,
    closeContextMenu,
    handleGlobalClick,
    onKeydown,
    onKeyup,
    CATEGORIES,
    MAX_CATEGORIES,
    categoryLabel,
    MOCK_PORTRAIT_PHOTOS,
    SVG_TEMPLATES,
    LAYOUTS,
    ELEMENT_TAG_FILTERS,
    FONT_CATEGORIES,
    getTextureBackgroundImage,
    getTextureBackgroundSize,
    isMac,
    shortcuts
  }



}

export function provideFrameEditor() {
  const editor = useFrameEditor()
  provide(FRAME_EDITOR_KEY, editor)
  provide("frameEditor", editor)
  provide("templateEditor", editor)
  return editor
}

export function useFrameEditorContext() {
  const context = inject(FRAME_EDITOR_KEY) || inject("frameEditor") || inject("templateEditor")
  if (!context) {
    throw new Error("useFrameEditorContext must be used within a frameEditor provider")
  }
  return context
}

// Backwards compatibility aliases
export const useTemplateEditor = useFrameEditor
export const provideTemplateEditor = provideFrameEditor
export const useTemplateEditorContext = useFrameEditorContext
