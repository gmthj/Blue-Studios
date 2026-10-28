<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { getItem, isSaved, saveItem, unsaveItem, hasReported, reportItem, REPORT_REASONS } from '../marketplace.js'
import { categoryLabel } from '../studio.js'
import StorageImage from '../components/StorageImage.vue'
import AppIcon from '../components/AppIcon.vue'
import { profileOf } from '../profiles.js'

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

// The maker's name and picture now (a new name or picture shows on older items too)
const maker = computed(() => profileOf(item.value ? item.value.ownerId : ''))

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
  <div class="app-page">
    <router-link :to="'/marketplace?type=' + route.params.type" class="back-link">
      <AppIcon name="arrow-right" :size="16" class="back-arrow" /> Back to the marketplace
    </router-link>

    <!-- Grey placeholders while it loads -->
    <div v-if="loading" class="row g-4" aria-label="Loading" role="status">
      <div class="col-12 col-md-6 col-lg-5"><div class="skeleton skeleton-preview"></div></div>
      <div class="col-12 col-md-6 col-lg-7">
        <div class="skeleton skeleton-line w-25 mb-3"></div>
        <div class="skeleton skeleton-title mb-3"></div>
        <div class="skeleton skeleton-line w-50"></div>
      </div>
    </div>

    <div v-else-if="!item" class="empty-state py-5">
      <span class="empty-icon"><AppIcon name="eye-off" :size="22" /></span>
      <strong class="text-body fs-5">This isn't available</strong>
      <span class="mb-2">It may have been made private or removed.</span>
      <router-link to="/marketplace" class="btn btn-primary">Browse the marketplace</router-link>
    </div>

    <div v-else class="row g-4 g-lg-5">
      <!-- The picture, on a soft grey card -->
      <div class="col-12 col-md-6 col-lg-5">
        <div class="preview" :class="item.type === 'templates' ? 'template-preview' : 'sticker-preview'">
          <StorageImage :path="item.type === 'templates' ? item.thumbnailPath : item.imagePath" :alt="item.name" priority />
        </div>
      </div>

      <div class="col-12 col-md-6 col-lg-7">
        <span class="type-pill">
          <AppIcon :name="item.type === 'templates' ? 'layout' : 'sparkle'" :size="14" />
          {{ item.type === 'templates' ? 'Template' : 'Sticker' }}
        </span>
        <h1 class="item-title">{{ item.name }}</h1>

        <!-- The maker, with the first letter of their name in a circle -->
        <p class="maker">
          <img :src="maker.avatar" class="maker-avatar" alt="" width="28" height="28" />
          by <strong>{{ maker.name || item.ownerName }}</strong>
        </p>

        <div v-if="item.categories && item.categories.length" class="d-flex flex-wrap gap-1 mb-4">
          <router-link
            v-for="c in item.categories"
            :key="c"
            :to="'/marketplace?type=' + item.type + '&category=' + c"
            class="chip chip-sm text-decoration-none"
          >{{ categoryLabel(c) }}</router-link>
        </div>

        <!-- Facts in a row of small boxes -->
        <div class="facts mb-4">
          <div class="fact">
            <span class="fact-value">{{ item.type === 'templates' ? item.slotCount : item.kind }}</span>
            <span class="fact-label">{{ item.type === 'templates' ? 'photo slots' : 'sticker' }}</span>
          </div>
          <div class="fact">
            <span class="fact-value">{{ item.saveCount }}</span>
            <span class="fact-label">{{ item.saveCount === 1 ? 'save' : 'saves' }}</span>
          </div>
          <div class="fact">
            <span class="fact-value">{{ formatDate(item.createdAt) }}</span>
            <span class="fact-label">added</span>
          </div>
        </div>

        <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

        <!-- My own item -->
        <div v-if="isMine" class="alert alert-light border small">
          <template v-if="!inMarketplace">Only you can see this: it is private or hidden by a moderator. </template>
          <router-link to="/studio">Manage it in My Studio</router-link>
        </div>

        <div class="actions">
          <!-- Someone else's item, and I have an account -->
          <button
            v-if="isAccount && !isMine"
            class="btn btn-lg d-inline-flex align-items-center justify-content-center gap-2"
            :class="saved ? 'btn-outline-primary' : 'btn-primary'"
            :disabled="saving"
            @click="toggleSave"
          >
            <AppIcon :name="saved ? 'check' : 'bookmark'" :size="18" />
            {{ saved ? 'Saved to My Studio' : 'Save to My Studio' }}
          </button>

          <!-- Guests -->
          <router-link v-else-if="!isAccount" :to="loginLink" class="btn btn-primary btn-lg d-inline-flex align-items-center justify-content-center gap-2">
            <AppIcon name="bookmark" :size="18" /> Log in to save
          </router-link>

          <!-- Templates can also be opened in the template editor -->
          <router-link
            v-if="item.type === 'templates'"
            :to="'/template-editor?template=' + item.id"
            class="btn btn-outline-secondary btn-lg d-inline-flex align-items-center justify-content-center gap-2"
          >
            <AppIcon name="edit" :size="18" /> Open in Template Editor
          </router-link>
        </div>
        <p v-if="!isAccount" class="small text-muted mt-2">Free account. Your saved templates and stickers show up in My Studio.</p>

        <!-- Report (accounts, not my own item) -->
        <div v-if="isAccount && !isMine" class="mt-4">
          <p v-if="reported" class="small text-muted">You reported this. Thanks, a moderator will take a look.</p>
          <button v-else-if="!showReportForm" class="btn btn-link btn-sm text-muted px-0 d-inline-flex align-items-center gap-1" @click="showReportForm = true">
            <AppIcon name="shield" :size="14" /> Report
          </button>

          <form v-else class="card card-body report-form" @submit.prevent="sendReport">
            <h2 class="h6 fw-bold">Report to a moderator</h2>
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  color: var(--ink);
}

/* The arrow-right icon, turned around */
.back-arrow {
  transform: scaleX(-1);
}

.preview {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--soft);
}

.template-preview {
  height: 520px;
  max-height: 70vh;
  padding: 20px;
}

.sticker-preview {
  aspect-ratio: 1;
  max-height: 60vh;
  padding: 40px;
}

.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--brand);
  background: var(--brand-tint);
  font-size: 0.8rem;
  font-weight: 700;
}

.item-title {
  margin-bottom: 8px;
  font-size: clamp(1.6rem, 1.3rem + 1.2vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.maker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: var(--muted);
}

.maker strong {
  color: var(--ink);
}

.maker-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--brand-tint);
}

/* Three small boxes side by side: slots / saves / date */
.facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 440px;
}

.fact {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #ffffff;
}

.fact-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fact-label {
  color: var(--muted);
  font-size: 0.78rem;
}

/* The buttons: side by side, or stacked full width on phones */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 575.98px) {
  .actions .btn {
    width: 100%;
  }
}

.report-form {
  max-width: 440px;
}

.skeleton-preview {
  height: 480px;
  max-height: 60vh;
  border-radius: 20px;
}

.skeleton-line {
  height: 16px;
}

.skeleton-title {
  width: 70%;
  height: 40px;
}
</style>
