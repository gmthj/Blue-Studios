<script setup>
import { ref, computed } from 'vue'
import { listAdminLog, namesFor } from '../../admin.js'
import { useAdminTab, useSort, formatTime, LOG_ACTIONS } from '../../composables/useAdminTab.js'
import SortHeader from './SortHeader.vue'

// Log tab: the latest 200 things moderators did (nobody can change or delete these)

const entries = ref([])
const names = ref({})
const action = ref('all')
const adminId = ref('all')
const search = ref('')

const { loading, errorMessage, reload } = useAdminTab(async () => {
  entries.value = await listAdminLog(200)
  names.value = await namesFor(entries.value.flatMap((entry) => [entry.adminId, entry.targetType === 'users' ? entry.targetId : '']))
})

defineExpose({ refresh: reload })

function nameOf(uid) {
  return names.value[uid] || uid
}

// "users Bob" or "rooms 1234"
function targetOf(entry) {
  return entry.targetType + ' ' + (entry.targetType === 'users' ? nameOf(entry.targetId) : entry.targetId)
}

// The moderators who appear in the log
const admins = computed(() => [...new Set(entries.value.map((entry) => entry.adminId))])

const sort = useSort({
  createdAt: { get: (entry) => entry.createdAt, first: 'desc' },
  admin: { get: (entry) => nameOf(entry.adminId), first: 'asc' },
  action: { get: (entry) => LOG_ACTIONS[entry.action] || entry.action, first: 'asc' },
  target: { get: (entry) => targetOf(entry), first: 'asc' },
  reason: { get: (entry) => entry.reason, first: 'asc' },
}, 'createdAt')

const shown = computed(() => {
  const text = search.value.trim().toLowerCase()
  return sort.apply(entries.value.filter((entry) =>
    (action.value === 'all' || entry.action === action.value)
    && (adminId.value === 'all' || entry.adminId === adminId.value)
    && (!text || targetOf(entry).toLowerCase().includes(text) || (entry.reason || '').toLowerCase().includes(text))))
})
</script>

<template>
  <div class="row g-2 mb-3">
    <div class="col-12 col-md-5">
      <input v-model="search" type="search" class="form-control form-control-sm" placeholder="Search by what it was done on, or the note" aria-label="Search the log" />
    </div>
    <div class="col-6 col-md-auto">
      <select v-model="action" class="form-select form-select-sm" aria-label="Action">
        <option value="all">All actions</option>
        <option v-for="(label, id) in LOG_ACTIONS" :key="id" :value="id">{{ label }}</option>
      </select>
    </div>
    <div class="col-6 col-md-auto">
      <select v-model="adminId" class="form-select form-select-sm" aria-label="Moderator">
        <option value="all">All moderators</option>
        <option v-for="uid in admins" :key="uid" :value="uid">{{ nameOf(uid) }}</option>
      </select>
    </div>
  </div>

  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <p v-if="loading" class="text-muted">Loading...</p>

  <template v-else>
    <p v-if="shown.length === 0" class="text-muted">Nothing here.</p>
    <p v-else class="small text-muted mb-1">{{ shown.length }} of {{ entries.length }} entries &middot; click a column to sort</p>
    <div class="table-responsive">
      <table class="table table-sm small">
        <thead>
          <tr>
            <SortHeader :sort="sort" column="createdAt" label="When" />
            <SortHeader :sort="sort" column="admin" label="Who" />
            <SortHeader :sort="sort" column="action" label="What" />
            <SortHeader :sort="sort" column="target" label="On" />
            <SortHeader :sort="sort" column="reason" label="Note" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in shown" :key="entry.id">
            <td class="text-nowrap">{{ formatTime(entry.createdAt) }}</td>
            <td>{{ nameOf(entry.adminId) }}</td>
            <td>{{ LOG_ACTIONS[entry.action] || entry.action }}</td>
            <td class="text-break">{{ targetOf(entry) }}</td>
            <td class="text-break">{{ entry.reason }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
