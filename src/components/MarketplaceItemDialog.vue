<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { getItem, isSaved, saveItem, unsaveItem, hasReported, reportItem, REPORT_REASONS, parseItemParam, savedChanges } from '../marketplace.js'
import { categoryLabel } from '../studio.js'
import StorageImage from './StorageImage.vue'
import AppIcon from './AppIcon.vue'
import { profileOf } from '../profiles.js'

// One marketplace template or sticker, as a popup on top of the page that opened it.
// Mounted ONCE in App.vue. It opens when the URL has ?item=templates:{id} or ?item=stickers:{id}
// (see itemLink() in marketplace.js), on any page: the marketplace, My Studio, Admin...
// Because it lives in the URL, the browser's back button closes it and the link can be shared.
// Anyone can look. Accounts can save it to their studio or report it to the admins.

const route = useRoute()
const router = useRouter()
const { user, isAccount } = useAuth()

const dialogEl = ref(null)

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

// { type, id } from the URL, or null when no item is open
const wanted = computed(() => parseItemParam(route.query.item))

// The maker's name and picture now (a new name or picture shows on older items too)
const maker = computed(() => profileOf(item.value ? item.value.ownerId : ''))

const isMine = computed(() => item.value && item.value.ownerId === user.value.uid)
const inMarketplace = computed(() => item.value && item.value.visibility === 'public' && item.value.status === 'active')
const loginLink = computed(() => '/login?redirect=' + encodeURIComponent(route.fullPath))

async function load(type, id) {
  loading.value = true
  item.value = null
  errorMessage.value = ''
  showReportForm.value = false
  reportDetails.value = ''
  try {
    const found = await getItem(type, id)
    let results = [false, false]
    if (found && isAccount.value && found.ownerId !== user.value.uid) {
      results = await Promise.all([isSaved(found.id), hasReported(found)])
    }
    // Another item may have been opened while this one loaded: then leave it to that one
    if (openKey.value !== type + ':' + id) return
    item.value = found
    saved.value = results[0]
    reported.value = results[1]
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load this. Check your internet connection and try again.'
  }
  loading.value = false
}

// "templates:aZ3kQ9" while an item is open, '' when not
const openKey = computed(() => (wanted.value ? wanted.value.type + ':' + wanted.value.id : ''))

// ?item= appeared or changed: show the popup and load it. Gone: close the popup.
function showWanted() {
  const el = dialogEl.value
  if (!el) return
  if (!wanted.value) {
    if (el.open) el.close()
    return
  }
  load(wanted.value.type, wanted.value.id)
  if (!el.open) {
    if (el.showModal) el.showModal()
    else el.setAttribute('open', '') // very old browsers (and tests) without showModal
  }
}

watch(openKey, showWanted, { flush: 'post' })
onMounted(showWanted) // opened straight from a shared link

// Close: take ?item= off the URL (the watch above then closes the <dialog>).
// Opened by a click on this site: go back, so the back button doesn't reopen it afterwards.
// Opened from a shared link: there is nothing to go back to, so just change the URL.
function close() {
  if (!route.query.item) return
  const query = { ...route.query }
  delete query.item
  const pageBehind = router.resolve({ path: route.path, query: query }).fullPath
  if (window.history.state && window.history.state.back === pageBehind) router.back()
  else router.replace({ path: route.path, query: query })
}

// A click on the dim area outside the box closes it too (the click lands on the <dialog> itself)
function onBackdropClick(event) {
  if (event.target === dialogEl.value) close()
}

// A link to another page of the marketplace (a category), without this popup on top
function categoryLink(category) {
  return { path: '/marketplace', query: { type: item.value.type, category: category } }
}

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
    savedChanges.value++ // My Studio's "Saved" list reloads
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
  <dialog
    ref="dialogEl"
    class="item-dialog"
    :aria-labelledby="item ? 'item-dialog-title' : undefined"
    :aria-label="item ? undefined : 'Marketplace item'"
    @close="close"
    @click="onBackdropClick"
  >
    <div class="app-page dialog-body">
      <button type="button" class="close-btn" aria-label="Close" @click="close">
        <AppIcon name="close" :size="18" />
      </button>

      <!-- Grey placeholders while it loads -->
      <div v-if="loading" class="layout" aria-label="Loading" role="status">
        <div class="skeleton skeleton-preview"></div>
        <div class="info">
          <div class="skeleton skeleton-line w-25 mb-3"></div>
          <div class="skeleton skeleton-title mb-3"></div>
          <div class="skeleton skeleton-line w-50"></div>
        </div>
      </div>

      <div v-else-if="!item" class="empty-state py-5">
        <span class="empty-icon"><AppIcon name="eye-off" :size="22" /></span>
        <strong class="text-body fs-5">{{ errorMessage ? 'Could not load this' : "This isn't available" }}</strong>
        <span class="mb-2">{{ errorMessage || 'It may have been made private or removed.' }}</span>
        <button type="button" class="btn btn-primary" @click="close">Close</button>
      </div>

      <div v-else class="layout">
        <!-- The picture, on a soft grey card -->
        <div class="preview" :class="item.type === 'templates' ? 'template-preview' : 'sticker-preview'">
          <StorageImage :path="item.type === 'templates' ? item.thumbnailPath : item.imagePath" :alt="item.name" priority />
        </div>

        <div class="info">
          <span class="type-pill">
            <AppIcon :name="item.type === 'templates' ? 'layout' : 'sparkle'" :size="14" />
            {{ item.type === 'templates' ? 'Template' : 'Sticker' }}
          </span>
          <h2 id="item-dialog-title" class="item-title">{{ item.name }}</h2>

          <p class="maker">
            <img :src="maker.avatar" class="maker-avatar" alt="" width="24" height="24" />
            by <strong>{{ maker.name || item.ownerName }}</strong>
          </p>

          <div v-if="item.categories && item.categories.length" class="d-flex flex-wrap gap-1 mb-3">
            <router-link v-for="c in item.categories" :key="c" :to="categoryLink(c)" class="chip chip-sm text-decoration-none">
              {{ categoryLabel(c) }}
            </router-link>
          </div>

          <!-- Facts in a row of small boxes -->
          <div class="facts mb-3">
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

          <div v-if="errorMessage" class="alert alert-danger small py-2">{{ errorMessage }}</div>

          <!-- My own item -->
          <div v-if="isMine" class="alert alert-light border small py-2">
            <template v-if="!inMarketplace">Only you can see this: it is private or hidden by a moderator. </template>
            <template v-if="route.path === '/studio'">This is yours.</template>
            <router-link v-else to="/studio">Manage it in My Studio</router-link>
          </div>

          <div class="actions">
            <!-- Someone else's item, and I have an account -->
            <button
              v-if="isAccount && !isMine"
              class="btn d-inline-flex align-items-center justify-content-center gap-2"
              :class="saved ? 'btn-outline-primary' : 'btn-primary'"
              :disabled="saving"
              @click="toggleSave"
            >
              <AppIcon :name="saved ? 'check' : 'bookmark'" :size="16" />
              {{ saved ? 'Saved to My Studio' : 'Save to My Studio' }}
            </button>

            <!-- Guests -->
            <router-link v-else-if="!isAccount" :to="loginLink" class="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2">
              <AppIcon name="bookmark" :size="16" /> Log in to save
            </router-link>

            <!-- Templates can also be opened in the template editor -->
            <router-link
              v-if="item.type === 'templates'"
              :to="'/template-editor?template=' + item.id"
              class="btn btn-outline-secondary d-inline-flex align-items-center justify-content-center gap-2"
            >
              <AppIcon name="edit" :size="16" /> Open in Template Editor
            </router-link>
          </div>
          <p v-if="!isAccount" class="small text-muted mt-2 mb-0">Free account. Your saved templates and stickers show up in My Studio.</p>

          <!-- Report (accounts, not my own item) -->
          <div v-if="isAccount && !isMine" class="mt-3">
            <p v-if="reported" class="small text-muted mb-0">You reported this. Thanks, a moderator will take a look.</p>
            <button v-else-if="!showReportForm" class="btn btn-link btn-sm text-muted px-0 d-inline-flex align-items-center gap-1" @click="showReportForm = true">
              <AppIcon name="shield" :size="14" /> Report
            </button>

            <form v-else class="card card-body report-form" @submit.prevent="sendReport">
              <h3 class="h6 fw-bold">Report to a moderator</h3>
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
  </dialog>
</template>

<style scoped>
/* The box in the middle of the screen. Pops in: a little smaller and see-through to full size. */
.item-dialog {
  width: min(820px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 64px rgba(20, 23, 43, 0.24);
  opacity: 1;
  transform: scale(1);
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.23, 1, 0.32, 1), overlay 200ms allow-discrete,
    display 200ms allow-discrete;
}

.item-dialog:not([open]) {
  opacity: 0;
  transform: scale(0.96);
}

@starting-style {
  .item-dialog[open] {
    opacity: 0;
    transform: scale(0.96);
  }
}

/* The dim page behind it */
.item-dialog::backdrop {
  background: rgba(20, 23, 43, 0.4);
  backdrop-filter: blur(2px);
}

.dialog-body {
  position: relative;
  padding: 24px;
}

.close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.9);
}

.close-btn:hover {
  color: var(--ink);
  background: var(--soft);
}

.close-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

/* Picture on the left, details on the right. Stacked on phones. */
.layout {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: 24px;
  align-items: start;
}

.info {
  min-width: 0;
  padding-right: 32px; /* clear of the close button */
}

.preview {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--soft);
}

.template-preview {
  height: 440px;
  max-height: 60dvh;
  padding: 16px;
}

.sticker-preview {
  aspect-ratio: 1;
  padding: 32px;
}

@media (max-width: 640px) {
  .dialog-body {
    padding: 16px;
  }

  .layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .info {
    padding-right: 0;
  }

  .template-preview {
    height: 320px;
    max-height: 45dvh;
  }

  .sticker-preview {
    max-height: 40dvh;
    margin: 0 auto;
    padding: 20px;
  }

  .actions .btn {
    width: 100%;
  }
}

.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--brand);
  background: var(--brand-tint);
  font-size: 0.8rem;
  font-weight: 700;
}

.item-title {
  margin-bottom: 6px;
  font-size: clamp(1.35rem, 1.2rem + 0.8vw, 1.75rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.maker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--muted);
  font-size: 0.9rem;
}

.maker strong {
  color: var(--ink);
}

.maker-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--brand-tint);
}

/* Three small boxes side by side: slots / saves / date */
.facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.fact {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px 10px;
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

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skeleton-preview {
  height: 360px;
  max-height: 50dvh;
  border-radius: 16px;
}

.skeleton-line {
  height: 16px;
}

.skeleton-title {
  width: 70%;
  height: 32px;
}

@media (prefers-reduced-motion: reduce) {
  .item-dialog {
    transition: none;
  }
}
</style>
