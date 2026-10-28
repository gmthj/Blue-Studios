<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { listAccounts, prefetchAccounts, reloadAccounts, lookupAccount, banAccount, unbanAccount, getAccountActivity } from '../../admin.js'
import { useAdminTab, useSort, formatTime } from '../../composables/useAdminTab.js'
import SortHeader from './SortHeader.vue'
import { askConfirm } from '../../composables/useDialog.js'
import { profileOf } from '../../profiles.js'

// Accounts tab: every login (accounts and guests) from Firebase Auth, through /api/admin.
// Pick one to see what they made and to ban / unban them.
// /admin?tab=accounts&uid=<uid> opens with that account picked.

const emit = defineEmits(['open-tab'])
const route = useRoute()

const FILTERS = [
  { id: 'all', label: 'Everyone', test: () => true },
  { id: 'accounts', label: 'Accounts', test: (a) => a.isAccount },
  { id: 'guests', label: 'Guests', test: (a) => !a.isAccount },
  { id: 'banned', label: 'Banned', test: (a) => a.banned || a.disabled },
  { id: 'admins', label: 'Admins', test: (a) => a.admin },
]

// How each account logs in, for people ('password' = email and password)
const PROVIDERS = { 'google.com': 'Google', password: 'Email' }

function loginLabel(a) {
  if (!a.isAccount) return 'Guest'
  return (a.providers || []).map((id) => PROVIDERS[id] || id).join(', ')
}

const accounts = ref([])
const nextPageToken = ref('')
const filter = ref('accounts') // guests are hidden at first: there are many and they rarely need moderating
const search = ref('')

const picked = ref(null) // the account shown in the card at the top
const activity = ref(null)
const reason = ref('')

// The first load uses the page the admin page already started loading (see prefetchAccounts in
// admin.js); Refresh and actions load it fresh.
let loadedOnce = false

const { loading, busy, errorMessage, message, run, reload } = useAdminTab(async () => {
  const page = await (loadedOnce ? reloadAccounts() : prefetchAccounts())
  loadedOnce = true
  accounts.value = page.accounts
  nextPageToken.value = page.nextPageToken
  if (route.query.uid && !picked.value) await pick(String(route.query.uid))
})

// For the Refresh button on the admin page: reload the list, and the picked account
async function refresh() {
  await reload()
  if (picked.value) await pick(picked.value.uid)
}

defineExpose({ refresh })

async function loadMore() {
  busy.value = true
  try {
    const page = await listAccounts(nextPageToken.value)
    accounts.value = accounts.value.concat(page.accounts)
    nextPageToken.value = page.nextPageToken
  } catch (error) {
    errorMessage.value = error.message
  }
  busy.value = false
}

function countFor(f) {
  return accounts.value.filter(f.test).length
}

// Last logged in within ... (Firebase Auth gives dates as text, e.g. "Mon, 19 Oct 2026 06:05:00 GMT")
const DAY = 24 * 60 * 60 * 1000
const SEEN = [
  { id: 'any', label: 'Any last login', days: 0 },
  { id: '1', label: 'Logged in today', days: 1 },
  { id: '7', label: 'In the last 7 days', days: 7 },
  { id: '30', label: 'In the last 30 days', days: 30 },
  { id: 'old', label: 'Not in 30 days', days: -30 },
]
const seen = ref('any')

function timeOf(text) {
  return text ? new Date(text).getTime() : 0
}

function seenTest(a) {
  const days = SEEN.find((s) => s.id === seen.value).days
  if (days === 0) return true
  const since = Date.now() - timeOf(a.lastLogin)
  return days > 0 ? since < days * DAY : since >= -days * DAY
}

const sort = useSort({
  name: { get: (a) => a.displayName, first: 'asc' },
  email: { get: (a) => a.email, first: 'asc' },
  login: { get: (a) => loginLabel(a), first: 'asc' },
  type: { get: (a) => (a.admin ? 0 : a.banned || a.disabled ? 1 : a.isAccount ? 2 : 3), first: 'asc' },
  createdAt: { get: (a) => timeOf(a.createdAt), first: 'desc' },
  lastLogin: { get: (a) => timeOf(a.lastLogin), first: 'desc' },
}, 'createdAt')

const shown = computed(() => {
  const test = FILTERS.find((f) => f.id === filter.value).test
  const text = search.value.trim().toLowerCase()
  return sort.apply(accounts.value.filter((a) => test(a) && seenTest(a) && (!text
    || (a.displayName || '').toLowerCase().includes(text)
    || (a.email || '').toLowerCase().includes(text)
    || a.uid.toLowerCase() === text)))
})

// Show one account in the card (by uid or email: also finds accounts not loaded in the list yet)
async function pick(uidOrEmail) {
  busy.value = true
  errorMessage.value = ''
  message.value = ''
  try {
    picked.value = await lookupAccount(uidOrEmail)
    activity.value = await getAccountActivity(picked.value.uid)
    reason.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
  busy.value = false
}

// After a ban or unban: update the card and the row in the list
function showUpdated(account) {
  picked.value = account
  accounts.value = accounts.value.map((a) => (a.uid === account.uid ? account : a))
  reason.value = ''
}

async function ban() {
  const sure = await askConfirm({
    title: 'Ban ' + (picked.value.displayName || picked.value.email) + '?',
    message: 'They are logged out and all their items are hidden.',
    confirmLabel: 'Ban account',
    danger: true,
    icon: 'lock',
  })
  if (!sure) return
  run(async () => {
    const result = await banAccount(picked.value.uid, reason.value)
    showUpdated(result.account)
    activity.value = await getAccountActivity(result.account.uid)
    message.value = 'Banned. ' + result.hiddenCount + ' item(s) hidden.'
  }, '')
}

function unban() {
  run(async () => {
    showUpdated((await unbanAccount(picked.value.uid, reason.value)).account)
  }, 'Unbanned. Their items stay hidden: unhide the ones that are fine under "Items".')
}
</script>

<template>
  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <div v-if="message" class="alert alert-success">{{ message }}</div>

  <div v-if="picked" class="card mb-4">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start">
        <p class="fw-semibold mb-0">
          {{ picked.displayName || '(no name)' }}
          <span v-if="picked.admin" class="badge text-bg-primary ms-1">Admin</span>
          <span v-if="picked.banned || picked.disabled" class="badge text-bg-danger ms-1">Banned</span>
          <span v-if="!picked.isAccount" class="badge text-bg-light border ms-1">Guest</span>
        </p>
        <button type="button" class="btn-close" aria-label="Close" @click="picked = null"></button>
      </div>
      <p class="small text-muted mb-2 text-break">
        {{ picked.email || 'no email' }} &middot; logs in with {{ loginLabel(picked) }} &middot; uid {{ picked.uid }}<br />
        Joined {{ formatTime(picked.createdAt) }}<template v-if="picked.lastLogin"> &middot; last login {{ formatTime(picked.lastLogin) }}</template>
      </p>
      <p v-if="activity" class="small mb-3">
        {{ activity.templates }} template(s) &middot; {{ activity.stickers }} sticker(s) &middot; {{ activity.strips }} saved strip(s)
        &middot; reported {{ activity.reportsAgainst }} time(s) &middot; filed {{ activity.reportsFiled }} report(s)
        <button v-if="activity.templates + activity.stickers > 0" class="btn btn-link btn-sm p-0 ms-1 align-baseline" @click="emit('open-tab', 'items', { owner: picked.uid })">See their items</button>
      </p>
      <template v-if="picked.isAccount && !picked.admin">
        <input v-model="reason" type="text" maxlength="300" class="form-control form-control-sm mb-2" placeholder="Reason (required, saved in the log)" />
        <button v-if="!picked.banned" class="btn btn-sm btn-danger" :disabled="busy || !reason.trim()" @click="ban">Ban account</button>
        <button v-else class="btn btn-sm btn-outline-primary" :disabled="busy || !reason.trim()" @click="unban">Unban account</button>
      </template>
    </div>
  </div>

  <div class="row g-2 mb-2">
    <div class="col-12 col-lg-5">
      <form class="input-group input-group-sm" @submit.prevent="search.trim() && pick(search)">
        <input v-model="search" type="search" class="form-control" placeholder="Search by name, email or user id" aria-label="Search accounts" />
        <button class="btn btn-outline-primary" type="submit" :disabled="busy">Find</button>
      </form>
    </div>
    <div class="col-12 col-sm-auto">
      <div class="btn-group btn-group-sm flex-wrap" role="group" aria-label="Show">
        <button
          v-for="f in FILTERS" :key="f.id"
          class="btn" :class="filter === f.id ? 'btn-primary' : 'btn-outline-primary'"
          @click="filter = f.id"
        >{{ f.label }} ({{ countFor(f) }})</button>
      </div>
    </div>
    <div class="col-12 col-sm-auto">
      <select v-model="seen" class="form-select form-select-sm" aria-label="Last login">
        <option v-for="s in SEEN" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>
    </div>
  </div>

  <p v-if="loading" class="text-muted">Loading...</p>
  <template v-else>
    <p class="small text-muted mb-1">{{ shown.length }} of {{ accounts.length }} logins &middot; click a column to sort</p>
    <div class="table-responsive">
      <table class="table table-sm table-hover small align-middle">
        <thead>
          <tr>
            <SortHeader :sort="sort" column="name" label="Name" />
            <SortHeader :sort="sort" column="email" label="Email" />
            <SortHeader :sort="sort" column="login" label="Login" />
            <SortHeader :sort="sort" column="type" label="Type" />
            <SortHeader :sort="sort" column="createdAt" label="Joined" />
            <SortHeader :sort="sort" column="lastLogin" label="Last login" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in shown" :key="a.uid" class="clickable" :class="{ 'table-active': picked && picked.uid === a.uid }" @click="pick(a.uid)">
            <td class="text-break">
              <span class="d-inline-flex align-items-center gap-2">
                <img :src="profileOf(a.uid).avatar" class="row-avatar" alt="" width="24" height="24" loading="lazy" />
                {{ a.displayName || (a.isAccount ? '(no name)' : 'Guest') }}
              </span>
            </td>
            <td class="text-break">{{ a.email }}</td>
            <td class="text-nowrap">{{ loginLabel(a) }}</td>
            <td class="text-nowrap">
              <span v-if="a.admin" class="badge text-bg-primary">Admin</span>
              <span v-if="a.banned || a.disabled" class="badge text-bg-danger">Banned</span>
              <span v-if="!a.isAccount" class="badge text-bg-light border">Guest</span>
              <span v-else-if="!a.admin && !a.banned && !a.disabled" class="badge text-bg-light border">Account</span>
            </td>
            <td class="text-nowrap">{{ formatTime(a.createdAt) }}</td>
            <td class="text-nowrap">{{ formatTime(a.lastLogin) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="shown.length === 0" class="small text-muted">Nobody matches. Press Find to look up an email or user id directly.</p>
    <button v-if="nextPageToken" class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="loadMore">Load more</button>
  </template>
</template>

<style scoped>
.clickable {
  cursor: pointer;
}

.row-avatar {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background: var(--brand-tint);
}
</style>
