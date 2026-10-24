<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { getItem, isSaved, saveItem, unsaveItem, hasReported, reportItem, REPORT_REASONS } from '../marketplace.js'
import { categoryLabel } from '../studio.js'
import StorageImage from '../components/StorageImage.vue'

// One marketplace item: /marketplace/templates/{id} or /marketplace/stickers/{id}
// Anyone can look. Accounts can save it to their studio or report it to the admins.

const route = useRoute()
const { user, isAccount } = useAuth()

const item = ref(null)
const loading = ref(true)
const errorMessage = ref('')

const saved = ref(false)
const saving = ref(false)

const reported = ref(false)
const showReportForm = ref(false)
const reportReason = ref('inappropriate')
const reportDetails = ref('')
const reporting = ref(false)

const isMine = computed(() => item.value && item.value.ownerId === user.value.uid)
const inMarketplace = computed(() => item.value && item.value.visibility === 'public' && item.value.status === 'active')
const loginLink = computed(() => '/login?redirect=' + encodeURIComponent(route.fullPath))

async function load() {
  loading.value = true
  errorMessage.value = ''
  showReportForm.value = false
  try {
    item.value = await getItem(route.params.type, route.params.id)
    if (item.value && isAccount.value && !isMine.value) {
      const results = await Promise.all([isSaved(item.value.id), hasReported(item.value)])
      saved.value = results[0]
      reported.value = results[1]
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load this. Check your internet connection and refresh.'
  }
  loading.value = false
}

watch(() => route.params.id, load, { immediate: true })

async function toggleSave() {
  saving.value = true
  errorMessage.value = ''
  try {
    if (saved.value) {
      await unsaveItem(item.value.type, item.value.id)
      item.value.saveCount--
    } else {
      await saveItem(item.value)
      item.value.saveCount++
    }
    saved.value = !saved.value
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not save. Please try again.'
  }
  saving.value = false
}

async function sendReport() {
  reporting.value = true
  errorMessage.value = ''
  try {
    await reportItem(item.value, reportReason.value, reportDetails.value)
    reported.value = true
    showReportForm.value = false
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not send the report. Please try again.'
  }
  reporting.value = false
}

function formatDate(time) {
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <router-link :to="'/marketplace?type=' + route.params.type" class="small d-inline-block mb-3">&larr; Back to the marketplace</router-link>

  <p v-if="loading" class="text-muted">Loading...</p>

  <div v-else-if="!item" class="text-center py-5">
    <h1 class="h4">This isn't available</h1>
    <p class="text-muted">It may have been made private or removed.</p>
    <router-link to="/marketplace" class="btn btn-primary">Browse the marketplace</router-link>
  </div>

  <div v-else class="row g-4">
    <div class="col-12 col-md-6 col-lg-5">
      <div class="preview" :class="item.type === 'templates' ? 'template-preview' : 'sticker-preview'">
        <StorageImage :path="item.type === 'templates' ? item.thumbnailPath : item.imagePath" :alt="item.name" />
      </div>
    </div>

    <div class="col-12 col-md-6 col-lg-7">
      <p class="small text-uppercase text-muted mb-1">{{ item.type === 'templates' ? 'Template' : 'Sticker' }}</p>
      <h1 class="h3 mb-1 text-break">{{ item.name }}</h1>
      <p class="text-muted mb-3">by {{ item.ownerName }}</p>

      <div class="d-flex flex-wrap gap-1 mb-3">
        <span v-for="c in item.categories" :key="c" class="badge rounded-pill text-bg-light border">{{ categoryLabel(c) }}</span>
      </div>

      <ul class="list-unstyled small text-muted mb-4">
        <li v-if="item.type === 'templates'">{{ item.slotCount }} photo slots</li>
        <li v-else>{{ item.kind }} sticker</li>
        <li>{{ item.saveCount }} {{ item.saveCount === 1 ? 'save' : 'saves' }}</li>
        <li>Added {{ formatDate(item.createdAt) }}</li>
      </ul>

      <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

      <!-- My own item -->
      <div v-if="isMine" class="alert alert-light border small">
        <template v-if="!inMarketplace">Only you can see this: it is private or hidden by a moderator.</template>
        <router-link to="/studio">Manage it in My Studio</router-link>
      </div>

      <!-- Open in Template Editor button for templates -->
      <div v-if="item.type === 'templates'" class="mb-3">
        <router-link :to="'/template-editor?template=' + item.id" class="btn btn-outline-primary btn-lg w-100 d-flex align-items-center justify-content-center gap-2">
          <span>Open in Template Editor</span>
        </router-link>
      </div>

      <!-- Someone else's item, and I have an account -->
      <template v-else-if="isAccount">
        <button class="btn btn-lg mb-3" :class="saved ? 'btn-outline-primary' : 'btn-primary'" :disabled="saving" @click="toggleSave">
          {{ saved ? 'Saved to My Studio ✓' : 'Save to My Studio' }}
        </button>

        <div>
          <p v-if="reported" class="small text-muted">You reported this. Thanks, a moderator will take a look.</p>
          <button v-else-if="!showReportForm" class="btn btn-link btn-sm text-muted px-0" @click="showReportForm = true">Report</button>

          <form v-else class="card card-body" @submit.prevent="sendReport">
            <h2 class="h6">Report to a moderator</h2>
            <div class="mb-2">
              <label class="form-label small" for="report-reason">What's wrong?</label>
              <select id="report-reason" v-model="reportReason" class="form-select form-select-sm">
                <option v-for="reason in REPORT_REASONS" :key="reason.id" :value="reason.id">{{ reason.label }}</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label small" for="report-details">More details (optional)</label>
              <textarea id="report-details" v-model="reportDetails" class="form-control form-control-sm" rows="3" maxlength="300"></textarea>
            </div>
            <div class="d-flex gap-2">
              <button type="submit" class="btn btn-sm btn-danger" :disabled="reporting">Send report</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="showReportForm = false">Cancel</button>
            </div>
          </form>
        </div>
      </template>

      <!-- Guests -->
      <template v-else>
        <router-link :to="loginLink" class="btn btn-primary btn-lg">Log in to save</router-link>
        <p class="small text-muted mt-2">Free account. Your saved templates and stickers show up in My Studio.</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.preview {
  background: #f1f3f5;
  border-radius: 0.5rem;
  overflow: hidden;
}

.template-preview {
  height: 480px;
  max-height: 70vh;
}

.sticker-preview {
  height: 300px;
  padding: 24px;
}
</style>
