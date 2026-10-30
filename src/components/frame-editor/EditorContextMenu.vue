<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"


const editor = useFrameEditorContext()
const {
  bringForward,
  bringToFrontSelected,
  canGroupSelected,
  canUngroupSelected,
  closeContextMenu,
  contextMenu,
  duplicateSelectedElements,
  getElementDisplayName,
  groupSelectedElements,
  removeSelectedElements,
  selectedElementIds,
  sendBackward,
  sendToBackSelected,
  shortcuts,
  showCutouts,
  startEditingText,
  toggleCutouts,
  toggleLock,
  ungroupSelectedElements
} = editor
</script>

<template>
    <!-- Custom Canva-Style Right-Click Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="custom-context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click.stop
    >
      <template v-if="contextMenu.targetElement || selectedElementIds.length > 0">
        <div class="context-menu-header">
          {{ selectedElementIds.length > 1 ? `${selectedElementIds.length} Elements Selected` : getElementDisplayName(contextMenu.targetElement) }}
        </div>
        <div class="context-divider"></div>

        <!-- Group / Ungroup Context Options -->
        <button v-if="canGroupSelected" class="context-item" @click="groupSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span class="context-label">Group Elements</span>
          <span class="context-shortcut">{{ shortcuts.group }}</span>
        </button>
        <button v-if="canUngroupSelected" class="context-item" @click="ungroupSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          </svg>
          <span class="context-label">Ungroup</span>
          <span class="context-shortcut">{{ shortcuts.ungroup }}</span>
        </button>
        <div v-if="canGroupSelected || canUngroupSelected" class="context-divider"></div>

        <button class="context-item" @click="bringForward(); closeContextMenu()">
          <span class="context-icon">▲</span>
          <span class="context-label">Bring Forward</span>
          <span class="context-shortcut">{{ shortcuts.bringForward }}</span>
        </button>
        <button class="context-item" @click="bringToFrontSelected(); closeContextMenu()">
          <span class="context-icon">⇪▲</span>
          <span class="context-label">Bring to Front</span>
          <span class="context-shortcut">{{ shortcuts.bringToFront }}</span>
        </button>
        <button class="context-item" @click="sendBackward(); closeContextMenu()">
          <span class="context-icon">▼</span>
          <span class="context-label">Send Backward</span>
          <span class="context-shortcut">{{ shortcuts.sendBackward }}</span>
        </button>
        <button class="context-item" @click="sendToBackSelected(); closeContextMenu()">
          <span class="context-icon">⇪▼</span>
          <span class="context-label">Send to Back</span>
          <span class="context-shortcut">{{ shortcuts.sendToBack }}</span>
        </button>
        <div class="context-divider"></div>
        <button
          v-if="selectedElementIds.length === 1 && contextMenu.targetElement?.type === 'text'"
          class="context-item"
          @click="startEditingText(contextMenu.targetElement); closeContextMenu()"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span class="context-label">Edit Text</span>
          <span class="context-shortcut">dbl-click</span>
        </button>
        <button class="context-item" @click="duplicateSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span class="context-label">Duplicate</span>
          <span class="context-shortcut">{{ shortcuts.duplicate }}</span>
        </button>
        <button class="context-item" @click="toggleLock(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path v-if="contextMenu.targetElement?.isLocked" d="M7 11V7a5 5 0 0 1 10 0v4" />
            <path v-else d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
          <span class="context-label">{{ contextMenu.targetElement?.isLocked ? 'Unlock' : 'Lock' }}</span>
        </button>
        <div class="context-divider"></div>
        <button class="context-item text-danger" @click="removeSelectedElements(); closeContextMenu()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="context-icon-svg">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span class="context-label">Delete</span>
          <span class="context-shortcut">Del</span>
        </button>
      </template>
      <template v-else>
        <div class="context-menu-header">Canvas Frame</div>
        <div class="context-divider"></div>
        <button class="context-item" @click="toggleCutouts(); closeContextMenu()">
          <span class="context-label">{{ showCutouts ? 'Hide Photo Cutouts' : 'Show Photo Cutouts' }}</span>
        </button>
      </template>
    </div>
</template>
