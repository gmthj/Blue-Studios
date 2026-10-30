import { ref, computed } from 'vue'

/**
 * Canva-Style Infinite Canvas Viewport Composable
 * Supports smooth Pan & Zoom, Spacebar-drag, trackpad pinch, mouse wheel,
 * fit-to-screen, and dynamic pixel rulers with draggable custom guides.
 */
export function useCanvasViewport() {
  // --- Viewport Transform State ---
  const scale = ref(1.0) // 1.0 = 100%
  const panX = ref(0)    // Translation in px
  const panY = ref(0)
  const isPanning = ref(false)
  const isSpacePressed = ref(false)
  const isMiddleMouseDown = ref(false)
  const isHandToolActive = ref(false)

  // Zoom Constraints
  const MIN_SCALE = 0.25  // 25%
  const MAX_SCALE = 5.0   // 500%
  const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0]

  // --- Rulers & Guides State ---
  const showRulers = ref(typeof window !== 'undefined' ? window.innerWidth >= 992 : true)
  // Custom user-dropped guides: Array of { id, type: 'horizontal' | 'vertical', pos: number }
  const customGuides = ref([])
  const activeHoverGuideId = ref(null)

  // Cursor tracking relative to photostrip frame (in canvas unscaled coordinates)
  const cursorInfo = ref({
    screenX: 0,
    screenY: 0,
    canvasX: 0, // X relative to frame (0 = left of frame)
    canvasY: 0  // Y relative to frame (0 = top of frame)
  })

  // Guide dragging state (dragging from ruler or moving existing guide)
  const isDraggingGuide = ref(false)
  const draggedGuide = ref(null) // { type: 'horizontal' | 'vertical', pos: number, isExisting: boolean, id?: number }

  let panStart = null

  // --- Zoom Methods ---
  function clampScale(s) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s))
  }

  /**
   * Set zoom centered at a specific screen coordinate (or workspace center)
   */
  function setZoom(newScale, centerPoint = null, workspaceEl = null) {
    const targetScale = clampScale(newScale)
    const oldScale = scale.value
    if (Math.abs(targetScale - oldScale) < 0.001) return

    let cx = 400
    let cy = 300

    if (centerPoint) {
      cx = centerPoint.x
      cy = centerPoint.y
    } else if (workspaceEl) {
      const rect = workspaceEl.getBoundingClientRect()
      cx = rect.width / 2
      cy = rect.height / 2
    }

    // Zoom-to-cursor math:
    // Keeps the point on the canvas directly under (cx, cy) stationary
    panX.value = Math.round(cx - (cx - panX.value) * (targetScale / oldScale))
    panY.value = Math.round(cy - (cy - panY.value) * (targetScale / oldScale))
    scale.value = targetScale
  }

  function zoomIn(workspaceEl = null) {
    const current = scale.value
    // Find next preset above current
    const next = ZOOM_PRESETS.find(p => p > current + 0.04) || MAX_SCALE
    setZoom(next, null, workspaceEl)
  }

  function zoomOut(workspaceEl = null) {
    const current = scale.value
    // Find next preset below current
    const reversed = [...ZOOM_PRESETS].reverse()
    const prev = reversed.find(p => p < current - 0.04) || MIN_SCALE
    setZoom(prev, null, workspaceEl)
  }

  /**
   * Fit photostrip to screen with comfortable margins
   */
  function fitToScreen(workspaceEl, frameEl) {
    const ws = (workspaceEl && workspaceEl.value !== undefined) ? workspaceEl.value : workspaceEl
    const frame = (frameEl && frameEl.value !== undefined) ? frameEl.value : frameEl
    if (!ws || !frame || typeof ws.getBoundingClientRect !== 'function') return
    const wsRect = ws.getBoundingClientRect()
    const frameW = frame.offsetWidth || 280
    const frameH = frame.offsetHeight || 556

    const isPhone = wsRect.width < 992
    const rulerOffset = (!isPhone && showRulers.value) ? 24 : 0
    const paddingH = isPhone ? 48 : (110 + rulerOffset)
    const paddingV = isPhone ? 88 : (100 + rulerOffset)

    const availW = Math.max(100, wsRect.width - paddingH)
    const availH = Math.max(100, wsRect.height - paddingV)

    const scaleW = availW / frameW
    const scaleH = availH / frameH
    const maxTarget = isPhone ? 0.80 : 0.95
    const target = Math.max(MIN_SCALE, Math.min(maxTarget, Math.min(scaleW, scaleH)))

    const roundedScale = Math.round(target * 20) / 20
    scale.value = roundedScale

    panX.value = Math.round((wsRect.width - frameW * roundedScale + rulerOffset) / 2)
    panY.value = Math.round((wsRect.height - frameH * roundedScale + rulerOffset) / 2)
  }

  /**
   * Fill screen height with the photostrip
   */
  function fillScreen(workspaceEl, frameEl) {
    const ws = (workspaceEl && workspaceEl.value !== undefined) ? workspaceEl.value : workspaceEl
    const frame = (frameEl && frameEl.value !== undefined) ? frameEl.value : frameEl
    if (!ws || !frame || typeof ws.getBoundingClientRect !== 'function') return
    const wsRect = ws.getBoundingClientRect()
    const frameW = frame.offsetWidth || 280
    const frameH = frame.offsetHeight || 556

    const rulerOffset = showRulers.value ? 24 : 0
    const availH = Math.max(100, wsRect.height - 40 - rulerOffset)
    const target = clampScale(availH / frameH)
    const roundedScale = Math.round(target * 20) / 20

    scale.value = roundedScale
    panX.value = Math.round((wsRect.width - frameW * roundedScale + rulerOffset) / 2)
    panY.value = Math.round((wsRect.height - frameH * roundedScale + rulerOffset) / 2)
  }

  /**
   * 100% Zoom: 1:1 Pixel Scale
   */
  function resetToActualSize(workspaceEl, frameEl) {
    if (!workspaceEl || !frameEl) {
      scale.value = 1.0
      return
    }
    const wsRect = workspaceEl.getBoundingClientRect()
    const frameW = frameEl.offsetWidth || 280
    const frameH = frameEl.offsetHeight || 556
    const rulerOffset = showRulers.value ? 24 : 0

    scale.value = 1.0
    panX.value = Math.round((wsRect.width - frameW + rulerOffset) / 2)
    panY.value = Math.round((wsRect.height - frameH + rulerOffset) / 2)
  }

  // --- Pan Methods ---
  function startPan(event) {
    panStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      initialPanX: panX.value,
      initialPanY: panY.value
    }
    isPanning.value = true
  }

  function updatePan(event) {
    if (!isPanning.value || !panStart) return
    const dx = event.clientX - panStart.clientX
    const dy = event.clientY - panStart.clientY
    panX.value = panStart.initialPanX + dx
    panY.value = panStart.initialPanY + dy
  }

  function endPan() {
    isPanning.value = false
    panStart = null
  }

  /**
   * Handles trackpad pinch-to-zoom and two-finger panning
   */
  function handleWheel(event, workspaceEl) {
    if (!workspaceEl) return
    event.preventDefault()

    const wsRect = workspaceEl.getBoundingClientRect()

    if (event.ctrlKey || event.metaKey) {
      // Pinch to Zoom or Cmd + Scroll
      const center = {
        x: event.clientX - wsRect.left,
        y: event.clientY - wsRect.top
      }
      const zoomFactor = Math.exp(-event.deltaY * 0.006)
      setZoom(scale.value * zoomFactor, center, workspaceEl)
    } else {
      // 2-Finger Trackpad Pan or Mouse Wheel
      panX.value -= Math.round(event.deltaX)
      panY.value -= Math.round(event.deltaY)
    }
  }

  // --- Cursor Tracking & Ruler Update ---
  function updateCursorPos(event, workspaceEl, frameEl) {
    if (!workspaceEl) return
    const wsRect = workspaceEl.getBoundingClientRect()
    const screenX = event.clientX - wsRect.left
    const screenY = event.clientY - wsRect.top

    // Calculate canvas coordinates relative to the photostrip frame
    // ScreenX = panX + canvasX * scale
    // => canvasX = (screenX - panX) / scale
    const canvasX = Math.round((screenX - panX.value) / scale.value)
    const canvasY = Math.round((screenY - panY.value) / scale.value)

    cursorInfo.value = {
      screenX,
      screenY,
      canvasX,
      canvasY
    }

    if (isDraggingGuide.value && draggedGuide.value) {
      if (draggedGuide.value.type === 'horizontal') {
        draggedGuide.value.pos = canvasY
      } else {
        draggedGuide.value.pos = canvasX
      }
    }
  }

  // --- Custom Guides Methods ---
  function startDraggingGuideFromRuler(type, event, workspaceEl) {
    event.preventDefault()
    event.stopPropagation()
    const wsRect = workspaceEl?.getBoundingClientRect() || { left: 0, top: 0 }
    const screenX = event.clientX - wsRect.left
    const screenY = event.clientY - wsRect.top

    const canvasX = Math.round((screenX - panX.value) / scale.value)
    const canvasY = Math.round((screenY - panY.value) / scale.value)

    isDraggingGuide.value = true
    draggedGuide.value = {
      type,
      pos: type === 'horizontal' ? canvasY : canvasX,
      isExisting: false
    }
  }

  function startDraggingExistingGuide(guide, event) {
    event.preventDefault()
    event.stopPropagation()
    isDraggingGuide.value = true
    draggedGuide.value = {
      ...guide,
      isExisting: true
    }
  }

  function finishDraggingGuide(frameEl) {
    if (!isDraggingGuide.value || !draggedGuide.value) return

    const { type, pos, isExisting, id } = draggedGuide.value
    const frameW = frameEl?.offsetWidth || 280
    const frameH = frameEl?.offsetHeight || 556

    // If dropped far outside the frame / workspace margin, treat as deleted
    const margin = 200
    const isOutOfBounds =
      type === 'horizontal'
        ? (pos < -margin || pos > frameH + margin)
        : (pos < -margin || pos > frameW + margin)

    if (isOutOfBounds) {
      if (isExisting && id) {
        removeGuide(id)
      }
    } else {
      if (isExisting && id) {
        const item = customGuides.value.find(g => g.id === id)
        if (item) item.pos = pos
      } else {
        customGuides.value.push({
          id: Date.now() + Math.random(),
          type,
          pos
        })
      }
    }

    isDraggingGuide.value = false
    draggedGuide.value = null
  }

  function removeGuide(id) {
    customGuides.value = customGuides.value.filter(g => g.id !== id)
  }

  function clearAllGuides() {
    customGuides.value = []
  }

  function toggleRulers() {
    showRulers.value = !showRulers.value
  }

  // Formatted Zoom percentage display string
  const zoomPercentage = computed(() => {
    return Math.round(scale.value * 100) + '%'
  })

  // CSS Transform style for the canvas transform layer
  const transformStyle = computed(() => {
    return {
      transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${scale.value})`,
      transformOrigin: '0 0'
    }
  })

  return {
    scale,
    panX,
    panY,
    isPanning,
    isSpacePressed,
    isMiddleMouseDown,
    isHandToolActive,
    showRulers,
    customGuides,
    activeHoverGuideId,
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
  }
}
