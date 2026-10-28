import { ref } from 'vue'

/**
 * Canva-Style Dynamic Alignment & Magnetic Smart-Snap Guides
 * Computes Axis-Aligned Bounding Boxes (AABB) for canvas center, safe boundaries,
 * photo cutouts, and passive elements on drag start, and provides magnetic threshold
 * snapping with real-time visual guide lines during drag.
 */
export function useSmartGuides() {
  const SNAP_THRESHOLD = 6 // pixels threshold for magnetic snap
  const activeGuides = ref([]) // Active guides to render in SVG overlay
  const activeDistanceBadges = ref([]) // Equidistant spacing indicators

  // Pre-cached targets for high-performance 60fps/120fps dragging
  let cachedTargets = {
    vertical: [],   // X-axis alignment lines (canvas center, edges, element centers)
    horizontal: []  // Y-axis alignment lines (canvas center, edges, element centers)
  }

  let draggingElementSize = { width: 36, height: 36 }
  let stripDimensions = { width: 280, height: 600 }

  /**
   * Initializes snap targets at the beginning of a drag operation.
   * Runs ONCE on mousedown / drag start to avoid DOM reflows during mousemove.
   */
  function initSnapTargets({ stripEl, activeElementId, showCutouts = true, customGuides = [] }) {
    cachedTargets = { vertical: [], horizontal: [] }
    activeGuides.value = []
    activeDistanceBadges.value = []

    if (!stripEl) return

    const stripBox = stripEl.getBoundingClientRect()
    const stripWidth = stripBox.width || 280
    const stripHeight = stripBox.height || 600
    stripDimensions = { width: stripWidth, height: stripHeight }

    // 1. Canvas / Photostrip Container Guides
    // Center guides
    const canvasCenterX = Math.round(stripWidth / 2)
    const canvasCenterY = Math.round(stripHeight / 2)

    cachedTargets.vertical.push({
      coord: canvasCenterX,
      type: 'center',
      source: 'canvas',
      label: 'Center',
      spanStart: 0,
      spanEnd: stripHeight
    })

    cachedTargets.horizontal.push({
      coord: canvasCenterY,
      type: 'center',
      source: 'canvas',
      label: 'Center',
      spanStart: 0,
      spanEnd: stripWidth
    })

    // Safe boundaries (padding inside the frame)
    const paddingX = 12
    const paddingTop = 12
    const paddingBottom = 18

    cachedTargets.vertical.push(
      { coord: paddingX, type: 'boundary', source: 'canvas', label: 'Boundary', spanStart: 0, spanEnd: stripHeight },
      { coord: stripWidth - paddingX, type: 'boundary', source: 'canvas', label: 'Boundary', spanStart: 0, spanEnd: stripHeight }
    )

    cachedTargets.horizontal.push(
      { coord: paddingTop, type: 'boundary', source: 'canvas', label: 'Boundary', spanStart: 0, spanEnd: stripWidth },
      { coord: stripHeight - paddingBottom, type: 'boundary', source: 'canvas', label: 'Boundary', spanStart: 0, spanEnd: stripWidth }
    )

    // Custom user-dropped guides from rulers
    if (customGuides && customGuides.length > 0) {
      customGuides.forEach((g) => {
        if (g.type === 'vertical') {
          cachedTargets.vertical.push({
            coord: Math.round(g.pos),
            type: 'customGuide',
            source: 'guide',
            label: 'Guide',
            spanStart: -100,
            spanEnd: stripHeight + 100
          })
        } else if (g.type === 'horizontal') {
          cachedTargets.horizontal.push({
            coord: Math.round(g.pos),
            type: 'customGuide',
            source: 'guide',
            label: 'Guide',
            spanStart: -100,
            spanEnd: stripWidth + 100
          })
        }
      })
    }

    // 2. Photo Cutout Slots (when cutouts are visible)
    if (showCutouts) {
      const slotNodes = stripEl.querySelectorAll('.cutout-slot')
      slotNodes.forEach((slotNode, idx) => {
        const r = slotNode.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return

        const left = Math.round(r.left - stripBox.left)
        const top = Math.round(r.top - stripBox.top)
        const right = Math.round(left + r.width)
        const bottom = Math.round(top + r.height)
        const centerX = Math.round(left + r.width / 2)
        const centerY = Math.round(top + r.height / 2)

        // Slot Vertical Targets
        cachedTargets.vertical.push({
          coord: centerX,
          type: 'center',
          source: 'slot',
          label: `Slot ${idx + 1} Center`,
          spanStart: Math.max(0, top - 20),
          spanEnd: Math.min(stripHeight, bottom + 20)
        })
        cachedTargets.vertical.push({
          coord: left,
          type: 'edge',
          source: 'slot',
          label: `Slot ${idx + 1} Left`,
          spanStart: top,
          spanEnd: bottom
        })
        cachedTargets.vertical.push({
          coord: right,
          type: 'edge',
          source: 'slot',
          label: `Slot ${idx + 1} Right`,
          spanStart: top,
          spanEnd: bottom
        })

        // Slot Horizontal Targets
        cachedTargets.horizontal.push({
          coord: centerY,
          type: 'center',
          source: 'slot',
          label: `Slot ${idx + 1} Middle`,
          spanStart: Math.max(0, left - 20),
          spanEnd: Math.min(stripWidth, right + 20)
        })
        cachedTargets.horizontal.push({
          coord: top,
          type: 'edge',
          source: 'slot',
          label: `Slot ${idx + 1} Top`,
          spanStart: left,
          spanEnd: right
        })
        cachedTargets.horizontal.push({
          coord: bottom,
          type: 'edge',
          source: 'slot',
          label: `Slot ${idx + 1} Bottom`,
          spanStart: left,
          spanEnd: right
        })
      })
    }

    // 3. Other Placed Canvas Elements (Passive elements)
    const elementNodes = stripEl.querySelectorAll('.canvas-element')
    const passiveBoxes = []

    elementNodes.forEach((node) => {
      const id = node.getAttribute('data-element-id')
      const r = node.getBoundingClientRect()

      if (id === activeElementId) {
        // Measure the currently dragged element's rendered bounding size
        draggingElementSize = {
          width: Math.max(16, Math.round(r.width)),
          height: Math.max(16, Math.round(r.height))
        }
      } else {
        // Passive target
        if (r.width === 0 || r.height === 0) return

        const left = Math.round(r.left - stripBox.left)
        const top = Math.round(r.top - stripBox.top)
        const right = Math.round(left + r.width)
        const bottom = Math.round(top + r.height)
        const centerX = Math.round(left + r.width / 2)
        const centerY = Math.round(top + r.height / 2)

        passiveBoxes.push({ left, top, right, bottom, centerX, centerY, width: r.width, height: r.height })

        // Element Vertical Targets
        cachedTargets.vertical.push({
          coord: centerX,
          type: 'center',
          source: 'element',
          label: 'Element Center',
          spanStart: top,
          spanEnd: bottom
        })
        cachedTargets.vertical.push({
          coord: left,
          type: 'edge',
          source: 'element',
          label: 'Element Left',
          spanStart: top,
          spanEnd: bottom
        })
        cachedTargets.vertical.push({
          coord: right,
          type: 'edge',
          source: 'element',
          label: 'Element Right',
          spanStart: top,
          spanEnd: bottom
        })

        // Element Horizontal Targets
        cachedTargets.horizontal.push({
          coord: centerY,
          type: 'center',
          source: 'element',
          label: 'Element Middle',
          spanStart: left,
          spanEnd: right
        })
        cachedTargets.horizontal.push({
          coord: top,
          type: 'edge',
          source: 'element',
          label: 'Element Top',
          spanStart: left,
          spanEnd: right
        })
        cachedTargets.horizontal.push({
          coord: bottom,
          type: 'edge',
          source: 'element',
          label: 'Element Bottom',
          spanStart: left,
          spanEnd: right
        })
      }
    })

    // Store passive element boxes for distance calculation
    cachedTargets.passiveBoxes = passiveBoxes
  }

  /**
   * Computes snapped coordinates (snappedX, snappedY) given raw unsnapped coordinates.
   * Generates guide lines for rendering.
   */
  function computeSnapping(rawX, rawY) {
    const w = draggingElementSize.width
    const h = draggingElementSize.height
    const stripW = stripDimensions.width
    const stripH = stripDimensions.height

    let snappedX = rawX
    let snappedY = rawY

    const guides = []
    const distanceBadges = []

    // --- Vertical Alignment (X-Axis) ---
    // Candidates for the dragging element
    const candidatesX = [
      { type: 'left', coord: rawX, offset: 0 },
      { type: 'center', coord: rawX + w / 2, offset: w / 2 },
      { type: 'right', coord: rawX + w, offset: w }
    ]

    let bestDiffX = SNAP_THRESHOLD + 0.001
    let bestSnapX = null

    for (const cand of candidatesX) {
      for (const target of cachedTargets.vertical) {
        const diff = Math.abs(cand.coord - target.coord)
        if (diff <= SNAP_THRESHOLD && diff < bestDiffX) {
          bestDiffX = diff
          bestSnapX = {
            targetCoord: target.coord,
            elementX: Math.round(target.coord - cand.offset),
            target,
            cand
          }
        }
      }
    }

    if (bestSnapX) {
      snappedX = bestSnapX.elementX
      // Determine vertical guide line span
      const lineX = bestSnapX.targetCoord
      const isCanvasCenter = bestSnapX.target.source === 'canvas'

      const spanStart = isCanvasCenter ? 0 : Math.min(bestSnapX.target.spanStart, rawY) - 10
      const spanEnd = isCanvasCenter ? stripH : Math.max(bestSnapX.target.spanEnd, rawY + h) + 10

      guides.push({
        id: `v-${lineX}-${bestSnapX.target.type}`,
        orientation: 'vertical',
        x: lineX,
        y1: Math.max(0, spanStart),
        y2: Math.min(stripH, spanEnd),
        type: bestSnapX.target.type,
        label: bestSnapX.target.label
      })
    }

    // --- Horizontal Alignment (Y-Axis) ---
    // Candidates for the dragging element
    const candidatesY = [
      { type: 'top', coord: rawY, offset: 0 },
      { type: 'center', coord: rawY + h / 2, offset: h / 2 },
      { type: 'bottom', coord: rawY + h, offset: h }
    ]

    let bestDiffY = SNAP_THRESHOLD + 0.001
    let bestSnapY = null

    for (const cand of candidatesY) {
      for (const target of cachedTargets.horizontal) {
        const diff = Math.abs(cand.coord - target.coord)
        if (diff <= SNAP_THRESHOLD && diff < bestDiffY) {
          bestDiffY = diff
          bestSnapY = {
            targetCoord: target.coord,
            elementY: Math.round(target.coord - cand.offset),
            target,
            cand
          }
        }
      }
    }

    if (bestSnapY) {
      snappedY = bestSnapY.elementY
      const lineY = bestSnapY.targetCoord
      const isCanvasCenter = bestSnapY.target.source === 'canvas'

      const spanStart = isCanvasCenter ? 0 : Math.min(bestSnapY.target.spanStart, rawX) - 10
      const spanEnd = isCanvasCenter ? stripW : Math.max(bestSnapY.target.spanEnd, rawX + w) + 10

      guides.push({
        id: `h-${lineY}-${bestSnapY.target.type}`,
        orientation: 'horizontal',
        y: lineY,
        x1: Math.max(0, spanStart),
        x2: Math.min(stripW, spanEnd),
        type: bestSnapY.target.type,
        label: bestSnapY.target.label
      })
    }

    // --- Bonus: Equidistant Spacing Check (Vertical distribution) ---
    if (cachedTargets.passiveBoxes && cachedTargets.passiveBoxes.length >= 2) {
      const sorted = [...cachedTargets.passiveBoxes].sort((a, b) => a.top - b.top)
      const curTop = snappedY
      const curBottom = snappedY + h

      for (let i = 0; i < sorted.length - 1; i++) {
        const topEl = sorted[i]
        const bottomEl = sorted[i + 1]

        // If dragging element is in between topEl and bottomEl
        if (curTop > topEl.bottom && curBottom < bottomEl.top) {
          const gapTop = curTop - topEl.bottom
          const gapBottom = bottomEl.top - curBottom

          if (Math.abs(gapTop - gapBottom) <= SNAP_THRESHOLD) {
            // Snap to exact equidistant middle
            const equalGap = Math.round((bottomEl.top - topEl.bottom - h) / 2)
            snappedY = topEl.bottom + equalGap

            distanceBadges.push({
              id: `dist-top-${i}`,
              x: Math.round(snappedX + w / 2),
              y1: topEl.bottom,
              y2: snappedY,
              distance: equalGap
            })

            distanceBadges.push({
              id: `dist-bot-${i}`,
              x: Math.round(snappedX + w / 2),
              y1: snappedY + h,
              y2: bottomEl.top,
              distance: equalGap
            })
            break
          }
        }
      }
    }

    activeGuides.value = guides
    activeDistanceBadges.value = distanceBadges

    return {
      x: snappedX,
      y: snappedY,
      hasGuides: guides.length > 0
    }
  }

  /**
   * Cleans up all guides instantly on pointerup / mouseup.
   */
  function clearGuides() {
    activeGuides.value = []
    activeDistanceBadges.value = []
  }

  return {
    SNAP_THRESHOLD,
    activeGuides,
    activeDistanceBadges,
    initSnapTargets,
    computeSnapping,
    clearGuides
  }
}
