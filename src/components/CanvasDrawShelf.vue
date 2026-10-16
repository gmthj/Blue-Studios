<template>
  <div v-if="isDrawMode" class="canvas-draw-shelf" @mousedown.stop>
    <!-- Left: Brush Tool Selector Buttons -->
    <div class="brush-group">
      <!-- Felt Pen -->
      <button
        class="brush-btn"
        :class="{ active: currentBrush === 'pen' }"
        title="Felt Pen (Solid, smooth signature & doodle pen)"
        @click="$emit('select-brush', 'pen')"
      >
        <div class="brush-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
          </svg>
        </div>
        <span class="brush-name">Felt Pen</span>
      </button>

      <!-- Highlighter / Marker -->
      <button
        class="brush-btn"
        :class="{ active: currentBrush === 'highlighter' }"
        title="Highlighter (Semi-transparent multiply marker)"
        @click="$emit('select-brush', 'highlighter')"
      >
        <div class="brush-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m9 11-6 6v3h3l6-6" />
            <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
          </svg>
        </div>
        <span class="brush-name">Highlighter</span>
      </button>

      <!-- Glitter Gel Pen -->
      <button
        class="brush-btn"
        :class="{ active: currentBrush === 'glitter' }"
        title="Glitter Pen (Sparkle & shimmer gel pen)"
        @click="$emit('select-brush', 'glitter')"
      >
        <div class="brush-icon glitter-icon-glow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
          </svg>
        </div>
        <span class="brush-name">Glitter</span>
      </button>

      <!-- Eraser -->
      <div class="eraser-wrap">
        <button
          class="brush-btn"
          :class="{ active: currentBrush === 'eraser' }"
          title="Eraser (Erase doodle strokes or segments)"
          @click="$emit('select-brush', 'eraser')"
        >
          <div class="brush-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
              <path d="M22 21H7" />
              <path d="m5 11 9 9" />
            </svg>
          </div>
          <span class="brush-name">Eraser</span>
        </button>

        <!-- Eraser Mode Sub-Toggle (when Eraser is active) -->
        <div v-if="currentBrush === 'eraser'" class="eraser-mode-pill">
          <button
            class="eraser-sub-btn"
            :class="{ active: eraserType === 'stroke' }"
            title="Stroke Eraser: click to delete entire doodle stroke"
            @click="$emit('update-eraser-type', 'stroke')"
          >
            Stroke
          </button>
          <button
            class="eraser-sub-btn"
            :class="{ active: eraserType === 'pixel' }"
            title="Pixel Eraser: drag over paths to erase"
            @click="$emit('update-eraser-type', 'pixel')"
          >
            Segment
          </button>
        </div>
      </div>
    </div>

    <div class="shelf-divider"></div>

    <!-- Middle: Stroke Thickness Slider -->
    <div class="thickness-group">
      <div class="thickness-preview-circle-wrap">
        <span
          class="thickness-dot"
          :style="{
            width: Math.min(24, Math.max(3, brushWidth)) + 'px',
            height: Math.min(24, Math.max(3, brushWidth)) + 'px',
            backgroundColor: currentBrush === 'eraser' ? '#94A3B8' : brushColor,
            opacity: currentBrush === 'highlighter' ? 0.5 : 1
          }"
        ></span>
      </div>

      <input
        type="range"
        min="1"
        max="48"
        step="1"
        :value="brushWidth"
        class="thickness-slider"
        title="Brush thickness"
        @input="$emit('update-width', Number($event.target.value))"
      />
      <span class="thickness-val">{{ brushWidth }}px</span>
    </div>

    <div class="shelf-divider"></div>

    <!-- Right: Color Palette Swatches -->
    <div v-if="currentBrush !== 'eraser'" class="color-group">
      <div class="palette-swatches">
        <button
          v-for="c in palette"
          :key="c"
          class="color-chip"
          :class="{ active: brushColor.toLowerCase() === c.toLowerCase() }"
          :style="{ backgroundColor: c }"
          :title="c"
          @click="$emit('update-color', c)"
        ></button>
      </div>

      <!-- Native Hex Color Input -->
      <div class="custom-color-picker-wrap" title="Custom color picker">
        <input
          type="color"
          :value="brushColor"
          class="native-color-input"
          @input="$emit('update-color', $event.target.value)"
        />
        <div class="rainbow-swatch" :style="{ backgroundColor: brushColor }">
          <span class="color-plus-icon">+</span>
        </div>
      </div>
    </div>

    <div class="shelf-divider"></div>

    <!-- Actions: Undo & Done Button -->
    <div class="shelf-actions">
      <button
        class="action-btn"
        :disabled="strokesCount === 0"
        title="Undo last stroke (⌘Z)"
        @click="$emit('undo-stroke')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>

      <button
        class="action-btn"
        :disabled="strokesCount === 0"
        title="Clear all active drawings"
        @click="$emit('clear-strokes')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      <!-- Done Button (Canva Magic: converts drawing into movable, rotatable canvas element) -->
      <button
        class="done-drawing-btn"
        title="Finish drawing and convert to selectable canvas element"
        @click="$emit('finish-draw')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>Done</span>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  isDrawMode: {
    type: Boolean,
    default: false
  },
  currentBrush: {
    type: String,
    default: 'pen'
  },
  eraserType: {
    type: String,
    default: 'stroke'
  },
  brushColor: {
    type: String,
    default: '#0F172A'
  },
  brushWidth: {
    type: Number,
    default: 6
  },
  strokesCount: {
    type: Number,
    default: 0
  },
  palette: {
    type: Array,
    default: () => [
      '#0F172A', '#E11D48', '#FF4081', '#F59E0B', '#10B981',
      '#2563EB', '#8B5CF6', '#EC4899', '#FEFBF6', '#64748B'
    ]
  }
})

defineEmits([
  'select-brush',
  'update-eraser-type',
  'update-color',
  'update-width',
  'undo-stroke',
  'clear-strokes',
  'finish-draw'
])
</script>

<style scoped>
.canvas-draw-shelf {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 40px;
  box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.03);
  animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

@keyframes slideDown {
  from { opacity: 0; transform: translate(-50%, -10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.brush-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.brush-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid transparent;
  background: transparent;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.brush-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.brush-btn.active {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #2563eb;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.12);
}

.brush-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.glitter-icon-glow {
  color: #f59e0b;
  filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.5));
}

.eraser-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.eraser-mode-pill {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 14px;
  padding: 2px;
  border: 1px solid #e2e8f0;
}

.eraser-sub-btn {
  border: none;
  background: transparent;
  font-size: 0.68rem;
  font-weight: 600;
  color: #64748b;
  padding: 2px 7px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.eraser-sub-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.shelf-divider {
  width: 1px;
  height: 22px;
  background: #e2e8f0;
}

.thickness-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thickness-preview-circle-wrap {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thickness-dot {
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: all 0.1s ease;
}

.thickness-slider {
  width: 78px;
  height: 5px;
  accent-color: #2563eb;
  cursor: pointer;
}

.thickness-val {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  width: 32px;
}

.color-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.palette-swatches {
  display: flex;
  align-items: center;
  gap: 5px;
}

.color-chip {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s ease;
}

.color-chip:hover {
  transform: scale(1.18);
}

.color-chip.active {
  transform: scale(1.25);
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #2563eb;
}

.custom-color-picker-wrap {
  position: relative;
  width: 20px;
  height: 20px;
}

.native-color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.rainbow-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.color-plus-icon {
  font-size: 0.75rem;
  font-weight: 800;
  color: #ffffff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  line-height: 1;
}

.shelf-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.done-drawing-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.28);
  transition: all 0.15s ease;
}

.done-drawing-btn:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.38);
}
</style>
