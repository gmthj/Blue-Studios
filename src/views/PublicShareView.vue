<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getShare } from '../shares.js'
import SharedStrip from '../components/SharedStrip.vue'
import MessagePage from '../components/MessagePage.vue'
import AppIcon from '../components/AppIcon.vue'

// The page a share's link opens (/s/:id): anyone can see the strip and download it, on any device, signed in or not.

const route = useRoute()
const share = ref(null)
const status = ref('loading') // 'loading' | 'ready' | 'notFound'

onMounted(async () => {
  try {
    share.value = await getShare(String(route.params.id))
    status.value = share.value ? 'ready' : 'notFound'
  } catch (error) {
    console.error(error)
    status.value = 'notFound'
  }
})
</script>

<template>
  <MessagePage v-if="status === 'loading'" loading title="Opening the strip">Just a moment...</MessagePage>

  <MessagePage v-else-if="status === 'notFound'" icon="search" title="This strip isn't here">
    The link may be wrong, or the strip was removed.
    <template #actions>
      <router-link to="/" class="btn btn-primary">Make your own strip</router-link>
    </template>
  </MessagePage>

  <!-- app-page: the shared Blue Studios look (colours, font, buttons) from pages.css, see design.md -->
  <div v-else class="app-page container py-4 share-page">
    <header class="page-header text-center">
      <p class="mb-2"><span class="badge text-bg-primary">Shared strip</span></p>
      <h1 class="page-title">{{ share.title }}</h1>
    </header>
    <SharedStrip :share="share" />
    <p class="text-center mt-4">
      <router-link to="/" class="btn btn-outline-secondary make-own">
        Like this? Make your own strip <AppIcon name="arrow-right" :size="16" />
      </router-link>
    </p>
  </div>
</template>

<style scoped>
.share-page {
  max-width: 900px;
}

.make-own {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
