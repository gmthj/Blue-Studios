<script setup>
import { computed, ref, watch } from "vue"
import { loadMyStickers } from "../../stickerTray.js"
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"
import { FONT_GROUPS_READY } from "../../stickerArt.js"
import AppIcon from "../AppIcon.vue"


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
  isAccount,
  onAssetDragEnd,
  onDropzoneDragOver,
  removeElementById,
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
  userUploads,
  appliedPresetId,
  activeTextElement,
  addTextBox,
  pickFont,
  closeDrawerOnPhone,
  clearFrameTexture
} = editor
import { getTextureBackgroundSize } from "../../constants/frameEditorData.js"
import { UPLOAD_TYPES } from "../../uploadsStore.js"

// ---- My stickers (still pictures; a moving GIF cannot go on a printed frame) ----
const myStickers = ref([])
const myStickersLoading = ref(false)
const addingStickerId = ref(null)
let myStickersLoaded = false
const shownMyStickers = computed(() => {
  const query = elementSearchQuery.value.trim().toLowerCase()
  return myStickers.value.filter((item) => item.tab === 'mine' && (!query || (item.name || '').toLowerCase().includes(query)))
})

// Loaded the first time the Elements tab is open (and again after logging in)
watch(() => [activeTool.value, isAccount.value], async ([tool, account]) => {
  if (tool !== 'elements' || !account || myStickersLoaded) return
  myStickersLoaded = true
  myStickersLoading.value = true
  try {
    myStickers.value = await loadMyStickers(true)
  } catch (error) {
    console.warn('Could not load your stickers:', error)
    myStickersLoaded = false
  } finally {
    myStickersLoading.value = false
  }
}, { immediate: true })

// The picture is copied into the frame (as a data: URL), so saving and downloading the frame
// never depend on a link that could expire
async function addMySticker(item) {
  addingStickerId.value = item.id
  let dataUrl = item.src
  try {
    const blob = await (await fetch(item.src)).blob()
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.warn('Using the sticker link as it is:', error)
  }
  addUploadToCanvas({ name: item.name, dataUrl: dataUrl, type: 'image', isSvg: false })
  addingStickerId.value = null
}

// The drawer's title, in the same place as the Sticker Maker's
const DRAWER_TITLES = { templates: 'Templates', elements: 'Elements', text: 'Text', uploads: 'Uploads', background: 'Colour' }
const drawerTitle = computed(() => DRAWER_TITLES[activeTool.value] || '')
</script>

<template>
      <!-- Expandable Flyout Drawer (Bootstrap 5) -->
      <Transition name="drawer" @after-enter="triggerFitToScreen" @after-leave="triggerFitToScreen">
        <div v-if="isDrawerOpen" class="canva-drawer te-panel te-drawer te-card">
        <div class="te-panel-head">
          <h2 class="te-panel-title">{{ drawerTitle }}</h2>
          <button type="button" class="te-close" aria-label="Hide this panel" title="Hide this panel" @click="closeDrawer">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <!-- DRAWER CONTENT: TEMPLATES -->
        <div v-if="activeTool === 'templates'" class="drawer-content te-panel-body d-flex flex-column gap-3 overflow-y-auto flex-grow-1">

          <div>
            <div class="row row-cols-2 g-2">
              <div
                v-for="tpl in templatePresets"
                :key="tpl.id"
                class="col"
              >
                <div
                  class="card h-100 p-2 cursor-pointer border transition-all template-preset-card"
                  :class="{ 'border-primary shadow-sm bg-primary bg-opacity-10': appliedPresetId === tpl.id }"
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
        <div v-if="activeTool === 'elements'" class="drawer-content elements-drawer-content te-panel-body d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <!-- Search: the same box as the Sticker Maker's -->
          <div class="te-search">
            <AppIcon name="search" :size="15" />
            <input v-model="elementSearchQuery" type="search" placeholder="Search stickers, shapes, washi…" aria-label="Search elements" />
            <button v-if="elementSearchQuery" type="button" class="te-search-clear" aria-label="Clear search" @click="elementSearchQuery = ''">
              <AppIcon name="close" :size="13" />
            </button>
          </div>

          <!-- Empty search state -->
          <div v-if="filteredElementCategories.length === 0">
            <p class="te-hint">Nothing matches "{{ elementSearchQuery }}".</p>
          </div>

          <!-- Filtered Elements Categories -->
          <div v-else class="d-flex flex-column gap-3">
            <div v-for="cat in filteredElementCategories" :key="cat.title">
              <p class="te-label">
                {{ cat.title }}
                <span class="te-count">{{ cat.items.length }}</span>
              </p>

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

          <!-- My stickers: the ones you made in the Sticker Maker (and saved from the marketplace) -->
          <div v-if="isAccount">
            <p class="te-label">
              My stickers
              <span class="te-count">{{ shownMyStickers.length }}</span>
            </p>
            <div v-if="myStickersLoading" class="te-upload-grid">
              <span v-for="n in 3" :key="n" class="skeleton te-upload-pick"></span>
            </div>
            <p v-else-if="shownMyStickers.length === 0 && elementSearchQuery" class="te-hint">None of your stickers match.</p>
            <div v-else-if="shownMyStickers.length" class="te-upload-grid">
              <div v-for="item in shownMyStickers" :key="item.id" class="te-upload">
                <button
                  type="button"
                  class="te-upload-pick"
                  :title="'Add ' + item.name"
                  :aria-label="'Add ' + item.name"
                  :disabled="addingStickerId === item.id"
                  @click="addMySticker(item)"
                >
                  <img :src="item.src" alt="" draggable="false" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: UPLOADS (the same as the Sticker Maker's Upload) -->
        <div v-if="activeTool === 'uploads'" class="drawer-content uploads-drawer-content te-panel-body d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <input
            ref="uploadInputRef"
            type="file"
            multiple
            :accept="UPLOAD_TYPES"
            class="d-none"
            @change="handleFileUpload"
          />
          <button
            type="button"
            class="te-drop"
            :class="{ 'is-busy': isUploading }"
            @dragover="onDropzoneDragOver"
            @drop="handleFileUploadDrop"
            @click="triggerFileUpload"
          >
            <span class="te-drop-tile"><AppIcon name="upload" :size="20" /></span>
            <span class="te-drop-title">{{ isUploading ? 'Adding…' : 'Choose or drop photos' }}</span>
          </button>

          <div>
            <p class="te-label">
              Your uploads
              <span class="te-count">{{ userUploads.length }}</span>
            </p>
            <div v-if="userUploads.length" class="te-upload-grid">
              <div v-for="item in userUploads" :key="item.id" class="te-upload">
                <button
                  type="button"
                  class="te-upload-pick"
                  :title="'Add ' + item.name"
                  :aria-label="'Add ' + item.name"
                  draggable="true"
                  @dragstart="onAssetDragStart(item, $event)"
                  @dragend="onAssetDragEnd"
                  @click="addUploadToCanvas(item)"
                >
                  <img :src="item.dataUrl" alt="" draggable="false" />
                </button>
                <button type="button" class="te-upload-del" title="Remove from your uploads" :aria-label="'Remove ' + item.name" @click.stop="deleteUpload(item.id, $event)">
                  <AppIcon name="close" :size="12" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- DRAWER CONTENT: TEXT (the same as the Sticker Maker) -->
        <div v-if="activeTool === 'text'" class="drawer-content te-panel-body d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div>
            <button type="button" class="btn btn-primary w-100 te-action" @click="addTextBox()">
              <AppIcon name="plus" :size="16" />
              <span>Add a text box</span>
            </button>
          </div>

          <!-- The fun fonts from the shared library. Each card is set in its own face. -->
          <div v-for="group in FONT_GROUPS_READY" :key="group.group">
            <p class="te-label">
              {{ group.group }}
              <span class="te-count">{{ group.fonts.length }}</span>
            </p>
            <div class="te-font-cards">
              <button
                v-for="font in group.fonts"
                :key="font.name"
                type="button"
                class="te-font-card"
                :class="{ active: activeTextElement && activeTextElement.fontFamily === font.stack }"
                :title="activeTextElement ? 'Change to ' + font.name : 'Add text in ' + font.name"
                @pointerdown.prevent
                @click="pickFont(font)"
              >
                <span class="te-font-card-sample" :style="{ fontFamily: font.stack }">{{ font.preview }}</span>
                <span class="te-font-card-name">{{ font.name }}</span>
              </button>
            </div>
          </div>
        </div>
        <!-- DRAWER CONTENT: COLOUR (the strip's background: a colour, a gradient, a texture) -->
        <div v-if="activeTool === 'background'" class="drawer-content te-panel-body d-flex flex-column gap-3 overflow-y-auto flex-grow-1">
          <div class="seg-tabs te-seg" role="tablist" aria-label="Background">
            <button type="button" role="tab" class="seg-tab" :class="{ active: activeBgTab === 'colors' }" :aria-selected="activeBgTab === 'colors'" @click="activeBgTab = 'colors'">Colour</button>
            <button type="button" role="tab" class="seg-tab" :class="{ active: activeBgTab === 'gradients' }" :aria-selected="activeBgTab === 'gradients'" @click="activeBgTab = 'gradients'">Gradient</button>
            <button type="button" role="tab" class="seg-tab" :class="{ active: activeBgTab === 'patterns' }" :aria-selected="activeBgTab === 'patterns'" @click="activeBgTab = 'patterns'">
              Texture<span v-if="frameBg.texture" class="te-seg-dot" aria-label="(on)"></span>
            </button>
          </div>

          <!-- Colours: one tap. Any colour and the screen picker at the end. -->
          <div v-if="activeBgTab === 'colors'" class="te-swatch-grid">
            <button
              v-for="col in bgColors"
              :key="col.value"
              type="button"
              class="te-swatch te-swatch-lg"
              :class="{ active: frameBg.type === 'color' && frameBg.baseColor === col.value }"
              :style="{ background: col.value }"
              :title="col.name"
              :aria-label="col.name"
              @click="setFrameSolidColor(col.value); closeDrawerOnPhone()"
            ></button>
            <label class="te-swatch te-swatch-lg te-swatch-custom" title="Any colour">
              <input type="color" :value="frameBg.baseColor || selectedBgColor" aria-label="Any colour" @change="setFrameSolidColor($event.target.value)" />
            </label>
          </div>

          <!-- Gradients -->
          <div v-if="activeBgTab === 'gradients'" class="te-tile-grid">
            <button
              v-for="grad in bgGradients"
              :key="grad.id"
              type="button"
              class="te-tile"
              :class="{ active: frameBg.type === 'gradient' && frameBg.value === grad.value }"
              :title="grad.name"
              @click="setFrameGradient(grad.value); closeDrawerOnPhone()"
            >
              <span class="te-tile-art" :style="{ background: grad.value }"></span>
              <span class="te-tile-name">{{ grad.name }}</span>
            </button>
          </div>

          <!-- Textures: a preview of each, on top of the colour or gradient -->
          <div v-if="activeBgTab === 'patterns'" class="te-tile-grid">
            <button
              type="button"
              class="te-tile"
              :class="{ active: !frameBg.texture }"
              title="No texture"
              @click="clearFrameTexture(); closeDrawerOnPhone()"
            >
              <span class="te-tile-art te-tile-none"><AppIcon name="close" :size="16" /></span>
              <span class="te-tile-name">None</span>
            </button>
            <button
              v-for="tex in [...bgTextures, ...bgPatterns]"
              :key="tex.id"
              type="button"
              class="te-tile"
              :class="{ active: frameBg.texture === tex.id }"
              :title="tex.name + ': ' + tex.desc"
              @click="setFrameTexture(tex.id); closeDrawerOnPhone()"
            >
              <span class="te-tile-art" :style="{ backgroundColor: '#ffffff', backgroundImage: getTextureBackgroundImage(tex.id), backgroundSize: getTextureBackgroundSize(tex.id, 0.6) }"></span>
              <span class="te-tile-name">{{ tex.name }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
</template>
