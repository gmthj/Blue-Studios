import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, arrayUnion } from 'firebase/firestore'
import { db, auth } from './firebase.js'

// Personal folders, now shared by stickers (mine) and templates (Joash's).
// Each folder is one small Firestore document in the "stickerCategories" collection:
//   { ownerId, name, type, itemIds: [...], createdAt, updatedAt }
// "type" is 'sticker' or 'template', so one collection serves both pages instead of
// Joash building a second, near-identical folder system.
// A folder stores only the IDS of the items, not the items themselves, so renaming a
// folder never breaks anything, and one item can sit in many folders.

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

// The only two kinds of folder allowed. Anything else is a typo, so we refuse it early
// rather than writing a folder no page will ever show.
const FOLDER_TYPES = ['sticker', 'template']

// Only logged-in accounts have folders (guests cannot save anything)
function myUid() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('Log in to use folders')
  }
  return auth.currentUser.uid
}

// Get my folders of one type, oldest first so the pills stay in a stable order.
// listMyFolders() with no argument means stickers, so existing calls keep working.
export async function listMyFolders(type = 'sticker') {
  const snapshot = await getDocs(query(collection(db, 'stickerCategories'), where('ownerId', '==', myUid())))
  const folders = []
  snapshot.forEach((d) => {
    const data = d.data()
    folders.push({
      id: d.id,
      ...data,
      // Folders created before this change have no "type" and store "stickerIds".
      // Reading the old field as a fallback means the old test folders keep working
      // instead of silently disappearing from the screen.
      type: data.type || 'sticker',
      itemIds: data.itemIds || data.stickerIds || [],
    })
  })
  // Sorted here instead of in the query, so Firestore does not need an extra index (same trick as studio.js)
  folders.sort((a, b) => a.createdAt - b.createdAt)
  // Only hand back the folders that belong to the page that asked
  return folders.filter((f) => f.type === type)
}

// Make a new, empty folder and return it (so the screen can show it straight away)
export async function createFolder(name, type = 'sticker') {
  if (!FOLDER_TYPES.includes(type)) throw new Error('Unknown folder type')
  const cleanName = name.trim()
  if (cleanName.length < 1 || cleanName.length > MAX_FOLDER_NAME) {
    throw new Error('Folder name must be 1 to ' + MAX_FOLDER_NAME + ' characters.')
  }
  const now = Date.now()
  const folderRef = doc(collection(db, 'stickerCategories')) // asks Firestore for a fresh random id
  const folder = { ownerId: myUid(), name: cleanName, type, itemIds: [], createdAt: now, updatedAt: now }
  await setDoc(folderRef, folder)
  return { id: folderRef.id, ...folder }
}

// Rename a folder (only name + updatedAt change, so the items inside are untouched)
export async function renameFolder(folderId, name) {
  const cleanName = name.trim()
  if (cleanName.length < 1 || cleanName.length > MAX_FOLDER_NAME) {
    throw new Error('Folder name must be 1 to ' + MAX_FOLDER_NAME + ' characters.')
  }
  await updateDoc(doc(db, 'stickerCategories', folderId), { name: cleanName, updatedAt: Date.now() })
  return cleanName
}

// Delete a folder. The items inside are NOT deleted, they stay in My Studio.
export async function deleteFolder(folderId) {
  await deleteDoc(doc(db, 'stickerCategories', folderId))
}

// Put one item into several folders. arrayUnion adds the id only if it is not there already,
// so pressing Save twice can never create duplicates.
export async function addItemToFolders(itemId, folderIds) {
  for (const folderId of folderIds) {
    await updateDoc(doc(db, 'stickerCategories', folderId), {
      itemIds: arrayUnion(itemId),
      updatedAt: Date.now(),
    })
  }
}