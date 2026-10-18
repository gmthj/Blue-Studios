<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth, authErrorMessage } from '../composables/useAuth.js'
import { getGuestName } from '../guest.js'

// Log in / Sign up page: /login (log in) or /login?mode=signup (sign up).
// After logging in we go back to ?redirect=... (e.g. /login?redirect=/studio), or the home page.

const route = useRoute()
const router = useRouter()
const { isAccount, signUp, logIn, logInWithGoogle, resetPassword } = useAuth()

const MIN_PASSWORD = 8

const mode = ref(route.query.mode === 'signup' ? 'signup' : 'login') // 'login' or 'signup'
const name = ref(getGuestName())
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const infoMessage = ref('')
const loading = ref(false)

// Only go back to pages on OUR site. A link like /login?redirect=https://evil.com must not
// send people to another website after they log in.
const redirectTo = computed(() => {
  const target = String(route.query.redirect || '/')
  const isOurPage = target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
  return isOurPage ? target : '/'
})

// Already logged in: nothing to do here
onMounted(() => {
  if (isAccount.value) {
    router.replace(redirectTo.value)
  }
})

function switchMode(newMode) {
  mode.value = newMode
  errorMessage.value = ''
  infoMessage.value = ''
}

// Check the form before sending it to Firebase. Returns an error message, or '' if it is fine.
function checkForm() {
  if (mode.value === 'signup') {
    const trimmed = name.value.trim()
    if (trimmed === '' || trimmed.length > 30) return 'Please enter your name (up to 30 characters).'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return 'Please enter a valid email address.'
  if (mode.value === 'signup' && password.value.length < MIN_PASSWORD) {
    return 'Your password needs at least ' + MIN_PASSWORD + ' characters.'
  }
  if (password.value === '') return 'Please enter your password.'
  return ''
}

async function submit() {
  errorMessage.value = checkForm()
  infoMessage.value = ''
  if (errorMessage.value) return

  loading.value = true
  try {
    if (mode.value === 'signup') {
      await signUp(name.value.trim(), email.value.trim(), password.value)
    } else {
      await logIn(email.value.trim(), password.value)
    }
    router.replace(redirectTo.value)
  } catch (error) {
    console.error(error)
    errorMessage.value = authErrorMessage(error)
  }
  password.value = '' // never keep the password around longer than needed
  loading.value = false
}

async function google() {
  errorMessage.value = ''
  infoMessage.value = ''
  loading.value = true
  try {
    await logInWithGoogle()
    router.replace(redirectTo.value)
  } catch (error) {
    console.error(error)
    errorMessage.value = authErrorMessage(error)
  }
  loading.value = false
}

async function forgotPassword() {
  errorMessage.value = ''
  infoMessage.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    errorMessage.value = 'Type your email above first, then press "Forgot password?" again.'
    return
  }
  try {
    await resetPassword(email.value.trim())
  } catch (error) {
    console.error(error) // do not say if the email has an account (see below)
  }
  // Same message whether or not the email has an account, so nobody can use this to check
  infoMessage.value = 'If ' + email.value.trim() + ' has an account, we have sent it a link to reset the password.'
}
</script>

<template>
  <div class="row justify-content-center">
    <div class="col-12 col-sm-10 col-md-7 col-lg-5">
      <h1 class="h3 text-center mb-4">{{ mode === 'signup' ? 'Create your account' : 'Welcome back' }}</h1>

      <div class="card mb-3">
        <div class="card-body">
          <!-- Log in / Sign up tabs -->
          <div class="btn-group w-100 mb-3" role="group">
            <button type="button" class="btn" :class="mode === 'login' ? 'btn-primary' : 'btn-outline-primary'" @click="switchMode('login')">
              Log in
            </button>
            <button type="button" class="btn" :class="mode === 'signup' ? 'btn-primary' : 'btn-outline-primary'" @click="switchMode('signup')">
              Sign up
            </button>
          </div>

          <!-- :key="mode" builds a fresh form when switching tabs, so password managers see a new
               sign up form, instead of the log in form with an extra field (they then fill it wrongly) -->
          <form :key="mode" novalidate @submit.prevent="submit">
            <div v-if="mode === 'signup'" class="mb-3">
              <label for="nameInput" class="form-label">Name</label>
              <input
                id="nameInput"
                v-model="name"
                name="name"
                type="text"
                class="form-control"
                maxlength="30"
                autocomplete="name"
              />
            </div>

            <div class="mb-3">
              <label for="emailInput" class="form-label">Email</label>
              <!-- autocomplete="username" (not "email") tells password managers this is the login name -->
              <input id="emailInput" v-model="email" name="username" type="email" class="form-control" autocomplete="username" />
            </div>

            <div class="mb-3">
              <label for="passwordInput" class="form-label">Password</label>
              <input
                id="passwordInput"
                v-model="password"
                name="password"
                type="password"
                class="form-control"
                :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
              />
              <div v-if="mode === 'signup'" class="form-text">At least {{ MIN_PASSWORD }} characters.</div>
              <button v-else type="button" class="btn btn-link btn-sm px-0" @click="forgotPassword">Forgot password?</button>
            </div>

            <button type="submit" class="btn btn-primary w-100" :disabled="loading">
              {{ mode === 'signup' ? 'Create account' : 'Log in' }}
            </button>
          </form>

          <p class="text-center text-muted small my-3">or</p>

          <button type="button" class="btn btn-outline-dark w-100" :disabled="loading" @click="google">
            Continue with Google
          </button>

          <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0">{{ errorMessage }}</div>
          <div v-if="infoMessage" class="alert alert-info mt-3 mb-0">{{ infoMessage }}</div>
        </div>
      </div>

      <p class="text-center small">
        Just joining a friend's room?
        <router-link :to="redirectTo">Continue as guest</router-link>
      </p>
    </div>
  </div>
</template>
