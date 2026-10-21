<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  listOpenReports, dismissReports, hideItem, unhideItem, listHiddenItems, getAnyItem,
  lookupAccount, banAccount, unbanAccount, listBannedAccounts,
  getRoomWithPhotos, closeRoom, deletePhoto, listAdminLog, namesFor,
} from '../admin.js'
import { REPORT_REASONS } from '../marketplace.js'
import StorageImage from '../components/StorageImage.vue'

// The admin page (/admin): moderator tools. Only accounts with the admin mark see it (router.js),
// and the security rules + /api/admin check the mark again, so it is safe even if someone opens it.
//   Reports   reported marketplace items: hide them, dismiss the reports, or ban the owner
//   Hidden    items hidden by moderators: unhide
//   Accounts  find an account by email or user id: ban / unban
//   Rooms     look at a room's photos: delete a photo, close the room
//   Log       everything moderators did

const route = useRoute()
const router = useRouter()

const TABS = [
  { id: 'reports', label: 'Reports' },
  { id: 'hidden', label: 'Hidden items' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'log', label: 'Log' },
]
const tab = computed(() => (TABS.some((t) => t.id === route.query.tab) ? route.query.tab : 'reports'))

function openTab(id, extra = {}) {
  router.replace({ query: { tab: id, ...extra } })
}

const loading = ref(false)
const errorMessage = ref('')
const message = ref('')
const busy = ref(false)
const names = ref({}) // uid -> display name, for showing who is who

// Run an action: shows "busy", catches errors, and reloads the tab afterwards
async function run(action, doneMessage) {
  busy.value = true
  errorMessage.value = ''
  message.value = ''
  try {
    await action()
    if (doneMessage) message.value = doneMessage
    await loadTab()
  } catch (error) {
    console.error(error)
    errorMessage.value = error.message || 'Something went wrong. Please try again.'
  }
  busy.value = false
}

function reasonLabel(id) {
  const reason = REPORT_REASONS.find((r) => r.id === id)
  return reason ? reason.label : id
}

function formatTime(time) {
  return new Date(time).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ---------- Reports ----------

const reportGroups = ref([]) // [{ type, itemId, ownerId, reports, item }]
const reportReason = ref({}) // itemId -> what the admin typed

async function loadReports() {
  const groups = await listOpenReports()
  await Promise.all(groups.map(async (group) => {
    group.item = await getAnyItem(group.type, group.itemId)
  }))
  reportGroups.value = groups
  names.value = await namesFor(groups.flatMap((g) => [g.ownerId, ...g.reports.map((r) => r.reporterId)]))
}

function hideReported(group) {
  run(() => hideItem(group.type, group.itemId, reportReason.value[group.itemId]), 'Hidden, and its reports closed.')
}

function dismissReported(group) {
  run(() => dismissReports(group.itemId, reportReason.value[group.itemId]), 'Reports dismissed.')
}

// ---------- Hidden items ----------

const hiddenItems = ref([])

async function loadHidden() {
  hiddenItems.value = await listHiddenItems()
}

function unhide(item) {
  run(() => unhideItem(item.type, item.id, ''), '"' + item.name + '" is back in the marketplace (if its owner set it to public).')
}

// ---------- Accounts ----------

const accountSearch = ref('')
const account = ref(null)
const accountReason = ref('')
const bannedAccounts = ref([])

async function loadAccounts() {
  bannedAccounts.value = await listBannedAccounts()
  if (route.query.uid && route.query.uid !== accountSearch.value) {
    accountSearch.value = String(route.query.uid)
    await findAccount()
  }
}

async function findAccount() {
  if (!accountSearch.value.trim()) return
  busy.value = true
  errorMessage.value = ''
  message.value = ''
  account.value = null
  try {
    account.value = await lookupAccount(accountSearch.value)
  } catch (error) {
    errorMessage.value = error.message
  }
  busy.value = false
}

function ban() {
  if (!confirm('Ban ' + (account.value.displayName || account.value.email) + '? They are logged out and all their items are hidden.')) return
  run(async () => {
    const result = await banAccount(account.value.uid, accountReason.value)
    account.value = result.account
    accountReason.value = ''
    message.value = 'Banned. ' + result.hiddenCount + ' item(s) hidden.'
  }, '')
}

function unban() {
  run(async () => {
    const result = await unbanAccount(account.value.uid, accountReason.value)
    account.value = result.account
    accountReason.value = ''
  }, 'Unbanned. Their items stay hidden: unhide the ones that are fine under "Hidden items".')
}

// ---------- Rooms ----------

const roomCode = ref('')
const roomInfo = ref(null)
const roomReason = ref('')

async function findRoom() {
  if (!/^[0-9]{4}$/.test(roomCode.value.trim())) {
    errorMessage.value = 'A room code is 4 digits.'
    return
  }
  busy.value = true
  errorMessage.value = ''
  message.value = ''
  try {
    roomInfo.value = await getRoomWithPhotos(roomCode.value.trim())
    if (!roomInfo.value) errorMessage.value = 'No room with that code.'
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load the room.'
  }
  busy.value = false
}

function removePhoto(photo) {
  if (!confirm('Delete this photo for everyone in the room?')) return
  run(async () => {
    await deletePhoto(roomInfo.value.code, photo.id, roomReason.value)
    await findRoom()
  }, 'Photo deleted.')
}

function closeThisRoom() {
  run(async () => {
    await closeRoom(roomInfo.value.code, roomReason.value)
    await findRoom()
  }, 'Room closed.')
}

// ---------- Log ----------

const logEntries = ref([])

async function loadLog() {
  logEntries.value = await listAdminLog(100)
  names.value = await namesFor(logEntries.value.flatMap((entry) => [entry.adminId, entry.targetType === 'users' ? entry.targetId : '']))
}

// ---------- Loading the open tab ----------

async function loadTab() {
  loading.value = true
  try {
    if (tab.value === 'reports') await loadReports()
    if (tab.value === 'hidden') await loadHidden()
    if (tab.value === 'accounts') await loadAccounts()
    if (tab.value === 'log') await loadLog()
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load this tab. If you were just made an admin, log out and in again.'
  }
  loading.value = false
}

watch(tab, () => {
  errorMessage.value = ''
  message.value = ''
  loadTab()
}, { immediate: true })
</script>

<template>
  <h1 class="h3 mb-3">Admin</h1>

  <ul class="nav nav-tabs mb-3">
    <li v-for="t in TABS" :key="t.id" class="nav-item">
      <button class="nav-link" :class="{ active: tab === t.id }" @click="openTab(t.id)">{{ t.label }}</button>
    </li>
  </ul>

  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <div v-if="message" class="alert alert-success">{{ message }}</div>
  <p v-if="loading" class="text-muted">Loading...</p>

  <!-- Reports -->
  <template v-if="tab === 'reports' && !loading">
    <p v-if="reportGroups.length === 0" class="text-muted">No open reports.</p>
    <div v-for="group in reportGroups" :key="group.itemId" class="card mb-3">
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
              <router-link v-if="group.item" :to="'/marketplace/' + group.type + '/' + group.itemId" class="ms-1">open</router-link>
            </p>
            <ul class="small mb-3 ps-3">
              <li v-for="report in group.reports" :key="report.id" class="text-break">
                <strong>{{ reasonLabel(report.reason) }}</strong>
                <template v-if="report.details">: {{ report.details }}</template>
                <span class="text-muted"> ({{ names[report.reporterId] || 'someone' }}, {{ formatTime(report.createdAt) }})</span>
              </li>
            </ul>
            <input v-model="reportReason[group.itemId]" type="text" maxlength="300" class="form-control form-control-sm mb-2" placeholder="Note for the log (optional)" />
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-sm btn-danger" :disabled="busy || !group.item" @click="hideReported(group)">Hide item</button>
              <button class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="dismissReported(group)">Dismiss (nothing wrong)</button>
              <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="openTab('accounts', { uid: group.ownerId })">Owner's account...</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- Hidden items -->
  <template v-if="tab === 'hidden' && !loading">
    <p v-if="hiddenItems.length === 0" class="text-muted">Nothing is hidden.</p>
    <div class="row g-3">
      <div v-for="item in hiddenItems" :key="item.type + item.id" class="col-6 col-md-3 col-xl-2">
        <div class="card h-100">
          <div class="preview"><StorageImage :path="item.type === 'templates' ? item.thumbnailPath : item.imagePath" :alt="item.name" /></div>
          <div class="card-body p-2">
            <p class="small fw-semibold text-truncate mb-0">{{ item.name }}</p>
            <p class="small text-muted text-truncate mb-2">by {{ item.ownerName }}</p>
            <button class="btn btn-sm btn-outline-primary w-100" :disabled="busy" @click="unhide(item)">Unhide</button>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- Accounts -->
  <template v-if="tab === 'accounts' && !loading">
    <form class="input-group mb-3" @submit.prevent="findAccount">
      <input v-model="accountSearch" type="text" class="form-control" placeholder="Email or user id" aria-label="Email or user id" />
      <button class="btn btn-primary" type="submit" :disabled="busy">Find</button>
    </form>

    <div v-if="account" class="card mb-4">
      <div class="card-body">
        <p class="fw-semibold mb-0">
          {{ account.displayName || '(no name)' }}
          <span v-if="account.admin" class="badge text-bg-primary ms-1">Admin</span>
          <span v-if="account.banned || account.disabled" class="badge text-bg-danger ms-1">Banned</span>
          <span v-if="!account.isAccount" class="badge text-bg-light border ms-1">Guest</span>
        </p>
        <p class="small text-muted mb-3 text-break">
          {{ account.email || 'no email' }} &middot; uid {{ account.uid }}<br />
          Joined {{ account.createdAt }}<template v-if="account.lastLogin"> &middot; last login {{ account.lastLogin }}</template>
        </p>
        <template v-if="account.isAccount && !account.admin">
          <input v-model="accountReason" type="text" maxlength="300" class="form-control form-control-sm mb-2" placeholder="Reason (required, saved in the log)" />
          <button v-if="!account.banned" class="btn btn-sm btn-danger" :disabled="busy || !accountReason.trim()" @click="ban">Ban account</button>
          <button v-else class="btn btn-sm btn-outline-primary" :disabled="busy || !accountReason.trim()" @click="unban">Unban account</button>
        </template>
      </div>
    </div>

    <h2 class="h6">Banned accounts</h2>
    <p v-if="bannedAccounts.length === 0" class="small text-muted">None.</p>
    <ul class="list-group">
      <li v-for="banned in bannedAccounts" :key="banned.uid" class="list-group-item d-flex justify-content-between align-items-center small">
        <span class="text-truncate">{{ banned.displayName || banned.uid }}</span>
        <button class="btn btn-sm btn-link" @click="accountSearch = banned.uid; findAccount()">Open</button>
      </li>
    </ul>
  </template>

  <!-- Rooms -->
  <template v-if="tab === 'rooms'">
    <form class="input-group mb-3 room-search" @submit.prevent="findRoom">
      <input v-model="roomCode" type="text" inputmode="numeric" maxlength="4" class="form-control" placeholder="4-digit room code" aria-label="Room code" />
      <button class="btn btn-primary" type="submit" :disabled="busy">Open</button>
    </form>

    <div v-if="roomInfo">
      <p class="mb-1">
        Room <strong>{{ roomInfo.code }}</strong>, host {{ roomInfo.hostName }}
        <span v-if="roomInfo.closed" class="badge text-bg-secondary ms-1">Closed</span>
      </p>
      <input v-model="roomReason" type="text" maxlength="300" class="form-control form-control-sm mb-2" placeholder="Note for the log (optional)" />
      <button v-if="!roomInfo.closed" class="btn btn-sm btn-outline-danger mb-3" :disabled="busy" @click="closeThisRoom">Close room</button>

      <p v-if="roomInfo.photos.length === 0" class="small text-muted">No photos.</p>
      <div class="row g-2">
        <div v-for="photo in roomInfo.photos" :key="photo.id" class="col-4 col-md-2">
          <img :src="photo.image" :alt="'Photo by ' + photo.name" class="img-fluid rounded" />
          <p class="small text-muted text-truncate mb-1">{{ photo.name }}, shot {{ photo.shotNumber }}</p>
          <button class="btn btn-sm btn-outline-danger w-100" :disabled="busy" @click="removePhoto(photo)">Delete</button>
        </div>
      </div>
    </div>
  </template>

  <!-- Log -->
  <template v-if="tab === 'log' && !loading">
    <p v-if="logEntries.length === 0" class="text-muted">Nothing yet.</p>
    <div class="table-responsive">
      <table class="table table-sm small">
        <thead>
          <tr><th>When</th><th>Who</th><th>What</th><th>On</th><th>Note</th></tr>
        </thead>
        <tbody>
          <tr v-for="entry in logEntries" :key="entry.id">
            <td class="text-nowrap">{{ formatTime(entry.createdAt) }}</td>
            <td>{{ names[entry.adminId] || entry.adminId }}</td>
            <td>{{ entry.action }}</td>
            <td class="text-break">
              {{ entry.targetType }}
              <template v-if="entry.targetType === 'users'">{{ names[entry.targetId] || entry.targetId }}</template>
              <template v-else>{{ entry.targetId }}</template>
            </td>
            <td class="text-break">{{ entry.reason }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
.preview {
  height: 140px;
  background: #f1f3f5;
  overflow: hidden;
}

.room-search {
  max-width: 20rem;
}
</style>
