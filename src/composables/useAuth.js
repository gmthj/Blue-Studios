import { ref } from 'vue'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { auth } from '../firebase.js'

// SHARED login state for the whole app.
//
// Everyone has a Firebase Auth user, even guests: a guest is signed in "anonymously" (no email
// or password) the first time they open the app. This gives every device a real user id (uid)
// that Firebase checks itself, so the Firestore security rules can tell who is writing.
// Firebase remembers the user in the browser, so refreshing the page keeps the same uid.
//
// Usage in a page:
//   const { user } = useAuth()     user.value.uid, user.value.isAnonymous
//   getUid()                       my uid as a plain string (outside templates)

const user = ref(null)     // the Firebase user, or null before startAuth() finishes
const authError = ref('')  // shown by App.vue if we could not sign in at all

// Called once by main.js BEFORE the app is shown, so every page can rely on having a user.
// Resolves when Firebase has told us who is signed in (signing in as a guest if nobody is).
export function startAuth() {
  return new Promise((resolve) => {
    let started = false

    // Firebase calls this when the page loads, and again whenever the user logs in or out
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser === null) {
        // Nobody signed in yet: sign in as a guest. This calls onAuthStateChanged again with the new user.
        try {
          await signInAnonymously(auth)
        } catch (error) {
          console.error(error)
          authError.value = 'Could not connect to Blue Studios. Check your internet connection and refresh.'
          started = true
          resolve()
        }
        return
      }

      user.value = firebaseUser
      if (!started) {
        started = true
        resolve()
      }
    })
  })
}

// My uid, e.g. 'Xk3v9...' (28 letters and numbers)
export function getUid() {
  return user.value ? user.value.uid : ''
}

export function useAuth() {
  return { user, authError }
}
