import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, arrayUnion } from 'firebase/firestore'
import { db, auth } from './firebase.js'

// Personal sticker folders. This file is new, so none of Gabriel's files (studio.js etc.) change.
// Each folder is one small Firestore document in the "stickerCategories" collection:
//   { ownerId, name, stickerIds: [...], createdAt, updatedAt }
// A folder only stores the IDS of stickers, not the stickers themselves, so renaming a
// folder never breaks anything, and a sticker can sit in many folders.

// The 5 public categories shown as pills. The ids must be ones that firestore.rules accepts
// (they are a subset of CATEGORIES in studio.js).
export const DEFAULT_CATEGORIES = [
  { id: 'friends', label: 'Friends' },
  { id: 'love', label: 'Love' },
  { id: 'cute', label: 'Cute' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'other', label: 'Other' },
]

export const MAX_FOLDER_NAME = 20 // matches the 1-20 character name rule used elsewhere in firestore.rules
export const MAX_FOLDERS = 20     // a client-side cap so one user cannot make endless folders

// Only logged-in accounts have folders (guests cannot save anything)
function myUid() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('Log in to use sticker folders')
  }
  return auth.currentUser.uid
}

// Get all my folders, oldest first so the pills stay in a stable order
export async function listMyFolders() {
  const snapshot = await getDocs(query(collection(db, 'stickerCategories'), where('ownerId', '==', myUid())))
  const folders = []
  snapshot.forEach((d) => folders.push({ id: d.id, ...d.data() }))
  // Sorted here instead of in the query, so Firestore does not need an extra index (same trick as studio.js)
  folders.sort((a, b) => a.createdAt - b.createdAt)
  return folders
}

// Make a new, empty folder and return it (so the screen can show it straight away)
export async function createFolder(name) {
  const cleanName = name.trim()
  if (cleanName.length < 1 || cleanName.length > MAX_FOLDER_NAME) {
    throw new Error('Folder name must be 1 to ' + MAX_FOLDER_NAME + ' characters.')
  }
  const now = Date.now()
  const folderRef = doc(collection(db, 'stickerCategories')) // asks Firestore for a fresh random id
  const folder = { ownerId: myUid(), name: cleanName, stickerIds: [], createdAt: now, updatedAt: now }
  await setDoc(folderRef, folder)
  return { id: folderRef.id, ...folder }
}

// Rename a folder (only name + updatedAt change, so the stickers inside are untouched)
export async function renameFolder(folderId, name) {
  const cleanName = name.trim()
  if (cleanName.length < 1 || cleanName.length > MAX_FOLDER_NAME) {
    throw new Error('Folder name must be 1 to ' + MAX_FOLDER_NAME + ' characters.')
  }
  await updateDoc(doc(db, 'stickerCategories', folderId), { name: cleanName, updatedAt: Date.now() })
  return cleanName
}

// Delete a folder. The stickers inside are NOT deleted, they stay in My Studio.
export async function deleteFolder(folderId) {
  await deleteDoc(doc(db, 'stickerCategories', folderId))
}

// Put one sticker into several folders. arrayUnion adds the id only if it is not there already,
// so pressing Save twice can never create duplicates.
export async function addStickerToFolders(stickerId, folderIds) {
  for (const folderId of folderIds) {
    await updateDoc(doc(db, 'stickerCategories', folderId), {
      stickerIds: arrayUnion(stickerId),
      updatedAt: Date.now(),
    })
  }
}