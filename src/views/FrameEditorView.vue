<script setup>
import { provideFrameEditor } from '../composables/useFrameEditor.js'
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

if (typeof document !== 'undefined') {
  document.title = 'Frame Editor · Blue Studios'
}

const editor = provideFrameEditor()
const {
  isSavedFramesModalOpen,
  savedFramesList,
  currentSavedFrameId,
  openSavedFrame,
  deleteFrame,
  downloadSavedFrame,
  importFrameFromFile,
  showNotification,
  notificationMessage,
  isWorkspaceLoading,
  workspaceLoadingMessage
} = editor
</script>

<template>
  <div class="canva-editor app-page d-flex flex-column h-100 w-100 overflow-hidden text-dark position-relative">
    <!-- 1. Subheader Toolbar -->
    <EditorSubheader />

    <!-- 2. Main Workspace Container -->
    <div class="editor-body d-flex flex-grow-1 overflow-hidden">
      <!-- Left Tool Rail -->
      <EditorLeftRail />

      <!-- Expandable Flyout Drawer -->
      <EditorDrawer />

      <!-- Center Canvas Workspace -->
      <EditorCanvas />

      <!-- Right Properties Panel -->
      <EditorPropertiesPanel />
    </div>

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
          <h5 class="workspace-loading-title">{{ workspaceLoadingMessage || 'Loading Saved Template...' }}</h5>
          <p class="workspace-loading-subtitle">Preparing your layout, canvas elements, and workspace...</p>
          <div class="workspace-loading-progress-bar">
            <div class="workspace-loading-progress-indeterminate"></div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Toast Notification -->
    <div v-if="showNotification" class="toast-toast">
      {{ notificationMessage }}
    </div>
  </div>
</template>
