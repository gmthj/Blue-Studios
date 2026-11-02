<script setup>
import { ref } from 'vue'

const props = defineProps({
  scale: {
    type: Number,
    default: 1.0
  },
  zoomPercentage: {
    type: String,
    default: '100%'
  },
  isHandToolActive: {
    type: Boolean,
    default: false
  },
  showRulers: {
    type: Boolean,
    default: true
  },
  hasCustomGuides: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'zoomIn',
  'zoomOut',
  'setZoom',
  'fitToScreen',
  'fillScreen',
  'resetToActualSize',
  'toggleHandTool',
  'toggleRulers',
  'clearAllGuides'
])

const isMenuOpen = ref(false)
const isMac = typeof navigator !== 'undefined' && (
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || '') ||
  (navigator.userAgentData?.platform === 'macOS')
)

function onSelectPreset(val) {
  emit('setZoom', val)
  isMenuOpen.value = false
}

function onFitScreen() {
  emit('fitToScreen')
  isMenuOpen.value = false
}

function onFillScreen() {
  emit('fillScreen')
  isMenuOpen.value = false
}

function onActualSize() {
  emit('resetToActualSize')
  isMenuOpen.value = false
}

function onToggleRulers() {
  emit('toggleRulers')
  isMenuOpen.value = false
}

function onClearGuides() {
  emit('clearAllGuides')
  isMenuOpen.value = false
}
</script>

<template>
  <div class="canvas-zoom-dock" @click.stop @mousedown.stop>
    <!-- Hand / Pan Tool Toggle -->
    <button
      class="dock-tool-btn hand-tool-btn"
      :class="{ active: isHandToolActive }"
      title="Hand / Pan Tool (Hold Spacebar or Click to Toggle)"
      @click="$emit('toggleHandTool')"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
        <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    </button>

    <div class="dock-divider"></div>

    <!-- Zoom Out (-) Button -->
    <button
      class="dock-tool-btn"
      title="Zoom Out (Cmd/Ctrl + -)"
      :disabled="scale <= 0.25"
      @click="$emit('zoomOut')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <!-- Zoom Readout Dropdown Menu Trigger -->
    <div class="zoom-dropdown-wrapper">
      <button
        class="dock-zoom-btn"
        :class="{ active: isMenuOpen }"
        title="Zoom Options"
        @click="isMenuOpen = !isMenuOpen"
      >
        <span class="zoom-text">{{ zoomPercentage }}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- Zoom Options Popover Menu -->
      <div v-if="isMenuOpen" class="zoom-popover-menu" @click.stop>
        <div class="menu-header">Zoom & Navigation</div>

        <button class="menu-item" @click="onFitScreen">
          <span class="item-name">Fit to Screen</span>
          <span class="item-shortcut">{{ isMac ? '⌘0' : 'Ctrl+0' }}</span>
        </button>

        <button class="menu-item" @click="onFillScreen">
          <span class="item-name">Fill Screen</span>
          <span class="item-shortcut">Fit H</span>
        </button>

        <button class="menu-item" @click="onActualSize">
          <span class="item-name">100% Actual Size</span>
          <span class="item-shortcut">{{ isMac ? '⌘1' : 'Ctrl+1' }}</span>
        </button>

        <div class="menu-divider"></div>

        <button class="menu-item" :class="{ current: Math.abs(scale - 0.5) < 0.01 }" @click="onSelectPreset(0.5)">
          <span class="item-name">50%</span>
        </button>

        <button class="menu-item" :class="{ current: Math.abs(scale - 1.0) < 0.01 }" @click="onSelectPreset(1.0)">
          <span class="item-name">100%</span>
        </button>

        <button class="menu-item" :class="{ current: Math.abs(scale - 1.5) < 0.01 }" @click="onSelectPreset(1.5)">
          <span class="item-name">150%</span>
        </button>

        <button class="menu-item" :class="{ current: Math.abs(scale - 2.0) < 0.01 }" @click="onSelectPreset(2.0)">
          <span class="item-name">200%</span>
        </button>

        <button class="menu-item" :class="{ current: Math.abs(scale - 3.0) < 0.01 }" @click="onSelectPreset(3.0)">
          <span class="item-name">300%</span>
        </button>

        <div class="menu-divider"></div>

        <button class="menu-item" @click="onToggleRulers">
          <span class="item-name">{{ showRulers ? 'Hide Rulers & Guides' : 'Show Rulers & Guides' }}</span>
          <span class="item-shortcut">⇧R</span>
        </button>

        <button v-if="hasCustomGuides" class="menu-item text-danger" @click="onClearGuides">
          <span class="item-name">Clear Custom Guides</span>
        </button>
      </div>
    </div>

    <!-- Zoom In (+) Button -->
    <button
      class="dock-tool-btn"
      title="Zoom In (Cmd/Ctrl + =)"
      :disabled="scale >= 5.0"
      @click="$emit('zoomIn')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <div class="dock-divider"></div>

    <!-- 1-Click Fit to Screen Shortcut Button -->
    <button
      class="dock-tool-btn"
      title="Fit Photostrip to Screen (Cmd/Ctrl + 0)"
      @click="$emit('fitToScreen')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.canvas-zoom-dock {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 55;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--line, #E3E6EE);
  border-radius: 30px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.05);
  display: flex;
  align-items: center;
  padding: 4px 6px;
  gap: 3px;
  user-select: none;
  animation: fadeInDock 0.2s ease-out;
}

@keyframes fadeInDock {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.dock-tool-btn {
  background: transparent;
  border: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted, #6B7080);
  cursor: pointer;
  transition: all 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .dock-tool-btn:hover:not(:disabled) {
    background: var(--soft, #F4F6FA);
    color: var(--ink, #14172B);
  }
}

.dock-tool-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.dock-tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.dock-tool-btn.active {
  background: var(--brand-tint, #E8EEFF);
  color: #2F5BEA;
}

.dock-divider {
  width: 1px;
  height: 18px;
  background: var(--line, #E3E6EE);
  margin: 0 2px;
}

.zoom-dropdown-wrapper {
  position: relative;
}

.dock-zoom-btn {
  background: transparent;
  border: none;
  border-radius: 16px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--ink, #14172B);
  cursor: pointer;
  transition: all 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .dock-zoom-btn:hover {
    background: var(--soft, #F4F6FA);
  }
}

.dock-zoom-btn.active {
  background: var(--brand-tint, #E8EEFF);
  color: #2F5BEA;
}

.zoom-text {
  font-size: 0.78rem;
  font-weight: 700;
  min-width: 36px;
  text-align: center;
}

/* Popover Menu */
.zoom-popover-menu {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  background: #FFFFFF;
  border: 1px solid var(--line, #E3E6EE);
  border-radius: 14px;
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.18), 0 4px 6px -2px rgba(15, 23, 42, 0.05);
  padding: 6px;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
  animation: slideUpMenu 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUpMenu {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.menu-header {
  font-size: 0.64rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted, #6B7080);
  padding: 6px 10px 4px 10px;
}

.menu-item {
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

@media (hover: hover) and (pointer: fine) {
  .menu-item:hover {
    background: var(--soft, #F4F6FA);
  }
}

.menu-item.current {
  background: var(--brand-tint, #E8EEFF);
  color: #2F5BEA;
}

.item-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink, #14172B);
}

.menu-item.current .item-name {
  color: #2F5BEA;
  font-weight: 700;
}

.item-shortcut {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--muted, #6B7080);
  background: var(--soft, #F4F6FA);
  padding: 2px 5px;
  border-radius: 4px;
}

.menu-divider {
  height: 1px;
  background: var(--soft, #F4F6FA);
  margin: 4px 0;
}

@media (hover: hover) and (pointer: fine) {
  .menu-item.text-danger:hover {
    background: #FDE4E5;
  }
}

.menu-item.text-danger .item-name {
  color: #CE3A3F;
}

/* People who turned on "Reduce motion" on their device: nothing slides, pops or shakes.
   Colour changes and fades stay (design.md). In a scoped style, * only means this component's parts. */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition-property: opacity, color, background-color, border-color, box-shadow !important;
  }
}
</style>
