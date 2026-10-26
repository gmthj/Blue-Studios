<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth, authErrorMessage } from '../composables/useAuth.js'
import { getGuestName } from '../guest.js'
import AppIcon from '../components/AppIcon.vue'

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
const showPassword = ref(false) // the eye button: show the password as plain text

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
  showPassword.value = false
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
  <div class="app-page auth-page">
    <div class="auth-box">
      <!-- Logo and title -->
      <div class="auth-head">
        <img src="/images/logo-mark.png" alt="" class="auth-logo" width="44" height="62" />
        <h1 class="auth-title">{{ mode === 'signup' ? 'Create your account' : 'Welcome back' }}</h1>
        <p class="auth-sub">
          {{ mode === 'signup'
            ? 'Save your photostrips, make templates and stickers, and share them in the marketplace.'
            : 'Log in to see your studio and saved photostrips.' }}
        </p>
      </div>

      <div class="card auth-card">
        <div class="card-body">
          <!-- Log in / Sign up tabs -->
          <div class="seg-tabs auth-tabs" role="tablist" aria-label="Log in or sign up">
            <button
              type="button" class="seg-tab" :class="{ active: mode === 'login' }" role="tab" :aria-selected="mode === 'login'"
              @click="switchMode('login')"
            >Log in</button>
            <button
              type="button" class="seg-tab" :class="{ active: mode === 'signup' }" role="tab" :aria-selected="mode === 'signup'"
              @click="switchMode('signup')"
            >Sign up</button>
          </div>

          <!-- Google first: one tap, no password to remember -->
          <button type="button" class="btn google-btn w-100" :disabled="loading" @click="google">
            <!-- Google's "G" (their sign-in buttons use it) -->
            <svg class="google-g" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>

          <div class="or-divider"><span>or with email</span></div>

          <!-- :key="mode" builds a fresh form when switching tabs, so password managers see a new
               sign up form, instead of the log in form with an extra field (they then fill it wrongly) -->
          <form :key="mode" novalidate @submit.prevent="submit">
            <div v-if="mode === 'signup'" class="field">
              <label for="nameInput" class="field-label">Name</label>
              <input
                id="nameInput"
                v-model="name"
                name="name"
                type="text"
                class="form-control auth-input"
                maxlength="30"
                autocomplete="name"
                placeholder="e.g. Cha Eun-woo"
              />
            </div>

            <div class="field">
              <label for="emailInput" class="field-label">Email</label>
              <!-- autocomplete="username" (not "email") tells password managers this is the login name -->
              <input
                id="emailInput"
                v-model="email"
                name="username"
                type="email"
                class="form-control auth-input"
                autocomplete="username"
                placeholder="you@example.com"
              />
            </div>

            <div class="field">
              <div class="d-flex justify-content-between align-items-baseline">
                <label for="passwordInput" class="field-label">Password</label>
                <button v-if="mode === 'login'" type="button" class="btn btn-link btn-sm p-0 forgot" @click="forgotPassword">
                  Forgot password?
                </button>
              </div>
              <!-- The eye button shows the password as text, so it can be checked before sending -->
              <div class="password-box">
                <input
                  id="passwordInput"
                  v-model="password"
                  name="password"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-control auth-input"
                  :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
                />
                <button
                  type="button"
                  class="eye-btn"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                >
                  <AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="18" />
                </button>
              </div>
              <p v-if="mode === 'signup'" class="hint">At least {{ MIN_PASSWORD }} characters.</p>
            </div>

            <div v-if="errorMessage" class="auth-message error" role="alert">{{ errorMessage }}</div>
            <div v-if="infoMessage" class="auth-message info" role="status">{{ infoMessage }}</div>

            <button type="submit" class="btn btn-primary btn-lg w-100 submit-btn" :disabled="loading">
              <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              {{ mode === 'signup' ? 'Create account' : 'Log in' }}
            </button>
          </form>
        </div>
      </div>

      <p class="guest-line">
        Just joining a friend's room?
        <router-link :to="redirectTo">Continue as guest</router-link>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* The card in the middle of the page */
.auth-page {
  display: flex;
  justify-content: center;
  padding: 8px 0 40px;
}

.auth-box {
  width: 100%;
  max-width: 420px;
}

.auth-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
  text-align: center;
}

.auth-logo {
  width: auto;
  height: 62px;
  margin-bottom: 12px;
  transform: rotate(-4deg);
}

.auth-title {
  margin: 0 0 6px;
  font-size: clamp(1.6rem, 1.4rem + 1vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.auth-sub {
  max-width: 340px;
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  text-wrap: balance;
}

.auth-card {
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04), 0 16px 40px rgba(20, 23, 43, 0.07);
}

.auth-card .card-body {
  padding: 22px;
}

@media (min-width: 576px) {
  .auth-card .card-body {
    padding: 28px;
  }
}

/* The Log in / Sign up tabs fill the card's width */
.auth-tabs {
  display: flex;
  width: 100%;
  margin-bottom: 20px;
}

.auth-tabs .seg-tab {
  flex: 1;
  justify-content: center;
}

/* ---------- Google button ---------- */
.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 46px;
  border: 1px solid var(--line);
  color: var(--ink);
  background: #ffffff;
  font-weight: 600;
}

.google-btn:hover:not(:disabled) {
  border-color: #C9CEDB;
  background: var(--soft);
}

.google-g {
  width: 18px;
  height: 18px;
}

/* A line with words in the middle */
.or-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  color: var(--muted);
  font-size: 0.8rem;
}

.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}

/* ---------- Fields ---------- */
.field {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.85rem;
  font-weight: 700;
}

/* font-size 16px: smaller makes iPhones zoom in when the box is tapped */
.auth-input {
  height: 46px;
  font-size: 16px;
}

.forgot {
  font-size: 0.8rem;
}

/* The eye button sits inside the password box, on the right */
.password-box {
  position: relative;
}

.password-box .auth-input {
  padding-right: 46px;
}

.eye-btn {
  position: absolute;
  top: 50%;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--muted);
  background: transparent;
  transform: translateY(-50%);
}

.eye-btn:hover {
  color: var(--ink);
  background: var(--soft);
}

.eye-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

.hint {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}

/* ---------- Messages and submit ---------- */
.auth-message {
  margin-bottom: 14px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.875rem;
}

.auth-message.error {
  color: #B42318;
  background: #FEF3F2;
}

.auth-message.info {
  color: #1E40AF;
  background: var(--brand-tint);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;
  margin-top: 4px;
  font-size: 1rem;
}

.guest-line {
  margin: 18px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  text-align: center;
}

.guest-line a {
  font-weight: 600;
}
</style>
