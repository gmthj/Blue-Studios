<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth.js'

const route = useRoute()
const router = useRouter()
const { user, isAccount, isAdmin, authError, logOut, resendVerification } = useAuth()

// Room pages use the full width of the screen (Bootstrap container-fluid), so big laptop and
// computer screens get a bigger camera and bigger video call tiles.
// Other pages (home) use the normal centred container.
const isEditor = computed(() => route.path === '/template-editor')
const inRoom = computed(() => route.path.startsWith('/room/'))
const containerClass = computed(() => {
  return inRoom.value ? 'container-fluid' : 'container'
})

// Accounts that have not clicked the link in their verification email yet
const showVerifyReminder = computed(() => isAccount.value && !user.value.emailVerified && !inRoom.value)
const verificationSent = ref(false)

async function resend() {
  try {
    await resendVerification()
    verificationSent.value = true
  } catch (error) {
    console.error(error)
  }
}

async function logOutAndGoHome() {
  await logOut()
  router.push('/')
}
</script>

<template>
  <template v-if="isEditor">
    <router-view />
  </template>
  <template v-else>
    <nav class="navbar bg-primary mb-4">
      <div :class="containerClass">
        <router-link to="/" class="navbar-brand text-white fw-bold">Blue Studios<span class="d-none d-md-inline"> Photobooth</span></router-link>

        <!-- Hidden inside a room: logging out there would change your user id and drop you from the room -->
        <div v-if="!inRoom" class="d-flex align-items-center gap-2">
          <router-link to="/marketplace" class="btn btn-sm btn-outline-light">Marketplace</router-link>
          <template v-if="isAccount">
            <router-link to="/studio" class="btn btn-sm btn-outline-light">My Studio</router-link>
            <router-link v-if="isAdmin" to="/admin" class="btn btn-sm btn-warning">Admin</router-link>
            <span class="text-white small text-truncate account-name d-none d-sm-inline">{{ user.displayName || user.email }}</span>
            <button class="btn btn-sm btn-light" @click="logOutAndGoHome">Log out</button>
          </template>
          <template v-else>
            <router-link to="/login" class="btn btn-sm btn-outline-light">Log in</router-link>
            <router-link to="/login?mode=signup" class="btn btn-sm btn-light">Sign up</router-link>
          </template>
        </div>
      </div>
    </nav>

    <main class="pb-3" :class="containerClass">
      <!-- Could not sign in (even as a guest), so nothing would be saved: show why instead of the page -->
      <div v-if="authError" class="alert alert-danger">{{ authError }}</div>

      <template v-else>
        <div v-if="showVerifyReminder" class="alert alert-warning small">
          Please confirm your email: open the link we sent to {{ user.email }}.
          <span v-if="verificationSent">Sent again!</span>
          <button v-else class="btn btn-link btn-sm p-0 align-baseline" @click="resend">Send it again</button>
        </div>

        <!-- The page that matches the URL (see router.js) is shown here -->
        <router-view />
      </template>
    </main>
  </template>
</template>

<style scoped>
.account-name {
  max-width: 10rem;
}
</style>
