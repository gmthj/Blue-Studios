<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"


const editor = useFrameEditorContext()
const {
  FONT_CATEGORIES,
  LAYOUTS,
  activeSelectedElement,
  activeTextElement,
  activeTool,
  activeVectorElement,
  addGradientStop,
  addTextElement,
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
  clearFrameTexture,
  currentLayoutDef,
  customGradient,
  debounceTextHistory,
  decrementBorderWidth,
  duplicateSelectedElements,
  flipElementH,
  flipElementV,
  frameBg,
  getElementDisplayName,
  getTextureBackgroundImage,
  getVectorBarTitle,
  getVectorSwatches,
  incrementBorderWidth,
  isMobileEditSheetOpen,
  lockAllElements,
  onBorderWidthChange,
  removeGradientStop,
  removeSelectedElements,
  resetFrameBackground,
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
  setSlotShape,
  setTextAlign,
  setTextColor,
  setVectorColor,
  shortcuts,
  showCutouts,
  slotShape,
    stepFontSize,
  swapGradientColors,
  switchToColorMode,
  switchToGradientMode,
  toggleBold,
  toggleHide,
  toggleItalic,
  toggleLock,
  toggleStrikethrough,
  toggleUnderline,
  toggleUppercase,
  unlockAllElements,
  updateCustomGradient
} = editor
</script>

<template>
      <!-- Right Properties Panel (Bootstrap 5 - Shown on lg+ screens; slide-up sheet on mobile) -->
      <aside
        class="properties-panel d-none d-lg-flex bg-white border-start p-3 flex-column gap-3 overflow-y-auto flex-shrink-0"
        :class="{ 'is-mobile-open': isMobileEditSheetOpen }"
        style="width: 320px;"
      >
        <!-- Mobile Bottom Sheet Grabber & Header -->
        <div class="mobile-sheet-header d-lg-none d-flex flex-column pt-1 pb-2 border-bottom mb-2 flex-shrink-0">
          <div class="mobile-sheet-grabber mx-auto mb-2"></div>
          <div class="d-flex align-items-center justify-content-between px-1">
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 text-uppercase" style="font-size: 0.7rem;">
                {{ activeSelectedElement ? activeSelectedElement.type : (activeTool === 'templates' ? 'Layout' : 'Properties') }}
              </span>
              <h6 class="fw-bold text-dark m-0 fs-6">
                {{ activeSelectedElement ? (getElementDisplayName(activeSelectedElement) + ' Properties') : 'Properties' }}
              </h6>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-light border-0 rounded-circle d-flex align-items-center justify-content-center p-1 text-secondary"
              style="width: 28px; height: 28px;"
              aria-label="Close Properties Sheet"
              @click="isMobileEditSheetOpen = false"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <!-- ================================================================= -->
        <!-- 1. TEMPLATES TAB: Frame Properties (Only when templates is active) -->
        <!-- ================================================================= -->
        <template v-if="activeTool === 'templates'">
          <div class="d-flex align-items-center justify-content-between border-bottom pb-2">
            <h6 class="fw-bold text-dark m-0 fs-6">Frame Properties</h6>
            <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">Templates</span>
          </div>

          <!-- LAYOUT PRESETS -->
          <div class="d-flex flex-column gap-1">
            <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Layout Presets</label>
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
            <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Shape of cutouts</label>
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
              <label class="form-label small fw-bold text-secondary text-uppercase m-0">Border</label>
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

          <!-- CAPTION -->
          <div class="d-flex flex-column gap-2">
            <div class="d-flex justify-content-between align-items-center">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Caption</label>
              <button
                v-if="captionColor.toLowerCase() !== borderColor.toLowerCase()"
                type="button"
                class="btn btn-link btn-xs p-0 text-decoration-none small text-primary fw-medium"
                style="font-size: 0.72rem;"
                title="Match frame border color"
                @click="captionColor = borderColor; saveHistoryState()"
              >
                Match Border
              </button>
              <span v-else class="badge bg-secondary-subtle text-secondary" style="font-size: 0.65rem;">
                Matches Border
              </span>
            </div>

            <!-- Single Caption Input with Clear Button -->
            <div class="input-group input-group-sm">
              <input
                v-model="captionText"
                type="text"
                class="form-control form-control-sm"
                placeholder="Enter caption text (e.g. REUNION · 1998)"
                maxlength="50"
                @input="debounceTextHistory"
              />
              <button
                v-if="captionText"
                class="btn btn-outline-secondary border-start-0 py-0 px-2"
                type="button"
                title="Clear caption"
                @click="captionText = ''; debounceTextHistory()"
              >
                &times;
              </button>
            </div>

            <!-- Caption Color: Single Picker + Hex Input + Quick Swatches -->
            <div class="d-flex align-items-center gap-2">
              <div class="d-flex align-items-center gap-2 flex-shrink-0">
                <label
                  class="rounded-circle border shadow-sm cursor-pointer position-relative d-flex align-items-center justify-content-center flex-shrink-0 m-0"
                  style="width: 26px; height: 26px; aspect-ratio: 1; transition: transform 0.15s ease;"
                  :style="{
                    backgroundColor: captionColor,
                    boxShadow: '0 0 0 2px #fff, 0 0 0 2px #cbd5e1'
                  }"
                  title="Pick custom caption color"
                >
                  <input
                    type="color"
                    v-model="captionColor"
                    class="position-absolute opacity-0 pointer-events-none"
                    style="width: 1px; height: 1px;"
                    @input="debounceTextHistory"
                    @change="saveHistoryState"
                  />
                </label>

                <input
                  type="text"
                  v-model="captionColor"
                  class="form-control form-control-sm text-uppercase font-monospace"
                  style="width: 82px;"
                  maxlength="7"
                  spellcheck="false"
                  placeholder="#033DFC"
                  @input="debounceTextHistory"
                  @change="saveHistoryState"
                />
              </div>

              <!-- Quick Swatches Palette -->
              <div class="d-flex align-items-center gap-1 ms-auto flex-wrap justify-content-end">
                <button
                  v-for="swatch in ['#2F5BEA', '#111827', '#64748B', '#FFFFFF', '#EF4444', '#EC4899', '#8B5CF6']"
                  :key="swatch"
                  type="button"
                  class="btn p-0 rounded-circle border shadow-none flex-shrink-0"
                  :style="{
                    backgroundColor: swatch,
                    width: '18px',
                    height: '18px',
                    boxShadow: captionColor.toLowerCase() === swatch.toLowerCase() ? '0 0 0 2px #fff, 0 0 0 2.5px #2563eb' : 'none'
                  }"
                  :title="swatch"
                  @click="captionColor = swatch; saveHistoryState()"
                ></button>
              </div>
            </div>
          </div>
        </template>

        <!-- ================================================================= -->
        <!-- 2. ELEMENTS TAB: Options specific to Elements                     -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'elements'">
          <div class="d-flex align-items-center justify-content-between border-bottom pb-2">
            <h6 class="fw-bold text-dark m-0 fs-6">Element Options</h6>
            <span class="badge bg-secondary bg-opacity-10 text-secondary border">Elements</span>
          </div>

          <!-- Empty State: No Element Selected -->
          <div v-if="!activeSelectedElement" class="card border-dashed p-4 text-center my-auto bg-light rounded-3">
            <div class="d-inline-flex align-items-center justify-content-center p-3 rounded-circle bg-white border text-secondary mx-auto mb-2" style="width: 52px; height: 52px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3.16a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1H8.3z" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <circle cx="17.5" cy="17.5" r="3.5" />
              </svg>
            </div>
            <h6 class="fw-bold text-dark mb-1">Select an Element</h6>
            <p class="small text-muted mb-0">
              Click on any element, shape, or tape on the canvas to customize its colors, size, opacity, and rotation.
            </p>
          </div>

          <!-- Element Inspector when Element is Selected -->
          <div v-else class="d-flex flex-column gap-3">
            <!-- Selected Element Header -->
            <div class="d-flex align-items-center justify-content-between p-2 bg-light border rounded-3">
              <div class="d-flex align-items-center gap-2 text-truncate">
                <div class="p-1 rounded-2 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center flex-shrink-0" style="width: 28px; height: 28px;">
                  <svg v-if="activeSelectedElement.isSvg || activeSelectedElement.type === 'shape'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <svg v-else-if="activeSelectedElement.type === 'tape'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="7" width="20" height="10" rx="1"/>
                    <line x1="6" y1="7" x2="6" y2="17"/>
                    <line x1="18" y1="7" x2="18" y2="17"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3.16a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1H8.3z" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <circle cx="17.5" cy="17.5" r="3.5" />
                  </svg>
                </div>
                <div class="text-truncate">
                  <span class="small fw-bold text-dark d-block text-truncate">
                    {{ activeVectorElement ? getVectorBarTitle(activeVectorElement) : getElementDisplayName(activeSelectedElement) }}
                  </span>
                  <span class="badge bg-primary bg-opacity-10 text-primary" style="font-size: 0.65rem;">
                    {{ activeSelectedElement.isSvg ? 'Vector SVG' : (activeSelectedElement.type === 'shape' ? 'Shape' : (activeSelectedElement.type === 'tape' ? 'Washi Tape' : 'Graphic')) }}
                  </span>
                </div>
              </div>
              <button class="btn btn-sm btn-outline-danger p-1" title="Delete Element" @click="removeSelectedElements">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>

            <!-- VECTOR / SHAPE / TAPE RECOLORING -->
            <div v-if="activeVectorElement && getVectorSwatches(activeVectorElement).length > 0" class="d-flex flex-column gap-2">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Colors & Fill</label>
              
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
                  <span class="small fw-semibold text-muted">Stroke Outline</span>
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

            <!-- If Sticker Note -->
            <div v-else-if="activeSelectedElement.type === 'sticker' && !activeSelectedElement.isSvg" class="alert alert-light border small text-muted p-2 mb-0 d-flex align-items-start gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Standard stickers artwork can be scaled, rotated, flipped, and have opacity adjusted below.</span>
            </div>

            <!-- OPACITY ADJUSTMENT -->
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Opacity</label>
                <span class="badge bg-secondary rounded-pill">
                  {{ Math.round((activeSelectedElement.opacity !== undefined ? activeSelectedElement.opacity : 1) * 100) }}%
                </span>
              </div>
              <input
                v-model.number="activeSelectedElement.opacity"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                class="form-range"
                @input="debounceTextHistory"
              />
            </div>

            <!-- ROTATION & FLIP -->
            <div class="d-flex flex-column gap-2">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Rotation & Flip</label>
                <button
                  class="btn btn-sm py-0 px-1 btn-outline-secondary"
                  style="font-size: 0.68rem;"
                  title="Reset rotation to 0"
                  @click="activeSelectedElement.rotation = 0; saveHistoryState()"
                >
                  Reset 0°
                </button>
              </div>
              <div class="d-flex align-items-center gap-2">
                <input
                  v-model.number="activeSelectedElement.rotation"
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  class="form-range"
                  @input="debounceTextHistory"
                />
                <span class="badge bg-light text-dark border font-monospace" style="min-width: 44px; text-align: center;">
                  {{ activeSelectedElement.rotation || 0 }}°
                </span>
              </div>

              <!-- Flip Buttons -->
              <div class="btn-group btn-group-sm w-100">
                <button
                  class="btn"
                  :class="activeSelectedElement.flipX ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Flip Horizontally"
                  @click="flipElementH(activeSelectedElement)"
                >
                  ⇄ Flip Horizontal
                </button>
                <button
                  class="btn"
                  :class="activeSelectedElement.flipY ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Flip Vertically"
                  @click="flipElementV(activeSelectedElement)"
                >
                  ⇅ Flip Vertical
                </button>
              </div>
            </div>

            <!-- DIMENSIONS (WIDTH & HEIGHT) -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Dimensions (px)</label>
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

            <!-- CANVAS ALIGNMENT -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Center</label>
              <div class="btn-group btn-group-sm w-100">
                <button
                  class="btn btn-outline-secondary"
                  title="Center Horizontally"
                  @click="alignElementCenterH(activeSelectedElement)"
                >
                  Horizontally
                </button>
                <button
                  class="btn btn-outline-secondary"
                  title="Center Vertically"
                  @click="alignElementCenterV(activeSelectedElement)"
                >
                  Vertically
                </button>
              </div>
            </div>

            <!-- ACTIONS (Duplicate, Lock, Delete) -->
            <div class="d-flex gap-2 pt-2 border-top">
              <button
                class="btn btn-sm btn-outline-secondary flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                @click="duplicateSelectedElements"
              >
                <span>Duplicate</span>
              </button>
              <button
                class="btn btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                :class="activeSelectedElement.isLocked ? 'btn-warning text-dark' : 'btn-outline-secondary'"
                @click="toggleLock(activeSelectedElement.id)"
              >
                <span>{{ activeSelectedElement.isLocked ? 'Unlock' : 'Lock' }}</span>
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                title="Delete Element"
                @click="removeSelectedElements"
              >
                Delete
              </button>
            </div>
          </div>
        </template>

        <!-- ================================================================= -->
        <!-- 3. TEXT TAB: Typography & Formatting Options                      -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'text'">
          <div class="d-flex align-items-center justify-content-between border-bottom pb-2">
            <h6 class="fw-bold text-dark m-0 fs-6">Typography</h6>
            <span class="badge bg-secondary bg-opacity-10 text-secondary border">Text</span>
          </div>

          <!-- Empty State: No Text Selected -->
          <div v-if="!activeTextElement" class="card border-dashed p-4 text-center my-auto bg-light rounded-3">
            <div class="d-inline-flex align-items-center justify-content-center p-3 rounded-circle bg-white border text-secondary mx-auto mb-2" style="width: 52px; height: 52px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
            </div>
            <h6 class="fw-bold text-dark mb-1">Select a Text Layer</h6>
            <p class="small text-muted mb-3">
              Click on any text on the canvas to customize font size, typeface, alignment, color, and curved arch.
            </p>
            <div class="d-flex flex-column gap-2">
              <button
                class="btn btn-sm btn-primary rounded-pill fw-semibold"
                @click="addTextElement({ text: 'Heading', fontSize: 32, fontWeight: 'bold' })"
              >
                + Add Heading
              </button>
              <button
                class="btn btn-sm btn-outline-secondary rounded-pill"
                @click="addTextElement({ text: 'Your text here', fontSize: 18 })"
              >
                + Add Body Text
              </button>
            </div>
          </div>

          <!-- Text Inspector when activeTextElement is Selected -->
          <div v-else class="d-flex flex-column gap-3">
            <!-- Text Content -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Text Content</label>
              <textarea
                v-model="activeTextElement.text"
                rows="2"
                class="form-control form-control-sm"
                placeholder="Enter text..."
                @input="debounceTextHistory"
              ></textarea>
            </div>

            <!-- FONT FAMILY SELECT -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Font Family</label>
              <select
                v-model="activeTextElement.fontFamily"
                class="form-select form-select-sm"
                @change="debounceTextHistory"
              >
                <optgroup v-for="cat in FONT_CATEGORIES" :key="cat.name" :label="cat.name">
                  <option
                    v-for="f in cat.fonts"
                    :key="f.family"
                    :value="f.family"
                    :style="{ fontFamily: f.family }"
                  >
                    {{ f.label.split('(')[0].trim() }}
                  </option>
                </optgroup>
              </select>
            </div>

            <!-- FONT SIZE -->
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Font Size</label>
                <span class="badge bg-primary rounded-pill">{{ activeTextElement.fontSize || 22 }}px</span>
              </div>
              <div class="d-flex gap-2">
                <div class="input-group input-group-sm">
                  <button class="btn btn-outline-secondary px-2" title="Decrease font size" @click="stepFontSize(-2)">−</button>
                  <input
                    v-model.number="activeTextElement.fontSize"
                    type="number"
                    min="8"
                    max="140"
                    class="form-control text-center p-0 fw-semibold"
                    @input="debounceTextHistory"
                  />
                  <button class="btn btn-outline-secondary px-2" title="Increase font size" @click="stepFontSize(2)">+</button>
                </div>
              </div>
              <!-- Quick Size Pills -->
              <div class="d-flex gap-1 mt-1">
                <button
                  v-for="size in [14, 18, 24, 32, 48]"
                  :key="size"
                  class="btn btn-sm py-0 px-2 rounded-pill"
                  :class="activeTextElement.fontSize === size ? 'btn-primary' : 'btn-light border'"
                  style="font-size: 0.72rem;"
                  @click="activeTextElement.fontSize = size; debounceTextHistory()"
                >
                  {{ size }}
                </button>
              </div>
            </div>

            <!-- TEXT STYLES (BOLD, ITALIC, UNDERLINE, UPPERCASE) -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Styling & Transform</label>
              <div class="btn-group btn-group-sm w-100">
                <button
                  class="btn"
                  :class="activeTextElement.fontWeight === 'bold' || activeTextElement.fontWeight >= 700 ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Bold"
                  @click="toggleBold"
                >
                  <strong>B</strong>
                </button>
                <button
                  class="btn"
                  :class="activeTextElement.fontStyle === 'italic' ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Italic"
                  @click="toggleItalic"
                >
                  <em>I</em>
                </button>
                <button
                  class="btn"
                  :class="activeTextElement.textDecoration === 'underline' ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Underline"
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
                  title="Uppercase"
                  @click="toggleUppercase"
                >
                  aA
                </button>
              </div>
            </div>

            <!-- TEXT ALIGNMENT -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Alignment</label>
              <div class="btn-group btn-group-sm w-100">
                <button
                  class="btn"
                  :class="activeTextElement.textAlign === 'left' ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Align Left"
                  @click="setTextAlign('left')"
                >
                  Left
                </button>
                <button
                  class="btn"
                  :class="activeTextElement.textAlign === 'center' || !activeTextElement.textAlign ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Align Center"
                  @click="setTextAlign('center')"
                >
                  Center
                </button>
                <button
                  class="btn"
                  :class="activeTextElement.textAlign === 'right' ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Align Right"
                  @click="setTextAlign('right')"
                >
                  Right
                </button>
              </div>
            </div>

            <!-- TEXT COLOR -->
            <div class="d-flex flex-column gap-2">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Text Color</label>
              <div class="d-flex gap-2 align-items-center">
                <div class="input-group input-group-sm" style="flex: 1.2;">
                  <input
                    type="color"
                    v-model="activeTextElement.color"
                    class="form-control form-control-color form-control-sm p-1"
                    style="max-width: 38px;"
                    @input="setTextColor(activeTextElement.color)"
                  />
                  <input
                    type="text"
                    v-model="activeTextElement.color"
                    class="form-control form-control-sm text-uppercase font-monospace"
                    maxlength="7"
                    spellcheck="false"
                    @change="setTextColor(activeTextElement.color)"
                  />
                </div>
              </div>

              <!-- Quick Palette Swatches -->
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
                    boxShadow: activeTextElement.color?.toLowerCase() === c.toLowerCase() ? '0 0 0 2px #fff, 0 0 0 3.5px #2563eb' : 'none'
                  }"
                  :title="c"
                  @click="setTextColor(c)"
                ></button>
              </div>
            </div>

            <!-- CURVE / ARCH -->
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Curve / Arch</label>
                <div class="d-flex align-items-center gap-1">
                  <span class="badge bg-secondary rounded-pill">{{ activeTextElement.curveAmount || 0 }}%</span>
                  <button
                    v-if="activeTextElement.curveAmount"
                    class="btn btn-sm py-0 px-1 btn-outline-secondary"
                    style="font-size: 0.68rem;"
                    @click="activeTextElement.curveAmount = 0; debounceTextHistory()"
                  >
                    Reset
                  </button>
                </div>
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

            <!-- SPACING (LETTER & LINE) -->
            <div class="d-flex flex-column gap-2">
              <div class="d-flex flex-column gap-1">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="small fw-semibold text-muted">Letter Spacing</span>
                  <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.letterSpacing || 0 }}px</span>
                </div>
                <input
                  v-model.number="activeTextElement.letterSpacing"
                  type="range"
                  min="-5"
                  max="35"
                  step="1"
                  class="form-range"
                  @input="debounceTextHistory"
                />
              </div>

              <div class="d-flex flex-column gap-1">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="small fw-semibold text-muted">Line Height</span>
                  <span class="badge bg-secondary-subtle text-secondary">{{ activeTextElement.lineHeight || 1.2 }}</span>
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

            <!-- OPACITY -->
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Opacity</label>
                <span class="badge bg-secondary rounded-pill">
                  {{ Math.round((activeTextElement.opacity !== undefined ? activeTextElement.opacity : 1) * 100) }}%
                </span>
              </div>
              <input
                v-model.number="activeTextElement.opacity"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                class="form-range"
                @input="debounceTextHistory"
              />
            </div>

            <!-- ALIGN ON STRIP -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Center</label>
              <div class="btn-group btn-group-sm w-100">
                <button
                  class="btn btn-outline-secondary"
                  title="Center Horizontally"
                  @click="alignElementCenterH(activeTextElement)"
                >
                  Horizontally
                </button>
                <button
                  class="btn btn-outline-secondary"
                  title="Center Vertically"
                  @click="alignElementCenterV(activeTextElement)"
                >
                  Vertically
                </button>
              </div>
            </div>

            <!-- ACTIONS (Duplicate, Lock, Delete) -->
            <div class="d-flex gap-2 pt-2 border-top">
              <button
                class="btn btn-sm btn-outline-secondary flex-grow-1"
                @click="duplicateSelectedElements"
              >
                Duplicate
              </button>
              <button
                class="btn btn-sm flex-grow-1"
                :class="activeTextElement.isLocked ? 'btn-warning text-dark' : 'btn-outline-secondary'"
                @click="toggleLock(activeTextElement.id)"
              >
                {{ activeTextElement.isLocked ? 'Unlock' : 'Lock' }}
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                title="Delete Text"
                @click="removeSelectedElements"
              >
                Delete
              </button>
            </div>
          </div>
        </template>

        <!-- ================================================================= -->
        <!-- 4. BACKGROUND TAB: Customization & Opacity Controls               -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'background'">
          <div class="d-flex align-items-center justify-content-between border-bottom pb-2 flex-shrink-0">
            <h6 class="fw-bold text-dark m-0 fs-6">Background Customizer</h6>
            <span class="badge bg-secondary bg-opacity-10 text-secondary border">Background</span>
          </div>

          <!-- Current Style Status Preview Banner -->
          <div
            class="card p-2 border rounded-3 bg-light d-flex flex-row align-items-center justify-content-between gap-2 flex-shrink-0 w-100 shadow-none"
            style="min-height: 52px;"
          >
            <div class="d-flex align-items-center gap-2 min-w-0 flex-grow-1 overflow-hidden">
              <div
                class="rounded border shadow-sm flex-shrink-0"
                style="width: 36px; height: 36px;"
                :style="{
                  background: frameBg.type === 'gradient' ? frameBg.value : (frameBg.baseColor || '#FFFFFF'),
                  backgroundImage: frameBg.texture ? getTextureBackgroundImage(frameBg.texture) : (frameBg.type === 'gradient' ? frameBg.value : 'none'),
                  backgroundSize: (frameBg.scale || 1) * 60 + 'px'
                }"
              ></div>
              <div class="min-w-0 flex-grow-1 overflow-hidden">
                <span class="small fw-bold text-dark d-block text-truncate" style="font-size: 0.8rem; line-height: 1.25;">
                  {{ frameBg.texture ? 'Pattern / Textured' : (frameBg.type === 'gradient' ? 'Gradient Strip' : 'Solid Color') }}
                </span>
                <span v-if="frameBg.type === 'gradient'" class="small text-muted font-monospace d-block text-truncate" style="font-size: 0.7rem; line-height: 1.25;">
                  {{ customGradient.type === 'radial' ? 'Radial Bloom' : customGradient.angle + '°' }} · {{ customGradient.color1 }} → {{ customGradient.color2 }}
                </span>
                <span v-else class="small text-muted font-monospace d-block text-truncate" style="font-size: 0.7rem; line-height: 1.25;">{{ frameBg.baseColor || '#FFFFFF' }}</span>
              </div>
            </div>
            <button
              class="btn btn-sm btn-outline-secondary py-0 px-2 flex-shrink-0"
              style="font-size: 0.75rem; height: 26px; line-height: 24px;"
              title="Reset to clean white background"
              @click="resetFrameBackground"
            >
              Reset
            </button>
          </div>

          <!-- MODE SELECTOR: SOLID COLOR vs GRADIENT -->
          <div class="d-flex flex-column gap-2">
            <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Background Type</label>
            <div class="btn-group btn-group-sm w-100" role="group">
              <button
                type="button"
                class="btn py-1"
                :class="frameBg.type !== 'gradient' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                @click="switchToColorMode()"
              >
                Solid Color
              </button>
              <button
                type="button"
                class="btn py-1"
                :class="frameBg.type === 'gradient' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                @click="switchToGradientMode()"
              >
                Gradient
              </button>
            </div>
          </div>

          <!-- ==================== GRADIENT EDITOR ==================== -->
          <div v-if="frameBg.type === 'gradient'" class="d-flex flex-column gap-3">
            <!-- Gradient Live Bar & Swap -->
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Gradient Preview</label>
                <button
                  type="button"
                  class="btn btn-xs btn-outline-secondary py-0 px-2"
                  style="font-size: 0.72rem;"
                  title="Swap gradient start and end colors"
                  @click="swapGradientColors()"
                >
                  ⇄ Reverse
                </button>
              </div>
              <div
                class="rounded-2 border shadow-sm w-100"
                style="height: 26px;"
                :style="{ background: frameBg.value }"
              ></div>
            </div>

            <!-- Color Stops -->
            <div class="d-flex flex-column gap-2">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Color Stops</label>
                <button
                  v-if="!customGradient.color3"
                  type="button"
                  class="btn btn-link p-0 text-decoration-none text-primary"
                  style="font-size: 0.72rem;"
                  @click="addGradientStop()"
                >
                  + Add 3rd Stop
                </button>
                <button
                  v-else
                  type="button"
                  class="btn btn-link p-0 text-decoration-none text-danger"
                  style="font-size: 0.72rem;"
                  @click="removeGradientStop()"
                >
                  ✕ Remove 3rd Stop
                </button>
              </div>

              <!-- Stop 1 (Start) -->
              <div class="d-flex align-items-center gap-2">
                <span class="small text-muted fw-semibold" style="width: 50px; font-size: 0.75rem;">Start</span>
                <div class="input-group input-group-sm flex-grow-1">
                  <input
                    type="color"
                    v-model="customGradient.color1"
                    class="form-control form-control-color form-control-sm p-1"
                    style="max-width: 38px;"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                  <input
                    type="text"
                    v-model="customGradient.color1"
                    class="form-control form-control-sm text-uppercase font-monospace"
                    maxlength="7"
                    spellcheck="false"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                </div>
              </div>

              <!-- Stop 3 (Middle / Optional) -->
              <div v-if="customGradient.color3" class="d-flex align-items-center gap-2">
                <span class="small text-muted fw-semibold" style="width: 50px; font-size: 0.75rem;">Middle</span>
                <div class="input-group input-group-sm flex-grow-1">
                  <input
                    type="color"
                    v-model="customGradient.color3"
                    class="form-control form-control-color form-control-sm p-1"
                    style="max-width: 38px;"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                  <input
                    type="text"
                    v-model="customGradient.color3"
                    class="form-control form-control-sm text-uppercase font-monospace"
                    maxlength="7"
                    spellcheck="false"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                </div>
              </div>

              <!-- Stop 2 (End) -->
              <div class="d-flex align-items-center gap-2">
                <span class="small text-muted fw-semibold" style="width: 50px; font-size: 0.75rem;">End</span>
                <div class="input-group input-group-sm flex-grow-1">
                  <input
                    type="color"
                    v-model="customGradient.color2"
                    class="form-control form-control-color form-control-sm p-1"
                    style="max-width: 38px;"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                  <input
                    type="text"
                    v-model="customGradient.color2"
                    class="form-control form-control-sm text-uppercase font-monospace"
                    maxlength="7"
                    spellcheck="false"
                    @input="updateCustomGradient(true)"
                    @change="saveHistoryState"
                  />
                </div>
              </div>
            </div>

            <!-- Direction & Angle Controls -->
            <div class="d-flex flex-column gap-2">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Direction / Style</label>
                <span class="small text-muted font-monospace" style="font-size: 0.75rem;">
                  {{ customGradient.type === 'radial' ? 'Radial Bloom' : customGradient.angle + '°' }}
                </span>
              </div>

              <!-- Direction quick presets -->
              <div class="btn-group btn-group-sm w-100" role="group">
                <button
                  type="button"
                  class="btn btn-sm py-1"
                  :class="customGradient.type === 'linear' && customGradient.angle === 180 ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  title="Top to Bottom (180°)"
                  @click="setGradientAngle(180)"
                >
                  ↓ 180°
                </button>
                <button
                  type="button"
                  class="btn btn-sm py-1"
                  :class="customGradient.type === 'linear' && customGradient.angle === 135 ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  title="Diagonal (135°)"
                  @click="setGradientAngle(135)"
                >
                  ↘ 135°
                </button>
                <button
                  type="button"
                  class="btn btn-sm py-1"
                  :class="customGradient.type === 'linear' && customGradient.angle === 90 ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  title="Left to Right (90°)"
                  @click="setGradientAngle(90)"
                >
                  → 90°
                </button>
                <button
                  type="button"
                  class="btn btn-sm py-1"
                  :class="customGradient.type === 'linear' && customGradient.angle === 0 ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  title="Bottom to Top (0°)"
                  @click="setGradientAngle(0)"
                >
                  ↑ 0°
                </button>
                <button
                  type="button"
                  class="btn btn-sm py-1 d-inline-flex align-items-center justify-content-center gap-1"
                  :class="customGradient.type === 'radial' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  title="Radial Bloom"
                  @click="setGradientType('radial')"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                  <span>Radial</span>
                </button>
              </div>

              <!-- Angle Range Slider (for linear gradients) -->
              <div v-if="customGradient.type === 'linear'" class="d-flex flex-column gap-1 mt-1">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="small text-muted" style="font-size: 0.72rem;">Custom Angle</span>
                  <span class="badge bg-secondary-subtle text-secondary font-monospace" style="font-size: 0.7rem;">{{ customGradient.angle }}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  v-model.number="customGradient.angle"
                  class="form-range"
                  @input="updateCustomGradient(true)"
                  @change="saveHistoryState"
                />
              </div>
            </div>

            <!-- Quick Gradient Presets Palette -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-1" style="font-size: 0.72rem;">Studio Gradient Presets</label>
              <div class="row row-cols-3 g-1">
                <div
                  v-for="grad in bgGradients"
                  :key="grad.id"
                  class="col"
                >
                  <button
                    type="button"
                    class="btn p-0 w-100 rounded-2 border position-relative"
                    :class="{ 'border-primary shadow-sm': frameBg.value === grad.value }"
                    :style="{
                      background: grad.value,
                      height: '28px',
                      boxShadow: frameBg.value === grad.value ? '0 0 0 2px #fff, 0 0 0 3.5px #2563eb' : 'none'
                    }"
                    :title="grad.name"
                    @click="setFrameGradient(grad.value)"
                  ></button>
                </div>
              </div>
            </div>
          </div>

          <!-- ==================== SOLID COLOR PICKER ==================== -->
          <div v-else class="d-flex flex-column gap-2">
            <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Strip Base Color</label>
            <div class="d-flex gap-2 align-items-center">
              <div class="input-group input-group-sm" style="flex: 1.2;">
                <input
                  type="color"
                  v-model="frameBg.baseColor"
                  class="form-control form-control-color form-control-sm p-1"
                  style="max-width: 38px;"
                  @input="frameBg.type = 'color'; frameBg.value = frameBg.baseColor; selectedBgColor = frameBg.baseColor; debounceTextHistory()"
                  @change="saveHistoryState"
                />
                <input
                  type="text"
                  v-model="frameBg.baseColor"
                  class="form-control form-control-sm text-uppercase font-monospace"
                  maxlength="7"
                  spellcheck="false"
                  placeholder="#FFFFFF"
                  @input="frameBg.type = 'color'; frameBg.value = frameBg.baseColor; selectedBgColor = frameBg.baseColor; debounceTextHistory()"
                  @change="saveHistoryState"
                />
              </div>
            </div>

            <!-- Quick Background Color Palette -->
            <div class="d-flex align-items-center gap-1 flex-wrap">
              <button
                v-for="col in ['#FFFFFF', '#FEFBF6', '#111827', '#FCE7F3', '#EDE9FE', '#D1FAE5', '#FEF3C7', '#E0F2FE', '#2F5BEA']"
                :key="col"
                type="button"
                class="btn p-0 rounded-circle border shadow-none"
                :style="{
                  backgroundColor: col,
                  width: '20px',
                  height: '20px',
                  boxShadow: frameBg.baseColor?.toLowerCase() === col.toLowerCase() ? '0 0 0 2px #fff, 0 0 0 3.5px #2563eb' : 'none'
                }"
                :title="col"
                @click="setFrameSolidColor(col)"
              ></button>
            </div>
          </div>

          <!-- TEXTURE CUSTOMIZATION & OPACITY (Active when a texture is present) -->
          <div v-if="frameBg.texture" class="card p-3 bg-light border rounded-3 d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <span class="small fw-bold text-secondary text-uppercase">Texture Adjustments</span>
              <div class="d-flex align-items-center gap-1">
                <span class="badge bg-primary rounded-pill">Active</span>
                <button
                  type="button"
                  class="btn btn-xs btn-outline-danger py-0 px-2"
                  style="font-size: 0.7rem;"
                  title="Remove pattern or texture overlay"
                  @click="clearFrameTexture"
                >
                  Remove
                </button>
              </div>
            </div>

            <!-- Opacity / Intensity Slider -->
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center">
                <span class="small fw-semibold text-muted">Intensity / Opacity</span>
                <span class="badge bg-secondary rounded-pill">{{ Math.round((frameBg.opacity || 0.85) * 100) }}%</span>
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
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center">
                <span class="small fw-semibold text-muted">Tile Pattern Scale</span>
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
            <div class="d-flex flex-column gap-1">
              <span class="small fw-semibold text-muted">Blend Mode</span>
              <div class="btn-group btn-group-sm w-100">
                <button
                  type="button"
                  class="btn"
                  :class="frameBg.blendMode === 'multiply' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  @click="frameBg.blendMode = 'multiply'; debounceTextHistory()"
                >
                  Multiply
                </button>
                <button
                  type="button"
                  class="btn"
                  :class="frameBg.blendMode === 'normal' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  @click="frameBg.blendMode = 'normal'; debounceTextHistory()"
                >
                  Normal
                </button>
                <button
                  type="button"
                  class="btn"
                  :class="frameBg.blendMode === 'overlay' ? 'btn-primary fw-bold' : 'btn-outline-secondary'"
                  @click="frameBg.blendMode = 'overlay'; debounceTextHistory()"
                >
                  Overlay
                </button>
              </div>
            </div>
          </div>

          <!-- If No Texture Active -->
          <div v-else class="alert alert-light border small text-muted p-3 rounded-3 mb-0">
            <div class="d-flex align-items-center gap-1 mb-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span class="fw-bold text-dark">Tactile Paper Textures</span>
            </div>
            Pick a texture (Polka Dots, Notebook Grid, Checkerboard) in the left Background drawer to adjust grain opacity, scale, and blend modes here.
          </div>
        </template>

        <!-- ================================================================= -->
        <!-- 5. UPLOADS TAB: Creative Uploads & Image Inspector                -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'uploads'">
          <div class="d-flex align-items-center justify-content-between border-bottom pb-2">
            <h6 class="fw-bold text-dark m-0 fs-6">Upload Inspector</h6>
            <span class="badge bg-secondary bg-opacity-10 text-secondary border">Uploads</span>
          </div>

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
              <button class="btn btn-sm btn-outline-danger p-1" title="Delete" @click="removeSelectedElements">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>

            <!-- OPACITY -->
            <div class="d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Opacity</label>
                <span class="badge bg-secondary rounded-pill">
                  {{ Math.round((activeSelectedElement.opacity !== undefined ? activeSelectedElement.opacity : 1) * 100) }}%
                </span>
              </div>
              <input
                v-model.number="activeSelectedElement.opacity"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                class="form-range"
                @input="debounceTextHistory"
              />
            </div>

            <!-- ROTATION & FLIP -->
            <div class="d-flex flex-column gap-2">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Rotation & Flip</label>
                <button
                  class="btn btn-sm py-0 px-1 btn-outline-secondary"
                  style="font-size: 0.68rem;"
                  @click="activeSelectedElement.rotation = 0; saveHistoryState()"
                >
                  Reset 0°
                </button>
              </div>
              <div class="d-flex align-items-center gap-2">
                <input
                  v-model.number="activeSelectedElement.rotation"
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  class="form-range"
                  @input="debounceTextHistory"
                />
                <span class="badge bg-light text-dark border font-monospace" style="min-width: 44px; text-align: center;">
                  {{ activeSelectedElement.rotation || 0 }}°
                </span>
              </div>

              <!-- Flip Buttons -->
              <div class="btn-group btn-group-sm w-100">
                <button
                  class="btn"
                  :class="activeSelectedElement.flipX ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Flip Horizontally"
                  @click="flipElementH(activeSelectedElement)"
                >
                  ⇄ Flip Horizontal
                </button>
                <button
                  class="btn"
                  :class="activeSelectedElement.flipY ? 'btn-primary' : 'btn-outline-secondary'"
                  title="Flip Vertically"
                  @click="flipElementV(activeSelectedElement)"
                >
                  ⇅ Flip Vertical
                </button>
              </div>
            </div>

            <!-- DIMENSIONS -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Size (px)</label>
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

            <!-- ALIGN ON STRIP -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Alignment</label>
              <div class="btn-group btn-group-sm w-100">
                <button class="btn btn-outline-secondary" @click="alignElementCenterH(activeSelectedElement)">Center H</button>
                <button class="btn btn-outline-secondary" @click="alignElementCenterV(activeSelectedElement)">Center V</button>
              </div>
            </div>

            <!-- ACTIONS -->
            <div class="d-flex gap-2 pt-2 border-top">
              <button class="btn btn-sm btn-outline-secondary flex-grow-1" @click="duplicateSelectedElements">Duplicate</button>
              <button
                class="btn btn-sm flex-grow-1"
                :class="activeSelectedElement.isLocked ? 'btn-warning text-dark' : 'btn-outline-secondary'"
                @click="toggleLock(activeSelectedElement.id)"
              >
                {{ activeSelectedElement.isLocked ? 'Unlock' : 'Lock' }}
              </button>
              <button class="btn btn-sm btn-outline-danger" @click="removeSelectedElements">Delete</button>
            </div>
          </div>

          <!-- CASE B: No Media Selected -->
          <div v-else class="card border-dashed p-4 text-center my-auto bg-light rounded-3">
            <div class="d-inline-flex align-items-center justify-content-center p-3 rounded-circle bg-white border text-secondary mx-auto mb-2" style="width: 52px; height: 52px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p class="small text-muted mb-0 fw-medium">Click on media to edit features</p>
          </div>
        </template>

        <!-- ================================================================= -->
        <!-- 6. LAYERS TAB: Creative Layer Depth & Alignment Inspector         -->
        <!-- ================================================================= -->
        <template v-else-if="activeTool === 'layers'">
          <div class="d-flex align-items-center justify-content-between border-bottom pb-2">
            <h6 class="fw-bold text-dark m-0 fs-6">Layer Inspector</h6>
            <span class="badge bg-secondary bg-opacity-10 text-secondary border">Layers</span>
          </div>

          <!-- When a layer is selected -->
          <div v-if="activeSelectedElement" class="d-flex flex-column gap-3">
            <div class="card p-2 bg-light border rounded-3 d-flex flex-row align-items-center gap-2">
              <div class="p-1 rounded-2 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center flex-shrink-0" style="width: 28px; height: 28px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <div class="min-w-0 flex-grow-1">
                <span class="small fw-bold text-dark d-block text-truncate">{{ getElementDisplayName(activeSelectedElement) }}</span>
                <span class="badge bg-primary bg-opacity-10 text-primary" style="font-size: 0.65rem;">Active Layer</span>
              </div>
              <button
                class="btn btn-sm p-1"
                :class="activeSelectedElement.isLocked ? 'btn-warning text-dark' : 'btn-outline-secondary'"
                :title="activeSelectedElement.isLocked ? 'Unlock layer' : 'Lock layer'"
                @click="toggleLock(activeSelectedElement.id)"
              >
                <svg v-if="activeSelectedElement.isLocked" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
              </button>
            </div>

            <!-- Stacking Depth Controls -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Stacking Depth</label>
              <div class="btn-group btn-group-sm w-100">
                <button class="btn btn-outline-secondary" :title="`Bring to Front (${shortcuts.bringToFront})`" @click="bringToFrontSelected">
                  ⇪▲ Front
                </button>
                <button class="btn btn-outline-secondary" :title="`Bring Forward (${shortcuts.bringForward})`" @click="bringForward(activeSelectedElement.id)">
                  ▲ Forward
                </button>
                <button class="btn btn-outline-secondary" :title="`Send Backward (${shortcuts.sendBackward})`" @click="sendBackward(activeSelectedElement.id)">
                  ▼ Backward
                </button>
                <button class="btn btn-outline-secondary" :title="`Send to Back (${shortcuts.sendToBack})`" @click="sendToBackSelected">
                  ⇪▼ Back
                </button>
              </div>
            </div>

            <!-- Canvas Alignment -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Canvas Alignment</label>
              <div class="btn-group btn-group-sm w-100">
                <button class="btn btn-outline-secondary" @click="alignElementCenterH(activeSelectedElement)">
                  Center Horizontal
                </button>
                <button class="btn btn-outline-secondary" @click="alignElementCenterV(activeSelectedElement)">
                  Center Vertical
                </button>
              </div>
            </div>

            <!-- Visibility & Lock -->
            <div class="d-flex flex-column gap-1">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">State</label>
              <div class="btn-group btn-group-sm w-100">
                <button
                  class="btn"
                  :class="activeSelectedElement.isHidden ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="toggleHide(activeSelectedElement.id)"
                >
                  {{ activeSelectedElement.isHidden ? 'Show Layer' : 'Hide Layer' }}
                </button>
                <button
                  class="btn"
                  :class="activeSelectedElement.isLocked ? 'btn-warning text-dark' : 'btn-outline-secondary'"
                  @click="toggleLock(activeSelectedElement.id)"
                >
                  {{ activeSelectedElement.isLocked ? 'Locked' : 'Unlocked' }}
                </button>
              </div>
            </div>

            <!-- Actions -->
            <div class="d-flex gap-2 pt-2 border-top">
              <button class="btn btn-sm btn-outline-secondary flex-grow-1" @click="duplicateSelectedElements">Duplicate</button>
              <button class="btn btn-sm btn-outline-danger" @click="removeSelectedElements">Delete</button>
            </div>
          </div>

          <!-- When no layer is selected -->
          <div v-else class="d-flex flex-column gap-3">
            <div class="card p-3 bg-light border rounded-3 text-center">
              <div class="d-inline-flex align-items-center justify-content-center p-3 rounded-circle bg-white border text-secondary mx-auto mb-2" style="width: 52px; height: 52px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <h6 class="fw-bold text-dark mb-1">Layers Overview</h6>
              <p class="small text-muted mb-2">Total {{ canvasElements.length }} elements on photostrip.</p>
              <div class="d-flex justify-content-center gap-1">
                <span class="badge bg-primary rounded-pill">Cutouts: {{ showCutouts ? 'Covering' : 'Hidden' }}</span>
              </div>
            </div>

            <!-- Bulk Layer Actions -->
            <div class="d-flex flex-column gap-2">
              <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Bulk Layer Actions</label>
              <button
                class="btn btn-sm btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2"
                :disabled="canvasElements.length === 0"
                @click="lockAllElements"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>Lock All Elements</span>
              </button>
              <button
                class="btn btn-sm btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2"
                :disabled="canvasElements.length === 0"
                @click="unlockAllElements"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
                <span>Unlock All Elements</span>
              </button>
              <button
                class="btn btn-sm btn-outline-secondary w-100"
                :disabled="selectedElementIds.length === 0"
                @click="selectedElementIds = []"
              >
                Deselect All
              </button>
            </div>

            <div class="alert alert-light border small text-muted p-2 rounded-3 mb-0 d-flex align-items-start gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Reorder layers by dragging or using the arrow buttons in the left Layers Stack drawer.</span>
            </div>
          </div>
        </template>

        <!-- Fallback for any unspecified tab -->
        <template v-else>
          <div class="card border-dashed p-4 text-center my-auto bg-light rounded-3">
            <h6 class="fw-bold text-dark mb-1">Properties</h6>
            <p class="small text-muted mb-0">Select an item to view options.</p>
          </div>
        </template>
      </aside>
</template>
