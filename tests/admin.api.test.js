// Tests for api/admin.js (ban / unban / lookup). Runs against local copies of Firebase Auth and Firestore
// (the "emulators"), never the real project. Run with:  npm run test:rules   (needs Java installed)
//
// firebase emulators:exec sets FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT,
// so api/_lib/firebaseAdmin.js connects to the emulators instead of the real project.

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/admin.js'
import { adminAuth, adminDb } from '../api/_lib/firebaseAdmin.js'

const PROJECT = process.env.GCLOUD_PROJECT
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST
const PASSWORD = 'test-password-123'

let adminToken, aliceToken, aliceUid, bobUid, guestUid

// Log in on the Auth emulator and get an ID token (what the browser would send)
async function idTokenFor(email) {
  const response = await fetch('http://' + AUTH_HOST + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: PASSWORD, returnSecureToken: true }),
  })
  return (await response.json()).idToken
}

// Call the function like Vercel would, and return { status, body }
async function callApi(token, body, method = 'POST') {
  const result = {}
  const res = {
    status(code) { result.status = code; return res },
    json(data) { result.body = data; return res },
  }
  await handler({ method: method, headers: token ? { authorization: 'Bearer ' + token } : {}, body: body }, res)
  return result
}

before(async () => {
  // Start empty
  await fetch('http://' + AUTH_HOST + '/emulator/v1/projects/' + PROJECT + '/accounts', { method: 'DELETE' })
  await fetch('http://' + FIRESTORE_HOST + '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents', { method: 'DELETE' })

  const admin = await adminAuth().createUser({ email: 'admin@test.com', password: PASSWORD })
  await adminAuth().setCustomUserClaims(admin.uid, { admin: true })
  aliceUid = (await adminAuth().createUser({ email: 'alice@test.com', password: PASSWORD })).uid
  bobUid = (await adminAuth().createUser({ email: 'bob@test.com', password: PASSWORD })).uid
  guestUid = (await adminAuth().createUser({})).uid // like a guest: no email or Google login

  adminToken = await idTokenFor('admin@test.com')
  aliceToken = await idTokenFor('alice@test.com')

  const db = adminDb()
  await db.doc('users/' + bobUid).set({ displayName: 'Bob', createdAt: 1 })
  await db.doc('templates/t1').set({ ownerId: bobUid, name: 'Bad frame', status: 'active', visibility: 'public' })
  await db.doc('stickers/s1').set({ ownerId: bobUid, name: 'Bad sticker', status: 'active', visibility: 'private' })
  await db.doc('templates/t2').set({ ownerId: aliceUid, name: 'Fine frame', status: 'active', visibility: 'public' })
})

test('only POST, only signed in, only admins', async () => {
  assert.equal((await callApi(adminToken, {}, 'GET')).status, 405)
  assert.equal((await callApi(null, { action: 'lookup', email: 'bob@test.com' })).status, 401)
  assert.equal((await callApi('not-a-real-token', { action: 'lookup', email: 'bob@test.com' })).status, 401)
  assert.equal((await callApi(aliceToken, { action: 'lookup', email: 'bob@test.com' })).status, 403)
  assert.equal((await callApi(aliceToken, { action: 'ban', uid: bobUid, reason: 'x' })).status, 403)
})

test('lookup finds an account by email or uid', async () => {
  const byEmail = await callApi(adminToken, { action: 'lookup', email: 'bob@test.com' })
  assert.equal(byEmail.status, 200)
  assert.equal(byEmail.body.uid, bobUid)
  assert.equal(byEmail.body.displayName, 'Bob')
  assert.equal(byEmail.body.isAccount, true)
  assert.equal(byEmail.body.banned, false)
  assert.equal((await callApi(adminToken, { action: 'lookup', uid: bobUid })).body.email, 'bob@test.com')
  assert.equal((await callApi(adminToken, { action: 'lookup', email: 'nobody@test.com' })).status, 404)
  assert.equal((await callApi(adminToken, { action: 'lookup', uid: '../../etc' })).status, 400)
})

test('cannot ban yourself, another admin, a guest, or without a reason', async () => {
  const me = (await adminAuth().getUserByEmail('admin@test.com')).uid
  assert.equal((await callApi(adminToken, { action: 'ban', uid: me, reason: 'x' })).status, 400)
  assert.equal((await callApi(adminToken, { action: 'ban', uid: guestUid, reason: 'x' })).status, 400)
  assert.equal((await callApi(adminToken, { action: 'ban', uid: bobUid, reason: '   ' })).status, 400)
  assert.equal((await callApi(adminToken, { action: 'ban', uid: bobUid, reason: 'x'.repeat(301) })).status, 400)
  const otherAdmin = await adminAuth().createUser({ email: 'admin2@test.com', password: PASSWORD })
  await adminAuth().setCustomUserClaims(otherAdmin.uid, { admin: true })
  assert.equal((await callApi(adminToken, { action: 'ban', uid: otherAdmin.uid, reason: 'x' })).status, 400)
})

test('ban: login switched off, marked banned, items hidden, logged, and their token stops working', async () => {
  const bobToken = await idTokenFor('bob@test.com')
  const result = await callApi(adminToken, { action: 'ban', uid: bobUid, reason: 'Spam' })
  assert.equal(result.status, 200)
  assert.equal(result.body.hiddenCount, 2)

  assert.equal((await adminAuth().getUser(bobUid)).disabled, true)
  const db = adminDb()
  assert.equal((await db.doc('users/' + bobUid).get()).data().banned, true)
  assert.equal((await db.doc('templates/t1').get()).data().status, 'hidden')
  assert.equal((await db.doc('stickers/s1').get()).data().status, 'hidden')
  assert.equal((await db.doc('templates/t2').get()).data().status, 'active') // someone else's: untouched

  const log = await db.collection('adminLog').where('targetId', '==', bobUid).get()
  assert.equal(log.size, 1)
  assert.equal(log.docs[0].data().action, 'ban')
  assert.equal(log.docs[0].data().reason, 'Spam')

  // The token Bob had before the ban no longer works on our server
  await adminAuth().setCustomUserClaims(bobUid, { admin: true }) // even if it somehow had the admin mark
  assert.equal((await callApi(bobToken, { action: 'lookup', email: 'alice@test.com' })).status, 401)
  await adminAuth().setCustomUserClaims(bobUid, null)
})

test('unban: login switched back on, no longer marked banned, items stay hidden', async () => {
  const result = await callApi(adminToken, { action: 'unban', uid: bobUid, reason: 'Appeal accepted' })
  assert.equal(result.status, 200)
  assert.equal((await adminAuth().getUser(bobUid)).disabled, false)
  assert.equal((await adminDb().doc('users/' + bobUid).get()).data().banned, false)
  assert.equal((await adminDb().doc('templates/t1').get()).data().status, 'hidden')
})

test('unknown actions are refused', async () => {
  assert.equal((await callApi(adminToken, { action: 'deleteEverything' })).status, 400)
})
