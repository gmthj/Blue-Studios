<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// Room pages use the full width of the screen (Bootstrap container-fluid), so big laptop and
// computer screens get a bigger camera and bigger video call tiles.
// Other pages (home) use the normal centred container.
const isEditor = computed(() => route.path === '/template-editor')
const containerClass = computed(() => {
  return route.path.startsWith('/room/') ? 'container-fluid' : 'container'
})
</script>

<template>
  <template v-if="isEditor">
    <router-view />
  </template>
  <template v-else>
    <nav class="navbar bg-primary mb-4">
      <div :class="containerClass">
        <router-link to="/" class="navbar-brand text-white fw-bold">Blue Studios Photobooth</router-link>
      </div>
    </nav>

    <main class="pb-3" :class="containerClass">
      <!-- The page that matches the URL (see router.js) is shown here -->
      <router-view />
    </main>
  </template>
</template>
