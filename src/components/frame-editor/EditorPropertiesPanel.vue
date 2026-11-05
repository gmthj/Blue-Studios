<script setup>
import { ref, computed, onBeforeUnmount } from "vue"
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"
import AppIcon from "../AppIcon.vue"
import { getTextureBackgroundImage } from "../../constants/frameEditorData.js"


const editor = useFrameEditorContext()
const {
  FONT_CATEGORIES,
  LAYOUTS,
  activeSelectedElement,
  activeTextElement,
  activeTool,
  activeVectorElement,
  addGradientStop,
  addTextBox,
  alignElementCenterH,
  alignElementCenterV,
  bgGradients,
  borderColor,
  borderWidth,
  bringForward,
  bringToFrontSelected,
  canvasElements,
  captionColor,
  captionText,
  currentLayoutDef,
  customGradient,
  debounceTextHistory,
  decrementBorderWidth,
  duplicateSelectedElements,
  flipElementH,
  flipElementV,
  frameBg,
  getElementDisplayName,
  getVectorBarTitle,
  getVectorSwatches,
  incrementBorderWidth,
  lockAllElements,
  onBorderWidthChange,
  removeGradientStop,
  removeSelectedElements,
  saveHistoryState,
  selectedBgColor,
  selectedElementIds,
  sendBackward,
  sendToBackSelected,
  setFrameGradient,
  setFrameSolidColor,
  setGradientAngle,
  setGradientType,
  setLayout,
  setTextAlign,
  setTextColor,
  setVectorColor,
  showCutouts,
  slotShape,
    stepFontSize,
  swapGradientColors,
  switchToColorMode,
  switchToGradientMode,
  templateName,
  toggleBold,
  toggleHide,
  toggleItalic,
  toggleLock,
  toggleStrikethrough,
  toggleUnderline,
  toggleUppercase,
  unlockAllElements,
  updateCustomGradient,
  isPropsSheetOpen,
  moveLayerTo,
  reversedElements,
  selectLayer,
  removeElementById,
  toggleCutouts,
  setSlotShape,
  getRenderedSvg,
  resetFrameBackground,
  clearFrameTexture
} = editor

// The panel's title, in the same place as the Sticker Maker's
const PANEL_TITLES = { templates: 'Frame', elements: 'Element', text: 'Text', background: 'Colour', uploads: 'Upload' }
const panelTitle = computed(() => PANEL_TITLES[activeTool.value] || 'Properties')

// ---- Layers list: drag a row by its grip to move the layer forward or back ----
// The same as the Sticker Maker: the top row is the front-most layer. Window listeners,
// because the row moves under the finger while it is dragged.
const draggingLayerId = ref(null)
const layerListEl = ref(null)

function startRowDrag(event, el) {
  event.preventDefault()
  draggingLayerId.value = el.id
  selectedElementIds.value = [el.id]
  window.addEventListener('pointermove', moveRowDrag)
  window.addEventListener('pointerup', endRowDrag)
  window.addEventListener('pointercancel', endRowDrag)
}

function moveRowDrag(event) {
  if (!draggingLayerId.value || !layerListEl.value) return
  const rows = [...layerListEl.value.querySelectorAll('[data-layer-id]')]
  // The row under the pointer: its place in the list (top first) is the new place
  let target = rows.length - 1
  for (let i = 0; i < rows.length; i++) {
    const box = rows[i].getBoundingClientRect()
    if (event.clientY < box.top + box.height / 2) {
      target = i
      break
    }
  }
  // The list is top-first; canvasElements is back-first
  moveLayerTo(draggingLayerId.value, canvasElements.value.length - 1 - target)
}

function endRowDrag() {
  if (draggingLayerId.value) saveHistoryState() // one undo step for the whole drag
  draggingLayerId.value = null
  window.removeEventListener('pointermove', moveRowDrag)
  window.removeEventListener('pointerup', endRowDrag)
  window.removeEventListener('pointercancel', endRowDrag)
}

onBeforeUnmount(endRowDrag)

// The quick colours under each colour of a drawing (the same as the Sticker Maker's)
const TEXT_PALETTE_COLORS = ['#101828', '#FFFFFF', '#1D4ED8', '#0EA5E9', '#12B76A', '#F79009', '#F04438', '#7A5AF8', '#FFB3C6', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#A0C4FF']

// A layer's picture for the layers list
function svgThumb(el) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(getRenderedSvg(el))
}

const GRIP_ICON = 'M4 8h16 M4 16h16' // two lines, the same as the Sticker Maker
</script>

<template>
      <!-- Right properties panel: the settings of the open tool, then the layers list (like the
           Sticker Maker). On a phone it is a sheet, opened by "Edit" on the tool bar. -->
      <aside class="properties-panel te-panel te-props te-card" :class="{ 'is-open': isPropsSheetOpen }">
        <!-- No title for text: the panel only lists the layers then. The head stays on a phone for its close button. -->
        <div class="te-panel-head" :class="{ 'te-head-phone-only': activeTool === 'text' }">
          <h2 v-if="activeTool !== 'text'" class="te-panel-title">{{ panelTitle }}</h2>
          <button type="button" class="te-close te-mobile-only" aria-label="Close" @click="isPropsSheetOpen = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="te-panel-body d-flex flex-column gap-3" :class="{ 'is-layers-only': activeTool === 'text' }">
        <!-- ================================================================= -->
        <!-- 1. TEMPLATES TAB: Frame Properties (Only when templates is active) -->
        <!-- ================================================================= -->
        <template v-if="activeTool === 'templates'">

          <!-- LAYOUT PRESETS -->
          <div class="d-flex flex-column gap-1">
            <label class="form-label small fw-bold text-secondary mb-0">Layout presets</label>
            <div class="row g-1">
              <div v-for="l in LAYOUTS" :key="l.id" class="col-6">
                <button
                  type="button"
                  class="btn btn-sm w-100 text-truncate px-1"
                  :class="currentLayoutDef.id === l.id ? 'btn-primary' : 'btn-outline-secondary'"
                  :title="l.name + ' (' + l.slots.length + ' slots)'"
                  @click="setLayout(l.id)"
                >
                  {{ l.name }}
                </button>
              </div>
            </div>
          </div>


          <!-- SHAPE -->
          <div class="d-flex flex-column gap-1">
            <label class="form-label small fw-bold text-secondary mb-0">Shape of cutouts</label>
            <div class="btn-group btn-group-sm w-100" role="group">
              <button
                type="button"
                class="btn"
                :class="slotShape === 'Square' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="setSlotShape('Square')"
              >
                Square
              </button>
              <button
                type="button"
                class="btn"
                :class="slotShape === 'Rounded' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="setSlotShape('Rounded')"
              >
                Rounded
              </button>
              <button
                type="button"
                class="btn"
                :class="slotShape === 'Circle' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="setSlotShape('Circle')"
              >
                Circle
              </button>
            </div>
          </div>

          <!-- BORDER -->
          <div class="d-flex flex-column gap-1">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <label class="form-label small fw-bold text-secondary m-0">Border</label>
              <span class="badge bg-primary rounded-pill">{{ borderWidth }}px</span>
            </div>

            <div class="d-flex gap-2">
              <!-- Color Box -->
              <div class="d-flex align-items-center gap-2" style="flex: 1.2;">
                <label
                  class="rounded-circle border shadow-sm cursor-pointer position-relative d-flex align-items-center justify-content-center flex-shrink-0 m-0"
                  style="width: 28px; height: 28px; aspect-ratio: 1; min-width: 28px; min-height: 28px; transition: transform 0.15s ease;"
                  :style="{
                    backgroundColor: borderColor,
                    boxShadow: '0 0 0 2px #fff, 0 0 0 2.5px #cbd5e1'
                  }"
                  title="Pick border color"
                >
                  <input
                    type="color"
                    v-model="borderColor"
                    class="position-absolute opacity-0 pointer-events-none"
                    style="width: 1px; height: 1px;"
                    @change="saveHistoryState"
                  />
                </label>
                <input
                  type="text"
                  v-model="borderColor"
                  class="form-control form-control-sm text-uppercase font-monospace flex-grow-1"
                  maxlength="7"
                  spellcheck="false"
                  placeholder="#2F5BEA"
                  @change="saveHistoryState"
                />
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
        </template>

        <!-- ================================================================= -->
        <!-- 2. ELEMENTS TAB: Options specific to Elements                     -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'elements'">

          <!-- Empty State: No Element Selected -->
          <div v-if="!activeSelectedElement" class="card border-dashed p-4 text-center my-auto bg-light rounded-3">
            <div class="mb-2 text-muted"><AppIcon name="sparkle" :size="26" /></div>
            <h6 class="fw-bold text-dark mb-1">Select an element</h6>
            <p class="small text-muted mb-0">
              Click on any element, shape, or tape on the canvas to customize its colors, size, opacity, and rotation.
            </p>
          </div>

          <!-- Element Inspector when Element is Selected -->
          <div v-else class="d-flex flex-column gap-3">
            <!-- Selected Element Header -->
            <div class="d-flex align-items-center justify-content-between p-2 bg-light border rounded-3">
              <div class="d-flex align-items-center gap-2 text-truncate">
                <AppIcon name="sparkle" :size="16" />
                <div class="text-truncate">
                  <span class="small fw-bold text-dark d-block text-truncate">
                    {{ activeVectorElement ? getVectorBarTitle(activeVectorElement) : getElementDisplayName(activeSelectedElement) }}
                  </span>
                  <span class="badge bg-primary bg-opacity-10 text-primary" style="font-size: 0.65rem;">
                    {{ activeSelectedElement.isSvg ? 'Vector SVG' : (activeSelectedElement.type === 'shape' ? 'Shape' : (activeSelectedElement.type === 'tape' ? 'Washi Tape' : 'Graphic')) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- VECTOR / SHAPE / TAPE RECOLORING -->
            <div v-if="activeVectorElement && getVectorSwatches(activeVectorElement).length > 0" class="d-flex flex-column gap-2">
              <label class="form-label small fw-bold text-secondary mb-0">Colours</label>
              
              <div
                v-for="(swatch, sIdx) in getVectorSwatches(activeVectorElement)"
                :key="sIdx"
                class="card p-2 bg-light border rounded-3 d-flex flex-column gap-2"
              >
                <div class="d-flex justify-content-between align-items-center">
                  <span class="small fw-semibold text-dark">{{ swatch.label || 'Color' }}</span>
                  <span class="font-monospace small text-muted">{{ swatch.current }}</span>
                </div>

                <div class="d-flex gap-2 align-items-center">
                  <div class="input-group input-group-sm" style="flex: 1.2;">
                    <input
                      type="color"
                      :value="swatch.current"
                      class="form-control form-control-color form-control-sm p-1"
                      style="max-width: 38px;"
                      @input="setVectorColor(swatch, $event.target.value)"
                    />
                    <input
                      type="text"
                      :value="swatch.current"
                      class="form-control form-control-sm text-uppercase font-monospace"
                      maxlength="7"
                      spellcheck="false"
                      @change="setVectorColor(swatch, $event.target.value)"
                    />
                  </div>
                </div>

                <!-- Color Palette Swatches -->
                <div class="d-flex align-items-center gap-1 flex-wrap">
                  <button
                    v-for="c in TEXT_PALETTE_COLORS"
                    :key="c"
                    type="button"
                    class="btn p-0 rounded-circle border shadow-none"
                    :style="{
                      backgroundColor: c,
                      width: '18px',
                      height: '18px',
                      boxShadow: swatch.current?.toLowerCase() === c.toLowerCase() ? '0 0 0 2px #fff, 0 0 0 3.5px #2563eb' : 'none'
                    }"
                    :title="c"
                    @click="setVectorColor(swatch, c)"
                  ></button>
                </div>
              </div>

              <!-- Extra Shape Stroke Width Slider if shape -->
              <div v-if="activeSelectedElement.type === 'shape'" class="d-flex flex-column gap-1 mt-1">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="small fw-semibold text-muted">Stroke outline</span>
                  <span class="badge bg-secondary-subtle text-secondary">{{ activeSelectedElement.strokeWidth || 2 }}px</span>
                </div>
                <input
                  v-model.number="activeSelectedElement.strokeWidth"
                  type="range"
                  min="0"
                  max="12"
                  step="1"
                  class="form-range"
                  @input="debounceTextHistory"
                />
              </div>
            </div>

            <!-- DIMENSIONS (WIDTH & HEIGHT) -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary mb-0">Dimensions (px)</label>
              <div class="d-flex gap-2">
                <div class="input-group input-group-sm">
                  <span class="input-group-text bg-light">W</span>
                  <input
                    v-model.number="activeSelectedElement.width"
                    type="number"
                    min="10"
                    max="600"
                    class="form-control text-center"
                    @input="debounceTextHistory"
                  />
                </div>
                <div class="input-group input-group-sm">
                  <span class="input-group-text bg-light">H</span>
                  <input
                    v-model.number="activeSelectedElement.height"
                    type="number"
                    min="10"
                    max="600"
                    class="form-control text-center"
                    @input="debounceTextHistory"
                  />
                </div>
              </div>
            </div>

          </div>
        </template>

        <!-- ================================================================= -->
        <!-- 3. TEXT TAB: Typography & Formatting Options                      -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'text'">

        </template>

        <!-- ================================================================= -->
        <!-- 4. BACKGROUND TAB: Customization & Opacity Controls               -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'background'">
          <!-- What the strip has now, and a reset -->
          <div class="te-current">
            <span
              class="te-current-swatch"
              :style="{
                backgroundColor: frameBg.type === 'gradient' ? 'transparent' : (frameBg.baseColor || '#FFFFFF'),
                backgroundImage: [frameBg.texture ? getTextureBackgroundImage(frameBg.texture) : null, frameBg.type === 'gradient' ? frameBg.value : null].filter(Boolean).join(', ') || 'none'
              }"
            ></span>
            <span class="te-current-text">
              <span class="te-current-name">{{ frameBg.type === 'gradient' ? 'Gradient' : 'Colour' }}{{ frameBg.texture ? ' + texture' : '' }}</span>
              <span class="te-current-detail">
                {{ frameBg.type === 'gradient' ? (customGradient.type === 'radial' ? 'Radial' : customGradient.angle + '°') + ' · ' + customGradient.color1 + ' → ' + customGradient.color2 : (frameBg.baseColor || '#FFFFFF') }}
              </span>
            </span>
            <button type="button" class="btn btn-sm btn-outline-secondary" title="Back to plain white" @click="resetFrameBackground">Reset</button>
          </div>

          <!-- One colour, or a gradient -->
          <div class="seg-tabs te-seg" role="tablist" aria-label="Background type">
            <button type="button" role="tab" class="seg-tab" :class="{ active: frameBg.type !== 'gradient' }" :aria-selected="frameBg.type !== 'gradient'" @click="switchToColorMode()">Colour</button>
            <button type="button" role="tab" class="seg-tab" :class="{ active: frameBg.type === 'gradient' }" :aria-selected="frameBg.type === 'gradient'" @click="switchToGradientMode()">Gradient</button>
          </div>

          <!-- Colour: any colour, or type its code -->
          <div v-if="frameBg.type !== 'gradient'" class="te-color-row">
            <label class="te-swatch te-swatch-lg" :style="{ background: frameBg.baseColor || '#FFFFFF' }" title="Pick a colour">
              <input
                type="color"
                v-model="frameBg.baseColor"
                aria-label="Background colour"
                @input="frameBg.type = 'color'; frameBg.value = frameBg.baseColor; selectedBgColor = frameBg.baseColor; debounceTextHistory()"
                @change="saveHistoryState"
              />
            </label>
            <input
              type="text"
              v-model="frameBg.baseColor"
              class="form-control form-control-sm text-uppercase font-monospace"
              maxlength="7"
              spellcheck="false"
              placeholder="#FFFFFF"
              aria-label="Colour code"
              @input="frameBg.type = 'color'; frameBg.value = frameBg.baseColor; selectedBgColor = frameBg.baseColor; debounceTextHistory()"
              @change="saveHistoryState"
            />
          </div>

          <!-- Gradient: the colours, then the direction (folded until needed) -->
          <template v-else>
            <details class="te-fold" open>
              <summary>Gradient colours</summary>
              <div class="te-fold-body">
                <div class="te-gradient-bar" :style="{ background: frameBg.value }"></div>
                <div v-for="stop in (customGradient.color3 ? ['color1', 'color3', 'color2'] : ['color1', 'color2'])" :key="stop" class="te-color-row">
                  <span class="te-stop-name">{{ stop === 'color1' ? 'Start' : stop === 'color2' ? 'End' : 'Middle' }}</span>
                  <label class="te-swatch" :style="{ background: customGradient[stop] }" title="Pick a colour">
                    <input type="color" v-model="customGradient[stop]" :aria-label="stop + ' colour'" @input="updateCustomGradient(true)" @change="saveHistoryState" />
                  </label>
                  <input
                    type="text"
                    v-model="customGradient[stop]"
                    class="form-control form-control-sm text-uppercase font-monospace"
                    maxlength="7"
                    spellcheck="false"
                    :aria-label="stop + ' colour code'"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                </div>
                <div class="te-pop-row">
                  <button v-if="!customGradient.color3" type="button" class="btn btn-sm btn-outline-secondary" @click="addGradientStop()">
                    <AppIcon name="plus" :size="13" /> Middle
                  </button>
                  <button v-else type="button" class="btn btn-sm btn-outline-secondary" @click="removeGradientStop()">
                    <AppIcon name="close" :size="13" /> Middle
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" title="Swap the start and end colours" @click="swapGradientColors()">⇄ Reverse</button>
                </div>
              </div>
            </details>

            <details class="te-fold">
              <summary>
                Direction
                <span class="te-count">{{ customGradient.type === 'radial' ? 'Radial' : customGradient.angle + '°' }}</span>
              </summary>
              <div class="te-fold-body">
                <div class="te-dir-row" role="group" aria-label="Direction">
                  <button
                    v-for="dir in [{ a: 180, t: '↓', l: 'Top to bottom' }, { a: 135, t: '↘', l: 'Diagonal' }, { a: 90, t: '→', l: 'Left to right' }, { a: 0, t: '↑', l: 'Bottom to top' }]"
                    :key="dir.a"
                    type="button"
                    class="te-dir"
                    :class="{ active: customGradient.type === 'linear' && customGradient.angle === dir.a }"
                    :title="dir.l + ' (' + dir.a + '°)'"
                    :aria-label="dir.l"
                    @click="setGradientAngle(dir.a)"
                  >{{ dir.t }}</button>
                  <button
                    type="button"
                    class="te-dir te-dir-wide"
                    :class="{ active: customGradient.type === 'radial' }"
                    title="From the middle out"
                    @click="setGradientType('radial')"
                  >Radial</button>
                </div>
                <div v-if="customGradient.type === 'linear'">
                  <p class="te-label">Angle <span class="te-count">{{ customGradient.angle }}°</span></p>
                  <input
                    v-model.number="customGradient.angle"
                    type="range"
                    class="te-range"
                    min="0"
                    max="360"
                    step="5"
                    :style="{ '--fill': (customGradient.angle / 360) * 100 + '%' }"
                    aria-label="Angle"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                </div>
              </div>
            </details>
          </template>

          <!-- Texture settings (only when the strip has a texture) -->
          <details v-if="frameBg.texture" class="te-fold" open>
            <summary>Texture</summary>
            <div class="te-fold-body">
              <div>
                <p class="te-label">Strength <span class="te-count">{{ Math.round((frameBg.opacity || 0.85) * 100) }}%</span></p>
                <input
                  v-model.number="frameBg.opacity"
                  type="range"
                  class="te-range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  :style="{ '--fill': (((frameBg.opacity || 0.85) - 0.1) / 0.9) * 100 + '%' }"
                  aria-label="Texture strength"
                  @input="debounceTextHistory"
                />
              </div>
              <div>
                <p class="te-label">Size <span class="te-count">{{ (frameBg.scale || 1).toFixed(1) }}×</span></p>
                <input
                  v-model.number="frameBg.scale"
                  type="range"
                  class="te-range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  :style="{ '--fill': (((frameBg.scale || 1) - 0.5) / 2.5) * 100 + '%' }"
                  aria-label="Texture size"
                  @input="debounceTextHistory"
                />
              </div>
              <div>
                <p class="te-label">Blend</p>
                <div class="seg-tabs te-seg" role="group" aria-label="Blend">
                  <button
                    v-for="mode in ['multiply', 'normal', 'overlay']"
                    :key="mode"
                    type="button"
                    class="seg-tab"
                    :class="{ active: (frameBg.blendMode || 'multiply') === mode }"
                    @click="frameBg.blendMode = mode; debounceTextHistory()"
                  >{{ mode.charAt(0).toUpperCase() + mode.slice(1) }}</button>
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="clearFrameTexture">
                <AppIcon name="close" :size="13" /> Remove texture
              </button>
            </div>
          </details>
        </template>

        <!-- ================================================================= -->
        <!-- 5. UPLOADS TAB: Creative Uploads & Image Inspector                -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'uploads'">

          <!-- CASE A: Uploaded Image Element Selected on Canvas -->
          <div v-if="activeSelectedElement && (activeSelectedElement.type === 'image' || activeSelectedElement.url)" class="d-flex flex-column gap-3">
            <div class="card p-2 bg-light border rounded-3 d-flex flex-row align-items-center gap-2">
              <img
                :src="activeSelectedElement.url"
                class="rounded border bg-white"
                style="width: 44px; height: 44px; object-fit: contain;"
                alt="Selected upload"
              />
              <div class="min-w-0 flex-grow-1">
                <span class="small fw-bold text-dark d-block text-truncate">{{ activeSelectedElement.name || 'Uploaded Photo' }}</span>
                <span class="badge bg-primary bg-opacity-10 text-primary" style="font-size: 0.65rem;">Placed Image</span>
              </div>
            </div>

            <!-- DIMENSIONS -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary mb-0">Size (px)</label>
              <div class="d-flex gap-2">
                <div class="input-group input-group-sm">
                  <span class="input-group-text bg-light">W</span>
                  <input
                    v-model.number="activeSelectedElement.width"
                    type="number"
                    min="20"
                    max="600"
                    class="form-control text-center"
                    @input="debounceTextHistory"
                  />
                </div>
                <div class="input-group input-group-sm">
                  <span class="input-group-text bg-light">H</span>
                  <input
                    v-model.number="activeSelectedElement.height"
                    type="number"
                    min="20"
                    max="600"
                    class="form-control text-center"
                    @input="debounceTextHistory"
                  />
                </div>
              </div>
            </div>

          </div>

          <!-- CASE B: No Media Selected -->
          <div v-else class="card border-dashed p-4 text-center my-auto bg-light rounded-3">
            <div class="mb-2 text-muted"><AppIcon name="image" :size="26" /></div>
            <p class="small text-muted mb-0 fw-medium">Click on media to edit features</p>
          </div>
        </template>

        <!-- Fallback for any unspecified tab -->
        <template v-else>
        </template>

        <!-- ================================================================= -->
        <!-- LAYERS: the top row is the front-most layer (moved here from the left rail) -->
        <!-- ================================================================= -->
        <div class="te-layers">
          <p class="te-label">
            Layers
            <span class="te-count">{{ canvasElements.length }}</span>
          </p>
          <div v-if="canvasElements.length" ref="layerListEl" class="te-layer-list">
            <!-- The photo cutouts sit above everything while they are shown -->
            <div v-if="showCutouts" class="te-layer-row is-fixed" title="The photo cutouts cover the elements. Turn Cutouts off to see under them.">
              <span class="te-layer-thumb"><AppIcon name="layout" :size="14" /></span>
              <span class="te-layer-name">Photo cutouts (on top)</span>
              <button type="button" class="te-row-btn on" title="Hide the photo cutouts" aria-label="Hide the photo cutouts" @click.stop="toggleCutouts">
                <AppIcon name="eye" :size="14" />
              </button>
            </div>
            <div
              v-for="el in reversedElements"
              :key="el.id"
              :data-layer-id="el.id"
              class="te-layer-row"
              :class="{
                active: selectedElementIds.includes(el.id),
                'is-dragging': el.id === draggingLayerId,
                'is-hidden': el.isHidden
              }"
              @click="selectLayer(el, $event)"
            >
              <span
                class="te-grip-handle"
                title="Drag to move this layer up or down"
                aria-label="Drag to reorder"
                @pointerdown="startRowDrag($event, el)"
                @click.stop
              >
                <svg class="te-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="GRIP_ICON" /></svg>
              </span>
              <span class="te-layer-thumb">
                <img v-if="el.type === 'image' && el.url" :src="el.url" alt="" />
                <!-- A drawing (sticker or tape): a small picture of it, in its current colours -->
                <img v-else-if="el.isSvg && el.svgRaw" :src="svgThumb(el)" alt="" />
                <template v-else-if="el.type === 'sticker' && !el.isSvg">{{ el.content }}</template>
                <span v-else-if="el.type === 'tape'" :style="{ width: '20px', height: '8px', borderRadius: '2px', backgroundColor: el.color }"></span>
                <span v-else-if="el.type === 'shape'" :style="{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: el.color }"></span>
                <template v-else-if="el.type === 'text'">T</template>
                <AppIcon v-else name="sparkle" :size="13" />
              </span>
              <span class="te-layer-name">
                {{ getElementDisplayName(el) }}
                <span v-if="el.groupId" class="te-count"> · group</span>
              </span>
              <button
                type="button"
                class="te-row-btn"
                :title="el.isHidden ? 'Show' : 'Hide'"
                :aria-label="el.isHidden ? 'Show layer' : 'Hide layer'"
                @click.stop="toggleHide(el.id)"
              >
                <AppIcon :name="el.isHidden ? 'eye-off' : 'eye'" :size="14" />
              </button>
              <button
                type="button"
                class="te-row-btn"
                :class="{ on: el.isLocked }"
                :title="el.isLocked ? 'Unlock' : 'Lock'"
                :aria-label="el.isLocked ? 'Unlock layer' : 'Lock layer'"
                @click.stop="toggleLock(el.id)"
              >
                <AppIcon :name="el.isLocked ? 'lock' : 'unlock'" :size="14" />
              </button>
              <button type="button" class="te-row-btn del" title="Delete layer" aria-label="Delete layer" @click.stop="removeElementById(el.id)">
                <AppIcon name="trash" :size="14" />
              </button>
            </div>
          </div>
          <div v-if="canvasElements.length > 0" class="d-flex gap-2 mt-2">
            <button type="button" class="btn btn-sm btn-outline-secondary flex-fill te-action" @click="lockAllElements">
              <AppIcon name="lock" :size="13" /> Lock all
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary flex-fill te-action" @click="unlockAllElements">
              <AppIcon name="unlock" :size="13" /> Unlock all
            </button>
          </div>
        </div>
        </div>
      </aside>
</template>
