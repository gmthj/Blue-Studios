import { reactive } from 'vue'
import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase.js'

// PEOPLE'S NAMES AND PICTURES, for showing anyone anywhere (navbar, marketplace, video call...).
//
// Every account has a public profile: users/{uid} { displayName, photoURL, ... }
// We always look the person up by their uid, so a new name or picture shows up everywhere at once,
// even on things they made before they changed it.
//
// Which picture: a photo they uploaded, otherwise a DiceBear "gaze" face made from their uid.
// Guests have no profile, so they always get the DiceBear face (the same one on every device).
//
// Usage:
//   import { profileOf } from '../profiles.js'
//   profileOf(uid).name     their name ('' until loaded, or for guests)
//   profileOf(uid).avatar   the link to their picture (never empty)
// It is reactive: the template updates by itself when the profile has loaded.

// DiceBear "gaze" faces (free to use, CC0): https://www.dicebear.com/styles/gaze/
// The same seed always draws the same face.
export function dicebearUrl(uid) {
  return 'https://api.dicebear.com/10.x/gaze/svg?seed=' + encodeURIComponent(uid)
}

// The picture to show, from a profile's fields
export function pickAvatar(uid, profile) {
  return (profile && profile.photoURL) || dicebearUrl(uid)
}

// uid -> { name, avatar, photoURL, loaded }. Each profile is loaded only once per visit.
const cache = reactive({})

export function profileOf(uid) {
  if (!uid) {
    return { name: '', avatar: '', photoURL: '', loaded: true }
  }
  if (!cache[uid]) {
    cache[uid] = { name: '', avatar: dicebearUrl(uid), photoURL: '', loaded: false }
    load(uid)
  }
  return cache[uid]
}

async function load(uid) {
  try {
    const snapshot = await getDoc(doc(db, 'users', uid))
    if (snapshot.exists()) {
      setProfile(uid, snapshot.data())
    }
  } catch (error) {
    console.error(error) // keep the DiceBear face
  }
  cache[uid].loaded = true
}

// Put new values in the cache, e.g. right after I change my own name or picture
export function setProfile(uid, data) {
  const entry = profileOf(uid)
  if (data.displayName !== undefined) entry.name = data.displayName
  if (data.photoURL !== undefined) entry.photoURL = data.photoURL
  entry.avatar = pickAvatar(uid, entry)
}
