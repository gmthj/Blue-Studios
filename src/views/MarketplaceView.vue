<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listPublicItems, searchPublicItems } from '../marketplace.js'
import { CATEGORIES } from '../studio.js'
import MarketplaceCard from '../components/MarketplaceCard.vue'
import AppIcon from '../components/AppIcon.vue'

// The marketplace (/marketplace): public templates and stickers. Anyone can browse, guests too.
// The tab, category, sort and search are kept in the URL
// (e.g. /marketplace?type=stickers&category=cute&sort=popular&q=cat) so the back button and shared links keep them.

const route = useRoute()
const router = useRouter()

const type = computed(() => (route.query.type === 'stickers' ? 'stickers' : 'templates'))
const category = computed(() => (CATEGORIES.some((c) => c.id === route.query.category) ? route.query.category : ''))
const sort = computed(() => (route.query.sort === 'popular' ? 'popular' : 'newest'))
const search = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))

const items = ref([])
const cursor = ref(null)
const hasMore = ref(false)
const loading = ref(false)
const errorMessage = ref('')

// Change one of type / category / sort / search in the URL (the watch below then loads the new list)
function setFilter(changes) {
  router.replace({
    query: { type: type.value, category: category.value || undefined, sort: sort.value, q: search.value || undefined, ...changes },
  })
}

// ---------- Search box ----------
// What is typed in the box. The search runs 300ms after the last key press, not on every letter.
const searchText = ref(search.value)
let searchTimer = null

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    setFilter({ q: searchText.value.trim() || undefined })
  }, 300)
}

function clearSearch() {
  clearTimeout(searchTimer)
  searchText.value = ''
  setFilter({ q: undefined })
}

// Back / forward buttons change the URL: put that search back in the box
watch(search, (newSearch) => {
  if (newSearch !== searchText.value.trim()) {
    searchText.value = newSearch
  }
})

onUnmounted(() => clearTimeout(searchTimer))

// Counts loads, so if someone clicks quickly between filters, an older slow answer is ignored
let latestLoad = 0

async function load(more) {
  const thisLoad = ++latestLoad
  loading.value = true
  errorMessage.value = ''
  if (!more) items.value = []
  try {
    if (search.value) {
      // Searching: every match at once, so no "Load more"
      const found = await searchPublicItems({ type: type.value, category: category.value, sort: sort.value, text: search.value })
      if (thisLoad !== latestLoad) return
      items.value = found
      hasMore.value = false
    } else {
      const page = await listPublicItems({
        type: type.value,
        category: category.value,
        sort: sort.value,
        after: more ? cursor.value : null,
      })
      if (thisLoad !== latestLoad) return
      items.value = more ? items.value.concat(page.items) : page.items
      cursor.value = page.cursor
      hasMore.value = page.hasMore
    }
  } catch (error) {
    if (thisLoad !== latestLoad) return
    console.error(error)
    errorMessage.value = 'Could not load the marketplace. Check your internet connection and refresh.'
  }
  loading.value = false
}

watch([type, category, sort, search], () => load(false), { immediate: true })

// Templates are tall, so fewer per row than stickers
const columnClass = computed(() => {
  return type.value === 'templates' ? 'col-6 col-md-4 col-lg-3' : 'col-4 col-md-3 col-lg-2'
})
</script>

<template>
  <div class="app-page">
    <header class="page-header">
      <h1 class="page-title">Marketplace</h1>
      <p class="page-sub">Templates and stickers made by the community. Save the ones you like to your studio.</p>
    </header>

    <!-- Top row: Templates / Stickers, the search box, and sort. On phones the search box gets its own line. -->
    <div class="toolbar mb-3">
      <div class="seg-tabs" role="tablist" aria-label="Show">
        <button
          class="seg-tab" :class="{ active: type === 'templates' }" role="tab" :aria-selected="type === 'templates'"
          @click="setFilter({ type: 'templates' })"
        >
          <AppIcon name="layout" :size="16" /> Templates
        </button>
        <button
          class="seg-tab" :class="{ active: type === 'stickers' }" role="tab" :aria-selected="type === 'stickers'"
          @click="setFilter({ type: 'stickers' })"
        >
          <AppIcon name="sparkle" :size="16" /> Stickers
        </button>
      </div>
      <div class="search-box" role="search">
        <AppIcon name="search" :size="16" class="search-icon" />
        <input
          v-model="searchText"
          type="search"
          class="form-control search-input"
          :placeholder="'Search ' + type + ' or makers'"
          aria-label="Search by name or maker"
          maxlength="60"
          @input="onSearchInput"
          @keyup.esc="clearSearch"
        />
        <button v-if="searchText" type="button" class="search-clear" aria-label="Clear search" @click="clearSearch">
          <AppIcon name="close" :size="14" />
        </button>
      </div>

      <select class="form-select form-select-sm sort-select" :value="sort" aria-label="Sort by" @change="setFilter({ sort: $event.target.value })">
        <option value="newest">Newest</option>
        <option value="popular">Most saved</option>
      </select>
    </div>

    <!-- Categories. On phones they scroll sideways in one row instead of taking up several lines -->
    <div class="chip-row mb-4">
      <button class="chip" :class="{ active: category === '' }" :aria-pressed="category === ''" @click="setFilter({ category: undefined })">
        All
      </button>
      <button
        v-for="c in CATEGORIES"
        :key="c.id"
        class="chip"
        :class="{ active: category === c.id }"
        :aria-pressed="category === c.id"
        @click="setFilter({ category: c.id })"
      >
        {{ c.label }}
      </button>
    </div>

    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <p v-if="search && !loading && items.length > 0" class="result-count">
      {{ items.length }} {{ items.length === 1 ? 'result' : 'results' }} for "{{ search }}"
    </p>

    <div v-if="!loading && !errorMessage && items.length === 0" class="empty-state mb-4">
      <template v-if="search">
        <span class="empty-icon"><AppIcon name="search" :size="22" /></span>
        <strong class="text-body">No {{ type }} match "{{ search }}"</strong>
        <span>Try another word, or <button type="button" class="btn btn-link p-0 align-baseline" @click="clearSearch">clear the search</button>.</span>
      </template>
      <template v-else>
        <span class="empty-icon"><AppIcon name="shop" :size="22" /></span>
        <strong class="text-body">Nothing here yet</strong>
        <span>Make something in My Studio and set it to public to be the first!</span>
      </template>
    </div>

    <div class="row g-3 mb-4">
      <!-- The first 8 cards are on screen straight away on most screens, so their pictures load first -->
      <div v-for="(item, index) in items" :key="item.id" :class="columnClass">
        <MarketplaceCard :item="item" :priority="index < 8" />
      </div>

      <!-- Grey placeholders the size of the cards while the first page loads -->
      <template v-if="loading && items.length === 0">
        <div v-for="i in 8" :key="'loading-' + i" :class="columnClass" aria-hidden="true">
          <div class="skeleton" :class="type === 'templates' ? 'skeleton-template' : 'skeleton-sticker'"></div>
        </div>
      </template>
    </div>

    <p v-if="loading && items.length > 0" class="text-muted text-center">Loading...</p>
    <div v-else-if="hasMore && !loading" class="text-center mb-4">
      <button class="btn btn-outline-secondary px-4" @click="load(true)">Load more</button>
    </div>
  </div>
</template>

<style scoped>
/* Tabs | search | sort in one row. Below 768px the search box drops to its own full-width line. */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.search-box {
  position: relative;
  order: 3;
  flex: 1 1 100%;
}

@media (min-width: 768px) {
  .search-box {
    order: 0;
    flex: 1 1 auto;
    max-width: 360px;
    margin-left: auto;
  }
}

/* The magnifying glass sits inside the box, on the left */
.search-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  color: var(--muted);
  transform: translateY(-50%);
  pointer-events: none;
}

/* font-size 16px: smaller makes iPhones zoom in when the box is tapped */
.search-input {
  height: 40px;
  padding-left: 36px;
  padding-right: 34px;
  font-size: 16px;
}

/* Hide the browser's own clear (x) button, we have our own */
.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--muted);
  background: var(--soft);
  transform: translateY(-50%);
}

.sort-select {
  width: auto;
  height: 40px;
}

.result-count {
  margin: -8px 0 12px;
  color: var(--muted);
  font-size: 0.875rem;
}

/* One row of chips. On narrow screens it scrolls sideways (the scroll bar is hidden) */
.chip-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  /* room for the chips' focus ring, without it being cut off */
  padding: 2px;
  margin: -2px;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

@media (min-width: 768px) {
  .chip-row {
    flex-wrap: wrap;
  }
}

.skeleton-template {
  height: 300px;
}

.skeleton-sticker {
  height: 190px;
}
</style>
