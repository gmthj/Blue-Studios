<script setup>
import { onMounted, nextTick } from 'vue'
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"
import CanvasRulerOverlay from "../CanvasRulerOverlay.vue"

const editor = useFrameEditorContext()
const {
  activeDistanceBadges,
  activeGuides,
  borderColor,
  borderWidth,
  bringForward,
  bringToFront,
  bringToFrontSelected,
  canUngroupSelected,
  canvasElements,
  canvasPanX,
  canvasPanY,
  canvasScale,
  canvasWorkspaceRef,
  captionColor,
  captionInputRef,
  captionText,
  collectiveBounds,
  currentLayoutDef,
  currentSlots,
  cursorInfo,
  customGuides,
  dragTarget,
  draggedGuide,
  duplicateElement,
  duplicateSelectedElements,
  editingTextId,
  exportConfig,
  finishEditingCaption,
  finishEditingText,
  fitToScreen,
  frameBg,
  getCurvedPathD,
  getCurvedSvgHeight,
  getCurvedSvgWidth,
  getFrameStyle,
  getFrameTextureStyle,
  getMockPhoto,
  getRenderedSvg,
  getShapePathD,
  getTapePattern,
  getTextStyle,
  groupSelectedElements,
  isDragging,
  isDraggingGuide,
  isEditingCaption,
  isExporting,
  isHandToolActive,
  isMarqueeActive,
  isPanning,
  isPositionPopoverOpen,
  isRotating,
  isScreenLg,
  isSpacePressed,
  marqueeBoxStyle,
  onCanvasClick,
  onCanvasDrop,
  onCollectiveDblClick,
  onElementDblClick,
  onFrameClick,
  onStartDragGuideFromRuler,
  onStartMoveExistingGuide,
  onWorkspaceMouseDown,
  onWorkspaceMouseLeave,
  onWorkspaceMouseMove,
  onWorkspaceMouseUp,
  onWorkspaceWheel,
  openContextMenu,
  removeGuide,
  removeSelectedElement,
  removeSelectedElements,
  rotateTarget,
  selectElement,
  selectedElementIds,
  sendBackward,
  sendToBack,
  sendToBackSelected,
  setTextRef,
  shortcuts,
  showCutouts,
  showRulers,
  slotShape,
  startCollectiveDrag,
  startCollectiveResize,
  startCollectiveRotate,
  startEditingCaption,
  startEditingText,
  startResize,
  startRotate,
  stripRef,
  toggleLock,
  togglePositionPopover,
  toggleRulers,
  transformStyle,
  ungroupSelectedElements,
  zoomPercentage
} = editor

onMounted(() => {
  nextTick(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 992) {
      fitToScreen(canvasWorkspaceRef.value, stripRef.value)
      setTimeout(() => {
        fitToScreen(canvasWorkspaceRef.value, stripRef.value)
      }, 100)
    }
  })
})
</script>

<template>
      <!-- Center Canvas Workspace -->
      <main
        ref="canvasWorkspaceRef"
        class="canvas-workspace position-relative"
        :class="{
          'is-hand-mode': isSpacePressed || isHandToolActive,
          'is-panning': isPanning,
          'has-rulers': showRulers
        }"
        @mousedown="onWorkspaceMouseDown"
        @mousemove="onWorkspaceMouseMove"
        @mouseup="onWorkspaceMouseUp"
        @mouseleave="onWorkspaceMouseLeave"
        @wheel.prevent="onWorkspaceWheel"
        @click="onCanvasClick"
      >
        <!-- Mobile Floating Stage Pills (Layout Name & Zoom/Fit Badge) -->
        <div class="canvas-stage-pills d-lg-none position-absolute top-0 start-0 end-0 d-flex justify-content-between p-2 pointer-events-none" style="z-index: 100;">
          <div class="badge bg-white text-dark shadow-sm border px-2 py-1 fw-medium pointer-events-auto d-flex align-items-center gap-1" style="font-size: 0.72rem;">
            <span>{{ currentLayoutDef.name }}</span>
            <span class="text-muted" style="font-size: 0.65rem;">({{ currentSlots.length }} slots)</span>
          </div>

          <button
            type="button"
            class="badge bg-white text-secondary shadow-sm border px-2 py-1 fw-medium pointer-events-auto btn btn-sm border-0"
            style="font-size: 0.72rem;"
            title="Reset Zoom & Fit to Screen"
            @click.stop="fitToScreen(canvasWorkspaceRef, stripRef)"
          >
            {{ zoomPercentage }}
          </button>
        </div>
        <!-- Canvas Marquee / Rubberband Selection Box -->
        <div
          v-if="isMarqueeActive && marqueeBoxStyle"
          class="canvas-marquee-box"
          :style="marqueeBoxStyle"
        ></div>

        <!-- Live Pixel Rulers & Custom Draggable Guides Overlay -->
        <CanvasRulerOverlay
          :show-rulers="showRulers"
          :scale="canvasScale"
          :pan-x="canvasPanX"
          :pan-y="canvasPanY"
          :cursor-info="cursorInfo"
          :custom-guides="customGuides"
          :is-dragging-guide="isDraggingGuide"
          :dragged-guide="draggedGuide"
          :frame-width="stripRef?.offsetWidth || 280"
          :frame-height="stripRef?.offsetHeight || Math.round(280 / currentLayoutDef.aspect)"
          @start-drag-guide="onStartDragGuideFromRuler"
          @start-move-guide="onStartMoveExistingGuide"
          @remove-guide="removeGuide"
          @toggle-rulers="toggleRulers"
        />

        <div class="canvas-viewport" :style="transformStyle">
          <!-- The Photostrip Frame -->
          <div
            ref="stripRef"
            class="photostrip-frame"
            :class="'layout-' + currentLayoutDef.id"
            :style="getFrameStyle()"
            @click.stop="onFrameClick"
            @contextmenu.prevent.stop="openContextMenu($event, null)"
            @dragover.prevent
            @drop="onCanvasDrop"
          >
            <!-- Background Texture / Pattern Overlay Layer -->
            <div
              v-if="frameBg.texture"
              class="frame-texture-overlay"
              :style="getFrameTextureStyle()"
            ></div>

            <!-- Photostrip Frame Border Overlay (Preserves exact cutout & frame size) -->
            <div
              v-if="borderWidth > 0"
              class="photostrip-border-overlay"
              :style="{
                borderColor: borderColor,
                borderWidth: borderWidth + 'px',
                borderStyle: 'solid'
              }"
            ></div>

            <!-- Slot Layout Container (EMPTY CUTOUTS - UP-MOST LAYER) -->
            <div
              class="strip-slots-container"
              :class="['layout-' + currentLayoutDef.id, { 'cutouts-hidden': !showCutouts }]"
              :style="{ zIndex: showCutouts ? 80 : 0 }"
            >
              <div
                v-for="(slot, index) in currentSlots"
                :key="slot.id"
                class="photostrip-slot cutout-slot"
                :class="['shape-' + slotShape.toLowerCase(), { 'slot-hidden': !showCutouts }]"
                :style="{
                  left: slot.x + '%',
                  top: slot.y + '%',
                  width: slot.w + '%',
                  height: slot.h + '%'
                }"
              >
                <!-- Empty Cutout Inner Aesthetic: Clean Photo Window or Mock Portrait -->
                <div class="cutout-window">
                  <img
                    v-if="(showCutouts && isExporting && exportConfig.includeMockPhotos && exportConfig.fileType !== 'photobooth_overlay') && getMockPhoto(index)"
                    :src="getMockPhoto(index)"
                    class="mock-photo-img"
                    alt="Mock portrait"
                    crossorigin="anonymous"
                    draggable="false"
                  />
                  <div v-else class="cutout-indicator">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="cutout-cam-icon">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span class="cutout-label">Photo Cutout {{ index + 1 }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Photostrip Caption / Footer (Double-click to edit) -->
            <div
              class="strip-caption"
              :class="{ 'is-empty': !captionText || !captionText.trim() }"
              :style="{ color: captionColor }"
              title="Double-click to edit caption"
              @dblclick="startEditingCaption"
            >
              <input
                v-if="isEditingCaption"
                ref="captionInputRef"
                v-model="captionText"
                type="text"
                class="strip-caption-input"
                :style="{ color: captionColor, borderBottomColor: captionColor }"
                placeholder="Enter caption..."
                @blur="finishEditingCaption"
                @keydown.enter.prevent="finishEditingCaption"
                @keydown.esc.prevent="finishEditingCaption"
                @click.stop
                @mousedown.stop
              />
              <span v-else class="strip-caption-text" :style="{ color: captionColor }">
                {{ (captionText && captionText.trim()) ? captionText : '\u00A0' }}
              </span>
            </div>

            <!-- FREEFORM DRAGGABLE ELEMENTS ON CANVAS (Stickers, Text, Tape, Shapes) -->
            <div
              v-for="(el, elIdx) in canvasElements"
              :key="el.id"
              :data-element-id="el.id"
              class="canvas-element"
              :class="{
                selected: selectedElementIds.includes(el.id),
                'multi-selected': selectedElementIds.length > 1 && selectedElementIds.includes(el.id),
                locked: el.isLocked
              }"
              :style="{
                left: el.x + 'px',
                top: el.y + 'px',
                transform: `rotate(${el.rotation || 0}deg) scaleX(${el.flipX ? -1 : 1}) scaleY(${el.flipY ? -1 : 1})`,
                opacity: el.opacity !== undefined ? el.opacity : 1,
                zIndex: showCutouts ? (selectedElementIds.includes(el.id) ? 90 : (elIdx + 10)) : (selectedElementIds.includes(el.id) ? 99 : (elIdx + 10)),
                display: el.isHidden ? 'none' : 'block'
              }"
              @mousedown.stop="selectElement(el, $event)"
              @touchstart.stop="selectElement(el, $event)"
              @click.stop
              @dblclick.stop="onElementDblClick(el)"
              @contextmenu="openContextMenu($event, el)"
            >
              <!-- Vector SVG Sticker -->
              <div
                v-if="el.type === 'sticker' && el.isSvg"
                class="element-svg-wrapper"
                :style="{
                  width: el.width + 'px',
                  height: el.height + 'px'
                }"
                v-html="getRenderedSvg(el)"
              ></div>

              <!-- Sticker Emoji -->
              <span
                v-else-if="el.type === 'sticker'"
                class="element-sticker"
                :style="{ fontSize: el.fontSize + 'px' }"
              >
                {{ el.content }}
              </span>

              <!-- User Uploaded Image -->
              <img
                v-else-if="el.type === 'image'"
                class="element-image-content"
                :src="el.url"
                :alt="el.name"
                :style="{
                  width: el.width + 'px',
                  height: el.height + 'px',
                  objectFit: 'contain',
                  pointerEvents: 'none'
                }"
                draggable="false"
              />

              <!-- Washi Tape -->
              <div
                v-else-if="el.type === 'tape'"
                class="element-tape"
                :style="{
                  backgroundColor: el.color,
                  backgroundImage: getTapePattern(el),
                  width: el.width + 'px',
                  height: el.height + 'px'
                }"
              ></div>

              <!-- Text Element (Direct In-Place Canvas Editing) -->
              <div
                v-else-if="el.type === 'text'"
                class="element-text-container"
                :style="{
                  width: (el.width || 200) + 'px',
                  minWidth: '40px'
                }"
              >
                <!-- Direct Inline Editable Text Node (During Active Editing) -->
                <div
                  v-if="editingTextId === el.id"
                  :ref="(domEl) => setTextRef(domEl, el.id)"
                  class="element-text is-editing"
                  contenteditable="plaintext-only"
                  spellcheck="false"
                  :style="getTextStyle(el)"
                  @blur="finishEditingText(el)"
                  @keydown.enter.prevent="finishEditingText(el)"
                  @keydown.esc.prevent="finishEditingText(el)"
                  @mousedown.stop
                  @touchstart.stop
                  @touchend.stop
                  @pointerdown.stop
                  @click.stop
                ></div>

                <!-- Curved / Arched SVG Text -->
                <svg
                  v-else-if="el.curveAmount && el.curveAmount !== 0"
                  class="element-curved-svg"
                  :width="getCurvedSvgWidth(el)"
                  :height="getCurvedSvgHeight(el)"
                  :viewBox="`0 0 ${getCurvedSvgWidth(el)} ${getCurvedSvgHeight(el)}`"
                  title="Double-click to edit text directly"
                  @dblclick.stop="startEditingText(el)"
                >
                  <defs>
                    <path :id="'curve-path-' + el.id" :d="getCurvedPathD(el)" fill="none" />
                  </defs>
                  <!-- Text Along Curved Path -->
                  <text
                    :fill="el.color || '#0F172A'"
                    :style="{
                      fontFamily: el.fontFamily || `'Montserrat', sans-serif`,
                      fontSize: (el.fontSize || 22) + 'px',
                      fontWeight: el.fontWeight || 'normal',
                      fontStyle: el.fontStyle || 'normal',
                      letterSpacing: (el.letterSpacing || 0) + 'px'
                    }"
                    :text-anchor="el.textAlign === 'left' ? 'start' : (el.textAlign === 'right' ? 'end' : 'middle')"
                    dominant-baseline="central"
                  >
                    <textPath
                      :href="'#curve-path-' + el.id"
                      :startOffset="el.textAlign === 'left' ? '5%' : (el.textAlign === 'right' ? '95%' : '50%')"
                    >
                      {{ el.textTransform === 'uppercase' ? (el.text || '').toUpperCase() : (el.textTransform === 'lowercase' ? (el.text || '').toLowerCase() : el.text) }}
                    </textPath>
                  </text>
                </svg>

                <!-- Normal Element Display -->
                <div
                  v-else
                  class="element-text"
                  :style="getTextStyle(el)"
                  title="Double-click to edit text directly"
                  @dblclick.stop="startEditingText(el)"
                >
                  {{ el.text }}
                </div>
              </div>

              <!-- Shape Element -->
              <div
                v-else-if="el.type === 'shape'"
                class="element-shape"
                :style="{
                  width: el.width + 'px',
                  height: el.height + 'px'
                }"
              >
                <svg viewBox="0 0 100 100" width="100%" height="100%" class="shape-svg-inner">
                  <path
                    :d="getShapePathD(el.shapeType)"
                    :fill="el.color || '#2F5BEA'"
                    :stroke="el.strokeColor || 'none'"
                    :stroke-width="el.strokeWidth || 0"
                  />
                </svg>
              </div>



              <!-- Multi-Select Sub-Element Dashed Indicator (when part of a collective selection) -->
              <div
                v-if="selectedElementIds.length > 1 && selectedElementIds.includes(el.id)"
                class="sub-element-selection-indicator"
              ></div>

              <!-- Single Element Selection Ring, Resize Handles, Rotate Knob & Floating Action Bar -->
              <template v-if="selectedElementIds.length === 1 && selectedElementIds[0] === el.id">
                <div class="element-bounding-box" :class="{ 'is-editing-text': editingTextId === el.id }">
                  <!-- Canva-Style Floating Action Toolbar above selected element (hidden during direct text typing) -->
                  <div
                    v-if="editingTextId !== el.id"
                    class="element-floating-bar"
                    @mousedown.stop
                    @touchstart.stop
                    @touchend.stop
                    @pointerdown.stop
                  >
                    <!-- Quick Edit Text Button if text type -->
                    <button
                      v-if="el.type === 'text'"
                      class="floating-tool-btn text-edit-btn"
                      title="Edit Text (or Double-Click)"
                      @click.stop="startEditingText(el)"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <span>Edit</span>
                    </button>
                    <div v-if="el.type === 'text'" class="floating-divider"></div>

                    <!-- Ungroup Button if this single element is in a group -->
                    <button
                      v-if="el.groupId"
                      class="floating-tool-btn group-btn"
                      :title="`Ungroup Element (${shortcuts.ungroup})`"
                      @click.stop="ungroupSelectedElements"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      </svg>
                      <span>Ungroup</span>
                    </button>
                    <div v-if="el.groupId" class="floating-divider"></div>

                    <!-- Position / Layers Popover Button -->
                    <div class="position-btn-wrapper">
                      <button
                        class="floating-tool-btn"
                        :class="{ active: isPositionPopoverOpen }"
                        title="Layer Depth & Ordering"
                        @click.stop="togglePositionPopover"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                          <polygon points="12 2 2 7 12 12 22 7 12 2" />
                          <polyline points="2 17 12 22 22 17" />
                          <polyline points="2 12 12 17 22 12" />
                        </svg>
                        <span>Position</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron-icon">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      <!-- Position Popover Menu -->
                      <div
                        v-if="isPositionPopoverOpen"
                        class="position-popover"
                        @click.stop
                        @mousedown.stop
                        @touchstart.stop
                        @touchend.stop
                        @pointerdown.stop
                      >
                        <div class="popover-header d-none d-lg-block">Layer Ordering</div>
                        <button class="popover-item" @click="bringForward(el.id)">
                          <span class="item-icon d-none d-lg-inline-block">▲</span>
                          <span class="item-label">Bring Forward</span>
                          <span class="item-shortcut d-none d-lg-inline-block">{{ shortcuts.bringForward }}</span>
                        </button>
                        <button class="popover-item" @click="bringToFront(el.id)">
                          <span class="item-icon d-none d-lg-inline-block">⇪▲</span>
                          <span class="item-label">Bring to Front</span>
                          <span class="item-shortcut d-none d-lg-inline-block">{{ shortcuts.bringToFront }}</span>
                        </button>
                        <button class="popover-item" @click="sendBackward(el.id)">
                          <span class="item-icon d-none d-lg-inline-block">▼</span>
                          <span class="item-label">Send Backward</span>
                          <span class="item-shortcut d-none d-lg-inline-block">{{ shortcuts.sendBackward }}</span>
                        </button>
                        <button class="popover-item" @click="sendToBack(el.id)">
                          <span class="item-icon d-none d-lg-inline-block">⇪▼</span>
                          <span class="item-label">Send to Back</span>
                          <span class="item-shortcut d-none d-lg-inline-block">{{ shortcuts.sendToBack }}</span>
                        </button>
                      </div>
                    </div>

                    <div class="floating-divider"></div>

                    <!-- Duplicate Button -->
                    <button class="floating-tool-btn icon-only" :title="`Duplicate (${shortcuts.duplicate})`" @click.stop="duplicateElement(el.id)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>

                    <!-- Lock / Unlock Button -->
                    <button
                      class="floating-tool-btn icon-only"
                      :class="{ 'is-locked': el.isLocked }"
                      :title="el.isLocked ? 'Unlock element' : 'Lock element'"
                      @click.stop="toggleLock(el.id)"
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

                    <!-- Delete Button -->
                    <button class="floating-tool-btn icon-only del" title="Delete (Del)" @click.stop="removeSelectedElement">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  <!-- Handles & Rotate Controls (Hidden during text typing to avoid blocking caret) -->
                  <template v-if="editingTextId !== el.id">
                    <!-- 4 Corner Resize Handles -->
                    <div
                      class="resize-handle handle-nw"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'nw', $event)"
                    ></div>
                    <div
                      class="resize-handle handle-ne"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'ne', $event)"
                    ></div>
                    <div
                      class="resize-handle handle-sw"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'sw', $event)"
                    ></div>
                    <div
                      class="resize-handle handle-se"
                      title="Resize"
                      @mousedown.stop="startResize(el, 'se', $event)"
                    ></div>

                    <!-- Rotate Handle Stem & Knob (bottom center) -->
                    <div class="rotate-stem"></div>
                    <div
                      class="element-rotate-handle"
                      title="Drag to rotate"
                      @mousedown.stop="startRotate(el, $event)"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2F5BEA" stroke-width="2.6">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
                      </svg>
                    </div>

                    <!-- Angle Tooltip when rotating -->
                    <div v-if="isRotating && rotateTarget && rotateTarget.id === el.id" class="rotation-tooltip">
                      {{ el.rotation || 0 }}°
                    </div>
                  </template>
                </div>
              </template>
            </div>

            <!-- UNIFIED COLLECTIVE BOUNDING BOX FOR MULTI-SELECTION / GROUP -->
            <div
              v-if="collectiveBounds && selectedElementIds.length > 1"
              class="collective-bounding-box"
              :style="{
                left: collectiveBounds.minX + 'px',
                top: collectiveBounds.minY + 'px',
                width: collectiveBounds.width + 'px',
                height: collectiveBounds.height + 'px',
                zIndex: showCutouts ? 90 : 99
              }"
              @mousedown.stop="startCollectiveDrag($event)"
              @click.stop
              @dblclick.stop="onCollectiveDblClick($event)"
            >
              <!-- Collective Floating Action Toolbar -->
              <div
                class="element-floating-bar collective-floating-bar"
                @mousedown.stop
                @touchstart.stop
                @touchend.stop
                @pointerdown.stop
              >
                <!-- Group / Ungroup Button -->
                <button
                  v-if="canUngroupSelected"
                  class="floating-tool-btn group-btn"
                  :title="`Ungroup Elements (${shortcuts.ungroup})`"
                  @click.stop="ungroupSelectedElements"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  </svg>
                  <span>Ungroup</span>
                  <span class="shortcut-tag d-none d-lg-inline-block">{{ shortcuts.ungroup }}</span>
                </button>
                <button
                  v-else
                  class="floating-tool-btn group-btn"
                  :title="`Group Elements (${shortcuts.group})`"
                  @click.stop="groupSelectedElements"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  <span>Group</span>
                  <span class="shortcut-tag d-none d-lg-inline-block">{{ shortcuts.group }}</span>
                </button>

                <div class="floating-divider"></div>

                <!-- Position Popover Button for Multi-Select -->
                <div class="position-btn-wrapper">
                  <button
                    class="floating-tool-btn"
                    :class="{ active: isPositionPopoverOpen }"
                    title="Layer Depth & Ordering"
                    @click.stop="togglePositionPopover"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    <span>Position</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron-icon">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  <!-- Position Popover Menu -->
                  <div
                    v-if="isPositionPopoverOpen"
                    class="position-popover"
                    @click.stop
                    @mousedown.stop
                    @touchstart.stop
                    @touchend.stop
                    @pointerdown.stop
                  >
                    <div class="popover-header d-none d-lg-block">Layer Ordering</div>
                    <button class="popover-item" @click="bringToFrontSelected">
                      <span class="item-icon d-none d-lg-inline-block">⇪▲</span>
                      <span class="item-label">Bring to Front</span>
                      <span class="item-shortcut d-none d-lg-inline-block">{{ shortcuts.bringToFront }}</span>
                    </button>
                    <button class="popover-item" @click="sendToBackSelected">
                      <span class="item-icon d-none d-lg-inline-block">⇪▼</span>
                      <span class="item-label">Send to Back</span>
                      <span class="item-shortcut d-none d-lg-inline-block">{{ shortcuts.sendToBack }}</span>
                    </button>
                  </div>
                </div>

                <div class="floating-divider"></div>

                <!-- Duplicate Multi-Selection -->
                <button class="floating-tool-btn icon-only" :title="`Duplicate (${shortcuts.duplicate})`" @click.stop="duplicateSelectedElements">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>

                <!-- Delete Multi-Selection -->
                <button class="floating-tool-btn icon-only del" title="Delete (Del)" @click.stop="removeSelectedElements">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>

              <!-- Collective 4-Corner Resize Handles -->
              <div class="resize-handle handle-nw" title="Scale Selection" @mousedown.stop="startCollectiveResize('nw', $event)"></div>
              <div class="resize-handle handle-ne" title="Scale Selection" @mousedown.stop="startCollectiveResize('ne', $event)"></div>
              <div class="resize-handle handle-sw" title="Scale Selection" @mousedown.stop="startCollectiveResize('sw', $event)"></div>
              <div class="resize-handle handle-se" title="Scale Selection" @mousedown.stop="startCollectiveResize('se', $event)"></div>

              <!-- Collective Rotate Handle Stem & Knob -->
              <div class="rotate-stem"></div>
              <div class="element-rotate-handle" title="Rotate Selection" @mousedown.stop="startCollectiveRotate($event)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2F5BEA" stroke-width="2.6">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
                </svg>
              </div>
            </div>

            <!-- SMART GUIDES & MAGNETIC ALIGNMENT OVERLAY -->
            <svg
              v-if="isDragging && (activeGuides.length > 0 || activeDistanceBadges.length > 0)"
              class="smart-guides-overlay"
              xmlns="http://www.w3.org/2000/svg"
            >
              <!-- Guide Lines -->
              <template v-for="g in activeGuides" :key="g.id">
                <!-- High-contrast crisp backing line for visibility on both dark and light frames -->
                <line
                  v-if="g.orientation === 'vertical'"
                  :x1="g.x"
                  :y1="g.y1"
                  :x2="g.x"
                  :y2="g.y2"
                  stroke="rgba(255, 255, 255, 0.9)"
                  stroke-width="3"
                  stroke-linecap="round"
                />
                <line
                  v-else
                  :x1="g.x1"
                  :y1="g.y"
                  :x2="g.x2"
                  :y2="g.y"
                  stroke="rgba(255, 255, 255, 0.9)"
                  stroke-width="3"
                  stroke-linecap="round"
                />

                <!-- Canva Vibrant Magenta/Pink Snapping Guide Line -->
                <line
                  v-if="g.orientation === 'vertical'"
                  :x1="g.x"
                  :y1="g.y1"
                  :x2="g.x"
                  :y2="g.y2"
                  stroke="#FF007A"
                  stroke-width="1.5"
                  :stroke-dasharray="g.type === 'edge' ? '4 3' : 'none'"
                  stroke-linecap="round"
                />
                <line
                  v-else
                  :x1="g.x1"
                  :y1="g.y"
                  :x2="g.x2"
                  :y2="g.y"
                  stroke="#FF007A"
                  stroke-width="1.5"
                  :stroke-dasharray="g.type === 'edge' ? '4 3' : 'none'"
                  stroke-linecap="round"
                />

                <!-- Center Alignment Indicator Marker -->
                <circle
                  v-if="g.type === 'center' && g.orientation === 'vertical'"
                  :cx="g.x"
                  :cy="dragTarget ? dragTarget.y + (dragTarget.height || 36) / 2 : (g.y1 + g.y2) / 2"
                  r="3.5"
                  fill="#FF007A"
                  stroke="#ffffff"
                  stroke-width="1.5"
                />
                <circle
                  v-if="g.type === 'center' && g.orientation === 'horizontal'"
                  :cx="dragTarget ? dragTarget.x + (dragTarget.width || 36) / 2 : (g.x1 + g.x2) / 2"
                  :cy="g.y"
                  r="3.5"
                  fill="#FF007A"
                  stroke="#ffffff"
                  stroke-width="1.5"
                />
              </template>

              <!-- Equal Spacing & Distribution Indicators -->
              <g v-for="b in activeDistanceBadges" :key="b.id">
                <line
                  :x1="b.x"
                  :y1="b.y1"
                  :x2="b.x"
                  :y2="b.y2"
                  stroke="#8B5CF6"
                  stroke-width="1.5"
                  stroke-dasharray="3 2"
                />
                <line :x1="b.x - 4" :y1="b.y1" :x2="b.x + 4" :y2="b.y1" stroke="#8B5CF6" stroke-width="1.5" />
                <line :x1="b.x - 4" :y1="b.y2" :x2="b.x + 4" :y2="b.y2" stroke="#8B5CF6" stroke-width="1.5" />
                <rect
                  :x="b.x - 14"
                  :y="(b.y1 + b.y2) / 2 - 8"
                  width="28"
                  height="16"
                  rx="4"
                  fill="#8B5CF6"
                />
                <text
                  :x="b.x"
                  :y="(b.y1 + b.y2) / 2 + 3.5"
                  fill="#ffffff"
                  font-size="9"
                  font-weight="700"
                  text-anchor="middle"
                >
                  {{ b.distance }}
                </text>
              </g>
            </svg>
          </div>
        </div>
      </main>
</template>
