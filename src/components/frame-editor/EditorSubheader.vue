<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"
import { IconFolder, IconSave } from "../icons/index.js"

const editor = useFrameEditorContext()
const {
  allUserTemplatesCount,
  canvasScale,
  canvasWorkspaceRef,
  clearAllGuides,
  cloudId,
  customGuides,
  fillScreen,
  fitToScreen,
  handleToggleRulers,
  history,
  historyIndex,
  isAccount,
  isOwner,
  isSavingFrame,
  isZoomMenuOpen,
  openMyTemplatesDrawer,
  redo,
  resetToActualSize,
  route,
  router,
  saveFrame,
  setZoom,
  shortcuts,
  showCutouts,
  showRulers,
  stripRef,
  templateName,
  toggleCutouts,
  toggleRulers,
  undo,
  zoomIn,
  zoomOut,
  zoomPercentage
} = editor
</script>

<template>
  <!-- 2. Subheader Toolbar -->
  <div class="d-flex align-items-center justify-content-between px-3 py-1 bg-white border-bottom position-relative" style="min-height: 44px; z-index: 100;">
    <!-- Desktop Left: My Studio / Title input -->
    <div class="d-none d-lg-flex align-items-center gap-2 small">
      <router-link to="/studio" class="text-decoration-none text-muted d-flex align-items-center gap-1 me-1 text-nowrap" title="Back to My Studio">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span class="fw-medium">My Studio</span>
      </router-link>
      <span class="text-muted">/</span>
      <div class="input-group input-group-sm template-name-group" style="width: auto;">
        <span class="input-group-text border-end-0 px-2 py-0" title="Frame Title (Click to edit)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </span>
        <input
          v-model="templateName"
          type="text"
          class="form-control form-control-sm border-start-0 template-name-field ps-1"
          style="width: 185px; font-size: 0.875rem;"
          placeholder="my-templates-1"
          title="Frame Title (Click to edit)"
          maxlength="40"
        />
      </div>
    </div>

    <!-- Mobile Left: Brand Title 'Frame Editor' -->
    <div class="d-lg-none d-flex align-items-center">
      <h1 class="h6 fw-bold text-dark m-0" style="font-size: 1.05rem; letter-spacing: -0.01em;">Frame Editor</h1>
    </div>

    <!-- Desktop Center: Controls -->
    <div class="d-none d-lg-flex align-items-center gap-2">
      <!-- Undo & Redo -->
      <div class="btn-group btn-group-sm">
        <button class="btn btn-outline-secondary" :title="`Undo (${shortcuts.undo})`" :disabled="historyIndex <= 0" @click="undo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button class="btn btn-outline-secondary" :title="`Redo (${shortcuts.redo})`" :disabled="historyIndex >= history.length - 1" @click="redo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </button>
      </div>

      <div class="vr my-1 mx-1"></div>

      <!-- Zoom Stepper Controls -->
      <div class="input-group input-group-sm zoom-stepper-group" style="width: auto;">
        <!-- Zoom Out (-) -->
        <button
          class="btn btn-outline-secondary zoom-btn-minus"
          :title="`Zoom Out (${shortcuts.zoomOut})`"
          :disabled="canvasScale <= 0.25"
          @click="zoomOut(canvasWorkspaceRef)"
        >
          −
        </button>

        <!-- Zoom Readout & Dropdown Menu -->
        <div class="zoom-dropdown-wrapper position-relative">
          <button
            class="btn btn-outline-secondary zoom-readout-btn rounded-0 px-2 d-flex align-items-center gap-1 border-start-0 border-end-0"
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
              <span class="item-shortcut">{{ shortcuts.fit }}</span>
            </button>

            <button class="menu-item" @click="fillScreen(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
              <span class="item-name">Fill Screen</span>
              <span class="item-shortcut">Fit H</span>
            </button>

            <button class="menu-item" @click="resetToActualSize(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
              <span class="item-name">100% Actual Size</span>
              <span class="item-shortcut">{{ shortcuts.actualSize }}</span>
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
          class="btn btn-outline-secondary zoom-btn-plus"
          :title="`Zoom In (${shortcuts.zoomIn})`"
          :disabled="canvasScale >= 5.0"
          @click="zoomIn(canvasWorkspaceRef)"
        >
          +
        </button>
      </div>

      <!-- Fit to Screen Quick Action Button -->
      <button
        class="btn btn-sm btn-outline-secondary"
        :title="`Fit to Screen (${shortcuts.fit})`"
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

    <!-- Right: Save Action (Desktop & Mobile) & My Templates (Desktop only) -->
    <div class="d-flex align-items-center gap-2">
      <!-- My Templates Drawer Action Button (Desktop only) -->
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary d-none d-lg-flex align-items-center gap-1"
        title="View all your saved templates"
        @click="openMyTemplatesDrawer"
      >
        <IconFolder :size="14" :stroke-width="2.2" />
        <span>My Templates</span>
        <span v-if="allUserTemplatesCount > 0" class="badge rounded-pill bg-primary ms-1">{{ allUserTemplatesCount }}</span>
      </button>

      <!-- Save Frame Button -->
      <button
        v-if="isAccount"
        class="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-bold shadow-sm px-3"
        :disabled="isSavingFrame"
        @click="saveFrame"
        :title="cloudId ? (isOwner ? `Save Frame to My Studio (${shortcuts.save})` : `Save a Copy to My Studio (${shortcuts.save})`) : `Save Frame to My Studio (${shortcuts.save})`"
      >
        <IconSave :size="14" :stroke-width="2.3" />
        <span class="d-none d-lg-inline">{{ isSavingFrame ? 'Saving...' : (cloudId ? (isOwner ? 'Save Frame' : 'Save a Copy') : 'Save Frame') }}</span>
        <span class="d-lg-none">{{ isSavingFrame ? '...' : 'Save' }}</span>
      </button>

      <router-link
        v-else
        :to="'/login?redirect=' + encodeURIComponent($route.fullPath)"
        class="btn btn-sm btn-primary d-flex align-items-center gap-1 fw-bold shadow-sm text-decoration-none px-3"
        :title="`Log in to save your template to My Studio (${shortcuts.save})`"
      >
        <IconSave :size="14" :stroke-width="2.3" />
        <span class="d-none d-lg-inline">Login to save</span>
        <span class="d-lg-none">Login</span>
      </router-link>
    </div>
  </div>
</template>
