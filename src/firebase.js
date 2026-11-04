import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getStorage, connectStorageEmulator } from 'firebase/storage'

// The values come from the .env file (locally) or Vercel's Environment Variables (when deployed).
// Vite only puts variables that start with VITE_ into the frontend, using import.meta.env.
// These values are not secret passwords: they only identify which Firebase project to talk to.
// Access to the data is controlled by the Firestore security rules.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

// db is imported by any page that needs to read or write data
export const db = getFirestore(app)

// auth is used by composables/useAuth.js (who is signed in)
export const auth = getAuth(app)

// storage is used for files (template previews, stickers, saved strips): see studio.js
export const storage = getStorage(app)

// End-to-end tests (npm run test:e2e) set VITE_USE_EMULATORS=true (see playwright.config.js), so the app talks to
// local copies of Auth, Firestore and Storage (the "emulators") instead of the real project.
// The tests can then make accounts and admins freely, and never touch real data.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
}
