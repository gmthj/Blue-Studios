<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { listMyItems, setVisibility, deleteItem } from '../studio.js'
import StorageImage from '../components/StorageImage.vue'

// My Studio (/studio): everything this account has saved. Accounts only (see router.js).
//   - shortcuts: design a frame, start a room, join a room
//   - my photostrips, my templates, my stickers
//   - templates and stickers can be made public (shown in the marketplace) or private

const router = useRouter()
const { user } = useAuth()

const strips = ref([])
const templates = ref([])
const stickers = ref([])
const loading = ref(true)
const errorMessage = ref('')
const busyId = ref('') // the item being changed right now (its buttons are disabled)

const joinCode = ref('')
const codeComplete = computed(() => /^[0-9]{4}$/.test(joinCode.value.trim()))

// The template editor is a teammate's page; only link to it once it is part of the app
const hasTemplateEditor = router.resolve('/template-editor').matched.length > 0

const firstName = computed(() => user.value.displayName.split(' ')[0])

onMounted(loadAll)

async function loadAll() {
  loading.value = true
  errorMessage.value = ''
  try {
    const results = await Promise.all([listMyItems('strips'), listMyItems('templates'), listMyItems('stickers')])
    strips.value = results[0]
    templates.value = results[1]
    stickers.value = results[2]
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load your studio. Check your internet connection and refresh.'
  }
  loading.value = false
}

// Public <-> private
async function toggleVisibility(item) {
  if (!user.value.emailVerified) return
  busyId.value = item.id
  const newVisibility = item.visibility === 'public' ? 'private' : 'public'
  try {
    await setVisibility(item, newVisibility)
    item.visibility = newVisibility
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not change "' + item.name + '". Please try again.'
  }
  busyId.value = ''
}

// The list on this page that an item is shown in
const listsByType = { strips: strips, templates: templates, stickers: stickers }

async function remove(item) {
  const name = item.name || item.title
  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return
  busyId.value = item.id
  try {
    await deleteItem(item)
    const list = listsByType[item.type]
    list.value = list.value.filter((other) => other.id !== item.id)
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not delete "' + name + '". Please try again.'
  }
  busyId.value = ''
}

function joinRoom() {
  if (codeComplete.value) {
    router.push('/?code=' + joinCode.value.trim())
  }
}

function formatDate(time) {
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <h1 class="h3 mb-1">Hey {{ firstName }}</h1>
  <p class="text-muted mb-4">Pick up where you left off, or start something new.</p>

  <!-- Shortcuts -->
  <div class="row g-3 mb-5">
    <div class="col-12 col-md-4">
      <div class="card h-100">
        <div class="card-body d-flex flex-column">
          <h2 class="h5">Design</h2>
          <p class="text-muted small flex-grow-1">Build a strip template with drag and drop slots.</p>
          <router-link v-if="hasTemplateEditor" to="/template-editor" class="btn btn-primary">+ New frame</router-link>
          <button v-else class="btn btn-primary" disabled>Template editor coming soon</button>
        </div>
      </div>
    </div>
    <div class="col-12 col-md-4">
      <div class="card h-100">
        <div class="card-body d-flex flex-column">
          <h2 class="h5">Start a room</h2>
          <p class="text-muted small flex-grow-1">Invite friends with a 4-digit code and shoot together.</p>
          <router-link to="/" class="btn btn-outline-primary">Start a room</router-link>
        </div>
      </div>
    </div>
    <div class="col-12 col-md-4">
      <div class="card h-100">
        <div class="card-body d-flex flex-column">
          <h2 class="h5">Join with code</h2>
          <p class="text-muted small flex-grow-1">Enter a friend's 4-digit room code.</p>
          <div class="input-group">
            <input v-model="joinCode" type="text" inputmode="numeric" maxlength="4" class="form-control" placeholder="4-digit code" @keyup.enter="joinRoom" />
            <button class="btn btn-outline-primary" :disabled="!codeComplete" @click="joinRoom">Join</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
  <p v-if="loading" class="text-muted">Loading your studio...</p>

  <template v-else>
    <!-- Photostrips -->
    <h2 class="h4 mb-3">My photostrips</h2>
    <p v-if="strips.length === 0" class="text-muted small mb-5">
      No strips yet. In a room, make your photostrip and press "Save to My Studio".
    </p>
    <div v-else class="row g-3 mb-5">
      <div v-for="strip in strips" :key="strip.id" class="col-6 col-md-3 col-xl-2">
        <div class="card h-100">
          <div class="preview strip-preview"><StorageImage :path="strip.imagePath" :alt="strip.title" /></div>
          <div class="card-body p-2">
            <p class="small fw-semibold text-truncate mb-0">{{ strip.title }}</p>
            <p class="small text-muted mb-2">{{ formatDate(strip.createdAt) }}</p>
            <button class="btn btn-sm btn-outline-danger w-100" :disabled="busyId === strip.id" @click="remove(strip)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Templates and stickers can be public (marketplace) or private -->
    <div v-if="!user.emailVerified" class="alert alert-light border small">
      Confirm your email to make your templates and stickers public in the marketplace.
    </div>

    <h2 class="h4 mb-3">My templates</h2>
    <p v-if="templates.length === 0" class="text-muted small mb-5">No templates yet. Design one in the template editor.</p>
    <div v-else class="row g-3 mb-5">
      <div v-for="template in templates" :key="template.id" class="col-12 col-sm-6 col-lg-4">
        <div class="card h-100">
          <div class="row g-0 h-100">
            <div class="col-4 preview"><StorageImage :path="template.thumbnailPath" :alt="template.name" /></div>
            <div class="col-8">
              <div class="card-body">
                <p class="fw-semibold text-truncate mb-0">{{ template.name }}</p>
                <p class="small text-muted mb-2">{{ template.slotCount }} slots &middot; {{ template.saveCount }} saves</p>
                <span v-if="template.status === 'hidden'" class="badge text-bg-warning mb-2">Hidden by a moderator</span>
                <div class="form-check form-switch">
                  <input
                    :id="'vis-' + template.id"
                    class="form-check-input"
                    type="checkbox"
                    :checked="template.visibility === 'public'"
                    :disabled="!user.emailVerified || busyId === template.id"
                    @change="toggleVisibility(template)"
                  />
                  <label class="form-check-label small" :for="'vis-' + template.id">
                    {{ template.visibility === 'public' ? 'Public' : 'Private' }}
                  </label>
                </div>
                <button class="btn btn-sm btn-link text-danger px-0" :disabled="busyId === template.id" @click="remove(template)">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <h2 class="h4 mb-3">My stickers</h2>
    <p v-if="stickers.length === 0" class="text-muted small mb-5">No stickers yet. Make one in the sticker maker.</p>
    <div v-else class="row g-3 mb-5">
      <div v-for="sticker in stickers" :key="sticker.id" class="col-6 col-md-3 col-xl-2">
        <div class="card h-100">
          <div class="preview sticker-preview"><StorageImage :path="sticker.imagePath" :alt="sticker.name" /></div>
          <div class="card-body p-2">
            <p class="small fw-semibold text-truncate mb-0">{{ sticker.name }}</p>
            <p class="small text-muted mb-1">{{ sticker.kind }}</p>
            <span v-if="sticker.status === 'hidden'" class="badge text-bg-warning mb-1">Hidden by a moderator</span>
            <div class="form-check form-switch">
              <input
                :id="'vis-' + sticker.id"
                class="form-check-input"
                type="checkbox"
                :checked="sticker.visibility === 'public'"
                :disabled="!user.emailVerified || busyId === sticker.id"
                @change="toggleVisibility(sticker)"
              />
              <label class="form-check-label small" :for="'vis-' + sticker.id">
                {{ sticker.visibility === 'public' ? 'Public' : 'Private' }}
              </label>
            </div>
            <button class="btn btn-sm btn-link text-danger px-0" :disabled="busyId === sticker.id" @click="remove(sticker)">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.preview {
  background: #f1f3f5;
  overflow: hidden;
}

.strip-preview {
  height: 220px;
}

.sticker-preview {
  height: 120px;
  padding: 8px;
}
</style>
