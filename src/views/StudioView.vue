<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { listMyItems, setVisibility, deleteItem, categoryLabel } from '../studio.js'
import { listMySaved, unsaveItem } from '../marketplace.js'
import StorageImage from '../components/StorageImage.vue'
import ItemDetailsForm from '../components/ItemDetailsForm.vue'
import MarketplaceCard from '../components/MarketplaceCard.vue'
import AppIcon from '../components/AppIcon.vue'
import { profileOf } from '../profiles.js'
import { askConfirm } from '../composables/useDialog.js'
import { listMyFolders } from '../stickerCategories.js'

// My Studio (/studio): everything this account has saved. Accounts only (see router.js).
//   - shortcuts: make a frame, make a sticker
//   - my photostrips, my templates, my stickers
//   - templates and stickers can be made public (shown in the marketplace) or private,
//     renamed, and given categories
//   - things I saved from the marketplace

const router = useRouter()
const { user } = useAuth()

const strips = ref([])
const templates = ref([])
const stickers = ref([])
const folders = ref([])          // my personal folders, loaded from Firebase
const folderFilter = ref('all')  // 'all', 'mine', or a folder id: which stickers are shown
const saved = ref([]) // from the marketplace: { id, type, savedAt, item } (item is null if no longer available)
const editingId = ref('') // the template or sticker whose name and categories are being edited
const loading = ref(true)
const errorMessage = ref('')
const busyId = ref('') // the item being changed right now (its buttons are disabled)

// The template editor and sticker maker are teammates' pages; only link to them once they are part of the app
const hasTemplateEditor = router.resolve('/template-editor').matched.length > 0
const hasStickerMaker = router.resolve('/sticker-maker').matched.length > 0

const me = computed(() => profileOf(user.value.uid))
const firstName = computed(() => (me.value.name || user.value.displayName).split(' ')[0])

onMounted(loadAll)

async function loadAll() {
  loading.value = true
  errorMessage.value = ''
  try {
    // .catch(() => []) means if folders fail to load, the rest of the page still works
    const results = await Promise.all([
      listMyItems('strips'), listMyItems('templates'), listMyItems('stickers'), listMySaved(),
      listMyFolders().catch(() => []),
    ])
    strips.value = results[0]
    templates.value = results[1]
    stickers.value = results[2]
    saved.value = results[3]
    folders.value = results[4]
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
  // Everything in the marketplace needs a category (so people can find it)
  if (!item.categories || item.categories.length === 0) {
    busyId.value = ''
    editingId.value = item.id
    errorMessage.value = 'Pick at least 1 category for "' + item.name + '" first.'
    return
  }
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
  const sure = await askConfirm({ title: 'Delete "' + name + '"?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })
  if (!sure) return
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

function detailsSaved(item, details) {
  item.name = details.name
  item.categories = details.categories
  editingId.value = ''
}

// Is it showing in the marketplace right now?
function isListed(item) {
  return item.visibility === 'public' && item.status === 'active'
}

async function unsave(savedItem) {
  busyId.value = savedItem.id
  try {
    await unsaveItem(savedItem.type, savedItem.id)
    saved.value = saved.value.filter((other) => other.id !== savedItem.id)
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not remove it. Please try again.'
  }
  busyId.value = ''
}

// Which of my folders is this sticker in? (a folder stores sticker ids, so we look the id up)
function foldersOf(sticker) {
  return folders.value.filter((f) => (f.itemIds || []).includes(sticker.id))
}

// The public labels to show. If the sticker is in one of my folders and its only public
// category is the auto-added 'other', hide it so the folder name shows instead.
function visibleCategories(sticker) {
  const cats = sticker.categories || []
  if (foldersOf(sticker).length > 0 && cats.length === 1 && cats[0] === 'other') return []
  return cats
}

// The stickers matching the filter row. computed() re-runs by itself when the filter changes.
const filteredStickers = computed(() => {
  if (folderFilter.value === 'all') return stickers.value
  if (folderFilter.value === 'mine') return stickers.value.filter((s) => foldersOf(s).length > 0)
  const folder = folders.value.find((f) => f.id === folderFilter.value)
  const ids = folder ? folder.itemIds || [] : []
  return stickers.value.filter((s) => ids.includes(s.id))
})

function formatDate(time) {
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="app-page">
    <header class="page-header d-flex align-items-center gap-3">
      <img :src="me.avatar" class="studio-avatar" alt="" width="64" height="64" />
      <div>
        <h1 class="page-title">Hey {{ firstName }}</h1>
        <p class="page-sub">Pick up where you left off, or start something new.</p>
      </div>
    </header>

    <!-- Shortcuts: make something new -->
    <div class="row g-3 mb-5">
      <div class="col-12 col-md-6">
        <div class="card h-100 shortcut">
          <div class="card-body d-flex flex-column">
            <span class="shortcut-icon"><AppIcon name="layout" :size="20" /></span>
            <h2 class="shortcut-title">Make a frame</h2>
            <p class="shortcut-text flex-grow-1">Build a strip template with drag and drop slots.</p>
            <router-link v-if="hasTemplateEditor" to="/template-editor" class="btn btn-primary">
              <AppIcon name="plus" :size="16" /> New frame
            </router-link>
            <button v-else class="btn btn-primary" disabled>Template editor coming soon</button>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="card h-100 shortcut">
          <div class="card-body d-flex flex-column">
            <span class="shortcut-icon"><AppIcon name="sparkle" :size="20" /></span>
            <h2 class="shortcut-title">Make a sticker</h2>
            <p class="shortcut-text flex-grow-1">Turn a photo or a drawing into a sticker for your strips.</p>
            <router-link v-if="hasStickerMaker" to="/sticker-maker" class="btn btn-primary">
              <AppIcon name="plus" :size="16" /> New sticker
            </router-link>
            <button v-else class="btn btn-primary" disabled>Sticker maker coming soon</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <!-- Grey placeholders while everything loads -->
    <div v-if="loading" aria-label="Loading your studio" role="status">
      <div class="skeleton skeleton-title mb-3"></div>
      <div class="row g-3 mb-5">
        <div v-for="i in 6" :key="i" class="col-6 col-md-3 col-xl-2">
          <div class="skeleton skeleton-card"></div>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Photostrips -->
      <section class="mb-5">
        <h2 class="section-title">
          <AppIcon name="film" :size="18" /> My photostrips
          <span v-if="strips.length" class="section-count">{{ strips.length }}</span>
        </h2>
        <div v-if="strips.length === 0" class="empty-state">
          <span class="empty-icon"><AppIcon name="film" :size="22" /></span>
          No strips yet. In a room, make your photostrip and press "Save to My Studio".
        </div>
        <div v-else class="row g-3">
          <div v-for="strip in strips" :key="strip.id" class="col-6 col-md-3 col-xl-2">
            <div class="card h-100 overflow-hidden">
              <div class="preview strip-preview"><StorageImage :path="strip.imagePath" :alt="strip.title" /></div>
              <div class="card-body item-body">
                <p class="item-name text-truncate" :title="strip.title">{{ strip.title }}</p>
                <p class="item-meta mb-2">{{ formatDate(strip.createdAt) }}</p>
                <button class="btn btn-sm btn-outline-danger w-100" :disabled="busyId === strip.id" @click="remove(strip)">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Templates -->
      <section class="mb-5">
        <h2 class="section-title">
          <AppIcon name="layout" :size="18" /> My templates
          <span v-if="templates.length" class="section-count">{{ templates.length }}</span>
        </h2>
        <div v-if="templates.length === 0" class="empty-state">
          <span class="empty-icon"><AppIcon name="layout" :size="22" /></span>
          No templates yet. Design one in the template editor.
        </div>
        <div v-else class="row g-3">
          <div v-for="template in templates" :key="template.id" class="col-12 col-sm-6 col-lg-4">
            <div class="card h-100 overflow-hidden">
              <div class="row g-0 h-100">
                <div class="col-4 preview template-preview"><StorageImage :path="template.thumbnailPath" :alt="template.name" /></div>
                <div class="col-8">
                  <div class="card-body">
                    <div class="d-flex align-items-start justify-content-between gap-2">
                      <p class="item-name text-truncate" :title="template.name">{{ template.name }}</p>
                      <span class="badge" :class="template.visibility === 'public' ? 'text-bg-success' : 'text-bg-light border'">
                        {{ template.visibility === 'public' ? 'Public' : 'Private' }}
                      </span>
                    </div>
                    <p class="item-meta mb-2">{{ template.slotCount }} slots &middot; {{ template.saveCount }} saves</p>
                    <div class="d-flex flex-wrap gap-1 mb-2">
                      <span v-for="c in template.categories" :key="c" class="badge text-bg-light border">{{ categoryLabel(c) }}</span>
                    </div>
                    <span v-if="template.status === 'hidden'" class="badge text-bg-warning mb-2">Hidden by a moderator</span>

                    <ItemDetailsForm v-if="editingId === template.id" :item="template" @saved="detailsSaved(template, $event)" @cancel="editingId = ''" />
                    <template v-else>
                      <div class="form-check form-switch mb-2">
                        <input
                          :id="'vis-' + template.id"
                          class="form-check-input"
                          type="checkbox"
                          :checked="template.visibility === 'public'"
                          :disabled="!user.emailVerified || busyId === template.id"
                          @change="toggleVisibility(template)"
                        />
                        <label class="form-check-label small" :for="'vis-' + template.id">Show in the marketplace</label>
                      </div>
                      <div class="item-actions">
                        <button class="btn btn-sm btn-link px-0" @click="editingId = template.id">Edit</button>
                        <router-link :to="'/template-editor?template=' + template.id" class="btn btn-sm btn-link px-0">Open in editor</router-link>
                        <router-link v-if="isListed(template)" :to="'/marketplace/templates/' + template.id" class="btn btn-sm btn-link px-0">View</router-link>
                        <button class="btn btn-sm btn-link text-danger px-0" :disabled="busyId === template.id" @click="remove(template)">Delete</button>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Stickers -->
      <section class="mb-5">
        <h2 class="section-title">
          <AppIcon name="sparkle" :size="18" /> My stickers
          <span v-if="stickers.length" class="section-count">{{ stickers.length }}</span>
        </h2>
        <div v-if="stickers.length === 0" class="empty-state">
          <span class="empty-icon"><AppIcon name="sparkle" :size="22" /></span>
          No stickers yet. Make one in the sticker maker.
        </div>
        <!-- Filter row: All / Mine (anything in one of my folders) / one button per folder -->
        <div v-if="stickers.length > 0" class="d-flex flex-wrap gap-2 mb-3">
          <button class="btn btn-sm rounded-pill" :class="folderFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'" @click="folderFilter = 'all'">All</button>
          <button class="btn btn-sm rounded-pill" :class="folderFilter === 'mine' ? 'btn-primary' : 'btn-outline-primary'" @click="folderFilter = 'mine'">My Privates</button>
          <button
            v-for="f in folders"
            :key="f.id"
            class="btn btn-sm rounded-pill"
            :class="folderFilter === f.id ? 'btn-primary' : 'btn-outline-primary'"
            @click="folderFilter = f.id"
          >{{ f.name }}</button>
        </div>
        <div v-else class="row g-3">
          <div v-for="sticker in filteredStickers" :key="sticker.id" class="col-6 col-md-3 col-xl-2">
            <div class="card h-100 overflow-hidden">
              <div class="preview sticker-preview"><StorageImage :path="sticker.imagePath" :alt="sticker.name" /></div>
              <div class="card-body item-body">
                <div class="d-flex align-items-start justify-content-between gap-1">
                  <p class="item-name text-truncate" :title="sticker.name">{{ sticker.name }}</p>
                  <span class="badge" :class="sticker.visibility === 'public' ? 'text-bg-success' : 'text-bg-light border'">
                    {{ sticker.visibility === 'public' ? 'Public' : 'Private' }}
                  </span>
                </div>
                <p class="item-meta mb-1">{{ sticker.kind }}</p>
                <div class="d-flex flex-wrap gap-1 mb-1">
                  <!-- Folder names first (blue), then the public labels (grey) -->
                  <span v-for="f in foldersOf(sticker)" :key="f.id" class="badge text-bg-primary">{{ f.name }}</span>
                  <span v-for="c in visibleCategories(sticker)" :key="c" class="badge text-bg-light border">{{ categoryLabel(c) }}</span>
                </div>
                <span v-if="sticker.status === 'hidden'" class="badge text-bg-warning mb-1">Hidden by a moderator</span>

                <ItemDetailsForm v-if="editingId === sticker.id" :item="sticker" @saved="detailsSaved(sticker, $event)" @cancel="editingId = ''" />
                <template v-else>
                  <div class="form-check form-switch">
                    <input
                      :id="'vis-' + sticker.id"
                      class="form-check-input"
                      type="checkbox"
                      :checked="sticker.visibility === 'public'"
                      :disabled="!user.emailVerified || busyId === sticker.id"
                      @change="toggleVisibility(sticker)"
                    />
                    <label class="form-check-label small" :for="'vis-' + sticker.id">Public</label>
                  </div>
                  <div class="item-actions">
                    <button class="btn btn-sm btn-link px-0" @click="editingId = sticker.id">Edit</button>
                    <router-link v-if="isListed(sticker)" :to="'/marketplace/stickers/' + sticker.id" class="btn btn-sm btn-link px-0">View</router-link>
                    <button class="btn btn-sm btn-link text-danger px-0" :disabled="busyId === sticker.id" @click="remove(sticker)">Delete</button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Saved from the marketplace -->
      <section class="mb-5">
        <h2 class="section-title">
          <AppIcon name="bookmark" :size="18" /> Saved from the marketplace
          <span v-if="saved.length" class="section-count">{{ saved.length }}</span>
        </h2>
        <div v-if="saved.length === 0" class="empty-state">
          <span class="empty-icon"><AppIcon name="bookmark" :size="22" /></span>
          <span>Nothing saved yet. <router-link to="/marketplace">Browse the marketplace</router-link> and save templates and stickers you like.</span>
        </div>
        <div v-else class="row g-3">
          <div v-for="savedItem in saved" :key="savedItem.id" class="col-6 col-md-3 col-xl-2 d-flex flex-column">
            <MarketplaceCard v-if="savedItem.item" :item="savedItem.item" />
            <div v-else class="empty-state h-100 justify-content-center small">
              No longer available: the maker made it private or removed it.
            </div>
            <button class="btn btn-sm btn-link text-danger" :disabled="busyId === savedItem.id" @click="unsave(savedItem)">Remove</button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.studio-avatar {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background: var(--brand-tint);
  box-shadow: 0 0 0 3px #ffffff, 0 0 0 5px var(--brand-tint);
}

/* ---------- Shortcuts ---------- */
.shortcut .card-body {
  padding: 20px;
}

.shortcut-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 14px;
  border-radius: 12px;
  color: var(--brand);
  background: var(--brand-tint);
}

.shortcut-title {
  margin-bottom: 4px;
  font-size: 1.05rem;
  font-weight: 700;
}

.shortcut-text {
  color: var(--muted);
  font-size: 0.875rem;
}

.shortcut .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* ---------- Item cards ---------- */
.preview {
  overflow: hidden;
  background: var(--soft);
}

.strip-preview {
  height: 220px;
}

.template-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  max-height: 220px;
  padding: 8px;
}

.template-preview :deep(.storage-image),
.template-preview :deep(img) {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.sticker-preview {
  height: 120px;
  padding: 10px;
}

.item-body {
  padding: 10px 12px 12px;
}

.item-name {
  min-width: 0;
  margin: 0 0 2px;
  font-size: 0.9rem;
  font-weight: 700;
}

.item-meta {
  color: var(--muted);
  font-size: 0.8rem;
}

.item-actions {
  display: flex;
  flex-wrap: wrap;
  column-gap: 14px;
}

/* ---------- Loading ---------- */
.skeleton-title {
  width: 200px;
  height: 24px;
}

.skeleton-card {
  height: 260px;
}
</style>
