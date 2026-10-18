// Firebase Admin: the SERVER version of Firebase, used by our api/ functions.
// Files in a folder starting with "_" are not turned into web addresses by Vercel,
// so this file can only be imported by other api/ files, never opened in a browser.
//
// It uses a service account (a secret key for our Firebase project) from the
// FIREBASE_SERVICE_ACCOUNT environment variable: the key's .json file turned into base64 text.
// The Admin SDK skips the security rules, so it must ONLY run on the server.

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Set up Firebase Admin once (Vercel can reuse the same server for many requests)
function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0]
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
  }
  const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
  return initializeApp({ credential: cert(JSON.parse(json)) })
}

export function adminAuth() {
  return getAuth(getAdminApp())
}

export function adminDb() {
  return getFirestore(getAdminApp())
}

// Who is calling? The browser sends its Firebase ID token in the header
//   Authorization: Bearer <token>
// We ask Firebase to check the token (signature, expiry, and that the user has not been
// disabled or logged out everywhere). Returns the checked user info, e.g. { uid, admin, ... },
// or null if there is no valid token.
export async function getCaller(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    return null
  }
  try {
    return await adminAuth().verifyIdToken(header.slice('Bearer '.length), true) // true: also check revoked
  } catch (error) {
    return null
  }
}
