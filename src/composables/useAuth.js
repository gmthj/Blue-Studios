import { ref, computed } from 'vue'
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  linkWithCredential,
  linkWithPopup,
  EmailAuthProvider,
  GoogleAuthProvider,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.js'

// SHARED login state for the whole app.
//
// Everyone has a Firebase Auth user, even guests: a guest is signed in "anonymously" (no email
// or password) the first time they open the app. This gives every device a real user id (uid)
// that Firebase checks itself, so the Firestore security rules can tell who is writing.
// Firebase remembers the user in the browser, so refreshing the page keeps the same uid.
//
// A guest can turn into an account (sign up or Google) WITHOUT changing their uid: Firebase
// "links" the email/Google login to the guest user. So anything they made as a guest stays theirs.
//
// Usage in a page:
//   const { user, isAccount, signUp, logIn, logInWithGoogle, logOut } = useAuth()
//   user.value.uid, user.value.displayName, user.value.email, user.value.emailVerified
//   getUid()   my uid as a plain string (outside templates)

// A plain copy of the Firebase user (Vue cannot see changes inside Firebase's own user object,
// so we copy the fields we need, and copy again whenever they change)
const user = ref(null)
const authError = ref('') // shown by App.vue if we could not sign in at all

// true for people with an account (email or Google), false for guests
const isAccount = computed(() => user.value !== null && !user.value.isAnonymous)

function copyUser(firebaseUser) {
  user.value = {
    uid: firebaseUser.uid,
    isAnonymous: firebaseUser.isAnonymous,
    displayName: firebaseUser.displayName || '',
    email: firebaseUser.email || '',
    emailVerified: firebaseUser.emailVerified,
  }
}

// Called once by main.js BEFORE the app is shown, so every page can rely on having a user.
// Resolves when Firebase has told us who is signed in (signing in as a guest if nobody is).
export function startAuth() {
  return new Promise((resolve) => {
    let started = false

    // Firebase calls this when the page loads, and again whenever the user logs in or out
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser === null) {
        // Nobody signed in (first visit, or just logged out): sign in as a guest.
        // This calls onAuthStateChanged again with the new user.
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

      // Firebase remembers the user from last time, so "emailVerified" can be out of date
      // (they may have clicked the link in the email since). Ask Firebase for the latest.
      if (!firebaseUser.isAnonymous && !firebaseUser.emailVerified) {
        try {
          await firebaseUser.reload()
        } catch (error) {
          console.error(error)
        }
      }

      copyUser(firebaseUser)
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

// ---------- Profile ----------

// Every account has a public profile in Firestore: users/{uid} { displayName, createdAt }.
// The email is NOT copied there (only Firebase Auth knows it), so other people cannot see it.
async function saveProfile(displayName) {
  // After linking, the login token still says "guest" until we ask Firebase for a fresh one.
  // The security rules only let accounts (not guests) write a profile, so refresh it first.
  await auth.currentUser.getIdToken(true)

  const profileRef = doc(db, 'users', auth.currentUser.uid)
  const existing = await getDoc(profileRef)
  if (existing.exists()) {
    await setDoc(profileRef, { displayName: displayName }, { merge: true })
  } else {
    await setDoc(profileRef, { displayName: displayName, createdAt: Date.now() })
  }
}

// Google gives us the person's full name. Keep it within our 30 character limit.
// When a GUEST links Google, Firebase does not copy the Google name onto the user (the guest had
// no name), so we also look in providerData: the list of logins on this user, one of them Google's.
function googleName(firebaseUser) {
  const google = firebaseUser.providerData.find((info) => info.providerId === 'google.com')
  const name = firebaseUser.displayName || (google && google.displayName) || 'Blue Studios user'
  return name.trim().slice(0, 30)
}

// ---------- Sign up, log in, log out ----------

// Create an account with email + password. The current guest user BECOMES the account (same uid).
async function signUp(displayName, email, password) {
  const credential = EmailAuthProvider.credential(email, password)
  const result = await linkWithCredential(auth.currentUser, credential)
  await updateProfile(result.user, { displayName: displayName })
  await saveProfile(displayName)

  // Ask them to confirm their email (needed later to publish to the marketplace)
  try {
    await sendEmailVerification(result.user)
  } catch (error) {
    console.error(error) // not a reason to fail the sign up
  }
  copyUser(result.user)
}

// Log in to an existing account. (Anything done as a guest on this device stays with the guest.)
async function logIn(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  copyUser(result.user)
}

// Log in or sign up with Google, in a popup window.
async function logInWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' }) // always let them pick which Google account

  let result
  if (auth.currentUser && auth.currentUser.isAnonymous) {
    try {
      // New to Blue Studios: the guest user becomes a Google account (same uid)
      result = await linkWithPopup(auth.currentUser, provider)
    } catch (error) {
      // This Google account already has a Blue Studios account: just log in to it
      if (error.code !== 'auth/credential-already-in-use') throw error
      result = await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(error))
    }
  } else {
    result = await signInWithPopup(auth, provider)
  }

  // First Google login: make their profile. Later logins: keep the name they already have.
  const profile = await getDoc(doc(db, 'users', result.user.uid))
  if (!profile.exists()) {
    const name = googleName(result.user)
    if (!result.user.displayName) {
      await updateProfile(result.user, { displayName: name }) // so the navbar shows it too
    }
    await saveProfile(name)
  }
  copyUser(result.user)
}

// Log out. startAuth() then signs this device in as a new guest automatically.
async function logOut() {
  await signOut(auth)
}

async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email)
}

async function resendVerification() {
  await sendEmailVerification(auth.currentUser)
}

// Turn Firebase's error codes into a message people can understand.
// (We never say whether an email has an account when logging in, so nobody can check who uses the app.)
export function authErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-login-credentials': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/email-already-in-use': 'That email already has an account. Try logging in instead.',
    'auth/credential-already-in-use': 'That login is already used by another account.',
    'auth/weak-password': 'Please choose a stronger password (at least 8 characters).',
    'auth/password-does-not-meet-requirements': 'Please choose a stronger password (at least 8 characters).',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/user-disabled': 'This account has been suspended.',
    'auth/popup-closed-by-user': 'The Google window was closed before finishing.',
    'auth/cancelled-popup-request': 'The Google window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow popups for this site and try again.',
    'auth/network-request-failed': 'Could not connect. Check your internet connection.',
  }
  return messages[error.code] || 'Something went wrong. Please try again.'
}

export function useAuth() {
  return { user, isAccount, authError, signUp, logIn, logInWithGoogle, logOut, resetPassword, resendVerification }
}
