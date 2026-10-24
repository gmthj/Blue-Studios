<script setup>
import { useTemplateEditorContext } from "../../composables/useTemplateEditor.js"
import { IconSave } from "../icons/index.js"

const editor = useTemplateEditorContext()
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
  router,
  slotCount,
  templateName,
  toggleCategory,
  user
} = editor
</script>

<template>
    <!-- Save Template to My Studio / Account Modal -->
    <div
      v-if="isSaveModalOpen"
      class="modal fade show d-block save-modal-backdrop"
      tabindex="-1"
      @click.self="isSaveModalOpen = false"
    >
      <div class="modal-dialog modal-dialog-centered" style="max-width: 480px;">
        <div class="modal-content shadow-lg border-0 rounded-4 overflow-hidden">
          <div class="modal-header bg-light border-bottom px-4 py-3 align-items-center">
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-circle bg-primary bg-opacity-10 p-2 text-primary d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                <IconSave :size="18" :stroke-width="2.2" />
              </div>
              <h5 class="modal-title fs-6 fw-bold m-0">Save Template</h5>
            </div>
            <button type="button" class="btn-close" @click="isSaveModalOpen = false" aria-label="Close"></button>
          </div>

          <div class="modal-body p-4 d-flex flex-column gap-3">
            <!-- Account Status Banner -->
            <div class="alert alert-light border d-flex align-items-center justify-content-between p-2 mb-0">
              <div class="d-flex align-items-center gap-2 small">
                <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">Logged In</span>
                <span class="fw-semibold text-truncate" style="max-width: 220px;">{{ user.displayName || user.email }}</span>
              </div>
              <router-link to="/studio" class="small text-decoration-none">My Studio &rarr;</router-link>
            </div>

            <!-- Notice if editing someone else's marketplace template -->
            <div v-if="isAccount && cloudId && !isOwner" class="alert alert-info small mb-0 py-2">
              ℹ️ This template belongs to another creator. Saving will save a <strong>new copy</strong> to your My Studio.
            </div>

            <!-- Template Name Field -->
            <div>
              <label class="form-label small fw-bold text-secondary text-uppercase mb-1" for="modal-template-name">Template Name</label>
              <input
                id="modal-template-name"
                v-model="templateName"
                type="text"
                maxlength="40"
                class="form-control"
                placeholder="e.g. Y2K Besties Strip"
                required
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
                Also download editable PNG & save to device folder
              </label>
            </div>

            <div v-if="cloudErrorMessage" class="alert alert-danger small py-2 mb-0">
              {{ cloudErrorMessage }}
            </div>
          </div>

          <div class="modal-footer bg-light border-top px-4 py-3 d-flex justify-content-between">
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="isSaveModalOpen = false">Cancel</button>

            <div class="d-flex gap-2">
              <button
                v-if="isAccount && cloudId && isOwner"
                type="button"
                class="btn btn-outline-primary btn-sm"
                :disabled="isSavingFrame"
                @click="executeSave({ asCopy: true })"
              >
                Save as Copy
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm fw-bold px-3 shadow-sm"
                :disabled="isSavingFrame"
                @click="executeSave({ asCopy: false })"
              >
                <span v-if="isSavingFrame" class="spinner-border spinner-border-sm me-1" role="status"></span>
                <span>{{ cloudId ? (isOwner ? 'Update in My Studio' : 'Save a copy to My Studio') : 'Save to My Studio' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
</template>
