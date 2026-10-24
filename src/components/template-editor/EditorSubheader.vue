<script setup>
import { useTemplateEditorContext } from "../../composables/useTemplateEditor.js"
import { IconFolder, IconSave } from "../icons/index.js"

const editor = useTemplateEditorContext()
const {
  activeSelectedElement,
  activeTextElement,
  activeVectorColorTarget,
  activeVectorElement,
  alignElementCenterH,
  alignElementCenterV,
  canvasScale,
  canvasWorkspaceRef,
  clearAllGuides,
  cloudId,
  customGuides,
  debounceTextHistory,
  duplicateSelectedElements,
  fillScreen,
  fitToScreen,
  flipElementH,
  flipElementV,
  fontSearchQuery,
  getActiveFontDisplayName,
  getElementDisplayName,
  getVectorBarTitle,
  getVectorSwatches,
  handleToggleRulers,
  history,
  historyIndex,
  isAccount,
  isElementTransformOpen,
  isFontDropdownOpen,
  isOwner,
  isSavingFrame,
  isScreenLg,
  isTextColorPickerOpen,
  isTextCurveOpen,
  isTextSpacingOpen,
  isVectorColorPickerOpen,
  isZoomMenuOpen,
  openVectorColorPicker,
  redo,
  removeSelectedElements,
  resetToActualSize,
  route,
  router,
  saveFrame,
  saveHistoryState,
  savedFramesList,
  selectFontFamily,
  setTextAlign,
  setTextColor,
  setVectorColor,
  setZoom,
  showCutouts,
  showRulers,
    stepFontSize,
  stripRef,
  templateName,
  toggleBold,
  toggleCutouts,
  toggleItalic,
  toggleLock,
  toggleRulers,
  toggleStrikethrough,
  toggleUnderline,
  toggleUppercase,
  undo,
  zoomIn,
  zoomOut,
  zoomPercentage
} = editor
</script>

<template>
    <!-- 2. Subheader Toolbar -->
    <div class="d-flex align-items-center justify-content-between px-3 py-1 bg-white border-bottom position-relative" style="min-height: 44px; z-index: 100;">
      <!-- When on SMALL screens (< lg): Show top contextual menu bar for text if selected -->
      <div
        v-if="!isScreenLg && activeTextElement"
        class="d-flex align-items-center gap-1 flex-nowrap overflow-x-auto py-1"
        style="max-width: 100%; scrollbar-width: none;"
        @mousedown.stop
      >
        <!-- Font Family Selector Dropdown -->
        <div class="position-relative font-picker-wrapper">
          <button
            class="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-between px-2 text-dark bg-white"
            style="min-width: 120px; max-width: 160px;"
            :class="{ 'border-primary shadow-sm': isFontDropdownOpen }"
            title="Font Family"
            @click.stop="isFontDropdownOpen = !isFontDropdownOpen; isTextColorPickerOpen = false; isTextSpacingOpen = false; isTextCurveOpen = false"
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
        <div class="input-group input-group-sm" style="width: 100px;">
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
        <div class="position-relative text-color-wrapper">
          <button
            class="btn btn-sm btn-outline-secondary d-flex flex-column align-items-center justify-content-center p-1 bg-white"
            style="width: 32px; height: 31px;"
            :class="{ 'border-primary shadow-sm': isTextColorPickerOpen }"
            title="Text Color"
            @click.stop="isTextColorPickerOpen = !isTextColorPickerOpen; isFontDropdownOpen = false; isTextSpacingOpen = false; isTextCurveOpen = false"
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
        <div class="position-relative text-spacing-wrapper">
          <button
            class="btn btn-sm d-flex align-items-center gap-1"
            :class="isTextSpacingOpen ? 'btn-primary' : 'btn-outline-secondary'"
            title="Letter & Line Spacing"
            @click.stop="isTextSpacingOpen = !isTextSpacingOpen; isFontDropdownOpen = false; isTextColorPickerOpen = false; isTextCurveOpen = false"
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

        <!-- Curve Popover -->
        <div class="position-relative text-curve-wrapper">
          <button
            class="btn btn-sm d-flex align-items-center gap-1"
            :class="isTextCurveOpen ? 'btn-primary' : (activeTextElement.curveAmount ? 'btn-primary-subtle text-primary border-primary' : 'btn-outline-secondary')"
            title="Text Curve / Arch"
            @click.stop="isTextCurveOpen = !isTextCurveOpen; isFontDropdownOpen = false; isTextColorPickerOpen = false; isTextSpacingOpen = false"
          >
            <span class="small fw-semibold">Curve</span>
            <span v-if="activeTextElement.curveAmount" class="badge bg-primary rounded-pill p-1" style="font-size: 8px;">{{ activeTextElement.curveAmount }}%</span>
          </button>
          <div v-if="isTextCurveOpen" class="card shadow-lg p-3 position-absolute border" style="top: calc(100% + 6px); left: 0; width: 220px; z-index: 1050;" @click.stop @mousedown.stop>
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="text-uppercase fw-bold text-muted small" style="font-size: 0.65rem;">Curve / Arch</span>
              <span class="badge bg-secondary rounded-pill">{{ activeTextElement.curveAmount || 0 }}%</span>
            </div>
            <input
              v-model.number="activeTextElement.curveAmount"
              type="range"
              min="-100"
              max="100"
              step="1"
              class="form-range mb-2"
              @input="debounceTextHistory"
            />
            <button class="btn btn-sm btn-outline-secondary w-100 py-0" style="font-size: 0.72rem;" @click="activeTextElement.curveAmount = 0; debounceTextHistory()">Reset 0%</button>
          </div>
        </div>

        <div class="vr mx-1"></div>

        <!-- Center Alignment on Strip -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Center Horizontally" @click="alignElementCenterH(activeTextElement)">
            ⇄ Center
          </button>
          <button class="btn btn-outline-secondary" title="Center Vertically" @click="alignElementCenterV(activeTextElement)">
            ⇅ Center
          </button>
        </div>

        <div class="vr mx-1"></div>

        <!-- Duplicate, Lock, Delete -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Duplicate (⌘D)" @click="duplicateSelectedElements">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button
            class="btn"
            :class="activeTextElement.isLocked ? 'btn-warning text-dark' : 'btn-outline-secondary'"
            :title="activeTextElement.isLocked ? 'Unlock Element' : 'Lock Element'"
            @click="toggleLock(activeTextElement.id)"
          >
            {{ activeTextElement.isLocked ? '🔒' : '🔓' }}
          </button>
          <button class="btn btn-outline-danger" title="Delete (Del)" @click="removeSelectedElements">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>

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

      <!-- When on SMALL screens (< lg): Show top contextual menu bar for elements/vectors/uploads -->
      <div
        v-else-if="!isScreenLg && activeSelectedElement"
        class="d-flex align-items-center gap-2 flex-nowrap overflow-x-auto py-1"
        style="max-width: 100%; scrollbar-width: none;"
        @mousedown.stop
      >
        <div class="badge bg-light text-dark border d-flex align-items-center gap-1 py-1 px-2 fw-semibold small flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a7 7 0 0 0 7 7c0 3-2 5-2 7a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2c0-2-2-4-2-7a7 7 0 0 0 7-7z" />
          </svg>
          <span>{{ activeVectorElement ? getVectorBarTitle(activeVectorElement) : getElementDisplayName(activeSelectedElement) }}</span>
        </div>

        <!-- Vector Swatches (if vector / shape / tape) -->
        <div v-if="activeVectorElement && getVectorSwatches(activeVectorElement).length > 0" class="d-flex align-items-center gap-1 vector-swatch-wrapper">
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
              class="card shadow-lg p-2 position-absolute border vector-color-popover"
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

        <!-- Transform & Adjust Popover (Opacity, Rotate, Flip, Stroke) -->
        <div class="position-relative element-transform-wrapper">
          <button
            class="btn btn-sm d-flex align-items-center gap-1"
            :class="isElementTransformOpen ? 'btn-primary' : 'btn-outline-secondary'"
            title="Adjust Size, Opacity, Rotation & Flip"
            @click.stop="isElementTransformOpen = !isElementTransformOpen; isVectorColorPickerOpen = false"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span class="small">Adjust</span>
          </button>

          <div
            v-if="isElementTransformOpen"
            class="card shadow-lg p-3 position-absolute border"
            style="top: calc(100% + 6px); left: 0; width: 230px; z-index: 1050;"
            @click.stop
            @mousedown.stop
          >
            <div class="text-uppercase fw-bold text-muted small mb-2" style="font-size: 0.65rem;">Element Adjustments</div>
            
            <!-- Opacity -->
            <div class="mb-2">
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span>Opacity</span>
                <span class="fw-bold text-dark">{{ Math.round((activeSelectedElement.opacity !== undefined ? activeSelectedElement.opacity : 1) * 100) }}%</span>
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

            <!-- Rotation -->
            <div class="mb-2">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small text-muted">Rotate</span>
                <button class="btn btn-sm py-0 px-1 btn-outline-secondary" style="font-size: 0.65rem;" @click="activeSelectedElement.rotation = 0; saveHistoryState()">0°</button>
              </div>
              <input
                v-model.number="activeSelectedElement.rotation"
                type="range"
                min="-180"
                max="180"
                step="1"
                class="form-range"
                @input="debounceTextHistory"
              />
            </div>

            <!-- Flip -->
            <div class="btn-group btn-group-sm w-100 mb-2">
              <button class="btn" :class="activeSelectedElement.flipX ? 'btn-primary' : 'btn-outline-secondary'" @click="flipElementH(activeSelectedElement)">
                ⇄ Flip H
              </button>
              <button class="btn" :class="activeSelectedElement.flipY ? 'btn-primary' : 'btn-outline-secondary'" @click="flipElementV(activeSelectedElement)">
                ⇅ Flip V
              </button>
            </div>

            <!-- Shape Stroke Outline if shape -->
            <div v-if="activeSelectedElement.type === 'shape'" class="mb-1">
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span>Outline Width</span>
                <span class="fw-bold text-dark">{{ activeSelectedElement.strokeWidth || 2 }}px</span>
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
        </div>

        <div class="vr mx-1"></div>

        <!-- Center Alignment on Strip -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Center Horizontally" @click="alignElementCenterH(activeSelectedElement)">
            ⇄ Center
          </button>
          <button class="btn btn-outline-secondary" title="Center Vertically" @click="alignElementCenterV(activeSelectedElement)">
            ⇅ Center
          </button>
        </div>

        <div class="vr mx-1"></div>

        <!-- Quick actions: Duplicate, Lock, Delete -->
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" title="Duplicate (⌘D)" @click="duplicateSelectedElements">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button
            class="btn"
            :class="activeSelectedElement.isLocked ? 'btn-warning text-dark' : 'btn-outline-secondary'"
            :title="activeSelectedElement.isLocked ? 'Unlock Element' : 'Lock Element'"
            @click="toggleLock(activeSelectedElement.id)"
          >
            {{ activeSelectedElement.isLocked ? '🔒' : '🔓' }}
          </button>
          <button class="btn btn-outline-danger" title="Delete (Del)" @click="removeSelectedElements">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          <router-link to="/studio" class="text-decoration-none text-muted d-flex align-items-center gap-1" title="Back to My Studio">
            <span>&larr;</span> <span>Templates</span>
          </router-link>
          <span class="text-muted">/</span>
          <input
            v-model="templateName"
            class="form-control form-control-sm border-0 fw-bold px-1 py-0 bg-transparent text-dark"
            style="width: 170px; font-size: 0.95rem;"
            placeholder="Untitled frame"
            title="Click to rename template"
          />
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

          <!-- Rulers & Guides Toggle -->
          <button
            class="btn btn-sm rounded-pill d-flex align-items-center gap-1"
            :class="showRulers ? 'btn-primary' : 'btn-outline-secondary'"
            :title="showRulers ? 'Click to hide pixel rulers & guides (⇧R)' : 'Click to show pixel rulers & guides (⇧R)'"
            @click="handleToggleRulers"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/>
              <path d="m14.5 3.5 2 2"/>
              <path d="m11.5 6.5 1 1"/>
              <path d="m8.5 9.5 2 2"/>
              <path d="m5.5 12.5 1 1"/>
            </svg>
            <span>Rulers: {{ showRulers ? 'On' : 'Off' }}</span>
          </button>
        </div>

        <div class="d-flex align-items-center gap-2">
          <!-- Saved Frames Action Button (Links to /studio templates homepage) -->
          <router-link
            to="/studio"
            class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 text-decoration-none"
            title="Go to My Templates in My Studio"
          >
            <IconFolder :size="14" :stroke-width="2.2" />
            <span>My Templates</span>
            <span v-if="savedFramesList.length > 0" class="badge rounded-pill bg-primary ms-1">{{ savedFramesList.length }}</span>
          </router-link>

          <!-- Save Frame Button (Shows 'Save Frame' if logged in, 'Login to save' if guest) -->
          <button
            v-if="isAccount"
            class="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-bold shadow-sm"
            :disabled="isSavingFrame"
            @click="saveFrame"
            :title="cloudId ? (isOwner ? 'Save Frame to My Studio (⌘S)' : 'Save a Copy to My Studio (⌘S)') : 'Save Frame to My Studio (⌘S)'"
          >
            <IconSave :size="14" :stroke-width="2.3" />
            <span>{{ isSavingFrame ? 'Saving...' : (cloudId ? (isOwner ? 'Save Frame' : 'Save a Copy') : 'Save Frame') }}</span>
          </button>

          <router-link
            v-else
            :to="'/login?redirect=' + encodeURIComponent($route.fullPath)"
            class="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-bold shadow-sm text-decoration-none"
            title="Log in to save your template to My Studio (⌘S)"
          >
            <IconSave :size="14" :stroke-width="2.3" />
            <span>Login to save</span>
          </router-link>
        </div>
      </template>
    </div>
</template>
