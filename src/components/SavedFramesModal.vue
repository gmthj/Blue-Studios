<template>
  <div
    v-if="isOpen"
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="saved-frames-title"
    style="background-color: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px);"
    @click.self="$emit('close')"
  >
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
        <!-- Modal Header -->
        <div class="modal-header px-4 py-3 border-bottom bg-white d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-3">
            <div class="p-2 rounded-3 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
              <IconFolder :size="22" :stroke-width="2" />
            </div>
            <div>
              <h5 id="saved-frames-title" class="modal-title fw-bold text-dark fs-5 mb-0">Saved Frames Folder</h5>
              <p class="text-muted small mb-0">
                Double-click any template to resume editing in the workspace.
              </p>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <!-- Hidden file input for importing images or JSON templates -->
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*,.json,application/json"
              class="d-none"
              @change="handleFileInputChange"
            />
            <button class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2 px-3 py-1 rounded-pill fw-semibold" title="Upload template or frame image from computer" @click="triggerFileInput">
              <AppIcon name="upload" :size="15" :stroke-width="2" />
              <span>Upload from Computer</span>
            </button>

            <button type="button" class="btn-close ms-2" aria-label="Close" @click="$emit('close')"></button>
          </div>
        </div>

        <!-- Search & Status Toolbar -->
        <div class="modal-toolbar px-4 py-2 bg-light border-bottom d-flex align-items-center justify-content-between gap-3">
          <div class="input-group input-group-sm" style="max-width: 320px;">
            <span class="input-group-text bg-white border-end-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search saved templates..."
              class="form-control border-start-0 ps-1"
            />
            <button v-if="searchQuery" class="btn btn-outline-secondary border-start-0" type="button" @click="searchQuery = ''">×</button>
          </div>

          <span class="badge bg-white text-secondary border px-3 py-2 rounded-pill fw-normal">
            {{ filteredFrames.length }} {{ filteredFrames.length === 1 ? 'template' : 'templates' }}
          </span>
        </div>

        <!-- Frames Grid / List -->
        <div
          class="modal-body p-4 bg-light bg-opacity-50 custom-scrollbar position-relative"
          style="min-height: 360px; max-height: 60vh;"
          @dragover.prevent="isDraggingOver = true"
          @dragleave.prevent="isDraggingOver = false"
          @drop.prevent="handleModalDrop"
        >
          <!-- Drag-over drop overlay -->
          <div v-if="isDraggingOver" class="modal-drop-overlay">
            <div class="text-center p-4 bg-white rounded-4 shadow-lg border border-primary border-2">
              <div class="fs-1 mb-2">📥</div>
              <h6 class="fw-bold text-primary mb-1">Drop to upload frame</h6>
              <p class="text-muted small mb-0">Supports PNG, JPG, WEBP, SVG, and JSON template files</p>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="filteredFrames.length === 0" class="text-center py-5">
            <div class="fs-1 mb-2">📁</div>
            <h6 class="fw-bold text-dark mb-1">{{ searchQuery ? 'No matching templates' : 'No saved frames yet' }}</h6>
            <p class="text-muted small mb-3 mx-auto" style="max-width: 380px;">
              {{
                searchQuery
                  ? 'Try a different search term.'
                  : 'Save frames from the top bar or upload custom frame images / templates from your computer.'
              }}
            </p>
            <div class="d-flex align-items-center justify-content-center gap-2 flex-wrap">
              <button v-if="!searchQuery" class="btn btn-primary rounded-pill px-4 btn-sm fw-semibold" @click="$emit('save-current')">
                💾 Save Current Workspace Frame
              </button>
              <button class="btn btn-outline-primary rounded-pill px-3 btn-sm fw-semibold d-flex align-items-center gap-2" @click="triggerFileInput">
                <AppIcon name="upload" :size="15" :stroke-width="2" />
                <span>Upload from Computer</span>
              </button>
            </div>
          </div>

          <!-- Cards Grid -->
          <div v-else class="row g-3">
            <div
              v-for="frame in filteredFrames"
              :key="frame.id"
              class="col-6 col-md-4 col-lg-3"
            >
              <div
                class="card h-100 frame-card border rounded-3 overflow-hidden"
                :class="{ 'border-primary shadow-sm': currentFrameId === frame.id }"
                title="Double-click to open in workspace"
                @dblclick="selectAndOpen(frame)"
              >
                <!-- Card Thumbnail -->
                <div class="frame-thumb-container position-relative bg-light d-flex align-items-center justify-content-center overflow-hidden" style="height: 200px;">
                  <img
                    v-if="frame.thumbnail"
                    :src="frame.thumbnail"
                    :alt="frame.name"
                    class="frame-thumb-img"
                    style="max-width: 82%; max-height: 90%; object-fit: contain;"
                  />
                  <div v-else class="d-flex align-items-center justify-content-center border border-2 border-secondary border-dashed rounded text-secondary fw-bold" style="width: 70px; height: 140px;">
                    <span>{{ frame.name.slice(0, 2).toUpperCase() }}</span>
                  </div>

                  <!-- Quick Hover Overlay with Open Button -->
                  <div class="frame-hover-overlay">
                    <button
                      class="btn btn-light btn-sm rounded-pill fw-bold px-3 shadow-sm d-flex align-items-center gap-1"
                      @click.stop="selectAndOpen(frame)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>Open</span>
                    </button>
                  </div>
                </div>

                <!-- Card Metadata -->
                <div class="card-body p-2 d-flex flex-column justify-content-between bg-white">
                  <div>
                    <div class="d-flex align-items-center justify-content-between mb-1">
                      <span class="fw-bold text-dark small text-truncate" :title="frame.name">{{ frame.name }}</span>
                    </div>

                    <div class="d-flex align-items-center justify-content-between text-muted" style="font-size: 0.72rem;">
                      <span class="badge bg-light text-secondary border fw-normal">{{ frame.slotCount || 4 }} slots</span>
                      <span>{{ formatDate(frame.updatedAt) }}</span>
                    </div>
                  </div>

                  <!-- Bottom Action Toolbar -->
                  <div class="d-flex align-items-center justify-content-between pt-2 border-top mt-2">
                    <button
                      class="btn btn-sm btn-outline-secondary py-0 px-2 d-flex align-items-center gap-1"
                      style="font-size: 0.72rem;"
                      title="Download editable PNG file"
                      @click.stop="$emit('download-frame', frame)"
                    >
                      <AppIcon name="download" :size="12" :stroke-width="2" />
                      <span>PNG</span>
                    </button>

                    <!-- Action buttons -->
                    <div v-if="confirmingDeleteId === frame.id" class="d-flex align-items-center gap-1">
                      <button
                        class="btn btn-sm btn-danger py-0 px-2 fw-semibold"
                        style="font-size: 0.72rem; line-height: 1.5;"
                        title="Permanently delete template"
                        @click.stop="handleConfirmDelete(frame)"
                      >
                        Delete?
                      </button>
                      <button
                        class="btn btn-sm btn-outline-secondary py-0 px-1"
                        style="font-size: 0.72rem; line-height: 1.5;"
                        title="Cancel"
                        @click.stop="confirmingDeleteId = null"
                      >
                        ✕
                      </button>
                    </div>

                    <button
                      v-else
                      class="btn btn-sm btn-outline-danger py-0 px-2 d-flex align-items-center gap-1"
                      style="font-size: 0.72rem;"
                      title="Delete template"
                      @click.stop="confirmingDeleteId = frame.id"
                    >
                      <IconTrash :size="12" :stroke-width="2" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer px-4 py-3 bg-white border-top d-flex justify-content-between align-items-center">
          <span class="small text-muted mb-0">
            💡 <strong>Tip:</strong> Drag and drop any saved <code>.png</code> file from your computer directly onto the workspace to open it!
          </span>
          <button class="btn btn-dark btn-sm rounded-pill px-4 fw-semibold" @click="$emit('close')">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { IconFolder, IconTrash, AppIcon } from './icons/index.js'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  savedFrames: {
    type: Array,
    default: () => []
  },
  currentFrameId: {
    type: String,
    default: null
  }
})

const emit = defineEmits([
  'close',
  'open-frame',
  'delete-frame',
  'download-frame',
  'import-file',
  'save-current'
])

const searchQuery = ref('')
const fileInputRef = ref(null)
const confirmingDeleteId = ref(null)
const isDraggingOver = ref(false)

const filteredFrames = computed(() => {
  if (!searchQuery.value.trim()) return props.savedFrames
  const q = searchQuery.value.toLowerCase().trim()
  return props.savedFrames.filter((f) => f.name && f.name.toLowerCase().includes(q))
})

function triggerFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

function handleFileInputChange(e) {
  const file = e.target.files?.[0]
  if (file) {
    emit('import-file', file)
  }
}

function handleModalDrop(e) {
  isDraggingOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    emit('import-file', file)
  }
}

function selectAndOpen(frame) {
  emit('open-frame', frame)
}

function handleConfirmDelete(frame) {
  confirmingDeleteId.value = null
  emit('delete-frame', frame.id)
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diffHours = (now - date) / (1000 * 60 * 60)
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.modal-drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(248, 250, 252, 0.88);
  backdrop-filter: blur(4px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.frame-card {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
}

.frame-card:hover {
  transform: translateY(-3px);
  border-color: #2563eb !important;
  box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.15) !important;
}

.frame-thumb-img {
  transition: transform 0.2s ease;
}

.frame-card:hover .frame-thumb-img {
  transform: scale(1.03);
}

.frame-hover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.frame-card:hover .frame-hover-overlay {
  opacity: 1;
}
</style>
