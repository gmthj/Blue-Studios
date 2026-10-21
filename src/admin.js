import axios from 'axios'
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch,
} from 'firebase/firestore'
import { db, auth } from './firebase.js'

// Moderator tools for the admin page (/admin). Only accounts with the admin mark can use them:
// the security rules (firestore.rules) and /api/admin check the mark again on Firebase's side,
// so these functions simply fail for everyone else.
//
// Every action is written to adminLog, in the same batch as the change itself.

function myUid() {
  return auth.currentUser.uid
}

// A new adminLog entry, added to a batch (so the change and its log entry are saved together)
function addLog(batch, action, targetType, targetId, reason) {
  batch.set(doc(collection(db, 'adminLog')), {
    adminId: myUid(),
    action: action,
    targetType: targetType,
    targetId: targetId,
    reason: (reason || '').trim().slice(0, 300),
    createdAt: Date.now(),
  })
}

function newestFirst(list) {
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

// ---------- Reports ----------

// Open reports, newest first, grouped by item: [{ type, itemId, ownerId, reports: [...] }]
export async function listOpenReports() {
  const snapshot = await getDocs(query(collection(db, 'reports'), where('status', '==', 'open')))
  const reports = newestFirst(snapshot.docs.map((reportDoc) => ({ id: reportDoc.id, ...reportDoc.data() })))

  const groups = []
  for (const report of reports) {
    let group = groups.find((g) => g.itemId === report.itemId)
    if (!group) {
      group = { type: report.type, itemId: report.itemId, ownerId: report.ownerId, reports: [] }
      groups.push(group)
    }
    group.reports.push(report)
  }
  return groups
}

// Close every open report about one item ('resolved' = we acted on it, 'dismissed' = nothing wrong)
async function closeReports(batch, itemId, status) {
  const snapshot = await getDocs(query(collection(db, 'reports'), where('itemId', '==', itemId), where('status', '==', 'open')))
  snapshot.docs.forEach((reportDoc) => batch.update(reportDoc.ref, { status: status }))
  return snapshot.size
}

// Nothing wrong with the item: close its reports
export async function dismissReports(itemId, reason) {
  const batch = writeBatch(db)
  await closeReports(batch, itemId, 'dismissed')
  addLog(batch, 'dismissReport', 'reports', itemId, reason)
  await batch.commit()
}

// ---------- Hiding items ----------

// Hide a template or sticker from the marketplace (the owner still sees it, with a "Hidden by a
// moderator" badge). Its open reports are closed as resolved.
export async function hideItem(type, itemId, reason) {
  const batch = writeBatch(db)
  batch.update(doc(db, type, itemId), { status: 'hidden' })
  await closeReports(batch, itemId, 'resolved')
  addLog(batch, 'hide', type, itemId, reason)
  await batch.commit()
}

export async function unhideItem(type, itemId, reason) {
  const batch = writeBatch(db)
  batch.update(doc(db, type, itemId), { status: 'active' })
  addLog(batch, 'unhide', type, itemId, reason)
  await batch.commit()
}

// Everything hidden by moderators, newest first (templates and stickers together)
export async function listHiddenItems() {
  const lists = await Promise.all(['templates', 'stickers'].map(async (type) => {
    const snapshot = await getDocs(query(collection(db, type), where('status', '==', 'hidden')))
    return snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, type: type, ...itemDoc.data() }))
  }))
  return lists[0].concat(lists[1]).sort((a, b) => b.updatedAt - a.updatedAt)
}

// One item (admins can see private and hidden ones too), or null if it was deleted
export async function getAnyItem(type, itemId) {
  const itemDoc = await getDoc(doc(db, type, itemId))
  return itemDoc.exists() ? { id: itemDoc.id, type: type, ...itemDoc.data() } : null
}

// ---------- Accounts (through /api/admin, see api/admin.js) ----------

async function callAdminApi(body) {
  const idToken = await auth.currentUser.getIdToken()
  try {
    const response = await axios.post('/api/admin', body, { headers: { Authorization: 'Bearer ' + idToken } })
    return response.data
  } catch (error) {
    // Show the server's message (e.g. "No account found") instead of "Request failed with status code 404"
    const message = error.response && error.response.data && error.response.data.error
    throw new Error(message || 'Could not reach the server')
  }
}

// Find an account by email or user id: { uid, email, displayName, isAccount, disabled, banned, admin, createdAt, lastLogin }
export async function lookupAccount(emailOrUid) {
  const text = emailOrUid.trim()
  return await callAdminApi(text.includes('@') ? { action: 'lookup', email: text } : { action: 'lookup', uid: text })
}

// Ban: switches off their login, logs them out everywhere and hides all their items. Returns { hiddenCount, account }
export async function banAccount(uid, reason) {
  return await callAdminApi({ action: 'ban', uid: uid, reason: reason })
}

export async function unbanAccount(uid, reason) {
  return await callAdminApi({ action: 'unban', uid: uid, reason: reason })
}

// Banned accounts: [{ uid, displayName, createdAt }]
export async function listBannedAccounts() {
  const snapshot = await getDocs(query(collection(db, 'users'), where('banned', '==', true)))
  return snapshot.docs.map((profile) => ({ uid: profile.id, ...profile.data() }))
}

// ---------- Rooms ----------

// A room and its photos (admins can see the photos of any room)
export async function getRoomWithPhotos(code) {
  const roomDoc = await getDoc(doc(db, 'rooms', code))
  if (!roomDoc.exists()) return null
  const photos = await getDocs(collection(db, 'rooms', code, 'photos'))
  return {
    code: code,
    ...roomDoc.data(),
    photos: photos.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() })).sort((a, b) => a.createdAt - b.createdAt),
  }
}

export async function closeRoom(code, reason) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'rooms', code), { closed: true })
  addLog(batch, 'closeRoom', 'rooms', code, reason)
  await batch.commit()
}

export async function deletePhoto(code, photoId, reason) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'rooms', code, 'photos', photoId))
  addLog(batch, 'deletePhoto', 'photos', code + '/' + photoId, reason)
  await batch.commit()
}

// ---------- Log ----------

// The latest moderator actions, newest first
export async function listAdminLog(count = 50) {
  const snapshot = await getDocs(query(collection(db, 'adminLog'), orderBy('createdAt', 'desc'), limit(count)))
  return snapshot.docs.map((logDoc) => ({ id: logDoc.id, ...logDoc.data() }))
}

// Names for user ids shown on the admin page ({ uid: 'Name' }), from their public profiles
export async function namesFor(uids) {
  const unique = [...new Set(uids.filter((uid) => uid && /^[A-Za-z0-9]+$/.test(uid)))]
  const names = {}
  await Promise.all(unique.map(async (uid) => {
    const profile = await getDoc(doc(db, 'users', uid))
    names[uid] = profile.exists() ? profile.data().displayName : ''
  }))
  return names
}
