<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  showRulers: {
    type: Boolean,
    default: true
  },
  scale: {
    type: Number,
    default: 1.0
  },
  panX: {
    type: Number,
    default: 0
  },
  panY: {
    type: Number,
    default: 0
  },
  cursorInfo: {
    type: Object,
    default: () => ({ screenX: 0, screenY: 0, canvasX: 0, canvasY: 0 })
  },
  customGuides: {
    type: Array,
    default: () => []
  },
  isDraggingGuide: {
    type: Boolean,
    default: false
  },
  draggedGuide: {
    type: Object,
    default: null
  },
  frameWidth: {
    type: Number,
    default: 280
  },
  frameHeight: {
    type: Number,
    default: 600
  }
})

const emit = defineEmits([
  'startDragGuide',
  'startMoveGuide',
  'removeGuide',
  'toggleRulers'
])

const topRulerCanvas = ref(null)
const leftRulerCanvas = ref(null)
const hoveredGuideId = ref(null)

const RULER_THICKNESS = 24

// Pick step intervals based on zoom level
function getStepInterval(scale) {
  if (scale >= 2.5) return { major: 25, minor: 5 }
  if (scale >= 1.5) return { major: 50, minor: 10 }
  if (scale >= 0.75) return { major: 100, minor: 20 }
  if (scale >= 0.4) return { major: 200, minor: 50 }
  return { major: 500, minor: 100 }
}

function renderRulers() {
  if (!props.showRulers) return

  // 1. Render Top Horizontal Ruler
  const topC = topRulerCanvas.value
  if (topC) {
    const rect = topC.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width
    const h = RULER_THICKNESS

    if (topC.width !== Math.round(w * dpr) || topC.height !== Math.round(h * dpr)) {
      topC.width = Math.round(w * dpr)
      topC.height = Math.round(h * dpr)
    }

    const ctx = topC.getContext('2d')
    ctx.resetTransform()
    ctx.scale(dpr, dpr)

    // Clear background
    ctx.fillStyle = '#F8FAFC'
    ctx.fillRect(0, 0, w, h)

    // Bottom border
    ctx.fillStyle = '#CBD5E1'
    ctx.fillRect(0, h - 1, w, 1)

    const { major, minor } = getStepInterval(props.scale)

    // Calculate canvas range visible on screen
    // screenX = panX + canvasX * scale
    // canvasX = (screenX - panX) / scale
    // Note: top ruler is offset by RULER_THICKNESS on screen
    const minCanvasX = Math.floor((RULER_THICKNESS - props.panX) / props.scale)
    const maxCanvasX = Math.ceil((w + RULER_THICKNESS - props.panX) / props.scale)

    const startX = Math.floor(minCanvasX / minor) * minor

    ctx.font = '500 9px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = '#64748B'
    ctx.strokeStyle = '#94A3B8'
    ctx.lineWidth = 1

    for (let cX = startX; cX <= maxCanvasX; cX += minor) {
      const screenX = props.panX + cX * props.scale - RULER_THICKNESS
      if (screenX < 0 || screenX > w) continue

      const isMajor = Math.abs(cX % major) < 0.001
      const tickH = isMajor ? 12 : 5
      const tickY = h - tickH

      ctx.beginPath()
      ctx.moveTo(Math.round(screenX) + 0.5, tickY)
      ctx.lineTo(Math.round(screenX) + 0.5, h)
      ctx.stroke()

      if (isMajor) {
        ctx.fillText(cX.toString(), screenX + 3, 10)
      }
    }

    // Special indicator for frame boundary (0 and frameWidth)
    const frame0X = props.panX - RULER_THICKNESS
    const frameEnd = props.panX + props.frameWidth * props.scale - RULER_THICKNESS

    ctx.fillStyle = 'rgba(47, 91, 234, 0.15)'
    if (frame0X < w && frameEnd > 0) {
      const bLeft = Math.max(0, frame0X)
      const bRight = Math.min(w, frameEnd)
      ctx.fillRect(bLeft, 0, bRight - bLeft, h - 1)
    }

    // Cursor indicator hairline
    const curScreenX = props.cursorInfo.screenX - RULER_THICKNESS
    if (curScreenX >= 0 && curScreenX <= w) {
      ctx.strokeStyle = '#2F5BEA'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(curScreenX, 0)
      ctx.lineTo(curScreenX, h)
      ctx.stroke()
    }
  }

  // 2. Render Left Vertical Ruler
  const leftC = leftRulerCanvas.value
  if (leftC) {
    const rect = leftC.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = RULER_THICKNESS
    const h = rect.height

    if (leftC.width !== Math.round(w * dpr) || leftC.height !== Math.round(h * dpr)) {
      leftC.width = Math.round(w * dpr)
      leftC.height = Math.round(h * dpr)
    }

    const ctx = leftC.getContext('2d')
    ctx.resetTransform()
    ctx.scale(dpr, dpr)

    // Clear background
    ctx.fillStyle = '#F8FAFC'
    ctx.fillRect(0, 0, w, h)

    // Right border
    ctx.fillStyle = '#CBD5E1'
    ctx.fillRect(w - 1, 0, 1, h)

    const { major, minor } = getStepInterval(props.scale)

    const minCanvasY = Math.floor((RULER_THICKNESS - props.panY) / props.scale)
    const maxCanvasY = Math.ceil((h + RULER_THICKNESS - props.panY) / props.scale)

    const startY = Math.floor(minCanvasY / minor) * minor

    ctx.font = '500 8.5px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = '#64748B'
    ctx.strokeStyle = '#94A3B8'
    ctx.lineWidth = 1

    for (let cY = startY; cY <= maxCanvasY; cY += minor) {
      const screenY = props.panY + cY * props.scale - RULER_THICKNESS
      if (screenY < 0 || screenY > h) continue

      const isMajor = Math.abs(cY % major) < 0.001
      const tickW = isMajor ? 12 : 5
      const tickX = w - tickW

      ctx.beginPath()
      ctx.moveTo(tickX, Math.round(screenY) + 0.5)
      ctx.lineTo(w, Math.round(screenY) + 0.5)
      ctx.stroke()

      if (isMajor) {
        ctx.save()
        ctx.translate(2, screenY + 10)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(cY.toString(), 0, 7)
        ctx.restore()
      }
    }

    // Special indicator for frame boundary (0 and frameHeight)
    const frame0Y = props.panY - RULER_THICKNESS
    const frameEndY = props.panY + props.frameHeight * props.scale - RULER_THICKNESS

    ctx.fillStyle = 'rgba(47, 91, 234, 0.15)'
    if (frame0Y < h && frameEndY > 0) {
      const bTop = Math.max(0, frame0Y)
      const bBottom = Math.min(h, frameEndY)
      ctx.fillRect(0, bTop, w - 1, bBottom - bTop)
    }

    // Cursor indicator hairline
    const curScreenY = props.cursorInfo.screenY - RULER_THICKNESS
    if (curScreenY >= 0 && curScreenY <= h) {
      ctx.strokeStyle = '#2F5BEA'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, curScreenY)
      ctx.lineTo(w, curScreenY)
      ctx.stroke()
    }
  }
}

watch(
  () => [props.scale, props.panX, props.panY, props.cursorInfo.screenX, props.cursorInfo.screenY, props.showRulers],
  () => {
    requestAnimationFrame(renderRulers)
  },
  { deep: true }
)

onMounted(() => {
  renderRulers()
  window.addEventListener('resize', renderRulers)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', renderRulers)
})
</script>

<template>
  <div v-if="showRulers" class="rulers-overlay-container" @click.stop>
    <!-- Top-Left Corner Box -->
    <div
      class="ruler-corner-box"
      title="Click to toggle Rulers & Guides (Shift+R)"
      @click="$emit('toggleRulers')"
    >
      <span class="corner-unit">px</span>
      <span class="corner-indicator-dot"></span>
    </div>

    <!-- Top Horizontal Ruler -->
    <div
      class="top-ruler-wrapper"
      title="Click and drag downwards to add a horizontal guide"
      @mousedown="$emit('startDragGuide', 'horizontal', $event)"
    >
      <canvas ref="topRulerCanvas" class="ruler-canvas top-canvas"></canvas>
    </div>

    <!-- Left Vertical Ruler -->
    <div
      class="left-ruler-wrapper"
      title="Click and drag rightwards to add a vertical guide"
      @mousedown="$emit('startDragGuide', 'vertical', $event)"
    >
      <canvas ref="leftRulerCanvas" class="ruler-canvas left-canvas"></canvas>
    </div>
  </div>

  <!-- Custom Guides Overlay (Drawn across the canvas workspace) -->
  <div class="custom-guides-layer" :class="{ 'rulers-active': showRulers }">
    <!-- Existing Dropped Guides -->
    <div
      v-for="g in customGuides"
      :key="g.id"
      class="custom-guide-line"
      :class="[g.type, { hovered: hoveredGuideId === g.id }]"
      :style="{
        top: g.type === 'horizontal' ? (panY + g.pos * scale) + 'px' : 0,
        left: g.type === 'vertical' ? (panX + g.pos * scale) + 'px' : 0,
        transform: g.type === 'vertical' ? 'translateX(-50%)' : 'translateY(-50%)'
      }"
      @mouseenter="hoveredGuideId = g.id"
      @mouseleave="hoveredGuideId = null"
      @mousedown.stop="$emit('startMoveGuide', g, $event)"
    >
      <!-- Guide Position Tag -->
      <div class="guide-tag">
        <span class="guide-coord">{{ g.type === 'horizontal' ? `Y: ${g.pos}px` : `X: ${g.pos}px` }}</span>
        <button
          class="guide-delete-btn"
          title="Remove Guide"
          @click.stop="$emit('removeGuide', g.id)"
          @mousedown.stop
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Active Guide Dragging Preview -->
    <div
      v-if="isDraggingGuide && draggedGuide"
      class="custom-guide-line active-dragging"
      :class="draggedGuide.type"
      :style="{
        top: draggedGuide.type === 'horizontal' ? (panY + draggedGuide.pos * scale) + 'px' : 0,
        left: draggedGuide.type === 'vertical' ? (panX + draggedGuide.pos * scale) + 'px' : 0,
        transform: draggedGuide.type === 'vertical' ? 'translateX(-50%)' : 'translateY(-50%)'
      }"
    >
      <div class="guide-tag dragging">
        <span>{{ draggedGuide.type === 'horizontal' ? `Y: ${draggedGuide.pos}px` : `X: ${draggedGuide.pos}px` }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rulers-overlay-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  overflow: hidden;
}

.ruler-corner-box {
  position: absolute;
  top: 0;
  left: 0;
  width: 24px;
  height: 24px;
  background: #F1F5F9;
  border-right: 1px solid #CBD5E1;
  border-bottom: 1px solid #CBD5E1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: pointer;
  z-index: 60;
  user-select: none;
  transition: background 0.15s ease;
}

.ruler-corner-box:hover {
  background: #E2E8F0;
}

.corner-unit {
  font-size: 8.5px;
  font-weight: 700;
  color: #64748B;
  letter-spacing: -0.02em;
}

.corner-indicator-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 3px;
  height: 3px;
  background: #2F5BEA;
  border-radius: 50%;
}

.top-ruler-wrapper {
  position: absolute;
  top: 0;
  left: 24px;
  right: 0;
  height: 24px;
  pointer-events: auto;
  cursor: row-resize;
  overflow: hidden;
  user-select: none;
}

.left-ruler-wrapper {
  position: absolute;
  top: 24px;
  left: 0;
  bottom: 0;
  width: 24px;
  pointer-events: auto;
  cursor: col-resize;
  overflow: hidden;
  user-select: none;
}

.ruler-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Custom Guides Layer */
.custom-guides-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 45;
  overflow: hidden;
}

.custom-guide-line {
  position: absolute;
  pointer-events: auto;
  transition: opacity 0.15s ease;
}

.custom-guide-line.horizontal {
  left: 0;
  right: 0;
  height: 1px;
  border-top: 1px dashed #06B6D4;
  cursor: row-resize;
}

.custom-guide-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
  border-left: 1px dashed #06B6D4;
  cursor: col-resize;
}

.custom-guide-line.active-dragging {
  border-color: #EC4899;
  z-index: 55;
}

.custom-guide-line.hovered {
  border-color: #0891B2;
  border-width: 1.5px;
  z-index: 52;
}

.guide-tag {
  position: absolute;
  background: #0891B2;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  user-select: none;
}

.custom-guide-line.horizontal .guide-tag {
  top: -12px;
  left: 36px;
}

.custom-guide-line.vertical .guide-tag {
  left: 6px;
  top: 36px;
}

.guide-tag.dragging {
  background: #EC4899;
}

.guide-delete-btn {
  background: transparent;
  border: none;
  color: #FFFFFF;
  font-size: 9px;
  padding: 0 2px;
  cursor: pointer;
  line-height: 1;
  opacity: 0.8;
  transition: opacity 0.15s ease;
}

.guide-delete-btn:hover {
  opacity: 1;
}
</style>
