<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listReports, dismissReports, hideItem, getAnyItem, namesFor } from '../../admin.js'
import { REPORT_REASONS, itemLink } from '../../marketplace.js'
import { useAdminTab, useSort, formatTime } from '../../composables/useAdminTab.js'
import StorageImage from '../StorageImage.vue'

// Reports tab: reported marketplace items, grouped by item. Open ones can be hidden or dismissed;
// resolved and dismissed ones are kept as a record.

const emit = defineEmits(['open-tab'])
const route = useRoute()

const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
]
const STATUS_BADGES = { open: 'text-bg-warning', resolved: 'text-bg-success', dismissed: 'text-bg-secondary' }

const status = ref('open')
const groups = ref([]) // [{ type, itemId, ownerId, reports, open, item }]
const notes = ref({}) // itemId -> what the admin typed
const names = ref({})

const { loading, busy, errorMessage, message, run, reload } = useAdminTab(async () => {
  const list = await listReports(status.value)
  await Promise.all(list.map(async (group) => {
    group.item = await getAnyItem(group.type, group.itemId)
  }))
  groups.value = list
  names.value = await namesFor(list.flatMap((g) => [g.ownerId, ...g.reports.map((r) => r.reporterId)]))
})

const type = ref('all')
const reason = ref('all')

// Each group's reports are newest first, so reports[0] is the latest one
const sort = useSort({
  latest: { get: (g) => g.reports[0].createdAt, first: 'desc' },
  count: { get: (g) => g.reports.length, first: 'desc' },
  name: { get: (g) => (g.item ? g.item.name : ''), first: 'asc' },
}, 'latest')
const { choice: sortChoice } = sort

const SORTS = [
  { value: 'latest:desc', label: 'Newest report first' },
  { value: 'latest:asc', label: 'Oldest report first' },
  { value: 'count:desc', label: 'Most reports' },
  { value: 'name:asc', label: 'Item name A-Z' },
]

const shown = computed(() => sort.apply(groups.value.filter((g) =>
  (type.value === 'all' || g.type === type.value)
  && (reason.value === 'all' || g.reports.some((r) => r.reason === reason.value)))))

defineExpose({ refresh: reload })

watch(status, () => {
  loading.value = true
  reload()
})

function reasonLabel(id) {
  const reason = REPORT_REASONS.find((r) => r.id === id)
  return reason ? reason.label : id
}

function hide(group) {
  run(() => hideItem(group.type, group.itemId, notes.value[group.itemId]), 'Hidden, and its reports closed.')
}

function dismiss(group) {
  run(() => dismissReports(group.itemId, notes.value[group.itemId]), 'Reports dismissed.')
}
</script>

<template>
  <div class="row g-2 mb-3">
    <div class="col-12 col-md-auto">
      <div class="btn-group btn-group-sm" role="group" aria-label="Report status">
        <button
          v-for="s in STATUSES" :key="s.id"
          class="btn" :class="status === s.id ? 'btn-primary' : 'btn-outline-primary'"
          @click="status = s.id"
        >{{ s.label }}</button>
      </div>
    </div>
    <div class="col-6 col-md-auto">
      <select v-model="type" class="form-select form-select-sm" aria-label="Type">
        <option value="all">Templates and stickers</option>
        <option value="templates">Templates</option>
        <option value="stickers">Stickers</option>
      </select>
    </div>
    <div class="col-6 col-md-auto">
      <select v-model="reason" class="form-select form-select-sm" aria-label="Reason">
        <option value="all">Any reason</option>
        <option v-for="r in REPORT_REASONS" :key="r.id" :value="r.id">{{ r.label }}</option>
      </select>
    </div>
    <div class="col-12 col-md-auto">
      <select v-model="sortChoice" class="form-select form-select-sm" aria-label="Sort">
        <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
    </div>
  </div>

  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <div v-if="message" class="alert alert-success">{{ message }}</div>
  <p v-if="loading" class="text-muted">Loading...</p>

  <template v-else>
    <p v-if="shown.length === 0" class="text-muted">No reports here.</p>
    <div v-for="group in shown" :key="group.itemId" class="card mb-3">
      <div class="card-body">
        <div class="row g-3">
          <div class="col-4 col-md-2">
            <div class="preview">
              <StorageImage v-if="group.item" :path="group.type === 'templates' ? group.item.thumbnailPath : group.item.imagePath" :alt="group.item.name" />
            </div>
          </div>
          <div class="col-8 col-md-10">
            <p class="fw-semibold mb-0 text-break">
              {{ group.item ? group.item.name : 'Deleted item' }}
              <span class="badge text-bg-light border ms-1">{{ group.type === 'templates' ? 'Template' : 'Sticker' }}</span>
              <span v-if="group.item && group.item.status === 'hidden'" class="badge text-bg-warning ms-1">Hidden</span>
            </p>
            <p class="small text-muted mb-2">
              by {{ names[group.ownerId] || group.ownerId }} &middot; {{ group.reports.length }} report(s)
              <router-link v-if="group.item" :to="itemLink(route, group.type, group.itemId)" class="ms-1">open</router-link>
            </p>
            <ul class="small mb-3 ps-3">
              <li v-for="report in group.reports" :key="report.id" class="text-break">
                <span class="badge me-1" :class="STATUS_BADGES[report.status]">{{ report.status }}</span>
                <strong>{{ reasonLabel(report.reason) }}</strong>
                <template v-if="report.details">: {{ report.details }}</template>
                <span class="text-muted"> ({{ names[report.reporterId] || 'someone' }}, {{ formatTime(report.createdAt) }})</span>
              </li>
            </ul>
            <input v-if="group.open" v-model="notes[group.itemId]" type="text" maxlength="300" class="form-control form-control-sm mb-2" placeholder="Note for the log (optional)" />
            <div class="d-flex flex-wrap gap-2">
              <template v-if="group.open">
                <button class="btn btn-sm btn-danger" :disabled="busy || !group.item" @click="hide(group)">Hide item</button>
                <button class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="dismiss(group)">Dismiss (nothing wrong)</button>
              </template>
              <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="emit('open-tab', 'accounts', { uid: group.ownerId })">Owner's account...</button>
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
