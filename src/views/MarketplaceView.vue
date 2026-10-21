<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listPublicItems } from '../marketplace.js'
import { CATEGORIES } from '../studio.js'
import MarketplaceCard from '../components/MarketplaceCard.vue'

// The marketplace (/marketplace): public templates and stickers. Anyone can browse, guests too.
// The tab, category and sort are kept in the URL (e.g. /marketplace?type=stickers&category=cute&sort=popular)
// so the back button and shared links keep them.

const route = useRoute()
const router = useRouter()

const type = computed(() => (route.query.type === 'stickers' ? 'stickers' : 'templates'))
const category = computed(() => (CATEGORIES.some((c) => c.id === route.query.category) ? route.query.category : ''))
const sort = computed(() => (route.query.sort === 'popular' ? 'popular' : 'newest'))

const items = ref([])
const cursor = ref(null)
const hasMore = ref(false)
const loading = ref(false)
const errorMessage = ref('')

// Change one of type / category / sort in the URL (the watch below then loads the new list)
function setFilter(changes) {
  router.replace({ query: { type: type.value, category: category.value || undefined, sort: sort.value, ...changes } })
}

// Counts loads, so if someone clicks quickly between filters, an older slow answer is ignored
let latestLoad = 0

async function load(more) {
  const thisLoad = ++latestLoad
  loading.value = true
  errorMessage.value = ''
  if (!more) items.value = []
  try {
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
  } catch (error) {
    if (thisLoad !== latestLoad) return
    console.error(error)
    errorMessage.value = 'Could not load the marketplace. Check your internet connection and refresh.'
  }
  loading.value = false
}

watch([type, category, sort], () => load(false), { immediate: true })
</script>

<template>
  <h1 class="h3 mb-1">Marketplace</h1>
  <p class="text-muted mb-4">Templates and stickers made by the community. Save the ones you like to your studio.</p>

  <ul class="nav nav-tabs mb-3">
    <li class="nav-item">
      <button class="nav-link" :class="{ active: type === 'templates' }" @click="setFilter({ type: 'templates' })">Templates</button>
    </li>
    <li class="nav-item">
      <button class="nav-link" :class="{ active: type === 'stickers' }" @click="setFilter({ type: 'stickers' })">Stickers</button>
    </li>
  </ul>

  <div class="d-flex flex-wrap align-items-center gap-2 mb-4">
    <div class="d-flex flex-wrap gap-1 flex-grow-1">
      <button
        class="btn btn-sm rounded-pill"
        :class="category === '' ? 'btn-primary' : 'btn-outline-secondary'"
        @click="setFilter({ category: undefined })"
      >
        All
      </button>
      <button
        v-for="c in CATEGORIES"
        :key="c.id"
        class="btn btn-sm rounded-pill"
        :class="category === c.id ? 'btn-primary' : 'btn-outline-secondary'"
        @click="setFilter({ category: c.id })"
      >
        {{ c.label }}
      </button>
    </div>
    <select class="form-select form-select-sm sort-select" :value="sort" aria-label="Sort by" @change="setFilter({ sort: $event.target.value })">
      <option value="newest">Newest</option>
      <option value="popular">Most saved</option>
    </select>
  </div>

  <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

  <p v-if="!loading && !errorMessage && items.length === 0" class="text-muted">
    Nothing here yet. Make something in My Studio and set it to public to be the first!
  </p>

  <div class="row g-3 mb-4">
    <div
      v-for="item in items"
      :key="item.id"
      :class="type === 'templates' ? 'col-6 col-md-4 col-lg-3' : 'col-4 col-md-3 col-lg-2'"
    >
      <MarketplaceCard :item="item" />
    </div>
  </div>

  <p v-if="loading" class="text-muted">Loading...</p>
  <div v-else-if="hasMore" class="text-center mb-4">
    <button class="btn btn-outline-primary" @click="load(true)">Load more</button>
  </div>
</template>

<style scoped>
.sort-select {
  width: auto;
}
</style>
