import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

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
