<script setup>
import { ref, computed } from 'vue'
import { getOverview, listAdminLog, namesFor } from '../../admin.js'
import { useAdminTab, formatTime, LOG_ACTIONS } from '../../composables/useAdminTab.js'

// Overview tab: how much of everything there is, and what moderators did lately.
// Each card opens the tab with the details.

const emit = defineEmits(['open-tab'])

const stats = ref(null)
const recent = ref([])
const names = ref({})

const { loading, errorMessage, reload } = useAdminTab(async () => {
  const [overview, log] = await Promise.all([getOverview(), listAdminLog(10)])
  stats.value = overview
  recent.value = log
  names.value = await namesFor(log.map((entry) => entry.adminId))
})

defineExpose({ refresh: reload })

const cards = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: 'Open reports', value: s.openReports, detail: s.openReports > 0 ? 'waiting for a moderator' : 'all handled', tab: 'reports', warn: s.openReports > 0 },
    { label: 'Accounts', value: s.accounts, detail: s.banned + ' banned', tab: 'accounts' },
    { label: 'Open rooms', value: s.openRooms, detail: s.rooms + ' rooms made in total', tab: 'rooms' },
    { label: 'Templates', value: s.templates, detail: s.publicTemplates + ' public · ' + s.hiddenTemplates + ' hidden', tab: 'items', extra: { type: 'templates' } },
    { label: 'Stickers', value: s.stickers, detail: s.publicStickers + ' public · ' + s.hiddenStickers + ' hidden', tab: 'items', extra: { type: 'stickers' } },
    { label: 'Saved strips', value: s.strips, detail: 'in people\'s studios' },
  ]
})
</script>

<template>
  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <p v-if="loading" class="text-muted">Loading...</p>

  <template v-else-if="stats">
    <div class="row g-3 mb-4">
      <div v-for="card in cards" :key="card.label" class="col-6 col-md-4 col-xl-2">
        <component
          :is="card.tab ? 'button' : 'div'"
          class="card h-100 w-100 text-start stat"
          :class="{ 'border-warning': card.warn, clickable: card.tab }"
          @click="card.tab && emit('open-tab', card.tab, card.extra || {})"
        >
          <div class="card-body p-3">
            <p class="small text-muted mb-1">{{ card.label }}</p>
            <p class="h3 mb-1">{{ card.value }}</p>
            <p class="small text-muted mb-0">{{ card.detail }}</p>
          </div>
        </component>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mb-2">
      <h2 class="h6 mb-0">Recent moderator actions</h2>
      <button class="btn btn-sm btn-link" @click="emit('open-tab', 'log')">Full log</button>
    </div>
    <p v-if="recent.length === 0" class="small text-muted">Nothing yet.</p>
    <ul class="list-group">
      <li v-for="entry in recent" :key="entry.id" class="list-group-item small">
        <span class="text-muted">{{ formatTime(entry.createdAt) }}</span>
        &middot; {{ names[entry.adminId] || entry.adminId }}: {{ LOG_ACTIONS[entry.action] || entry.action }}
        <span class="text-muted text-break">({{ entry.targetType }} {{ entry.targetId }})</span>
        <template v-if="entry.reason"> &middot; {{ entry.reason }}</template>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.stat {
  background: var(--bs-body-bg);
}

.clickable:hover {
  border-color: var(--bs-primary);
}
</style>
