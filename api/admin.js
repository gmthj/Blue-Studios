// Vercel serverless function: POST /api/admin   (moderators only)
// Header: Authorization: Bearer <Firebase ID token of an admin>
// Body (JSON), one of:
//   { action: 'lookup', email: 'someone@example.com' }   find an account by email
//   { action: 'lookup', uid: 'Xk3v9...' }                 find an account by user id
//   { action: 'list',   pageToken: '...' }                every login (accounts and guests), 1000 at a time
//   { action: 'ban',    uid: 'Xk3v9...', reason: '...' }  block an account
//   { action: 'unban',  uid: 'Xk3v9...', reason: '...' }  let them back in
//   { action: 'deleteRoom', code: '1234', reason: '...' } delete a room and everything in it
//
// Why a server function: banning has to switch off the account's login in Firebase Auth
// (disable + log out everywhere), which only the Admin SDK can do, and the Admin SDK has full
// access to everything, so it must never run in the browser.
//
// Who is an admin: an account with the custom claim admin: true inside its login token.
// Only scripts/set-admin.mjs (run by Gabriel on a laptop with the secret key) can give that mark.

import { adminAuth, adminDb, getCaller } from './_lib/firebaseAdmin.js'

const UID_PATTERN = /^[A-Za-z0-9]{1,128}$/

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 1. Who is asking? (checked by Firebase, including "not banned or logged out everywhere")
    const caller = await getCaller(req)
    if (caller === null) {
      return res.status(401).json({ error: 'Please log in again' })
    }
    if (caller.admin !== true) {
      return res.status(403).json({ error: 'Admins only' })
    }

    // 2. Do what was asked
    const body = req.body || {}
    const action = String(body.action || '')
    if (action === 'lookup') {
      return await lookup(body, res)
    }
    if (action === 'list') {
      return await list(body, res)
    }
    if (action === 'ban' || action === 'unban') {
      return await changeBan(action, body, caller, res)
    }
    if (action === 'deleteRoom') {
      return await deleteRoom(body, caller, res)
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'No account found' })
    }
    console.error(error) // details only in the Vercel logs
    return res.status(500).json({ error: 'Something went wrong' })
  }
}

// ---------- lookup ----------

async function lookup(body, res) {
  let account
  if (typeof body.email === 'string' && body.email.includes('@') && body.email.length <= 254) {
    account = await adminAuth().getUserByEmail(body.email.trim())
  } else if (typeof body.uid === 'string' && UID_PATTERN.test(body.uid)) {
    account = await adminAuth().getUser(body.uid)
  } else {
    return res.status(400).json({ error: 'Give an email or a user id' })
  }
  return res.status(200).json(await describe(account))
}

// ---------- list ----------

// One page of every login, with the names and ban marks from their profiles.
// Returns { accounts: [...], nextPageToken } (nextPageToken is '' on the last page)
async function list(body, res) {
  const pageToken = typeof body.pageToken === 'string' && body.pageToken !== '' ? body.pageToken : undefined
  if (pageToken && pageToken.length > 2000) {
    return res.status(400).json({ error: 'Invalid page token' })
  }
  const page = await adminAuth().listUsers(1000, pageToken)
  const db = adminDb()
  const profiles = page.users.length > 0 ? await db.getAll(...page.users.map((account) => db.doc('users/' + account.uid))) : []
  return res.status(200).json({
    accounts: page.users.map((account, i) => summary(account, profiles[i])),
    nextPageToken: page.pageToken || '',
  })
}

// What an admin needs to see about an account (no password info, no tokens)
async function describe(account) {
  return summary(account, await adminDb().doc('users/' + account.uid).get())
}

// The same, from a login and its profile document (which guests do not have)
function summary(account, profile) {
  return {
    uid: account.uid,
    email: account.email || '',
    displayName: profile.exists ? profile.data().displayName : account.displayName || '',
    isAccount: account.providerData.length > 0, // guests (anonymous) have no email/Google login
    disabled: account.disabled,
    banned: profile.exists && profile.data().banned === true,
    admin: Boolean(account.customClaims && account.customClaims.admin),
    createdAt: account.metadata.creationTime,
    lastLogin: account.metadata.lastSignInTime || '',
  }
}

// ---------- ban / unban ----------

async function changeBan(action, body, caller, res) {
  const uid = String(body.uid || '')
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!UID_PATTERN.test(uid)) {
    return res.status(400).json({ error: 'Invalid user id' })
  }
  if (reason.length < 1 || reason.length > 300) {
    return res.status(400).json({ error: 'Write a reason (up to 300 characters)' })
  }
  if (uid === caller.uid) {
    return res.status(400).json({ error: 'You cannot ban yourself' })
  }

  const account = await adminAuth().getUser(uid)
  if (account.customClaims && account.customClaims.admin) {
    return res.status(400).json({ error: 'Admins cannot be banned. Remove the admin mark first (scripts/set-admin.mjs).' })
  }
  if (account.providerData.length === 0) {
    return res.status(400).json({ error: 'This is a guest, not an account, so there is nothing to ban' })
  }

  const db = adminDb()
  let hiddenCount = 0

  if (action === 'ban') {
    // Switch off their login and log them out on every device
    await adminAuth().updateUser(uid, { disabled: true })
    await adminAuth().revokeRefreshTokens(uid)
    // The security rules check this flag (notBanned() in firestore.rules), so even a login token
    // that has not expired yet cannot be used to create or change anything
    await db.doc('users/' + uid).set({ banned: true }, { merge: true })
    // Take their things out of the marketplace
    hiddenCount = await hideAllItems(uid)
  } else {
    await adminAuth().updateUser(uid, { disabled: false })
    await db.doc('users/' + uid).set({ banned: false }, { merge: true })
    // Their items stay hidden: an admin can unhide the ones that are fine on the admin page
  }

  await db.collection('adminLog').add({
    adminId: caller.uid,
    action: action,
    targetType: 'users',
    targetId: uid,
    reason: reason,
    createdAt: Date.now(),
  })

  return res.status(200).json({ ok: true, hiddenCount: hiddenCount, account: await describe(await adminAuth().getUser(uid)) })
}

// ---------- deleteRoom ----------

// Delete a room with everything inside it (members, photos and any other list teammates added).
// Done here because the browser cannot find a room's sub-lists to delete them, and a Firestore
// document's sub-lists are NOT deleted with it.
async function deleteRoom(body, caller, res) {
  const code = String(body.code || '')
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!/^[0-9]{4}$/.test(code)) {
    return res.status(400).json({ error: 'A room code is 4 digits' })
  }
  if (reason.length > 300) {
    return res.status(400).json({ error: 'The note can be up to 300 characters' })
  }

  const db = adminDb()
  const roomRef = db.doc('rooms/' + code)
  const room = await roomRef.get()
  if (!room.exists) {
    return res.status(404).json({ error: 'No room with that code' })
  }

  // Close it first, so everyone still inside is sent back to the home page (RoomLayout.vue)
  if (room.data().closed !== true) {
    await roomRef.update({ closed: true })
  }
  await db.recursiveDelete(roomRef)

  await db.collection('adminLog').add({
    adminId: caller.uid,
    action: 'deleteRoom',
    targetType: 'rooms',
    targetId: code,
    reason: reason,
    createdAt: Date.now(),
  })

  return res.status(200).json({ ok: true })
}

// Hide every active template and sticker of this account. Returns how many were hidden.
async function hideAllItems(uid) {
  const db = adminDb()
  let count = 0
  for (const collectionName of ['templates', 'stickers']) {
    const snapshot = await db.collection(collectionName).where('ownerId', '==', uid).get()
    const active = snapshot.docs.filter((itemDoc) => itemDoc.data().status === 'active')
    // A batch can hold up to 500 writes
    for (let start = 0; start < active.length; start += 400) {
      const batch = db.batch()
      active.slice(start, start + 400).forEach((itemDoc) => batch.update(itemDoc.ref, { status: 'hidden' }))
      await batch.commit()
    }
    count += active.length
  }
  return count
}
