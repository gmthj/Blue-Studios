<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminOverview from '../components/admin/AdminOverview.vue'
import AdminReports from '../components/admin/AdminReports.vue'
import AdminItems from '../components/admin/AdminItems.vue'
import AdminAccounts from '../components/admin/AdminAccounts.vue'
import AdminRooms from '../components/admin/AdminRooms.vue'
import AdminLog from '../components/admin/AdminLog.vue'

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
  { id: 'overview', label: 'Overview', component: AdminOverview },
  { id: 'reports', label: 'Reports', component: AdminReports },
  { id: 'items', label: 'Items', component: AdminItems },
  { id: 'accounts', label: 'Accounts', component: AdminAccounts },
  { id: 'rooms', label: 'Rooms', component: AdminRooms },
  { id: 'log', label: 'Log', component: AdminLog },
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

// A new tab loads itself, so forget the last refresh time
watch(() => route.fullPath, () => {
  refreshedAt.value = null
})
</script>

<template>
  <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
    <h1 class="h3 mb-0">Admin</h1>
    <div class="d-flex align-items-center gap-2">
      <span v-if="refreshedAt" class="small text-muted">Updated {{ refreshedAt.toLocaleTimeString() }}</span>
      <button class="btn btn-sm btn-outline-secondary" :disabled="refreshing" @click="refresh">
        {{ refreshing ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>
  </div>

  <ul class="nav nav-tabs mb-3 flex-nowrap overflow-auto">
    <li v-for="t in TABS" :key="t.id" class="nav-item">
      <button class="nav-link text-nowrap" :class="{ active: tab.id === t.id }" @click="openTab(t.id)">{{ t.label }}</button>
    </li>
  </ul>

  <!-- :key reloads the tab when it is opened again (or opened with different filters) -->
  <component :is="tab.component" ref="current" :key="route.fullPath" @open-tab="openTab" />
</template>
