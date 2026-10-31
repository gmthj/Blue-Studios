<script setup>
import { ref, computed } from 'vue'
import { useFrameEditorContext } from '../../composables/useFrameEditor.js'
import StorageImage from '../StorageImage.vue'
import { IconFolder, IconTrash, IconSave } from '../icons/index.js'

const editor = useFrameEditorContext()
const {
  isMyTemplatesDrawerOpen,
  closeMyTemplatesDrawer,
  isLoadingUserTemplates,
  allUserTemplates,
  currentSavedFrameId,
  cloudId,
  promptSwitchTemplate,
  pendingSwitchTemplate,
  isSwitchPromptOpen,
  isSwitchingWorkspace,
  confirmSaveAndSwitch,
  confirmSwitchWithoutSaving,
  deleteUserTemplate,
  startNewBlankFrame
} = editor

const searchQuery = ref('')
const deletingId = ref(null)

const filteredTemplates = computed(() => {
  let list = allUserTemplates.value || []

  // Filter by search query if user types in search bar
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter((t) => (t.name || '').toLowerCase().includes(q))
  }

  return list
})

function isCurrentTemplate(template) {
  if (cloudId.value && (cloudId.value === template.id || cloudId.value === template.cloudId)) {
    return true
  }
  if (currentSavedFrameId.value && currentSavedFrameId.value === template.id) {
    return true
  }
  return false
}

function handleSelect(template) {
  promptSwitchTemplate(template)
}

async function handleDeleteClick(template) {
  if (deletingId.value) return
  deletingId.value = template.id
  try {
    await deleteUserTemplate(template)
  } finally {
    deletingId.value = null
  }
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

<template>
  <div v-if="isMyTemplatesDrawerOpen">
    <!-- 1. Full-screen Blurred Backdrop with Centered Floating Rectangle -->
    <div
      class="my-templates-overlay-backdrop"
      @click.self="closeMyTemplatesDrawer"
    >
      <!-- 2. Centered Rectangular Dialog (Screen-Sized Ratio with Roomy Layout) -->
      <div
        class="my-templates-dialog shadow-2xl d-flex flex-column"
        role="dialog"
        aria-modal="true"
        aria-labelledby="templates-overlay-title"
      >
        <!-- Dialog Header -->
        <div class="px-4 py-3 bg-white border-bottom d-flex align-items-center justify-content-between flex-shrink-0">
          <div class="d-flex align-items-center gap-3">
            <div class="p-2 rounded-3 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
              <IconFolder :size="22" :stroke-width="2" />
            </div>
            <div>
              <h5 id="templates-overlay-title" class="fw-bold text-dark fs-5 mb-0">My Saved Templates</h5>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <!-- Button to start new frame -->
            <button
              type="button"
              class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-semibold d-flex align-items-center gap-1"
              style="font-size: 0.82rem;"
              title="Start a new blank photostrip frame"
              @click="startNewBlankFrame"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Frame</span>
            </button>

            <!-- Router link to full studio -->
            <router-link
              to="/studio"
              class="btn btn-sm btn-light border rounded-pill px-3 py-1 text-secondary text-decoration-none fw-semibold d-flex align-items-center gap-1"
              style="font-size: 0.82rem;"
              title="View full My Studio page"
            >
              <span>My Studio</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </router-link>

            <!-- Close button -->
            <button
              type="button"
              class="btn-close ms-2"
              aria-label="Close"
              @click="closeMyTemplatesDrawer"
            ></button>
          </div>
        </div>

        <!-- Toolbar: Search Bar & Count -->
        <div class="px-4 py-2 bg-light border-bottom d-flex align-items-center justify-content-between gap-3 flex-shrink-0">
          <div class="input-group input-group-sm" style="max-width: 380px;">
            <span class="input-group-text bg-white border-end-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search templates by name..."
              class="form-control border-start-0 ps-1"
              style="font-size: 0.85rem;"
            />
            <button
              v-if="searchQuery"
              class="btn btn-outline-secondary border-start-0"
              type="button"
              @click="searchQuery = ''"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <span class="badge bg-white text-secondary border px-3 py-2 rounded-pill fw-normal" style="font-size: 0.75rem;">
            {{ filteredTemplates.length }} {{ filteredTemplates.length === 1 ? 'template' : 'templates' }}
          </span>
        </div>

        <!-- Dialog Body: Responsive Multi-Column Grid -->
        <div class="dialog-body p-4 flex-grow-1 overflow-y-auto custom-scrollbar bg-light bg-opacity-50">
          <!-- Loading Skeleton -->
          <div v-if="isLoadingUserTemplates" class="text-center py-5">
            <div class="spinner-border text-primary mb-3" style="width: 2.8rem; height: 2.8rem;" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <h6 class="fw-bold text-dark mb-1">Loading your saved templates...</h6>
            <p class="text-muted small mb-0">Connecting to storage and loading files...</p>
          </div>

          <!-- Empty State -->
          <div v-else-if="filteredTemplates.length === 0" class="text-center py-5 my-auto">
            <div class="empty-icon-wrapper mb-3 mx-auto">
              <IconFolder :size="36" :stroke-width="1.8" />
            </div>
            <h5 class="fw-bold text-dark mb-1">
              {{ searchQuery ? 'No matching templates found' : 'No saved templates yet' }}
            </h5>
            <p class="text-muted small mb-4 mx-auto" style="max-width: 380px; font-size: 0.85rem;">
              {{
                searchQuery
                  ? 'Try searching with a different keyword.'
                  : 'Design custom photostrips in the workspace and click "Save Frame" to save them here!'
              }}
            </p>
            <button
              class="btn btn-primary rounded-pill px-4 py-2 fw-semibold shadow-sm d-inline-flex align-items-center gap-2"
              @click="startNewBlankFrame"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create a New Frame</span>
            </button>
          </div>

          <!-- Multi-Column Grid of Templates (Spacious 3-4 columns on desktop) -->
          <div v-else class="row g-3">
            <div
              v-for="template in filteredTemplates"
              :key="template.id"
              class="col-12 col-sm-6 col-md-4 col-xl-3"
            >
              <div
                class="card h-100 template-card border rounded-3 overflow-hidden shadow-xs cursor-pointer position-relative bg-white"
                :class="{
                  'is-active-workspace border-primary shadow-sm': isCurrentTemplate(template)
                }"
                @click="handleSelect(template)"
              >
                <!-- Card Thumbnail Container -->
                <div class="template-thumb-wrapper position-relative d-flex align-items-center justify-content-center overflow-hidden" style="height: 220px;">
                  <!-- Cloud Image via StorageImage if has cardUrl or thumbnailPath -->
                  <StorageImage
                    v-if="template.cardUrl || template.thumbnailPath"
                    :src="template.cardUrl || ''"
                    :path="template.thumbnailPath || ''"
                    :alt="template.name"
                    class="template-thumb-img"
                    style="max-width: 82%; max-height: 90%; object-fit: contain;"
                  />

                  <!-- Local Thumbnail Data URL -->
                  <img
                    v-else-if="template.thumbnail"
                    :src="template.thumbnail"
                    :alt="template.name"
                    class="template-thumb-img"
                    style="max-width: 82%; max-height: 90%; object-fit: contain;"
                  />

                  <!-- Fallback Slot Placeholder -->
                  <div v-else class="d-flex flex-column align-items-center justify-content-center border border-2 border-secondary border-dashed rounded p-3 text-secondary" style="width: 75px; height: 150px;">
                    <span class="fw-bold small">{{ (template.name || 'FR').slice(0, 2).toUpperCase() }}</span>
                    <span class="badge bg-light text-secondary border mt-1" style="font-size: 0.65rem;">{{ template.slotCount || 4 }} slots</span>
                  </div>

                  <!-- Active Workspace Indicator Badge -->
                  <div v-if="isCurrentTemplate(template)" class="position-absolute top-0 start-0 m-2">
                    <span class="badge bg-success shadow-xs d-flex align-items-center gap-1 py-1 px-2" style="font-size: 0.72rem;">
                      <span class="spinner-grow spinner-grow-sm" style="width: 6px; height: 6px;" role="status"></span>
                      <span>Currently Open</span>
                    </span>
                  </div>

                  <!-- Hover Action Overlay -->
                  <div class="template-hover-action">
                    <button
                      class="btn btn-primary btn-sm rounded-pill fw-bold px-3 py-1 shadow-sm d-flex align-items-center gap-1"
                      style="font-size: 0.8rem;"
                      @click.stop="handleSelect(template)"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>{{ isCurrentTemplate(template) ? 'Reload Frame' : 'Switch to Frame' }}</span>
                    </button>
                  </div>
                </div>

                <!-- Card Details -->
                <div class="card-body p-3 d-flex flex-column justify-content-between bg-white">
                  <div>
                    <div class="d-flex align-items-center justify-content-between gap-1 mb-1">
                      <span class="fw-bold text-dark small text-truncate" :title="template.name">
                        {{ template.name }}
                      </span>
                    </div>

                    <div class="d-flex align-items-center justify-content-between text-muted" style="font-size: 0.72rem;">
                      <span class="badge bg-light text-secondary border fw-normal">{{ template.slotCount || 4 }} slots</span>
                      <span>{{ formatDate(template.updatedAt) }}</span>
                    </div>
                  </div>

                  <!-- Bottom Toolbar (Delete) -->
                  <div class="d-flex align-items-center justify-content-end pt-2 border-top mt-2" @click.stop>
                    <button
                      type="button"
                      class="btn btn-sm btn-link text-danger p-0 d-flex align-items-center gap-1 text-decoration-none"
                      style="font-size: 0.75rem;"
                      title="Delete saved template"
                      :disabled="deletingId === template.id"
                      @click.stop="handleDeleteClick(template)"
                    >
                      <span v-if="deletingId === template.id" class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;" role="status"></span>
                      <IconTrash v-else :size="13" :stroke-width="2" />
                      <span>{{ deletingId === template.id ? 'Deleting...' : 'Delete' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dialog Footer -->
        <div class="px-4 py-3 bg-white border-top d-flex align-items-center justify-content-end flex-shrink-0">
          <button
            type="button"
            class="btn btn-dark btn-sm rounded-pill px-4 fw-semibold"
            style="font-size: 0.82rem;"
            @click="closeMyTemplatesDrawer"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- 3. TEMPLATE SWITCH CONFIRMATION PROMPT MODAL                   -->
    <!-- ============================================================== -->
    <div
      v-if="isSwitchPromptOpen && pendingSwitchTemplate"
      class="modal fade show d-block switch-prompt-backdrop"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      style="background-color: rgba(15, 23, 42, 0.75); backdrop-filter: blur(6px); z-index: 1065;"
      @click.self="!isSwitchingWorkspace ? (isSwitchPromptOpen = false) : null"
    >
      <div class="modal-dialog modal-dialog-centered" style="max-width: 440px;">
        <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
          <!-- Prompt Header -->
          <div class="modal-header bg-light border-bottom px-4 py-3 align-items-center">
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-circle bg-primary bg-opacity-10 p-2 text-primary d-flex align-items-center justify-content-center" style="width: 34px; height: 34px;">
                <IconSave :size="18" :stroke-width="2.2" />
              </div>
              <h5 class="modal-title fs-6 fw-bold m-0 text-dark">Save Current Frame First?</h5>
            </div>
            <button
              v-if="!isSwitchingWorkspace"
              type="button"
              class="btn-close"
              aria-label="Close"
              @click="isSwitchPromptOpen = false"
            ></button>
          </div>

          <!-- Prompt Body -->
          <div class="modal-body p-4 text-center">
            <p class="text-secondary small mb-3">
              You are about to switch your workspace to:
            </p>
            <div class="p-3 bg-light rounded-3 border mb-3 text-center">
              <div class="fw-bold text-dark fs-6 text-truncate mb-1">
                {{ pendingSwitchTemplate.name || 'Untitled Template' }}
              </div>
              <div class="d-flex align-items-center justify-content-center gap-2 text-muted" style="font-size: 0.75rem;">
                <span class="badge bg-white text-secondary border">{{ pendingSwitchTemplate.slotCount || 4 }} slots</span>
              </div>
            </div>
            <p class="text-muted small mb-0" style="font-size: 0.8rem;">
              Would you like to save changes to your current frame before switching workspaces?
            </p>
          </div>

          <!-- Prompt Footer with 3 distinct Actions -->
          <div class="modal-footer bg-light border-top px-4 py-3 d-flex flex-column gap-2">
            <div class="d-flex align-items-center justify-content-between w-100 gap-2">
              <!-- Switch without saving -->
              <button
                type="button"
                class="btn btn-outline-danger btn-sm rounded-pill px-3 flex-grow-1"
                :disabled="isSwitchingWorkspace"
                @click="confirmSwitchWithoutSaving"
              >
                Switch without Saving
              </button>

              <!-- Save current frame & switch -->
              <button
                type="button"
                class="btn btn-primary btn-sm rounded-pill fw-bold px-3 flex-grow-1 shadow-sm d-flex align-items-center justify-content-center gap-1"
                :disabled="isSwitchingWorkspace"
                @click="confirmSaveAndSwitch"
              >
                <span v-if="isSwitchingWorkspace" class="spinner-border spinner-border-sm me-1" role="status"></span>
                <span>{{ isSwitchingWorkspace ? 'Saving...' : 'Save & Switch' }}</span>
              </button>
            </div>

            <!-- Cancel Button -->
            <button
              type="button"
              class="btn btn-link btn-sm text-secondary text-decoration-none py-1"
              :disabled="isSwitchingWorkspace"
              @click="isSwitchPromptOpen = false"
            >
              Cancel and stay on current frame
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-templates-overlay-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(8px);
  z-index: 1045;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3vh 3vw;
  animation: fadeIn 0.2s ease-out;
}

.my-templates-dialog {
  width: min(1200px, 94vw);
  height: min(820px, 88vh);
  background-color: #ffffff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  animation: scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.empty-icon-wrapper {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background-color: rgba(37, 99, 235, 0.08);
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.template-card {
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  cursor: pointer;
}

.template-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.09);
  border-color: #3b82f6 !important;
}

.template-card.is-active-workspace {
  background-color: rgba(59, 130, 246, 0.02);
}

.template-thumb-wrapper {
  background: radial-gradient(circle, #f8fafc 0%, #f1f5f9 100%);
}

.template-hover-action {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.template-card:hover .template-hover-action {
  opacity: 1;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
