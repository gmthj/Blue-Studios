<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"


const editor = useFrameEditorContext()
const {
  activeBgTab,
  activeTool,
  addElement,
  addTextElement,
  addUploadToCanvas,
  applyTemplate,
  bgColors,
  bgGradients,
  bgPatterns,
  bgTextures,
  borderColor,
  borderWidth,
  bringForward,
  canvasElements,
  captionColor,
  clearFrameTexture,
  closeDrawer,
  deleteUpload,
  elementSearchQuery,
  filteredElementCategories,
  formatAspect,
  frameBg,
  getElementDisplayName,
  getLayoutAspect,
  getLayoutSlots,
  getShapePathD,
  getTapePattern,
  getTextureBackgroundImage,
  handleFileUpload,
  handleFileUploadDrop,
  isDrawerOpen,
  isUploading,
  onAssetDragStart,
  onAssetDragEnd,
  onDropzoneDragOver,
  removeElementById,
  resetFrameBackground,
  reversedElements,
  selectLayer,
  selectedBgColor,
  selectedElementIds,
  selectedElementTag,
  sendBackward,
  setFrameGradient,
  setFrameSolidColor,
  setFrameTexture,
  showCutouts,
  templateName,
  templatePresets,
  textPresets,
  toggleHide,
  toggleLock,
  triggerFileUpload,
  triggerFitToScreen,
  uploadInputRef,
  userUploads
} = editor
</script>

<template>
      <!-- Expandable Flyout Drawer (Bootstrap 5) -->
      <Transition name="drawer" @after-enter="triggerFitToScreen" @after-leave="triggerFitToScreen">
        <div v-if="isDrawerOpen" class="canva-drawer bg-white border-end d-flex flex-column flex-shrink-0 shadow-sm overflow-hidden" style="width: 310px; z-index: 15;">
          <div class="mobile-sheet-grabber d-lg-none mt-2 mb-0"></div>
          <div class="p-3 border-bottom d-flex align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2 flex-grow-1 px-1">
            <div class="p-1 rounded-2 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 28px; height: 28px;">
              <svg v-if="activeTool === 'templates'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              <svg v-else-if="activeTool === 'elements'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3.16a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1H8.3z" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <circle cx="17.5" cy="17.5" r="3.5" />
              </svg>
              <svg v-else-if="activeTool === 'text'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
              <svg v-else-if="activeTool === 'uploads'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <svg v-else-if="activeTool === 'background'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <svg v-else-if="activeTool === 'layers'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span class="fw-bold fs-6 text-dark text-capitalize">
              {{
                activeTool === 'elements' ? 'Elements' :
                activeTool === 'templates' ? 'Templates Presets' :
                activeTool === 'text' ? 'Text & Typography' :
                activeTool === 'uploads' ? 'Upload Media' :
                activeTool === 'background' ? 'Background Styles' :
                activeTool === 'layers' ? 'Layers Stack' : activeTool
              }}
            </span>
          </div>
          <button class="btn btn-sm btn-light text-muted p-1 rounded d-flex align-items-center justify-content-center" style="width: 30px; height: 30px;" title="Collapse drawer" @click="closeDrawer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <!-- DRAWER CONTENT: TEMPLATES -->
        <div v-if="activeTool === 'templates'" class="drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">

          <div>
            <h6 class="fw-bold text-dark mb-1">Starter Layout Presets</h6>
            <p class="small text-muted mb-3">Click to load fresh layout, frame, and styles.</p>

            <div class="row row-cols-2 g-2">
              <div
                v-for="tpl in templatePresets"
                :key="tpl.id"
                class="col"
              >
                <div
                  class="card h-100 p-2 cursor-pointer border transition-all template-preset-card"
                  style="cursor: pointer;"
                  :class="{ 'border-primary shadow-sm bg-primary bg-opacity-10': templateName === tpl.name }"
                  @click="applyTemplate(tpl)"
                >
                  <div class="tpl-card-preview rounded mb-2 d-flex align-items-center justify-content-center position-relative overflow-hidden bg-light" style="height: 114px;">
                    <!-- Proportional Photostrip Frame Preview -->
                    <div
                      class="tpl-mini-strip shadow-sm position-relative overflow-hidden"
                      :style="{
                        aspectRatio: String(tpl.aspect || getLayoutAspect(tpl.layout)),
                        height: '100px',
                        background: tpl.bgType === 'gradient' ? (tpl.gradient || tpl.bg) : tpl.bg,
                        borderColor: tpl.border,
                        borderWidth: (tpl.borderWidth > 0 ? Math.min(2, Math.max(1, Math.round(tpl.borderWidth / 2))) : 0) + 'px',
                        borderStyle: 'solid',
                        borderRadius: tpl.shape === 'Circle' ? '6px' : (tpl.shape === 'Square' ? '0px' : '3px')
                      }"
                    >
                      <!-- Mini texture overlay preview if present -->
                      <div
                        v-if="tpl.texture"
                        class="position-absolute top-0 start-0 w-100 h-100 pointer-events-none opacity-50"
                        :style="{ backgroundImage: getTextureBackgroundImage(tpl.texture), backgroundSize: '12px 12px' }"
                      ></div>

                      <!-- Mini Cutout Slots accurately positioned via percentage coordinates -->
                      <div
                        v-for="(slot, idx) in getLayoutSlots(tpl.layout)"
                        :key="idx"
                        class="mini-slot position-absolute"
                        :class="['shape-' + tpl.shape.toLowerCase()]"
                        :style="{
                          left: slot.x + '%',
                          top: slot.y + '%',
                          width: slot.w + '%',
                          height: slot.h + '%'
                        }"
                      ></div>

                      <!-- Mini bottom caption placeholder line -->
                      <div
                        class="mini-caption-line position-absolute start-50 translate-middle-x"
                        :style="{
                          bottom: '3%',
                          width: '55%',
                          height: '2px',
                          backgroundColor: tpl.captionColor || tpl.border,
                          borderRadius: '1px',
                          opacity: 0.65
                        }"
                      ></div>
                    </div>
                  </div>
                  <div class="d-flex flex-column">
                    <span class="small fw-bold text-dark text-truncate">{{ tpl.name }}</span>
                    <div class="d-flex align-items-center justify-content-between mt-1">
                      <span class="badge bg-secondary-subtle text-secondary" style="font-size: 0.65rem;">{{ tpl.tag }}</span>
                      <span class="text-muted" style="font-size: 0.65rem;">{{ formatAspect(tpl.aspect || getLayoutAspect(tpl.layout)) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: ELEMENTS (Stickers, Washi Tape, Shapes, Vectors) -->
        <div v-if="activeTool === 'elements'" class="drawer-content elements-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <!-- Instant Search Box & Category Filter Chips -->
          <div class="d-flex flex-column gap-2 mb-2">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light border-end-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                v-model="elementSearchQuery"
                type="text"
                class="form-control form-control-sm bg-light border-start-0 ps-1"
                placeholder="Search elements, shapes, washi..."
              />
              <button v-if="elementSearchQuery" class="btn btn-outline-secondary border-start-0" title="Clear search" @click="elementSearchQuery = ''">×</button>
            </div>
          </div>

          <!-- Empty search state -->
          <div v-if="filteredElementCategories.length === 0" class="text-center py-5 text-muted">
            <div class="d-inline-flex align-items-center justify-content-center p-3 rounded-circle bg-light border text-secondary mx-auto mb-3" style="width: 52px; height: 52px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h6 class="fw-bold text-dark mb-1">No elements found</h6>
            <p class="small text-muted mb-3">No graphics match "{{ elementSearchQuery }}".</p>
            <button class="btn btn-sm btn-primary rounded-pill px-3" @click="elementSearchQuery = ''; selectedElementTag = 'All'">Clear Search & Filters</button>
          </div>

          <!-- Filtered Elements Categories -->
          <div v-else class="d-flex flex-column gap-3">
            <div v-for="cat in filteredElementCategories" :key="cat.title">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="fw-bold text-dark mb-0 small">{{ cat.title }}</h6>
              </div>

              <div class="elements-grid">
                <button
                  v-for="item in cat.items"
                  :key="item.name"
                  class="btn btn-sm btn-light border p-1 d-flex align-items-center justify-content-center rounded-3 element-item-hover"
                  style="height: 52px;"
                  :title="item.name + (item.isSvg ? ' (Dynamic Recolorable)' : '')"
                  @click="addElement(item)"
                >
                  <!-- Vector SVG Preview -->
                  <div v-if="item.isSvg" class="element-drawer-svg" v-html="item.svgRaw"></div>

                  <!-- Sticker emoji content -->
                  <span v-else-if="item.type === 'sticker'" class="fs-4">{{ item.content }}</span>

                  <!-- Washi tape preview -->
                  <div
                    v-else-if="item.type === 'tape'"
                    class="washi-preview w-100 rounded-1 d-flex align-items-center justify-content-center shadow-sm"
                    style="height: 18px;"
                    :style="{
                      backgroundColor: item.color,
                      backgroundImage: getTapePattern(item)
                    }"
                  >
                    <span class="fw-bold text-dark" style="font-size: 0.6rem;">{{ item.name.split(' ')[0] }}</span>
                  </div>

                  <!-- Shape preview -->
                  <div
                    v-else-if="item.type === 'shape'"
                    class="d-flex align-items-center justify-content-center"
                  >
                    <svg viewBox="0 0 100 100" width="28" height="28">
                      <path
                        :d="getShapePathD(item.shapeType)"
                        :fill="item.color || '#2F5BEA'"
                        :stroke="item.strokeColor || '#0F172A'"
                        :stroke-width="item.strokeWidth || 2"
                      />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: UPLOADS -->
        <div v-if="activeTool === 'uploads'" class="drawer-content uploads-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <h6 class="fw-bold text-dark mb-1">Upload Media</h6>
            <p class="small text-muted mb-2">Add custom images, photos or SVGs to your photostrip.</p>
          </div>

          <!-- Hidden File Input -->
          <input
            ref="uploadInputRef"
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
            class="d-none"
            @change="handleFileUpload"
          />

          <!-- Drag and Drop Upload Dropzone -->
          <div
            class="card border-2 border-dashed p-4 text-center cursor-pointer mb-2 bg-light rounded-3 transition-all"
            :class="{ 'border-primary bg-primary bg-opacity-10': isUploading }"
            @dragover="onDropzoneDragOver"
            @drop="handleFileUploadDrop"
            @click="triggerFileUpload"
          >
            <div class="mb-2 text-primary">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <span class="fw-bold small text-dark d-block">{{ isUploading ? 'Processing assets...' : 'Upload files' }}</span>
            <span class="small text-muted d-block">Drag & drop or click to browse</span>
            <span class="badge bg-secondary-subtle text-secondary align-self-center mt-2" style="font-size: 0.65rem;">PNG, JPG, or SVG</span>
          </div>

          <!-- Uploaded Media Grid -->
          <div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small fw-bold text-secondary text-uppercase">YOUR ASSETS ({{ userUploads.length }})</span>
            </div>

            <!-- Empty State -->
            <div v-if="userUploads.length === 0" class="text-center py-4 text-muted bg-light rounded-3 border">
              <div class="d-inline-flex align-items-center justify-content-center p-3 rounded-circle bg-white border text-secondary mx-auto mb-2" style="width: 48px; height: 48px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span class="fw-bold small text-dark d-block mb-1">No uploads yet</span>
              <p class="small text-muted mb-0 px-3">Your uploaded photos and vector elements will appear here and persist across refreshes.</p>
            </div>

            <!-- Media Grid -->
            <div v-else class="row row-cols-2 g-2">
              <div
                v-for="item in userUploads"
                :key="item.id"
                class="col"
              >
                <div
                  class="card h-100 p-1 position-relative cursor-pointer border"
                  :title="'Click to add ' + item.name + ' to strip'"
                  draggable="true"
                  @dragstart="onAssetDragStart(item, $event)"
                  @dragend="onAssetDragEnd"
                  @click="addUploadToCanvas(item)"
                >
                  <!-- Thumbnail -->
                  <div class="bg-light rounded d-flex align-items-center justify-content-center overflow-hidden mb-1" style="height: 72px;">
                    <div v-if="item.isSvg" class="w-100 h-100 d-flex align-items-center justify-content-center p-2" v-html="item.svgContent"></div>
                    <img v-else :src="item.dataUrl" :alt="item.name" class="w-100 h-100 object-fit-cover" draggable="false" />
                  </div>
                  <span class="badge bg-primary position-absolute top-0 start-0 m-1" style="font-size: 0.6rem;">{{ item.isSvg ? 'SVG' : (item.type || 'IMG').toUpperCase() }}</span>
                  <span class="small fw-semibold text-truncate text-dark px-1">{{ item.name }}</span>

                  <!-- Delete Trash Button -->
                  <button
                    class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 p-0 rounded-circle d-flex align-items-center justify-content-center"
                    style="width: 22px; height: 22px;"
                    title="Delete from uploads"
                    @click.stop="deleteUpload(item.id, $event)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: TEXT -->
        <div v-if="activeTool === 'text'" class="drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <h6 class="fw-bold text-dark mb-1">Add text to strip</h6>
            <p class="small text-muted mb-2">Click to place typography anywhere on your frame.</p>
          </div>

          <div class="d-flex flex-column gap-2">
            <button
              v-for="preset in textPresets"
              :key="preset.label"
              class="btn btn-outline-light border text-dark text-start p-3 rounded-3 d-flex flex-column gap-1 w-100"
              @click="addTextElement(preset)"
            >
              <span class="small text-secondary fw-semibold">{{ preset.label }}</span>
              <span
                :style="{
                  fontSize: preset.fontSize + 'px',
                  fontWeight: preset.fontWeight,
                  fontStyle: preset.fontStyle || 'normal',
                  color: preset.color
                }"
              >
                {{ preset.text }}
              </span>
            </button>
          </div>
        </div>








        <!-- DRAWER CONTENT: BACKGROUND (Colors, Gradients, Textures & Patterns) -->
        <div v-if="activeTool === 'background'" class="drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div class="d-flex align-items-center justify-content-between">
            <div>
              <h6 class="fw-bold text-dark mb-0">Strip Background</h6>
              <p class="small text-muted mb-0">Solid colors, gradients, and paper grains.</p>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary py-0 px-2 flex-shrink-0"
              style="font-size: 0.75rem; height: 26px; line-height: 24px;"
              title="Reset to clean white background"
              @click="resetFrameBackground"
            >
              Reset
            </button>
          </div>

          <!-- Segmented Navigation Tabs (Single Row 3-Tab Segmented Control) -->
          <div class="btn-group btn-group-sm w-100 mb-2 p-1 bg-light border rounded-3" role="group">
            <button
              type="button"
              class="btn btn-sm py-1 px-1 fw-semibold text-truncate"
              :class="activeBgTab === 'colors' ? 'btn-white bg-white text-dark shadow-sm' : 'btn-light text-secondary border-0'"
              @click="activeBgTab = 'colors'"
            >
              Colors
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-1 fw-semibold text-truncate"
              :class="activeBgTab === 'gradients' ? 'btn-white bg-white text-dark shadow-sm' : 'btn-light text-secondary border-0'"
              @click="activeBgTab = 'gradients'"
            >
              Gradients
            </button>
            <button
              type="button"
              class="btn btn-sm py-1 px-1 fw-semibold text-truncate position-relative"
              :class="activeBgTab === 'patterns' ? 'btn-white bg-white text-dark shadow-sm' : 'btn-light text-secondary border-0'"
              @click="activeBgTab = 'patterns'"
            >
              Textures
              <span v-if="frameBg.texture" class="badge bg-primary rounded-circle p-1 ms-1" style="width: 6px; height: 6px;"></span>
            </button>
          </div>

          <!-- SUBSECTION 1: SOLID COLORS -->
          <div v-if="activeBgTab === 'colors'">
            <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">CURATED PALETTE</label>
            <div class="row row-cols-2 g-2 mb-3">
              <div
                v-for="col in bgColors"
                :key="col.value"
                class="col"
              >
                <div
                  class="card p-2 text-center cursor-pointer border rounded-2 position-relative shadow-none"
                  :class="{ 'border-primary shadow-sm': frameBg.type === 'color' && frameBg.baseColor === col.value }"
                  :style="{ backgroundColor: col.value, height: '48px' }"
                  @click="setFrameSolidColor(col.value)"
                >
                  <span class="small fw-bold m-auto" :class="{ 'text-white': col.value === '#111827' || col.value === '#2F5BEA' || col.value === '#4A3B32' }">
                    {{ col.name }}
                  </span>
                  <span v-if="frameBg.type === 'color' && frameBg.baseColor === col.value" class="badge bg-primary position-absolute top-0 end-0 m-1 p-0 rounded-circle d-flex align-items-center justify-content-center" style="width: 16px; height: 16px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>

            <!-- Custom Hex Color Input -->
            <div class="card p-2 bg-light border rounded-3 mb-2">
              <div class="mb-1">
                <span class="small fw-bold text-secondary">Custom Frame Color</span>
              </div>
              <div class="input-group input-group-sm">
                <input
                  type="color"
                  :value="frameBg.baseColor || selectedBgColor"
                  class="form-control form-control-color"
                  style="width: 42px;"
                  @input="setFrameSolidColor($event.target.value)"
                />
                <input
                  type="text"
                  :value="frameBg.baseColor || selectedBgColor"
                  class="form-control form-control-sm font-monospace text-uppercase"
                  placeholder="#FFFFFF"
                  @change="setFrameSolidColor($event.target.value)"
                />
              </div>
            </div>
          </div>

          <!-- SUBSECTION 2: AESTHETIC GRADIENTS -->
          <div v-if="activeBgTab === 'gradients'">
            <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">STUDIO GRADIENTS</label>
            <div class="row row-cols-2 g-2 mb-3">
              <div
                v-for="grad in bgGradients"
                :key="grad.id"
                class="col"
              >
                <div
                  class="card p-2 text-center cursor-pointer border rounded-2 position-relative shadow-none"
                  :class="{ 'border-primary shadow-sm': frameBg.type === 'gradient' && frameBg.value === grad.value }"
                  :style="{ background: grad.value, height: '54px' }"
                  @click="setFrameGradient(grad.value)"
                >
                  <span class="small fw-bold text-white text-shadow m-auto">{{ grad.name }}</span>
                  <span v-if="frameBg.type === 'gradient' && frameBg.value === grad.value" class="badge bg-primary position-absolute top-0 end-0 m-1 p-0 rounded-circle d-flex align-items-center justify-content-center" style="width: 16px; height: 16px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- SUBSECTION 3: TEXTURES & PATTERNS -->
          <div v-if="activeBgTab === 'patterns'">
            <!-- Tactile Textures -->
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="small fw-bold text-secondary text-uppercase mb-0">TACTILE PAPER GRAINS</label>
                <button
                  v-if="frameBg.texture"
                  type="button"
                  class="btn btn-link p-0 text-decoration-none text-danger small"
                  style="font-size: 0.72rem;"
                  title="Clear active texture pattern"
                  @click="clearFrameTexture"
                >
                  Clear Pattern
                </button>
              </div>
              <div class="d-flex flex-column gap-1">
                <button
                  v-for="tex in bgTextures"
                  :key="tex.id"
                  class="btn btn-outline-light border text-dark text-start p-2 rounded-3 d-flex align-items-center gap-2 w-100"
                  :class="{ 'border-primary bg-primary bg-opacity-10': frameBg.texture === tex.id }"
                  @click="setFrameTexture(tex.id)"
                >
                  <div class="p-1 rounded-2 bg-light border text-secondary d-flex align-items-center justify-content-center flex-shrink-0" style="width: 32px; height: 32px;">
                    <svg v-if="tex.id === 'kraft'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                      <line x1="12" y1="22.08" x2="12" y2="12"/>
                    </svg>
                    <svg v-else-if="tex.id === 'watercolor'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
                      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
                      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/>
                    </svg>
                    <svg v-else-if="tex.id === 'noise'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                      <line x1="7" y1="2" x2="7" y2="22"/>
                      <line x1="17" y1="2" x2="17" y2="22"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <line x1="2" y1="7" x2="7" y2="7"/>
                      <line x1="2" y1="17" x2="7" y2="17"/>
                      <line x1="17" y1="17" x2="22" y2="17"/>
                      <line x1="17" y1="7" x2="22" y2="7"/>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                  <div class="d-flex flex-column">
                    <span class="small fw-bold">{{ tex.name }}</span>
                    <span class="text-muted" style="font-size: 0.7rem;">{{ tex.desc }}</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Graphic Patterns -->
            <div class="mb-3">
              <label class="small fw-bold text-secondary text-uppercase mb-2 d-block">GRAPHIC PATTERNS</label>
              <div class="d-flex flex-column gap-1">
                <button
                  v-for="pat in bgPatterns"
                  :key="pat.id"
                  class="btn btn-outline-light border text-dark text-start p-2 rounded-3 d-flex align-items-center gap-2 w-100"
                  :class="{ 'border-primary bg-primary bg-opacity-10': frameBg.texture === pat.id }"
                  @click="setFrameTexture(pat.id)"
                >
                  <div class="p-1 rounded-2 bg-light border text-secondary d-flex align-items-center justify-content-center flex-shrink-0" style="width: 32px; height: 32px;">
                    <svg v-if="pat.id === 'polka'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="6" cy="6" r="2.5"/>
                      <circle cx="18" cy="6" r="2.5"/>
                      <circle cx="12" cy="12" r="2.5"/>
                      <circle cx="6" cy="18" r="2.5"/>
                      <circle cx="18" cy="18" r="2.5"/>
                    </svg>
                    <svg v-else-if="pat.id === 'grid'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <line x1="3" y1="9" x2="21" y2="9"/>
                      <line x1="3" y1="15" x2="21" y2="15"/>
                      <line x1="9" y1="3" x2="9" y2="21"/>
                      <line x1="15" y1="3" x2="15" y2="21"/>
                    </svg>
                    <svg v-else-if="pat.id === 'checkerboard'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
                      <rect x="3" y="3" width="9" height="9"/>
                      <rect x="12" y="12" width="9" height="9"/>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                  </div>
                  <div class="d-flex flex-column">
                    <span class="small fw-bold">{{ pat.name }}</span>
                    <span class="text-muted" style="font-size: 0.7rem;">{{ pat.desc }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: LAYERS -->
        <div v-if="activeTool === 'layers'" class="drawer-content layers-drawer-content p-3 d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <div>
              <h6 class="fw-bold text-dark mb-0">Layers Stack</h6>
              <p class="small text-muted mb-0">Visual depth from top to bottom.</p>
            </div>
            <span class="badge bg-primary-subtle text-primary rounded-pill">{{ canvasElements.length }} items</span>
          </div>

          <!-- Empty State when canvasElements is empty -->
          <div v-if="canvasElements.length === 0" class="text-center py-5 text-muted bg-light rounded-3 border">
            <div class="fs-1 mb-2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.8">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span class="fw-bold small text-dark d-block mb-1">No canvas elements yet</span>
            <p class="small text-muted mb-0 px-3">Add elements, washi tapes, or text from the Elements tab to manage their visual stacking order here.</p>
          </div>

          <!-- Visual Layers List (Reversed: Top layer at top of list) -->
          <div v-else class="list-group list-group-flush gap-1">
            <!-- Cutouts Fixed Indicator when toggled on -->
            <div v-if="showCutouts" class="list-group-item d-flex align-items-center justify-content-between p-2 border rounded-2 bg-light">
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-primary rounded-pill" style="font-size: 0.65rem;">FRAME</span>
                <span class="small fw-bold text-dark">Photo Cutouts Layer</span>
              </div>
              <span class="badge bg-secondary-subtle text-secondary small">Upmost (Covering)</span>
            </div>

            <!-- Draggable / Reorderable Layer Items -->
            <div
              v-for="(el, revIndex) in reversedElements"
              :key="el.id"
              class="list-group-item d-flex align-items-center justify-content-between p-2 border rounded-2 cursor-pointer transition-all"
              :class="{
                'border-primary bg-primary bg-opacity-10 shadow-sm': selectedElementIds.includes(el.id),
                'border-dashed bg-light': el.isLocked,
                'opacity-50': el.isHidden
              }"
              @click="selectLayer(el, $event)"
            >
              <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                <!-- Up / Down Reorder buttons -->
                <div class="btn-group-vertical btn-group-sm" @click.stop>
                  <button
                    class="btn btn-sm btn-light border p-0 px-1"
                    style="font-size: 8px; line-height: 1;"
                    title="Bring Forward"
                    :disabled="revIndex === 0"
                    @click="bringForward(el.id)"
                  >
                    ▲
                  </button>
                  <button
                    class="btn btn-sm btn-light border p-0 px-1"
                    style="font-size: 8px; line-height: 1;"
                    title="Send Backward"
                    :disabled="revIndex === reversedElements.length - 1"
                    @click="sendBackward(el.id)"
                  >
                    ▼
                  </button>
                </div>

                <!-- Layer Preview Icon / Content -->
                <div class="rounded bg-light border d-flex align-items-center justify-content-center flex-shrink-0" style="width: 32px; height: 32px;">
                  <span v-if="el.type === 'sticker'" class="fs-5">{{ el.content }}</span>
                  <span
                    v-else-if="el.type === 'tape'"
                    class="rounded-1 d-inline-block"
                    style="width: 20px; height: 8px;"
                    :style="{ backgroundColor: el.color }"
                  ></span>
                  <span v-else-if="el.type === 'text'" class="fw-bold text-primary small">T</span>
                  <span
                    v-else-if="el.type === 'shape'"
                    class="rounded-1 d-inline-block"
                    style="width: 14px; height: 14px;"
                    :style="{ backgroundColor: el.color }"
                  ></span>
                </div>

                <!-- Layer Label & Depth Info -->
                <div class="d-flex flex-column text-truncate">
                  <span class="small fw-semibold text-truncate text-dark">{{ getElementDisplayName(el) }}</span>
                  <div class="d-flex align-items-center gap-1">
                    <span class="text-muted" style="font-size: 0.68rem;">Depth {{ canvasElements.length - revIndex }} of {{ canvasElements.length }}</span>
                    <span v-if="el.groupId" class="badge bg-primary-subtle text-primary p-0 px-1" style="font-size: 0.6rem;">Group</span>
                  </div>
                </div>
              </div>

              <!-- Quick Action Icons (Visibility, Lock, Delete) -->
              <div class="d-flex align-items-center gap-1 flex-shrink-0" @click.stop>
                <!-- Visibility Toggle -->
                <button
                  class="btn btn-sm p-1 rounded-circle"
                  :class="el.isHidden ? 'btn-primary' : 'btn-light border text-muted'"
                  :title="el.isHidden ? 'Show element' : 'Hide element'"
                  @click="toggleHide(el.id)"
                >
                  <svg v-if="!el.isHidden" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>

                <!-- Lock Toggle -->
                <button
                  class="btn btn-sm p-1 rounded-circle"
                  :class="el.isLocked ? 'btn-primary' : 'btn-light border text-muted'"
                  :title="el.isLocked ? 'Unlock element' : 'Lock element'"
                  @click="toggleLock(el.id)"
                >
                  <svg v-if="!el.isLocked" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </button>

                <!-- Delete button -->
                <button
                  class="btn btn-sm btn-light border text-danger p-1 rounded-circle"
                  title="Delete layer"
                  @click="removeElementById(el.id)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
</template>
