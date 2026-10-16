import { ref, computed } from 'vue'

export function useDoodleEngine() {
  const isDrawMode = ref(false)
  const currentBrush = ref('pen') // 'pen' | 'highlighter' | 'eraser'
  const brushColor = ref('#0F172A')
  const brushWidth = ref(6) // 1 to 48
  const isDrawing = ref(false)
  const currentPoints = ref([])
  const activeStrokes = ref([]) // strokes currently being drawn in current session

  // Curated color swatches matching the photostrip aesthetic
  const DOODLE_PALETTE = [
    '#0F172A', '#E11D48', '#FF4081', '#F59E0B', '#10B981',
    '#2563EB', '#8B5CF6', '#EC4899', '#FEFBF6', '#64748B'
  ]

  // Default brush widths
  const BRUSH_DEFAULTS = {
    pen: { width: 6, opacity: 1 },
    highlighter: { width: 24, opacity: 0.45 },
    eraser: { width: 16, opacity: 1 }
  }

  function setBrush(brush) {
    currentBrush.value = brush
    if (BRUSH_DEFAULTS[brush]) {
      brushWidth.value = BRUSH_DEFAULTS[brush].width
    }
  }

  /**
   * Smooths points using midpoint quadratic Bézier curve interpolation
   * Returns an SVG path 'd' string
   */
  function pointsToSvgPath(points, close = false) {
    if (!points || points.length === 0) return ''
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`
    }

    let d = `M ${points[0].x} ${points[0].y}`
    if (points.length === 2) {
      d += ` L ${points[1].x} ${points[1].y}`
      return d
    }

    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      d += ` Q ${p1.x} ${p1.y}, ${midX} ${midY}`
    }

    const last = points[points.length - 1]
    d += ` L ${last.x} ${last.y}`
    if (close) d += ' Z'
    return d
  }

  /**
   * Computes bounding box for an array of points or strokes
   */
  function computeBoundingBox(points, strokePadding = 8) {
    if (!points || points.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }

    minX = Math.floor(minX - strokePadding)
    minY = Math.floor(minY - strokePadding)
    maxX = Math.ceil(maxX + strokePadding)
    maxY = Math.ceil(maxY + strokePadding)

    const width = Math.max(16, maxX - minX)
    const height = Math.max(16, maxY - minY)

    return { minX, minY, maxX, maxY, width, height }
  }

  /**
   * Generates dazzling, multi-layered glitter sparkles along a point path.
   * Includes 4-point diamond starbursts, cross glints, and luminous micro-orbs.
   */
  function generateSparkles(points, color, count) {
    if (!points || points.length < 2) return []
    const sparkles = []

    // Calculate approximate cumulative path length
    let totalLen = 0
    for (let i = 1; i < points.length; i++) {
      totalLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    }

    // High sparkle density: ~1 sparkle every 7 to 10px
    const targetCount = count || Math.max(12, Math.min(75, Math.floor(totalLen / 8)))
    const step = Math.max(1, Math.floor(points.length / targetCount))

    for (let i = 0; i < points.length; i += step) {
      const p = points[i]
      // Organic jitter around the stroke center
      const jitterDist = (Math.random() - 0.5) * 11
      const jitterAngle = Math.random() * Math.PI * 2
      const x = Math.round((p.x + Math.cos(jitterAngle) * jitterDist) * 10) / 10
      const y = Math.round((p.y + Math.sin(jitterAngle) * jitterDist) * 10) / 10

      const rand = Math.random()
      let type = 'star'
      let size = 7 + Math.random() * 7
      let spColor = '#FFFFFF'

      if (rand < 0.52) {
        // Brilliant 4-Point Diamond Starburst
        type = 'star'
        size = 8 + Math.random() * 8
        spColor = Math.random() > 0.3 ? '#FFFFFF' : (Math.random() > 0.5 ? '#FFF4C2' : color)
      } else if (rand < 0.78) {
        // Delicate Diamond Cross Glint
        type = 'cross'
        size = 5 + Math.random() * 5
        spColor = Math.random() > 0.4 ? '#FFFFFF' : '#FFFDE7'
      } else {
        // Soft Luminous Micro-Orb
        type = 'dot'
        size = 2.5 + Math.random() * 3.5
        spColor = Math.random() > 0.4 ? '#FFFFFF' : color
      }

      sparkles.push({
        x,
        y,
        size: Math.round(size * 10) / 10,
        rotation: Math.floor(Math.random() * 90),
        color: spColor,
        type,
        opacity: Math.round((0.85 + Math.random() * 0.15) * 100) / 100
      })
    }
    return sparkles
  }

  /**
   * Converts current drawn strokes into a standard DoodleElement
   */
  function createDoodleElement(strokes, brushType, color, strokeWidth, opacity = 1) {
    if (!strokes || strokes.length === 0) return null

    // Flatten all points to calculate global element bounding box
    const allPoints = []
    strokes.forEach((s) => allPoints.push(...s.points))
    if (allPoints.length === 0) return null

    const bbox = computeBoundingBox(allPoints, strokeWidth)

    // Normalize each stroke's points relative to (bbox.minX, bbox.minY)
    const normalizedStrokes = strokes.map((s) => {
      const normPoints = s.points.map((p) => ({
        x: Math.round((p.x - bbox.minX) * 10) / 10,
        y: Math.round((p.y - bbox.minY) * 10) / 10,
        pressure: p.pressure
      }))
      return {
        pathData: pointsToSvgPath(normPoints),
        points: normPoints
      }
    })

    // Combine all normalized pathDatas into one unified SVG path string
    const combinedPathData = normalizedStrokes.map((s) => s.pathData).join(' ')

    return {
      id: 'el-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      type: 'doodle',
      name: brushType === 'highlighter' ? 'Highlighter' : 'Doodle Pen',
      brushType,
      color,
      strokeWidth,
      opacity: brushType === 'highlighter' ? 0.45 : (opacity || 1),
      x: bbox.minX,
      y: bbox.minY,
      originalWidth: bbox.width,
      originalHeight: bbox.height,
      width: bbox.width,
      height: bbox.height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      pathData: combinedPathData,
      strokes: normalizedStrokes,
      isLocked: false,
      isHidden: false
    }
  }

  return {
    isDrawMode,
    currentBrush,
    brushColor,
    brushWidth,
    isDrawing,
    currentPoints,
    activeStrokes,
    DOODLE_PALETTE,
    BRUSH_DEFAULTS,
    setBrush,
    pointsToSvgPath,
    computeBoundingBox,
    generateSparkles,
    createDoodleElement
  }
}
