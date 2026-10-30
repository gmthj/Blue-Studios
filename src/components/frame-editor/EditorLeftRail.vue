<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"


const editor = useFrameEditorContext()
const {
  activeTool,
  canvasElements,
  isDrawerOpen,
  toggleDrawer,
  userUploads
} = editor
</script>

<template>
      <!-- Left Tool Rail (Bootstrap 5) -->
      <aside class="left-rail d-flex flex-column align-items-center bg-white border-end py-2 px-1 gap-1 flex-shrink-0" style="width: 72px;">
        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'templates' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('templates')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Templates</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'elements' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('elements')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8" cy="8" r="4" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <polygon points="12 14 16 21 8 21" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Elements</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'text' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('text')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Text</span>
        </button>



        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'uploads' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('uploads')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Uploads</span>
          <span v-if="userUploads.length > 0" class="badge rounded-pill bg-primary position-absolute top-0 end-0 translate-middle-y me-1">{{ userUploads.length }}</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'background' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('background')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Background</span>
        </button>

        <button
          class="btn btn-sm d-flex flex-column align-items-center justify-content-center p-2 rounded border-0 position-relative w-100"
          :class="(activeTool === 'layers' && isDrawerOpen) ? 'text-primary bg-primary bg-opacity-10 fw-bold' : 'text-secondary'"
          @click="toggleDrawer('layers')"
        >
          <div class="mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <span style="font-size: 0.68rem;">Layers</span>
          <span v-if="canvasElements.length > 0" class="badge rounded-pill bg-primary position-absolute top-0 end-0 translate-middle-y me-1">{{ canvasElements.length }}</span>
        </button>
      </aside>
</template>
