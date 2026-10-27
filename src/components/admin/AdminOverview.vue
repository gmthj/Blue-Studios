<script setup>
import { ref, computed } from 'vue'
import { getOverview, listAdminLog, namesFor } from '../../admin.js'
import { useAdminTab, formatTime, LOG_ACTIONS } from '../../composables/useAdminTab.js'
import AppIcon from '../AppIcon.vue'

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
    { label: 'Open reports', icon: 'shield', value: s.openReports, detail: s.openReports > 0 ? 'waiting for a moderator' : 'all handled', tab: 'reports', warn: s.openReports > 0 },
    { label: 'Accounts', icon: 'users', value: s.accounts, detail: s.banned + ' banned', tab: 'accounts' },
    { label: 'Open rooms', icon: 'camera', value: s.openRooms, detail: s.rooms + ' rooms made in total', tab: 'rooms' },
    { label: 'Templates', icon: 'layout', value: s.templates, detail: s.publicTemplates + ' public · ' + s.hiddenTemplates + ' hidden', tab: 'items', extra: { type: 'templates' } },
    { label: 'Stickers', icon: 'sparkle', value: s.stickers, detail: s.publicStickers + ' public · ' + s.hiddenStickers + ' hidden', tab: 'items', extra: { type: 'stickers' } },
    { label: 'Saved strips', icon: 'film', value: s.strips, detail: 'in people\'s studios' },
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
          :class="{ warn: card.warn, clickable: card.tab }"
          @click="card.tab && emit('open-tab', card.tab, card.extra || {})"
        >
          <div class="card-body p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="stat-label">{{ card.label }}</span>
              <span class="stat-icon"><AppIcon :name="card.icon" :size="15" /></span>
            </div>
            <p class="stat-value">{{ card.value }}</p>
            <p class="stat-detail">{{ card.detail }}</p>
          </div>
        </component>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mb-2">
      <h2 class="section-title mb-0">Recent moderator actions</h2>
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
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 200ms var(--ease-out);
}

.stat-label {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--brand);
  background: var(--brand-tint);
}

.stat-value {
  margin: 0 0 2px;
  font-size: 1.9rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.stat-detail {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

/* Open reports waiting: amber, so it stands out */
.stat.warn {
  border-color: #F5C77E;
  background: #FFFBF0;
}

.stat.warn .stat-icon {
  color: #A15C07;
  background: #FEF3C7;
}

.stat:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

/* Lifts a little under the mouse (only with a mouse: on phones a tap would leave it stuck) */
@media (hover: hover) and (pointer: fine) {
  .clickable:hover {
    border-color: #C9D4FA;
    box-shadow: 0 10px 24px rgba(20, 23, 43, 0.08);
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .clickable:hover {
    transform: none;
  }
}
</style>
