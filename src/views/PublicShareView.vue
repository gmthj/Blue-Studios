<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getShare } from '../shares.js'
import SharedStrip from '../components/SharedStrip.vue'
import MessagePage from '../components/MessagePage.vue'

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

  <div v-else class="container py-4" style="max-width: 900px">
    <p class="text-center mb-1"><span class="badge text-bg-light">Shared strip</span></p>
    <h1 class="h3 fw-bold text-center mb-3">{{ share.title }}</h1>
    <SharedStrip :share="share" />
    <p class="text-center mt-4">
      <router-link to="/" class="btn btn-outline-primary">Like this? Make your own strip</router-link>
    </p>
  </div>
</template>
