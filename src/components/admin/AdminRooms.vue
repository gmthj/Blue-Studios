<script setup>
import { ref, computed, watch } from 'vue'
import { listRooms, getRoomWithPhotos, closeRoom, deleteRoom, deletePhoto, deleteClip } from '../../admin.js'
import { isActive } from '../../room.js'
import { useAdminTab, useSort, formatTime } from '../../composables/useAdminTab.js'
import SortHeader from './SortHeader.vue'
import { askConfirm } from '../../composables/useDialog.js'
import { ROOM_STAGES, stageIndex } from '../../composables/useRoom.js'

// Rooms tab: the newest 200 rooms (more with "Show more"), open and closed, with who is in each one. Open one to see its
// photos and videos, delete a photo or video clip, close the room or delete it. Older rooms can still be opened by their code.

const rooms = ref([])
const status = ref('all')
const people = ref('all')
const stage = ref('all')
const search = ref('')

const room = ref(null) // the opened room, with members and photos
const note = ref('')

// "Here now" = seen in the last 45 seconds (see room.js)
const now = ref(Date.now())

// How many of the newest rooms to load; "Show more" adds another page
const PAGE = 200
const roomLimit = ref(PAGE)
const loadingMore = ref(false)
const hasMore = computed(() => rooms.value.length >= roomLimit.value)

const { loading, busy, errorMessage, message, run, reload } = useAdminTab(async () => {
  rooms.value = await listRooms(roomLimit.value)
  now.value = Date.now()
})

async function showMore() {
  loadingMore.value = true
  roomLimit.value += PAGE
  try {
    rooms.value = await listRooms(roomLimit.value)
    now.value = Date.now()
  } catch (error) {
    console.error(error)
    roomLimit.value -= PAGE
    errorMessage.value = 'Could not load more rooms.'
  }
  loadingMore.value = false
}

function here(r) {
  return r.members.filter((member) => isActive(member, now.value))
}

const STATUSES = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'open', label: 'Open', test: (r) => !r.closed },
  { id: 'closed', label: 'Closed', test: (r) => r.closed },
]

const PEOPLE = [
  { id: 'all', label: 'Anyone or nobody', test: () => true },
  { id: 'here', label: 'Someone here now', test: (r) => here(r).length > 0 },
  { id: 'empty', label: 'Nobody here now', test: (r) => here(r).length === 0 },
]

// The stages the loaded rooms are at (shoot, pick, decorate, ...), in the rooms' step order
const stages = computed(() => {
  const found = new Set(rooms.value.map((r) => r.stage))
  return ROOM_STAGES.map((s) => s.id).filter((id) => found.has(id))
})

function countFor(s) {
  return rooms.value.filter(s.test).length
}

const sort = useSort({
  code: { get: (r) => r.code, first: 'asc' },
  host: { get: (r) => r.hostName, first: 'asc' },
  createdAt: { get: (r) => r.createdAt, first: 'desc' },
  stage: { get: (r) => stageIndex(r.stage), first: 'asc' },
  shots: { get: (r) => r.shotNumber, first: 'desc' },
  people: { get: (r) => here(r).length * 1000 + r.members.length, first: 'desc' },
  status: { get: (r) => (r.closed ? 1 : 0), first: 'asc' },
}, 'createdAt')

const shown = computed(() => {
  const statusTest = STATUSES.find((s) => s.id === status.value).test
  const peopleTest = PEOPLE.find((p) => p.id === people.value).test
  const text = search.value.trim().toLowerCase()
  return sort.apply(rooms.value.filter((r) => statusTest(r)
    && peopleTest(r)
    && (stage.value === 'all' || r.stage === stage.value)
    && (!text
      || r.code.includes(text)
      || (r.hostName || '').toLowerCase().includes(text)
      || r.members.some((member) => (member.name || '').toLowerCase().includes(text)))))
})

// The opened room shows in a popup over the list, so the list keeps its scroll position.
// It is a <dialog> like AppDialog.vue: the confirm popups (askConfirm) open on top of it.
const roomDialog = ref(null)

watch(room, (current) => {
  const el = roomDialog.value
  if (!el) return
  if (current && !el.open) el.showModal ? el.showModal() : el.setAttribute('open', '')
  if (!current && el.open) el.close()
})

function closeRoomDialog() {
  room.value = null
}

// A click on the dim area outside the box closes it (the click lands on the <dialog> itself)
function onDialogClick(event) {
  if (event.target === roomDialog.value) closeRoomDialog()
}

async function openRoom(code) {
  if (!/^[0-9]{4}$/.test(code)) {
    errorMessage.value = 'A room code is 4 digits.'
    return
  }
  busy.value = true
  errorMessage.value = ''
  message.value = ''
  try {
    now.value = Date.now()
    room.value = await getRoomWithPhotos(code)
    note.value = ''
    if (!room.value) errorMessage.value = 'No room with that code.'
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load the room.'
  }
  busy.value = false
}

async function removePhoto(photo) {
  if (!(await askConfirm({ title: 'Delete this photo?', message: 'It is deleted for everyone in the room.', confirmLabel: 'Delete', danger: true }))) return
  run(async () => {
    await deletePhoto(room.value.code, photo.id, note.value)
    await openRoom(room.value.code)
  }, 'Photo deleted.')
}

async function removeClip(clip) {
  if (!(await askConfirm({ title: 'Delete this video clip?', message: 'It is deleted for everyone in the room. Edited videos that use it will skip it.', confirmLabel: 'Delete', danger: true }))) return
  run(async () => {
    await deleteClip(room.value.code, clip, note.value)
    await openRoom(room.value.code)
  }, 'Video clip deleted.')
}

// The opened room's edited videos (made on the Video page from its clips), oldest first:
// [{ id, name, createdAt, clips: [{ clip, start, end }], seconds }]. Clips that were deleted are left out.
const editedVideos = computed(() => {
  if (!room.value) return []
  return Object.entries(room.value.editedVideos || {}).map(([id, edit]) => {
    const parts = (edit.timeline || [])
      .map((item) => ({ clip: room.value.clips.find((c) => c.id === item.clipId), start: item.start || 0, end: item.end || 0 }))
      .filter((part) => part.clip)
    return {
      id: id,
      name: edit.name,
      createdAt: edit.createdAt,
      clips: parts,
      seconds: parts.reduce((sum, part) => sum + Math.max(0, part.end - part.start), 0),
    }
  }).sort((a, b) => a.createdAt - b.createdAt)
})

async function closeThisRoom() {
  if (!(await askConfirm({ title: 'Close room ' + room.value.code + '?', message: 'Everyone in it is sent back to the home page.', confirmLabel: 'Close room', danger: true, icon: 'lock' }))) return
  run(async () => {
    await closeRoom(room.value.code, note.value)
    await openRoom(room.value.code)
  }, 'Room closed.')
}

async function deleteThisRoom() {
  const code = room.value.code
  const warning = room.value.closed ? '' : ' It is still open: everyone in it is sent back to the home page.'
  const sure = await askConfirm({
    title: 'Delete room ' + code + ' for good?',
    message: 'All its photos and videos are deleted too.' + warning + ' This cannot be undone.',
    confirmLabel: 'Delete room',
    danger: true,
  })
  if (!sure) return
  run(async () => {
    await deleteRoom(code, note.value)
    room.value = null
  }, 'Room ' + code + ' deleted.')
}

// For the Refresh button on the admin page: reload the list, and the opened room
async function refresh() {
  await reload()
  if (room.value) await openRoom(room.value.code)
}

defineExpose({ refresh })
</script>

<template>
  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <div v-if="message" class="alert alert-success">{{ message }}</div>

  <dialog
    ref="roomDialog"
    class="room-dialog"
    aria-labelledby="room-dialog-title"
    @click="onDialogClick"
    @cancel.prevent="closeRoomDialog"
  >
    <div v-if="room" class="dialog-body">
      <div class="d-flex justify-content-between align-items-start">
        <p id="room-dialog-title" class="mb-1">
          Room <strong>{{ room.code }}</strong>, host {{ room.hostName }}
          <span v-if="room.closed" class="badge text-bg-secondary ms-1">Closed</span>
          <span v-else class="badge text-bg-success ms-1">Open</span>
        </p>
        <button type="button" class="btn-close" aria-label="Close" @click="closeRoomDialog"></button>
      </div>
      <div v-if="errorMessage" class="alert alert-danger small py-2 my-2">{{ errorMessage }}</div>
      <div v-if="message" class="alert alert-success small py-2 my-2">{{ message }}</div>
      <p class="small text-muted mb-3">
        Made {{ formatTime(room.createdAt) }} &middot; stage {{ room.stage }} &middot; {{ room.shotNumber }} shot(s) taken
      </p>

      <h3 class="h6">People ({{ here(room).length }} here now, {{ room.members.length }} joined)</h3>
      <p v-if="room.members.length === 0" class="small text-muted">Nobody.</p>
      <ul class="list-unstyled small mb-3">
        <li v-for="member in room.members" :key="member.id">
          <span class="dot" :class="isActive(member, now) ? 'bg-success' : 'bg-secondary'"></span>
          {{ member.name }}
          <span class="text-muted">&middot; {{ member.deviceType }} &middot; joined {{ formatTime(member.joinedAt) }} &middot; last seen {{ formatTime(member.lastSeen) }}</span>
          <span v-if="member.id === room.hostId" class="badge text-bg-light border ms-1">Host</span>
        </li>
      </ul>

      <input v-model="note" type="text" maxlength="300" class="form-control form-control-sm mb-2" placeholder="Note for the log (optional)" />
      <div class="d-flex flex-wrap gap-2 mb-3">
        <button v-if="!room.closed" class="btn btn-sm btn-outline-danger" :disabled="busy" @click="closeThisRoom">Close room</button>
        <button class="btn btn-sm btn-danger" :disabled="busy" @click="deleteThisRoom">Delete room</button>
      </div>

      <h3 class="h6">Photos ({{ room.photos.length }})</h3>
      <p v-if="room.photos.length === 0" class="small text-muted">No photos.</p>
      <div class="row g-2">
        <div v-for="photo in room.photos" :key="photo.id" class="col-4 col-md-2">
          <img :src="photo.image" :alt="'Photo by ' + photo.name" class="img-fluid rounded" />
          <p class="small text-muted text-truncate mb-1">{{ photo.name }}, shot {{ photo.shotNumber }}</p>
          <button class="btn btn-sm btn-outline-danger w-100" :disabled="busy" @click="removePhoto(photo)">Delete</button>
        </div>
      </div>

      <h3 class="h6 mt-3">Video clips ({{ room.clips.length }})</h3>
      <p v-if="room.clips.length === 0" class="small text-muted">No video clips.</p>
      <div class="row g-2">
        <div v-for="clip in room.clips" :key="clip.id" class="col-6 col-md-3">
          <video
            v-if="clip.url" :src="clip.url" class="w-100 rounded bg-dark"
            controls muted loop playsinline preload="metadata" :aria-label="'Video clip by ' + clip.name"
          ></video>
          <div v-else class="missing rounded small text-muted">File missing</div>
          <p class="small text-muted text-truncate mb-1">{{ clip.name }}, shot {{ clip.shotNumber }} &middot; {{ formatTime(clip.createdAt) }}</p>
          <button class="btn btn-sm btn-outline-danger w-100" :disabled="busy" @click="removeClip(clip)">Delete</button>
        </div>
      </div>

      <template v-if="editedVideos.length > 0">
        <h3 class="h6 mt-3">Edited videos ({{ editedVideos.length }})</h3>
        <ul class="list-unstyled small mb-0">
          <li v-for="edit in editedVideos" :key="edit.id" class="mb-1">
            <strong>{{ edit.name }}</strong>
            <span class="text-muted">&middot; {{ edit.seconds.toFixed(1) }}s &middot; made {{ formatTime(edit.createdAt) }} &middot;</span>
            <span v-if="edit.clips.length === 0" class="text-muted">no clips left</span>
            <span v-else class="text-muted">
              clips by {{ edit.clips.map((part) => part.clip.name + ' (shot ' + part.clip.shotNumber + ')').join(', ') }}
            </span>
          </li>
        </ul>
      </template>
    </div>
  </dialog>

  <div class="row g-2 mb-2">
    <div class="col-12 col-lg-5">
      <form class="input-group input-group-sm" @submit.prevent="openRoom(search.trim())">
        <input v-model="search" type="search" class="form-control" placeholder="Search by code, host or person" aria-label="Search rooms" />
        <button class="btn btn-outline-primary" type="submit" :disabled="busy">Open code</button>
      </form>
    </div>
    <div class="col-12 col-sm-auto">
      <div class="btn-group btn-group-sm" role="group" aria-label="Open or closed">
        <button
          v-for="s in STATUSES" :key="s.id"
          class="btn" :class="status === s.id ? 'btn-primary' : 'btn-outline-primary'"
          @click="status = s.id"
        >{{ s.label }} ({{ countFor(s) }})</button>
      </div>
    </div>
    <div class="col-6 col-sm-auto">
      <select v-model="people" class="form-select form-select-sm" aria-label="People">
        <option v-for="p in PEOPLE" :key="p.id" :value="p.id">{{ p.label }} ({{ countFor(p) }})</option>
      </select>
    </div>
    <div class="col-6 col-sm-auto">
      <select v-model="stage" class="form-select form-select-sm" aria-label="Stage">
        <option value="all">Any stage</option>
        <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>
  </div>

  <p v-if="loading" class="text-muted">Loading...</p>
  <template v-else>
    <p class="small text-muted mb-1">{{ shown.length }} of {{ rooms.length }} rooms &middot; click a column to sort</p>
    <div class="table-responsive">
      <table class="table table-sm table-hover small align-middle">
        <thead>
          <tr>
            <SortHeader :sort="sort" column="code" label="Code" />
            <SortHeader :sort="sort" column="host" label="Host" />
            <SortHeader :sort="sort" column="people" label="Who's in it" />
            <SortHeader :sort="sort" column="createdAt" label="Made" />
            <SortHeader :sort="sort" column="stage" label="Stage" />
            <SortHeader :sort="sort" column="shots" label="Shots" />
            <SortHeader :sort="sort" column="status" label="Status" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in shown" :key="r.code" class="clickable" :class="{ 'table-active': room && room.code === r.code }" @click="openRoom(r.code)">
            <td class="fw-semibold">{{ r.code }}</td>
            <td class="text-break">{{ r.hostName }}</td>
            <td>
              <span v-if="r.members.length === 0" class="text-muted">nobody joined</span>
              <span
                v-for="member in r.members" :key="member.id"
                class="person" :class="{ 'text-muted': !isActive(member, now) }"
                :title="(isActive(member, now) ? 'Here now' : 'Left, last seen ' + formatTime(member.lastSeen)) + ' · ' + member.deviceType"
              ><span class="dot" :class="isActive(member, now) ? 'bg-success' : 'bg-secondary'"></span>{{ member.name }}</span>
            </td>
            <td class="text-nowrap">{{ formatTime(r.createdAt) }}</td>
            <td>{{ r.stage }}</td>
            <td>{{ r.shotNumber }}</td>
            <td>
              <span v-if="r.closed" class="badge text-bg-secondary">Closed</span>
              <span v-else class="badge text-bg-success">Open</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="shown.length === 0" class="small text-muted">No rooms here.</p>
    <div v-if="hasMore" class="text-center my-3">
      <button class="btn btn-sm btn-outline-primary" :disabled="loadingMore" @click="showMore">
        {{ loadingMore ? 'Loading...' : 'Show ' + PAGE + ' more (older) rooms' }}
      </button>
    </div>
  </template>
</template>

<style scoped>
.clickable {
  cursor: pointer;
}

/* The opened room: a big box in the middle of the screen that scrolls inside itself.
   Pops in like AppDialog.vue. */
.room-dialog {
  width: min(960px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 64px rgba(20, 23, 43, 0.24);
  opacity: 1;
  transform: scale(1);
  transition: opacity 180ms ease, transform 180ms cubic-bezier(0.23, 1, 0.32, 1), overlay 180ms allow-discrete,
    display 180ms allow-discrete;
}

.room-dialog:not([open]) {
  opacity: 0;
  transform: scale(0.96);
}

@starting-style {
  .room-dialog[open] {
    opacity: 0;
    transform: scale(0.96);
  }
}

.room-dialog::backdrop {
  background: rgba(20, 23, 43, 0.4);
  backdrop-filter: blur(2px);
}

.dialog-body {
  padding: 22px;
}

@media (prefers-reduced-motion: reduce) {
  .room-dialog {
    transition: none;
  }
}

.dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  margin-right: 0.25rem;
}

.missing {
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bs-light);
}

.person {
  display: inline-block;
  margin-right: 0.6rem;
  white-space: nowrap;
}
</style>
