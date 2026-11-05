<script setup>
import { ref, onMounted } from 'vue'
import { provideFrameEditor } from '../composables/useFrameEditor.js'
import { loadArtFonts } from '../stickerArt.js'
import GuideTips from '../components/GuideTips.vue'
import SavedFramesModal from '../components/SavedFramesModal.vue'
import {
  EditorSubheader,
  EditorLeftRail,
  EditorDrawer,
  EditorCanvas,
  EditorPropertiesPanel,
  EditorContextMenu,
  EditorSaveModal,
  EditorMyTemplatesDrawer
} from '../components/frame-editor/index.js'

import '../components/frame-editor/frame-editor.css'
import '../components/frame-editor/frame-editor-look.css'

if (typeof document !== 'undefined') {
  document.title = 'Frame Editor · Blue Studios'
}

const editor = provideFrameEditor()
const {
  closeMobileSheets,
  currentSavedFrameId,
  deleteFrame,
  downloadSavedFrame,
  importFrameFromFile,
  isDrawerOpen,
  isMobileEditSheetOpen,
  isSavedFramesModalOpen,
  isScreenLg,
  isWorkspaceLoading,
  openSavedFrame,
  savedFramesList,
  workspaceLoadingMessage
} = editor

// First-visit tips (and the "?" in the top bar): where everything is, instead of grey text
const guide = ref(null)
const EDITOR_TIPS = [
  { target: '.te-rail', title: 'Add things', text: 'Start from a template, add elements, text or your photos (PNG, JPEG, WebP or SVG), or change the colour of the strip.' },
  { target: '.photostrip-frame', title: 'Your frame', text: 'Drag to move, pull a corner to resize. Tap twice on an empty spot to type. Click the caption at the bottom to change it.' },
  { target: '.te-props', title: 'Settings and layers', text: 'Change what you picked here. Drag a layer to put it in front or behind, use the eye to hide it and the lock to keep it in place. Right-click on the strip for more.' },
  { target: '.te-topbar-tools', title: 'View', text: 'Zoom in and out, show the photo cutouts, or rulers to line things up.' },
  { target: '.te-topbar-actions', title: 'Keep it', text: 'Save it to My Studio. My templates opens another of your frames to keep editing.' },
]

// The Text tab uses the Sticker Maker's fonts (only added to the page once)
onMounted(loadArtFonts)
</script>

<template>
  <!-- app-page: the shared colours, font and buttons (pages.css), the same as the Sticker Maker.
       The Blue Studios bar above this page is the app's own (App.vue), like on every page. -->
  <div class="canva-editor app-page te-page d-flex flex-column h-100 w-100 overflow-hidden text-dark position-relative">
    <!-- 1. Top bar -->
    <EditorSubheader @help="guide && guide.start()" />

    <!-- 2. Main Workspace Container -->
    <div class="editor-body te-body d-flex flex-grow-1 overflow-hidden">
      <!-- Left Tool Rail -->
      <EditorLeftRail />

      <!-- Expandable Flyout Drawer -->
      <EditorDrawer />

      <!-- Center Canvas Workspace -->
      <EditorCanvas />

      <!-- Right Properties Panel -->
      <EditorPropertiesPanel />
    </div>

    <!-- Mobile Bottom-Sheet Backdrop Overlay -->
    <div
      v-if="!isScreenLg && (isDrawerOpen || isMobileEditSheetOpen)"
      class="mobile-sheet-backdrop"
      @click="closeMobileSheets"
    ></div>

    <!-- Custom Canva-Style Right-Click Context Menu -->
    <EditorContextMenu />

    <!-- Saved Frames Folder Modal -->
    <SavedFramesModal
      v-if="isSavedFramesModalOpen"
      :frames="savedFramesList"
      :current-id="currentSavedFrameId"
      @close="isSavedFramesModalOpen = false"
      @load="openSavedFrame"
      @delete="deleteFrame"
      @download="downloadSavedFrame"
      @import="importFrameFromFile"
    />

    <!-- First-visit tips (the "?" in the top bar shows them again) -->
    <GuideTips ref="guide" :steps="EDITOR_TIPS" storage-key="fe-guide-seen" />

    <!-- Save Template to My Studio / Account Modal -->
    <EditorSaveModal />

    <!-- My Templates Drawer Overlay & Workspace Switch Confirmation -->
    <EditorMyTemplatesDrawer />

    <!-- Full Workspace Loading Screen (Hides stock canvas until saved template finishes loading) -->
    <transition name="workspace-loader-fade">
      <div
        v-if="isWorkspaceLoading"
        class="workspace-loading-overlay"
        aria-live="polite"
        role="status"
      >
        <div class="workspace-loading-card">
          <div class="workspace-loading-spinner-box">
            <div class="spinner-border text-primary" style="width: 3.25rem; height: 3.25rem; border-width: 0.26rem;" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
          <h5 class="workspace-loading-title">{{ workspaceLoadingMessage || 'Loading Saved Frame...' }}</h5>
          <p class="workspace-loading-subtitle">Preparing your layout, canvas elements, and workspace...</p>
          <div class="workspace-loading-progress-bar">
            <div class="workspace-loading-progress-indeterminate"></div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
