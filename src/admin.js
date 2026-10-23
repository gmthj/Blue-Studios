import axios from 'axios'
import {
  collection, collectionGroup, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch, getCountFromServer,
} from 'firebase/firestore'
import { ref, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, auth, storage } from './firebase.js'

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

// How many documents match a query (counted by Firebase, without downloading them)
async function countOf(path, ...constraints) {
  const snapshot = await getCountFromServer(query(collection(db, path), ...constraints))
  return snapshot.data().count
}

// ---------- Overview ----------

// The numbers on the Overview tab
export async function getOverview() {
  const [
    accounts, banned, rooms, openRooms, templates, publicTemplates, hiddenTemplates,
    stickers, publicStickers, hiddenStickers, strips, openReports,
  ] = await Promise.all([
    countOf('users'),
    countOf('users', where('banned', '==', true)),
    countOf('rooms'),
    countOf('rooms', where('closed', '==', false)),
    countOf('templates'),
    countOf('templates', where('visibility', '==', 'public')),
    countOf('templates', where('status', '==', 'hidden')),
    countOf('stickers'),
    countOf('stickers', where('visibility', '==', 'public')),
    countOf('stickers', where('status', '==', 'hidden')),
    countOf('strips'),
    countOf('reports', where('status', '==', 'open')),
  ])
  return {
    accounts, banned, rooms, openRooms, templates, publicTemplates, hiddenTemplates,
    stickers, publicStickers, hiddenStickers, strips, openReports,
  }
}

// ---------- Reports ----------

// Reports, newest first, grouped by item: [{ type, itemId, ownerId, reports: [...], open }]
// status: 'open' | 'resolved' | 'dismissed' | 'all'
export async function listReports(status = 'open') {
  const reportsQuery = status === 'all'
    ? collection(db, 'reports')
    : query(collection(db, 'reports'), where('status', '==', status))
  const snapshot = await getDocs(reportsQuery)
  const reports = newestFirst(snapshot.docs.map((reportDoc) => ({ id: reportDoc.id, ...reportDoc.data() })))

  const groups = []
  for (const report of reports) {
    let group = groups.find((g) => g.itemId === report.itemId)
    if (!group) {
      group = { type: report.type, itemId: report.itemId, ownerId: report.ownerId, reports: [], open: false }
      groups.push(group)
    }
    group.reports.push(report)
    if (report.status === 'open') group.open = true
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

// ---------- Templates and stickers ----------

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

// Every template and sticker (public, private and hidden), newest first, up to `count` of each
export async function listItems(count = 500) {
  const lists = await Promise.all(['templates', 'stickers'].map(async (type) => {
    const snapshot = await getDocs(query(collection(db, type), orderBy('createdAt', 'desc'), limit(count)))
    return snapshot.docs.map((itemDoc) => ({ id: itemDoc.id, type: type, ...itemDoc.data() }))
  }))
  return newestFirst(lists[0].concat(lists[1]))
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

// Every login, accounts and guests, 1000 at a time: { accounts: [...like lookupAccount], nextPageToken }
// Pass the nextPageToken of the previous page to get the next one ('' means there are no more).
export async function listAccounts(pageToken = '') {
  return await callAdminApi({ action: 'list', pageToken: pageToken })
}

// The first page of logins is slow to get (the server reads them all from Firebase Auth), so it is
// kept while the admin page is open: the admin page starts loading it straight away (prefetchAccounts),
// and the Accounts tab shows it at once. It is fetched again when it is over 5 minutes old.
const ACCOUNTS_MAX_AGE = 5 * 60 * 1000
let firstPage = null // { promise, at }

export function prefetchAccounts() {
  if (!firstPage || Date.now() - firstPage.at > ACCOUNTS_MAX_AGE) {
    const promise = listAccounts()
    promise.catch(() => {
      if (firstPage && firstPage.promise === promise) firstPage = null // try again next time
    })
    firstPage = { promise: promise, at: Date.now() }
  }
  return firstPage.promise
}

// The first page, fresh (for Refresh, and after a ban or unban)
export function reloadAccounts() {
  firstPage = null
  return prefetchAccounts()
}

// Ban: switches off their login, logs them out everywhere and hides all their items. Returns { hiddenCount, account }
export async function banAccount(uid, reason) {
  return await callAdminApi({ action: 'ban', uid: uid, reason: reason })
}

export async function unbanAccount(uid, reason) {
  return await callAdminApi({ action: 'unban', uid: uid, reason: reason })
}

// What an account has made and reported: { templates, stickers, strips, reportsAgainst, reportsFiled }
export async function getAccountActivity(uid) {
  const [templates, stickers, strips, reportsAgainst, reportsFiled] = await Promise.all([
    countOf('templates', where('ownerId', '==', uid)),
    countOf('stickers', where('ownerId', '==', uid)),
    countOf('strips', where('ownerId', '==', uid)),
    countOf('reports', where('ownerId', '==', uid)),
    countOf('reports', where('reporterId', '==', uid)),
  ])
  return { templates, stickers, strips, reportsAgainst, reportsFiled }
}

// ---------- Rooms ----------

// The newest rooms, open and closed, each with everyone who joined it:
// [{ code, hostName, closed, createdAt, ..., members: [{ id, name, deviceType, joinedAt, lastSeen }] }]
export async function listRooms(count = 200) {
  const [rooms, members] = await Promise.all([
    getDocs(query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(count))),
    getDocs(collectionGroup(db, 'members')), // the members of every room, in one query
  ])
  const membersByRoom = {}
  members.docs.forEach((memberDoc) => {
    const room = memberDoc.ref.parent.parent
    if (!room || room.parent.id !== 'rooms') return
    if (!membersByRoom[room.id]) membersByRoom[room.id] = []
    membersByRoom[room.id].push({ id: memberDoc.id, ...memberDoc.data() })
  })
  return rooms.docs.map((roomDoc) => ({
    code: roomDoc.id,
    ...roomDoc.data(),
    members: (membersByRoom[roomDoc.id] || []).sort((a, b) => a.joinedAt - b.joinedAt),
  }))
}

// A room with its members, photos and video clips (admins can see these in any room).
// Clips are recorded on the camera page in Video mode (clips.js): the file is in Storage and
// rooms/{code}/clips/{clipId} points to it. Each clip gets a `url` to play it ('' if the file is missing).
export async function getRoomWithPhotos(code) {
  const roomDoc = await getDoc(doc(db, 'rooms', code))
  if (!roomDoc.exists()) return null
  const [members, photos, clips] = await Promise.all([
    getDocs(collection(db, 'rooms', code, 'members')),
    getDocs(collection(db, 'rooms', code, 'photos')),
    getDocs(collection(db, 'rooms', code, 'clips')),
  ])
  const clipList = await Promise.all(clips.docs.map(async (clipDoc) => {
    const clip = { id: clipDoc.id, ...clipDoc.data() }
    clip.url = clip.path ? await getDownloadURL(ref(storage, clip.path)).catch(() => '') : ''
    return clip
  }))
  return {
    code: code,
    ...roomDoc.data(),
    members: members.docs.map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() })).sort((a, b) => a.joinedAt - b.joinedAt),
    photos: photos.docs.map((photoDoc) => ({ id: photoDoc.id, ...photoDoc.data() })).sort((a, b) => a.createdAt - b.createdAt),
    clips: clipList.sort((a, b) => a.createdAt - b.createdAt),
  }
}

export async function closeRoom(code, reason) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'rooms', code), { closed: true })
  addLog(batch, 'closeRoom', 'rooms', code, reason)
  await batch.commit()
}

// Delete a room and everything in it, for good (through /api/admin: only the server can delete a
// room's sub-lists). If it is still open, it is closed first so everyone inside is sent home.
export async function deleteRoom(code, reason) {
  return await callAdminApi({ action: 'deleteRoom', code: code, reason: reason })
}

export async function deletePhoto(code, photoId, reason) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'rooms', code, 'photos', photoId))
  addLog(batch, 'deletePhoto', 'photos', code + '/' + photoId, reason)
  await batch.commit()
}

// Delete a video clip: its file in Storage, then the document that points to it.
// Edited videos that used it simply skip it from then on (resolveTimeline in clips.js).
export async function deleteClip(code, clip, reason) {
  if (clip.path) {
    await deleteObject(ref(storage, clip.path)).catch((error) => {
      if (error.code !== 'storage/object-not-found') throw error // already gone is fine
    })
  }
  const batch = writeBatch(db)
  batch.delete(doc(db, 'rooms', code, 'clips', clip.id))
  addLog(batch, 'deleteClip', 'clips', code + '/' + clip.id, reason)
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
