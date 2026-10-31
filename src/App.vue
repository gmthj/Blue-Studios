<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth.js'
import { useFullscreen } from './composables/useFullscreen.js'
import AppIcon from './components/AppIcon.vue'
import ProfileDialog from './components/ProfileDialog.vue'
import AppDialog from './components/AppDialog.vue'
import MarketplaceItemDialog from './components/MarketplaceItemDialog.vue'
import { profileOf } from './profiles.js'

const route = useRoute()
const router = useRouter()
const { user, isAccount, isAdmin, authError, avatar, logOut, resendVerification } = useAuth()

// Room pages and frame editor use the full width of the screen (Bootstrap container-fluid), so big laptop and
// computer screens get a bigger camera, video call tiles, or full-width editor canvas.
// Other pages (home) use the normal centred container.
const isEditor = computed(() => route.path === '/frame-editor')
const inRoom = computed(() => route.path.startsWith('/room/'))
const containerClass = computed(() => {
  return (inRoom.value || isEditor.value) ? 'container-fluid' : 'container'
})

// Fullscreen button in a room (StageBar.vue): the header is hidden so the room gets the whole screen
const { fullscreen } = useFullscreen()
const hideNav = computed(() => inRoom.value && fullscreen.value)

// Accounts that have not clicked the link in their verification email yet
const showVerifyReminder = computed(() => isAccount.value && !user.value.emailVerified && !inRoom.value && !isEditor.value)
const verificationSent = ref(false)

async function resend() {
  try {
    await resendVerification()
    verificationSent.value = true
  } catch (error) {
    console.error(error)
  }
}

// The "Edit profile" popup (ProfileDialog.vue), opened by clicking my picture and name
const profileOpen = ref(false)

async function logOutAndGoHome() {
  await logOut()
  router.push('/')
}
</script>

<template>
  <!--
    White bar with the logo. Sticky: it stays at the top while the page scrolls (not in a room,
    where the camera needs all the height). On phones the links become icons, so everything fits on one line.
  -->
  <nav v-if="!hideNav" class="app-nav" :class="{ sticky: !inRoom, 'mb-4': !inRoom && !isEditor }">
    <div class="nav-inner" :class="containerClass">
      <router-link to="/" class="brand">
        <!-- The camera and film strip from the logo (public/images/bluestudios.jpeg), cut out with a see-through background -->
        <img src="/images/logo-mark.png" class="brand-mark" alt="" width="28" height="40" />
        <span>Blue Studios</span>
      </router-link>

      <!-- Hidden inside a room: logging out there would change your user id and drop you from the room -->
      <div v-if="!inRoom" class="nav-links">
        <router-link to="/marketplace" class="nav-link-btn" title="Marketplace">
          <AppIcon name="shop" :size="18" />
          <span class="link-text">Marketplace</span>
        </router-link>
        <template v-if="isAccount">
          <router-link to="/studio" class="nav-link-btn" title="My Studio">
            <AppIcon name="folder" :size="18" />
            <span class="link-text">My Studio</span>
          </router-link>
          <router-link v-if="isAdmin" to="/admin" class="nav-link-btn nav-admin" title="Admin">
            <AppIcon name="shield" :size="18" />
            <span class="link-text">Admin</span>
          </router-link>
          <span class="nav-divider" aria-hidden="true"></span>
          <!-- My picture and name: opens the Edit profile popup -->
          <button class="account" title="Edit profile" aria-haspopup="dialog" @click="profileOpen = true">
            <img :src="avatar" class="avatar" alt="" width="30" height="30" />
            <span class="account-name text-truncate d-none d-lg-inline">{{ profileOf(user.uid).name || user.displayName || user.email }}</span>
            <span class="visually-hidden">Edit profile</span>
          </button>
          <button class="nav-link-btn" title="Log out" @click="logOutAndGoHome">
            <AppIcon name="log-out" :size="18" />
            <span class="link-text">Log out</span>
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="nav-link-btn">Log in</router-link>
          <router-link to="/login?mode=signup" class="nav-signup">Sign up</router-link>
        </template>
      </div>
    </div>
  </nav>

  <ProfileDialog v-if="isAccount" v-model:open="profileOpen" />

  <!-- One marketplace template or sticker, on top of any page whose URL has ?item=templates:{id} -->
  <MarketplaceItemDialog />

  <main
    :class="[
      isEditor ? 'p-0 editor-main' : containerClass,
      {
        'pb-3': !isEditor,
        'pt-2': hideNav
      }
    ]"
  >
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

  <!-- In-app popups for questions and messages (askConfirm / askText / showNotice in useDialog.js).
       Outside the v-if above, so the template editor can use it too. -->
  <AppDialog />
</template>

<style scoped>
/* The same colours and font as the landing page */
.app-nav {
  --brand: #2F5BEA;
  --brand-dark: #2449C4;
  --brand-tint: #E8EEFF;
  --ink: #14172B;
  --muted: #6B7080;
  --line: #E3E6EE;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  background: rgba(255, 255, 255, 0.85);
  border-bottom: 1px solid var(--line);
}

/* Full-height viewport workspace for template editor */
.editor-main {
  height: calc(100vh - 57px);
  max-height: calc(100vh - 57px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Stays at the top while scrolling. The see-through white with blur lets the page show faintly behind it.
   z-index 1030: Bootstrap's value for sticky bars (below the video call window and modals). */
.app-nav.sticky {
  position: sticky;
  top: 0;
  z-index: 1030;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 56px tall, the same as the old Bootstrap navbar (RoomView.vue counts on that for the camera's height) */
.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 56px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  text-decoration: none;
  white-space: nowrap;
}

/* The logo picture. transform-origin bottom: it wiggles from the bottom of the film, like it is waving */
.brand-mark {
  width: auto;
  height: 40px;
  transform-origin: 50% 90%;
  transition: transform 300ms var(--ease-out);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Links: just an icon on phones, icon + words from 576px (sm) up */
.nav-link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 38px;
  height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  color: var(--muted);
  background: transparent;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: color 150ms ease, background-color 150ms ease, transform 160ms var(--ease-out);
}

.link-text {
  display: none;
}

@media (min-width: 576px) {
  .link-text {
    display: inline;
  }
}

/* The page you are on (router-link adds this class by itself) */
.nav-link-btn.router-link-active {
  color: var(--brand);
  background: var(--brand-tint);
}

.nav-admin {
  color: #B45309;
}

.nav-signup {
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  color: #ffffff;
  background: var(--brand);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms ease, transform 160ms var(--ease-out);
}

/* Shrinks a little when pressed */
.nav-link-btn:active,
.nav-signup:active {
  transform: scale(0.97);
}

.nav-link-btn:focus-visible,
.nav-signup:focus-visible,
.brand:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

/* Hover only with a mouse: on phones a tap would leave it stuck in its hover colour */
@media (hover: hover) and (pointer: fine) {
  .nav-link-btn:hover {
    color: var(--ink);
    background: #F2F4F8;
  }

  .nav-link-btn.router-link-active:hover {
    color: var(--brand);
    background: var(--brand-tint);
  }

  .nav-signup:hover {
    color: #ffffff;
    background: var(--brand-dark);
  }

  /* The logo tilts a little */
  .brand:hover .brand-mark {
    transform: rotate(-8deg);
  }
}

.nav-divider {
  width: 1px;
  height: 22px;
  margin: 0 4px;
  background: var(--line);
}

/* My picture and name: a button that opens the Edit profile popup */
.account {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 10px 0 4px;
  border: 0;
  border-radius: 999px;
  color: var(--ink);
  background: transparent;
  font-size: 0.9rem;
  font-weight: 600;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms ease, transform 160ms var(--ease-out);
}

.account:active {
  transform: scale(0.97);
}

.account:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .account:hover {
    background: #F2F4F8;
  }
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--brand-tint);
}

.account-name {
  max-width: 10rem;
}

/* Very narrow phones: a little tighter so it all fits on one line */
@media (max-width: 359px) {
  .brand {
    gap: 6px;
    font-size: 0.95rem;
  }

  .brand-mark {
    height: 32px;
  }

  .nav-links {
    gap: 2px;
  }

  .nav-link-btn {
    min-width: 34px;
    padding: 0 6px;
  }

  .nav-signup {
    padding: 0 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-mark,
  .nav-link-btn,
  .nav-signup {
    transition: none;
  }

  .nav-link-btn:active,
  .nav-signup:active {
    transform: none;
  }
}
</style>
