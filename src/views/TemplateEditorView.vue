<script setup>
import { provideTemplateEditor } from '../composables/useTemplateEditor.js'
import SavedFramesModal from '../components/SavedFramesModal.vue'
import {
  EditorNavbar,
  EditorSubheader,
  EditorLeftRail,
  EditorDrawer,
  EditorCanvas,
  EditorPropertiesPanel,
  EditorContextMenu,
  EditorSaveModal
} from '../components/template-editor/index.js'

import '../components/template-editor/template-editor.css'

const editor = provideTemplateEditor()
const {
  isSavedFramesModalOpen,
  savedFramesList,
  currentSavedFrameId,
  openSavedFrame,
  deleteFrame,
  downloadSavedFrame,
  importFrameFromFile,
  showNotification,
  notificationMessage
} = editor
</script>

<template>
  <div class="canva-editor d-flex flex-column vh-100 w-100 overflow-hidden bg-light text-dark">
    <!-- 1. Top Navbar -->
    <EditorNavbar />

    <!-- 2. Subheader Toolbar -->
    <EditorSubheader />

    <!-- 3. Main Workspace Container -->
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

    <!-- Toast Notification -->
    <div v-if="showNotification" class="toast-toast">
      {{ notificationMessage }}
    </div>
  </div>
</template>
