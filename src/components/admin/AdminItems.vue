<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { listItems, hideItem, unhideItem } from '../../admin.js'
import { CATEGORIES, categoryLabel } from '../../studio.js'
import { useAdminTab, useSort, formatTime } from '../../composables/useAdminTab.js'
import StorageImage from '../StorageImage.vue'
import { askText } from '../../composables/useDialog.js'

// Items tab: every template and sticker (public, private and hidden by moderators).
// /admin?tab=items&type=stickers&state=hidden&owner=<uid> opens it already filtered.

const emit = defineEmits(['open-tab'])
const route = useRoute()

const items = ref([])
const type = ref(['templates', 'stickers'].includes(route.query.type) ? route.query.type : 'all')
const state = ref(['public', 'private', 'hidden'].includes(route.query.state) ? route.query.state : 'all')
const search = ref(route.query.owner ? String(route.query.owner) : '')

const { loading, busy, errorMessage, message, run, reload } = useAdminTab(async () => {
  items.value = await listItems()
})

defineExpose({ refresh: reload })

// public = in the marketplace; private = only the owner sees it; hidden = taken down by a moderator
function stateOf(item) {
  if (item.status === 'hidden') return 'hidden'
  return item.visibility === 'public' ? 'public' : 'private'
}

const category = ref('all')

const sort = useSort({
  createdAt: { get: (item) => item.createdAt, first: 'desc' },
  updatedAt: { get: (item) => item.updatedAt, first: 'desc' },
  name: { get: (item) => item.name, first: 'asc' },
  owner: { get: (item) => item.ownerName, first: 'asc' },
  saves: { get: (item) => item.saveCount || 0, first: 'desc' },
}, 'createdAt')
const { choice: sortChoice } = sort

const SORTS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently changed' },
  { value: 'saves:desc', label: 'Most saved' },
  { value: 'saves:asc', label: 'Least saved' },
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'name:desc', label: 'Name Z-A' },
  { value: 'owner:asc', label: 'Owner A-Z' },
]

const shown = computed(() => {
  const text = search.value.trim().toLowerCase()
  return sort.apply(items.value.filter((item) =>
    (type.value === 'all' || item.type === type.value)
    && (state.value === 'all' || stateOf(item) === state.value)
    && (category.value === 'all' || (item.categories || []).includes(category.value))
    && (!text
      || (item.name || '').toLowerCase().includes(text)
      || (item.ownerName || '').toLowerCase().includes(text)
      || item.ownerId === search.value.trim())))
})

async function hide(item) {
  const note = await askText({
    title: 'Hide "' + item.name + '" from the marketplace?',
    label: 'Note for the log (optional)',
    placeholder: 'e.g. copied from someone else',
    confirmLabel: 'Hide item',
    danger: true,
    icon: 'eye-off',
  })
  if (note === null) return
  run(() => hideItem(item.type, item.id, note), '"' + item.name + '" is hidden.')
}

function unhide(item) {
  run(() => unhideItem(item.type, item.id, ''), '"' + item.name + '" is unhidden (it is in the marketplace again if its owner set it to public).')
}
</script>

<template>
  <div class="row g-2 mb-3">
    <div class="col-12 col-lg-4">
      <input v-model="search" type="search" class="form-control form-control-sm" placeholder="Search by name, owner name or owner id" aria-label="Search items" />
    </div>
    <div class="col-6 col-md-3 col-lg-2">
      <select v-model="type" class="form-select form-select-sm" aria-label="Type">
        <option value="all">Templates and stickers</option>
        <option value="templates">Templates</option>
        <option value="stickers">Stickers</option>
      </select>
    </div>
    <div class="col-6 col-md-3 col-lg-2">
      <select v-model="state" class="form-select form-select-sm" aria-label="Visibility">
        <option value="all">Public, private and hidden</option>
        <option value="public">Public</option>
        <option value="private">Private</option>
        <option value="hidden">Hidden by a moderator</option>
      </select>
    </div>
    <div class="col-6 col-md-3 col-lg-2">
      <select v-model="category" class="form-select form-select-sm" aria-label="Category">
        <option value="all">Any category</option>
        <option v-for="c in CATEGORIES" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
    </div>
    <div class="col-6 col-md-3 col-lg-2">
      <select v-model="sortChoice" class="form-select form-select-sm" aria-label="Sort">
        <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
    </div>
  </div>

  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <div v-if="message" class="alert alert-success">{{ message }}</div>
  <p v-if="loading" class="text-muted">Loading...</p>

  <template v-else>
    <p class="small text-muted">{{ shown.length }} of {{ items.length }} items</p>
    <div class="row g-3">
      <div v-for="item in shown" :key="item.type + item.id" class="col-6 col-md-3 col-xl-2">
        <div class="card h-100">
          <div class="preview"><StorageImage :src="item.cardUrl" :path="item.type === 'templates' ? item.thumbnailPath : item.imagePath" :alt="item.name" /></div>
          <div class="card-body p-2 d-flex flex-column">
            <p class="small fw-semibold text-truncate mb-0" :title="item.name">{{ item.name }}</p>
            <p class="small mb-1">
              <span class="badge text-bg-light border">{{ item.type === 'templates' ? 'Template' : 'Sticker' }}</span>
              <span v-if="stateOf(item) === 'hidden'" class="badge text-bg-warning ms-1">Hidden</span>
              <span v-else-if="stateOf(item) === 'public'" class="badge text-bg-success ms-1">Public</span>
              <span v-else class="badge text-bg-secondary ms-1">Private</span>
            </p>
            <p class="small text-muted mb-2">
              <button class="btn btn-link btn-sm p-0 align-baseline text-truncate mw-100" @click="emit('open-tab', 'accounts', { uid: item.ownerId })">{{ item.ownerName || item.ownerId }}</button><br />
              {{ formatTime(item.createdAt) }} &middot; {{ item.saveCount || 0 }} saves<br />
              {{ (item.categories || []).map(categoryLabel).join(', ') }}
            </p>
            <div class="mt-auto d-flex gap-1">
              <router-link v-if="stateOf(item) === 'public'" :to="'/marketplace/' + item.type + '/' + item.id" class="btn btn-sm btn-outline-secondary flex-fill">Open</router-link>
              <button v-if="item.status === 'hidden'" class="btn btn-sm btn-outline-primary flex-fill" :disabled="busy" @click="unhide(item)">Unhide</button>
              <button v-else class="btn btn-sm btn-outline-danger flex-fill" :disabled="busy" @click="hide(item)">Hide</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.preview {
  height: 140px;
  background: var(--soft);
  border-radius: 10px;
  overflow: hidden;
}
</style>
