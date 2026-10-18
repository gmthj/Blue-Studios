<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from './composables/useAuth.js'

const route = useRoute()
const { authError } = useAuth()

// Room pages use the full width of the screen (Bootstrap container-fluid), so big laptop and
// computer screens get a bigger camera and bigger video call tiles.
// Other pages (home) use the normal centred container.
const containerClass = computed(() => {
  return route.path.startsWith('/room/') ? 'container-fluid' : 'container'
})
</script>

<template>
  <nav class="navbar bg-primary mb-4">
    <div :class="containerClass">
      <router-link to="/" class="navbar-brand text-white fw-bold">Blue Studios Photobooth</router-link>
    </div>
  </nav>

  <main class="pb-3" :class="containerClass">
    <!-- Could not sign in (even as a guest), so nothing would be saved: show why instead of the page -->
    <div v-if="authError" class="alert alert-danger">{{ authError }}</div>

    <!-- The page that matches the URL (see router.js) is shown here -->
    <router-view v-else />
  </main>
</template>
