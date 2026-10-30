<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"
import { IconSave } from "../icons/index.js"

const editor = useFrameEditorContext()
const {
  CATEGORIES,
  MAX_CATEGORIES,
  activeLayout,
  alsoDownloadPng,
  chosenCategories,
  cloudErrorMessage,
  cloudId,
  executeSave,
  isAccount,
  isOwner,
  isSaveModalOpen,
  isSavingFrame,
  isSaveSuccess,
  slotCount,
  templateName,
  toggleCategory
} = editor
</script>

<template>
  <!-- Save Template to My Studio / Account Modal -->
  <div
    v-if="isSaveModalOpen"
    class="modal fade show d-block save-modal-backdrop"
    tabindex="-1"
    style="background-color: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px); z-index: 1055;"
    @click.self="!isSavingFrame && !isSaveSuccess ? (isSaveModalOpen = false) : null"
  >
    <div class="modal-dialog modal-dialog-centered" style="max-width: 480px;">
      <div class="modal-content shadow-lg border-0 rounded-4 overflow-hidden">
        
        <!-- ========================================== -->
        <!-- STATE 1: LOADING ANIMATION                 -->
        <!-- ========================================== -->
        <div v-if="isSavingFrame" class="modal-body p-4 text-center py-5">
          <div class="save-loading-pulse mb-3 mx-auto">
            <div class="spinner-border text-primary" style="width: 3.5rem; height: 3.5rem; border-width: 0.28rem;" role="status">
              <span class="visually-hidden">Saving...</span>
            </div>
          </div>
          <h5 class="fw-bold text-dark mb-1">Saving to My Studio...</h5>
          <p class="text-muted small mb-0" style="max-width: 320px; margin: 0 auto;">
            Rendering high-resolution strip, baking layout, and syncing with your cloud studio.
          </p>
        </div>

        <!-- ========================================== -->
        <!-- STATE 2: SUCCESS ANIMATION                 -->
        <!-- ========================================== -->
        <div v-else-if="isSaveSuccess" class="modal-body p-4 text-center py-5">
          <div class="save-success-circle mx-auto mb-3">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h5 class="fw-bold text-success mb-1">Saved Successfully!</h5>
          <p class="text-muted small mb-3">
            <strong>"{{ templateName || 'Untitled frame' }}"</strong> is now saved to your My Studio templates.
          </p>
          <div class="d-inline-flex align-items-center gap-2 px-3 py-1 bg-light rounded-pill border small text-secondary">
            <span class="spinner-grow spinner-grow-sm text-success" role="status" style="width: 8px; height: 8px;"></span>
            <span>Redirecting to My Studio...</span>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- STATE 3: FORM VIEW (SAVE AS / UPDATE)      -->
        <!-- ========================================== -->
        <template v-else>
          <div class="modal-header bg-light border-bottom px-4 py-3 align-items-center">
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-circle bg-primary bg-opacity-10 p-2 text-primary d-flex align-items-center justify-content-center" style="width: 34px; height: 34px;">
                <IconSave :size="18" :stroke-width="2.2" />
              </div>
              <div>
                <h5 class="modal-title fs-6 fw-bold m-0">
                  {{ cloudId && isOwner ? 'Update Frame' : 'Save Frame As' }}
                </h5>
                <span class="text-muted" style="font-size: 0.72rem;">
                  {{ cloudId && isOwner ? 'Save updates or save a new duplicate copy.' : 'Name your frame before saving to My Studio.' }}
                </span>
              </div>
            </div>
            <button type="button" class="btn-close" aria-label="Close" @click="isSaveModalOpen = false"></button>
          </div>

          <div class="modal-body p-4 d-flex flex-column gap-3">
            <!-- Notice if editing someone else's marketplace template -->
            <div v-if="isAccount && cloudId && !isOwner" class="alert alert-info small mb-0 py-2 d-flex align-items-center gap-2 rounded-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>This template belongs to another creator. Saving will save a <strong>new copy</strong> to your My Studio.</span>
            </div>

            <!-- Frame Title Field -->
            <div>
              <label class="form-label small fw-bold text-secondary text-uppercase mb-1" for="modal-template-name">Frame Title</label>
              <input
                id="modal-template-name"
                v-model="templateName"
                type="text"
                maxlength="40"
                class="form-control"
                placeholder="e.g. my-templates-1"
                required
                autofocus
              />
              <div class="d-flex justify-content-between text-muted mt-1" style="font-size: 0.72rem;">
                <span>{{ slotCount }} slots &middot; {{ activeLayout }} layout</span>
                <span>{{ (templateName || '').length }} / 40</span>
              </div>
            </div>

            <!-- Category Picker (1 to 3) -->
            <div>
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label small fw-bold text-secondary text-uppercase mb-0">Marketplace Categories</label>
                <span class="small text-muted" style="font-size: 0.75rem;">Pick 1 to {{ MAX_CATEGORIES }}</span>
              </div>
              <div class="d-flex flex-wrap gap-1">
                <button
                  v-for="c in CATEGORIES"
                  :key="c.id"
                  type="button"
                  class="btn btn-sm rounded-pill py-0 px-2 category-pill-btn"
                  :class="chosenCategories.includes(c.id) ? 'btn-primary' : 'btn-outline-secondary'"
                  :disabled="!chosenCategories.includes(c.id) && chosenCategories.length >= MAX_CATEGORIES"
                  @click="toggleCategory(c.id)"
                >
                  {{ c.label }}
                </button>
              </div>
            </div>

            <!-- Also download PNG checkbox -->
            <div class="form-check">
              <input id="modal-download-png" v-model="alsoDownloadPng" class="form-check-input" type="checkbox" />
              <label class="form-check-label small text-secondary" for="modal-download-png">
                Export a copy to desktop
              </label>
            </div>

            <div v-if="cloudErrorMessage" class="alert alert-danger small py-2 mb-0">
              {{ cloudErrorMessage }}
            </div>
          </div>

          <div class="modal-footer bg-light border-top px-4 py-3 d-flex justify-content-between">
            <button type="button" class="btn btn-outline-secondary btn-sm rounded-pill px-3" @click="isSaveModalOpen = false">
              Cancel
            </button>

            <div class="d-flex gap-2">
              <button
                v-if="isAccount && cloudId && isOwner"
                type="button"
                class="btn btn-outline-primary btn-sm rounded-pill px-3"
                :disabled="isSavingFrame"
                @click="executeSave({ asCopy: true })"
              >
                Save as Copy
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm fw-bold px-4 rounded-pill shadow-sm"
                :disabled="isSavingFrame || !templateName.trim()"
                @click="executeSave({ asCopy: false })"
              >
                <span>{{ cloudId ? (isOwner ? 'Update in My Studio' : 'Save Copy to My Studio') : 'Save to My Studio' }}</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.save-success-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.save-loading-pulse {
  animation: pulseOpacity 1.5s ease-in-out infinite;
}

@keyframes popIn {
  0% { transform: scale(0.5); opacity: 0; }
  70% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes pulseOpacity {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.category-pill-btn {
  font-size: 0.75rem;
  transition: all 0.15s ease;
}
</style>
