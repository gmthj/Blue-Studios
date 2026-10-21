import { ref, computed, onMounted } from 'vue'

// Shared by the tabs of the admin page (components/admin/*.vue).
//
// How to use it:
//   const { loading, busy, errorMessage, message, run, reload } = useAdminTab(async () => { ...load the tab... })
//   run(() => hideItem(...), 'Hidden.')   does an action, shows the message or the error, then loads the tab again
//   defineExpose({ refresh: reload })      lets the Refresh button on the admin page reload the tab (filters stay)
export function useAdminTab(load) {
  const loading = ref(true)
  const busy = ref(false)
  const errorMessage = ref('')
  const message = ref('')

  async function reload() {
    errorMessage.value = ''
    try {
      await load()
    } catch (error) {
      console.error(error)
      errorMessage.value = 'Could not load this tab. If you were just made an admin, log out and in again.'
    }
    loading.value = false
  }

  async function run(action, doneMessage) {
    busy.value = true
    errorMessage.value = ''
    message.value = ''
    try {
      await action()
      if (doneMessage) message.value = doneMessage
      await reload()
    } catch (error) {
      console.error(error)
      errorMessage.value = error.message || 'Something went wrong. Please try again.'
    }
    busy.value = false
  }

  onMounted(reload)

  return { loading, busy, errorMessage, message, run, reload }
}

// Sorting for the admin lists. columns: { key: { get: (row) => value, first: 'asc' | 'desc' } }
// ("first" is the order used when that column is picked: names A-Z, dates newest first, ...)
//
//   const sort = useSort(columns, 'createdAt')
//   sort.apply(list)       a sorted copy (empty values always go last)
//   sort.toggle('name')    sort by name, or flip the order if it already is (for clickable table headers)
//   sort.arrow('name')     '▲' / '▼' next to the column it is sorted by
//   sort.choice            'name:asc', for a <select> with v-model
export function useSort(columns, key) {
  const sortKey = ref(key)
  const sortDir = ref(columns[key].first)

  function toggle(newKey) {
    if (sortKey.value === newKey) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = newKey
      sortDir.value = columns[newKey].first
    }
  }

  function arrow(columnKey) {
    if (sortKey.value !== columnKey) return ''
    return sortDir.value === 'asc' ? '▲' : '▼'
  }

  const choice = computed({
    get: () => sortKey.value + ':' + sortDir.value,
    set: (value) => {
      const [newKey, newDir] = value.split(':')
      sortKey.value = newKey
      sortDir.value = newDir
    },
  })

  function apply(list) {
    const get = columns[sortKey.value].get
    const sign = sortDir.value === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      const xEmpty = x === undefined || x === null || x === ''
      const yEmpty = y === undefined || y === null || y === ''
      if (xEmpty || yEmpty) return xEmpty - yEmpty
      if (typeof x === 'string') return sign * x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true })
      return sign * (x - y)
    })
  }

  return { sortKey, sortDir, toggle, arrow, choice, apply }
}

// "19 Oct, 14:05" (from a number like Date.now(), or a date string from Firebase Auth)
export function formatTime(time) {
  if (!time) return ''
  return new Date(time).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// What each adminLog action means, for people
export const LOG_ACTIONS = {
  hide: 'Hid item',
  unhide: 'Unhid item',
  resolveReport: 'Resolved report',
  dismissReport: 'Dismissed reports',
  closeRoom: 'Closed room',
  deleteRoom: 'Deleted room',
  deletePhoto: 'Deleted photo',
  ban: 'Banned account',
  unban: 'Unbanned account',
}
