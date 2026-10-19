import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, orderBy, limit, startAfter, writeBatch, increment,
} from 'firebase/firestore'
import { db, auth } from './firebase.js'

// The marketplace: public templates and stickers that other people can browse and save.
//
// Anyone can browse (guests too). Saving and reporting need an account.
// Saving is "by reference": users/{uid}/saved/{itemId} is just a bookmark { type, savedAt },
// the item stays with its owner. If the owner makes it private or deletes it, it disappears
// from everyone's saved list.
//
// The security rules (firestore.rules) check:
//   - only public items that an admin has not hidden can be listed, saved or reported
//   - saveCount only changes by 1, together with the saved bookmark (so it cannot be faked)
//   - each account can report an item once (the report id is itemId_uid)

export const PAGE_SIZE = 24

export const REPORT_REASONS = [
  { id: 'inappropriate', label: 'Inappropriate or offensive' },
  { id: 'copyright', label: 'Copied from someone else' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Something else' },
]

function myUid() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('Log in to save or report')
  }
  return auth.currentUser.uid
}

function toItem(type, itemDoc) {
  return { id: itemDoc.id, type: type, ...itemDoc.data() }
}

// ---------- Browsing ----------

// One page of public templates or stickers.
//   type: 'templates' or 'stickers'
//   category: a category id from CATEGORIES in studio.js, or '' for all
//   sort: 'newest' or 'popular' (most saved)
//   after: the cursor from the previous page, to load the next one
// Each combination needs an index in firestore.indexes.json (deployed with the rules).
export async function listPublicItems({ type, category = '', sort = 'newest', after = null }) {
  const constraints = [where('visibility', '==', 'public'), where('status', '==', 'active')]
  if (category) {
    constraints.push(where('categories', 'array-contains', category))
  }
  constraints.push(orderBy(sort === 'popular' ? 'saveCount' : 'createdAt', 'desc'))
  if (after) {
    constraints.push(startAfter(after))
  }
  constraints.push(limit(PAGE_SIZE))

  const snapshot = await getDocs(query(collection(db, type), ...constraints))
  return {
    items: snapshot.docs.map((itemDoc) => toItem(type, itemDoc)),
    cursor: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.docs.length === PAGE_SIZE,
  }
}

// One item, or null if it does not exist or I am not allowed to see it (private, hidden)
export async function getItem(type, itemId) {
  try {
    const itemDoc = await getDoc(doc(db, type, itemId))
    return itemDoc.exists() ? toItem(type, itemDoc) : null
  } catch (error) {
    if (error.code === 'permission-denied') return null
    throw error
  }
}

// ---------- Saving ----------

function savedRef(itemId) {
  return doc(db, 'users', myUid(), 'saved', itemId)
}

export async function isSaved(itemId) {
  return (await getDoc(savedRef(itemId))).exists()
}

// Save: add my bookmark and add 1 to the item's saveCount, both at once (the rules need both)
export async function saveItem(item) {
  const batch = writeBatch(db)
  batch.set(savedRef(item.id), { type: item.type, savedAt: Date.now() })
  batch.update(doc(db, item.type, item.id), { saveCount: increment(1) })
  await batch.commit()
}

// Unsave: remove my bookmark and take 1 off the item's saveCount
export async function unsaveItem(type, itemId) {
  const batch = writeBatch(db)
  batch.delete(savedRef(itemId))
  batch.update(doc(db, type, itemId), { saveCount: increment(-1) })
  try {
    await batch.commit()
  } catch (error) {
    // The owner deleted the item, so there is no saveCount to change: just remove the bookmark
    await deleteDoc(savedRef(itemId))
  }
}

// Everything I saved, newest first. item is null if it is no longer available
// (the owner made it private or deleted it, or an admin hid it).
export async function listMySaved() {
  const snapshot = await getDocs(collection(db, 'users', myUid(), 'saved'))
  const saved = await Promise.all(snapshot.docs.map(async (savedDoc) => {
    const data = savedDoc.data()
    return { id: savedDoc.id, type: data.type, savedAt: data.savedAt, item: await getItem(data.type, savedDoc.id) }
  }))
  saved.sort((a, b) => b.savedAt - a.savedAt)
  return saved
}

// ---------- Reporting ----------

function reportRef(item) {
  return doc(db, 'reports', item.id + '_' + myUid())
}

export async function hasReported(item) {
  return (await getDoc(reportRef(item))).exists()
}

// Flag an item for the admins. reason: an id from REPORT_REASONS; details: up to 300 characters
export async function reportItem(item, reason, details) {
  await setDoc(reportRef(item), {
    type: item.type,
    itemId: item.id,
    ownerId: item.ownerId,
    reporterId: myUid(),
    reason: reason,
    details: details.trim().slice(0, 300),
    status: 'open',
    createdAt: Date.now(),
  })
}
