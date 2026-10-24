<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminOverview from '../components/admin/AdminOverview.vue'
import AdminReports from '../components/admin/AdminReports.vue'
import AdminItems from '../components/admin/AdminItems.vue'
import AdminAccounts from '../components/admin/AdminAccounts.vue'
import AdminRooms from '../components/admin/AdminRooms.vue'
import AdminLog from '../components/admin/AdminLog.vue'
import { prefetchAccounts } from '../admin.js'
import AppIcon from '../components/AppIcon.vue'

// The admin page (/admin): the moderator dashboard. Only accounts with the admin mark see it (router.js),
// and the security rules + /api/admin check the mark again, so it is safe even if someone opens it.
//   Overview  how many accounts, rooms, items, strips and open reports there are, and recent actions
//   Reports   reported marketplace items (open, resolved, dismissed): hide them or dismiss the reports
//   Items     every template and sticker (public, private, hidden): hide / unhide
//   Accounts  every login (accounts and guests): see what they made, ban / unban
//   Rooms     every room (open and closed): who is in it, its photos, delete a photo, close or delete the room
//   Log       everything moderators did
// Each tab is its own component in components/admin/.

const route = useRoute()
const router = useRouter()

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'layout', component: AdminOverview },
  { id: 'reports', label: 'Reports', icon: 'shield', component: AdminReports },
  { id: 'items', label: 'Items', icon: 'image', component: AdminItems },
  { id: 'accounts', label: 'Accounts', icon: 'users', component: AdminAccounts },
  { id: 'rooms', label: 'Rooms', icon: 'camera', component: AdminRooms },
  { id: 'log', label: 'Log', icon: 'film', component: AdminLog },
]
const tab = computed(() => TABS.find((t) => t.id === route.query.tab) || TABS[0])

// extra: more query values for the tab, e.g. { uid } on Accounts or { owner } on Items
function openTab(id, extra = {}) {
  router.replace({ query: { tab: id, ...extra } })
}

// Refresh: load the open tab again, keeping its filters and sorting (each tab has a refresh())
const current = ref(null)
const refreshing = ref(false)
const refreshedAt = ref(null)

async function refresh() {
  if (!current.value || refreshing.value) return
  refreshing.value = true
  await current.value.refresh()
  refreshedAt.value = new Date()
  refreshing.value = false
}

// The account list is the slowest tab to load, so start loading it now, whichever tab is open
// (the Accounts tab then shows it at once). An error is shown when the tab itself is opened.
onMounted(() => {
  prefetchAccounts().catch(() => {})
})

// A new tab loads itself, so forget the last refresh time
watch(() => route.fullPath, () => {
  refreshedAt.value = null
})
</script>

<template>
  <div class="app-page">
    <header class="page-header d-flex flex-wrap align-items-end justify-content-between gap-3">
      <div>
        <h1 class="page-title">Admin</h1>
        <p class="page-sub">Reports, items, accounts and rooms.</p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span v-if="refreshedAt" class="small text-muted">Updated {{ refreshedAt.toLocaleTimeString() }}</span>
        <button class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" :disabled="refreshing" @click="refresh">
          <AppIcon name="refresh" :size="14" :class="{ spinning: refreshing }" />
          {{ refreshing ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </header>

    <!-- Scrolls sideways on narrow screens -->
    <div class="seg-tabs mb-4" role="tablist" aria-label="Admin sections">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="seg-tab"
        :class="{ active: tab.id === t.id }"
        role="tab"
        :aria-selected="tab.id === t.id"
        @click="openTab(t.id)"
      >
        <AppIcon :name="t.icon" :size="16" /> {{ t.label }}
      </button>
    </div>

    <!-- :key reloads the tab when it is opened again (or opened with different filters) -->
    <component :is="tab.component" ref="current" :key="route.fullPath" @open-tab="openTab" />
  </div>
</template>

<style scoped>
/* The refresh arrow turns while loading */
.spinning {
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
