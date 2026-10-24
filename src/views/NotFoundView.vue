<script setup>
import { useRoute } from 'vue-router'
import MessagePage from '../components/MessagePage.vue'
import AppIcon from '../components/AppIcon.vue'

// Any address the app does not know (the last route in router.js), e.g. /hello or /room/4821/nope.

const route = useRoute()
</script>

<template>
  <MessagePage icon="search" title="This page doesn't exist">
    We couldn't find <strong class="text-break">{{ route.path }}</strong>. The link may be wrong, or the page has moved.
    <template #actions>
      <router-link to="/" class="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2">
        Go to the home page <AppIcon name="arrow-right" :size="16" />
      </router-link>
      <router-link to="/marketplace" class="btn btn-outline-secondary">Browse the marketplace</router-link>
    </template>
  </MessagePage>
</template>
