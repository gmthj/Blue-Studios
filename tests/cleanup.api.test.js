// Tests for api/cleanup.js (the daily room cleanup). Runs against the local Firebase emulators, never the real
// project. Run with:  npm run test:rules   (needs Java installed)

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/cleanup.js'
import { adminDb } from '../api/_lib/firebaseAdmin.js'

const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST
const PROJECT = process.env.GCLOUD_PROJECT
const SECRET = 'test-cron-secret'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

process.env.CRON_SECRET = SECRET

async function callApi(token, query = {}, method = 'GET') {
  const result = {}
  const res = {
    status(code) { result.status = code; return res },
    json(data) { result.body = data; return res },
  }
  await handler({ method: method, headers: token ? { authorization: 'Bearer ' + token } : {}, query: query }, res)
  return result
}

async function exists(path) {
  return (await adminDb().doc(path).get()).exists
}

before(async () => {
  await fetch('http://' + FIRESTORE_HOST + '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents', { method: 'DELETE' })
  const db = adminDb()
  const now = Date.now()
  const base = { hostId: 'h', hostName: 'Host', stage: 'shoot', stripSlots: {}, shotNumber: 0, closed: false }

  // R1: empty and unused for 2 hours -> deleted
  await db.doc('rooms/1001').set({ ...base, createdAt: now - 2 * HOUR })
  await db.doc('rooms/1001/members/m1').set({ name: 'A', joinedAt: now - 2 * HOUR, lastSeen: now - 2 * HOUR })
  // unused but only 10 minutes old -> stays
  await db.doc('rooms/1002').set({ ...base, createdAt: now - 10 * 60 * 1000 })
  // R3: has photos, empty for 8 hours -> closed, NOT deleted (photos stay)
  await db.doc('rooms/1003').set({ ...base, shotNumber: 2, createdAt: now - 8 * HOUR })
  await db.doc('rooms/1003/photos/p1').set({ image: 'data:image/jpeg;base64,x' })
  // R4: closed with photos, last left 31 days ago -> deleted with its sub-lists
  await db.doc('rooms/1004').set({ ...base, shotNumber: 2, closed: true, createdAt: now - 40 * DAY, lastActive: now - 31 * DAY })
  await db.doc('rooms/1004/photos/p1').set({ image: 'data:image/jpeg;base64,x' })
  // closed with photos, left 5 days ago -> stays
  await db.doc('rooms/1005').set({ ...base, shotNumber: 2, closed: true, createdAt: now - 6 * DAY, lastActive: now - 5 * DAY })
  // someone is in it right now and it is young -> stays
  await db.doc('rooms/1006').set({ ...base, createdAt: now - 3 * HOUR })
  await db.doc('rooms/1006/members/m1').set({ name: 'B', joinedAt: now - 3 * HOUR, lastSeen: now - 5000 })
  // keep: true -> stays although it is old and empty
  await db.doc('rooms/1007').set({ ...base, keep: true, createdAt: now - 10 * DAY })
  // R6: a test room with photos, someone in it, and open -> still deleted (over an hour old)
  await db.doc('rooms/1009').set({ ...base, hostName: 'Playwright', shotNumber: 3, createdAt: now - 2 * HOUR })
  await db.doc('rooms/1009/photos/p1').set({ image: 'data:image/jpeg;base64,x' })
  await db.doc('rooms/1009/members/m1').set({ name: 'T', joinedAt: now - 2 * HOUR, lastSeen: now - 5000 })
  // a test room only 5 minutes old -> stays (the test may still be running)
  await db.doc('rooms/1010').set({ ...base, hostName: 'Playwright', createdAt: now - 5 * 60 * 1000 })
  // R2: closed and unused for 2 days -> deleted
  await db.doc('rooms/1008').set({ ...base, closed: true, createdAt: now - 3 * DAY, lastActive: now - 2 * DAY })
})

test('refuses without the secret, and when no secret is set', async () => {
  assert.equal((await callApi(null)).status, 401)
  assert.equal((await callApi('wrong')).status, 401)
  assert.equal((await callApi(SECRET, {}, 'DELETE')).status, 405)
  delete process.env.CRON_SECRET
  assert.equal((await callApi(SECRET)).status, 500)
  process.env.CRON_SECRET = SECRET
})

test('dryRun reports what would happen and changes nothing', async () => {
  const { status, body } = await callApi(SECRET, { dryRun: '1' })
  assert.equal(status, 200)
  assert.equal(body.dryRun, true)
  assert.deepEqual(body.deleted.map((d) => d.code).sort(), ['1001', '1004', '1008', '1009'])
  assert.deepEqual(body.closed.map((d) => d.code), ['1003'])
  assert.equal(await exists('rooms/1001'), true)
  assert.equal((await adminDb().collection('adminLog').get()).size, 0)
})

test('the real run closes and deletes the right rooms, and logs each one', async () => {
  const { status, body } = await callApi(SECRET)
  assert.equal(status, 200)
  assert.equal(body.dryRun, false)

  // deleted, with everything inside
  for (const code of ['1001', '1004', '1008', '1009']) assert.equal(await exists('rooms/' + code), false, code)
  assert.equal((await adminDb().collection('rooms/1001/members').get()).size, 0)
  assert.equal((await adminDb().collection('rooms/1004/photos').get()).size, 0)

  // closed but kept, photos intact
  assert.equal((await adminDb().doc('rooms/1003').get()).data().closed, true)
  assert.equal(await exists('rooms/1003/photos/p1'), true)

  // untouched
  for (const code of ['1002', '1005', '1006', '1007', '1010']) assert.equal(await exists('rooms/' + code), true, code)
  assert.equal((await adminDb().doc('rooms/1002').get()).data().closed, false)
  assert.equal((await adminDb().doc('rooms/1007').get()).data().closed, false)

  const log = await adminDb().collection('adminLog').get()
  assert.equal(log.size, 5)
  log.docs.forEach((entry) => assert.equal(entry.data().adminId, 'system'))
  const deletes = log.docs.filter((entry) => entry.data().action === 'deleteRoom')
  assert.equal(deletes.length, 4)
  assert.match(log.docs.find((entry) => entry.data().targetId === '1004').data().reason, /R4/)
})

test('running it again does nothing more', async () => {
  const { body } = await callApi(SECRET)
  assert.equal(body.deleted.length, 0)
  assert.equal(body.closed.length, 0)
})
