<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"
import AppIcon from "../AppIcon.vue"

const editor = useFrameEditorContext()
const {
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
  redo,
  resetToActualSize,
  saveFrame,
  openMyTemplatesDrawer,
  setZoom,
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

// The "?" shows the first-visit tips again (GuideTips in FrameEditorView.vue)
const emit = defineEmits(['help'])
function startGuide() {
  emit('help')
}
</script>

<template>
  <!-- ============ TOP BAR (the same as the Sticker Maker's) ============
       The bar for selected text or a selected element floats over the canvas instead
       (EditorSelectionBar.vue), the same as the Sticker Maker's text bar. -->
  <header class="te-topbar te-card">
    <div class="te-brand">
      <h1 class="te-brand-title">Frame Editor</h1>
      <input
        v-model="templateName"
        class="te-name"
        placeholder="Untitled"
        title="Click to name the template"
        aria-label="Template name"
      />
    </div>

    <div class="te-topbar-tools">
      <!-- Zoom: smaller, the zoom menu, bigger -->
      <div class="te-zoom zoom-dropdown-wrapper">
        <button
          type="button"
          class="te-zoom-btn"
          title="Zoom out (Ctrl -)"
          aria-label="Zoom out"
          :disabled="canvasScale <= 0.25"
          @click="zoomOut(canvasWorkspaceRef)"
        >−</button>
        <button
          type="button"
          class="te-zoom-btn"
          :class="{ active: isZoomMenuOpen }"
          title="Zoom options"
          aria-haspopup="menu"
          :aria-expanded="isZoomMenuOpen"
          @click.stop="isZoomMenuOpen = !isZoomMenuOpen"
        >
          {{ zoomPercentage }}
          <AppIcon name="chevron-down" :size="12" />
        </button>
        <button
          type="button"
          class="te-zoom-btn"
          title="Zoom in (Ctrl +)"
          aria-label="Zoom in"
          :disabled="canvasScale >= 5.0"
          @click="zoomIn(canvasWorkspaceRef)"
        >+</button>

        <!-- Zoom menu -->
        <div v-if="isZoomMenuOpen" class="zoom-popover-menu shadow-lg" @click.stop @pointerdown.stop>
          <div class="menu-header">Zoom</div>
          <button class="menu-item" @click="fitToScreen(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
            <span class="item-name">Fit to screen</span>
            <span class="item-shortcut">Ctrl 0</span>
          </button>
          <button class="menu-item" @click="fillScreen(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
            <span class="item-name">Fill screen</span>
            <span class="item-shortcut">Fit H</span>
          </button>
          <button class="menu-item" @click="resetToActualSize(canvasWorkspaceRef, stripRef); isZoomMenuOpen = false">
            <span class="item-name">Actual size (100%)</span>
            <span class="item-shortcut">Ctrl 1</span>
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
            <span class="item-name">{{ showRulers ? 'Hide rulers' : 'Show rulers' }}</span>
            <span class="item-shortcut">Shift R</span>
          </button>
          <button v-if="customGuides.length > 0" class="menu-item text-danger" @click="clearAllGuides(); isZoomMenuOpen = false">
            <span class="item-name">Clear guides</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-outline-secondary te-square te-hide-sm"
        title="Fit to screen (Ctrl 0)"
        aria-label="Fit to screen"
        @click="fitToScreen(canvasWorkspaceRef, stripRef)"
      >
        <AppIcon name="maximize" :size="16" />
      </button>

      <!-- On / off switches -->
      <button
        type="button"
        class="te-toggle"
        :class="{ active: showCutouts }"
        :aria-pressed="showCutouts"
        :title="showCutouts ? 'Hide the photo cutouts' : 'Show the photo cutouts'"
        aria-label="Cutouts"
        @click="toggleCutouts"
      >
        <AppIcon name="layout" :size="15" />
        <span class="te-hide-xs">Cutouts</span>
      </button>
      <button
        type="button"
        class="te-toggle"
        :class="{ active: showRulers }"
        :aria-pressed="showRulers"
        :title="showRulers ? 'Hide the rulers and guides (Shift R)' : 'Show the rulers and guides (Shift R)'"
        aria-label="Rulers"
        @click="handleToggleRulers"
      >
        <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true" style="width: 15px; height: 15px;"><path d="M3 8h18v8H3z M7 8v3 M11 8v4 M15 8v3 M19 8v4" /></svg>
        <span class="te-hide-xs">Rulers</span>
      </button>
    </div>

    <div class="te-topbar-actions">
      <button type="button" class="btn btn-outline-secondary te-square" title="How it works" aria-label="How it works" @click="startGuide">?</button>
      <button
        type="button"
        class="btn btn-outline-secondary te-square"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        :disabled="historyIndex <= 0"
        @click="undo"
      >
        <AppIcon name="undo" :size="16" />
      </button>
      <button
        type="button"
        class="btn btn-outline-secondary te-square"
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
        :disabled="historyIndex >= history.length - 1"
        @click="redo"
      >
        <AppIcon name="redo" :size="16" />
      </button>

      <!-- My templates: Joash's switcher, to open another of your frames and keep editing it -->
      <button
        type="button"
        class="btn btn-outline-secondary te-action"
        title="My templates: open another of your frames"
        aria-label="My templates"
        @click="openMyTemplatesDrawer"
      >
        <AppIcon name="folder" :size="16" />
        <span class="te-hide-xs te-hide-lg">My templates</span>
      </button>

      <!-- Save (accounts) or log in to save (guests) -->
      <button
        v-if="isAccount"
        type="button"
        class="btn btn-primary te-action"
        :disabled="isSavingFrame"
        :title="cloudId && !isOwner ? 'Save a copy to My Studio (Ctrl+S)' : 'Save to My Studio (Ctrl+S)'"
        :aria-label="cloudId && !isOwner ? 'Save a copy' : 'Save to My Studio'"
        @click="saveFrame"
      >
        <AppIcon name="save" :size="16" />
        <span class="te-hide-xs">
          <span class="te-hide-md">{{ isSavingFrame ? 'Saving…' : (cloudId && !isOwner ? 'Save a copy' : 'Save to My Studio') }}</span>
          <span class="te-show-md">{{ isSavingFrame ? 'Saving…' : 'Save' }}</span>
        </span>
      </button>
      <router-link
        v-else
        :to="'/login?redirect=' + encodeURIComponent($route.fullPath)"
        class="btn btn-primary te-action"
        title="Log in to save your template to My Studio"
        aria-label="Log in to save"
      >
        <AppIcon name="save" :size="16" />
        <span class="te-hide-xs"><span class="te-hide-md">Log in to save</span><span class="te-show-md">Log in</span></span>
      </router-link>
    </div>
  </header>
</template>
