// Tests for firestore.rules. Runs against a local copy of Firestore (the "emulator"),
// never the real database. Run with:  npm run test:rules   (needs Java installed)
//
// assertSucceeds(...) = this read/write SHOULD be allowed
// assertFails(...)    = this read/write SHOULD be blocked

import { test, before, beforeEach, after } from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit, writeBatch, increment, getCountFromServer, collectionGroup,
} from 'firebase/firestore'

let testEnv

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-blue-studios',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

after(async () => {
  await testEnv.cleanup()
})

// A Firestore connection signed in as a user ('host', 'guest', 'stranger'), an admin, or nobody
function dbAs(uid) {
  return testEnv.authenticatedContext(uid).firestore()
}
// Someone with an account (email or Google), not a guest
function dbAsAccount(uid) {
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore()
}
// A guest (signed in anonymously)
function dbAsGuest(uid) {
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore()
}
function dbAsAdmin() {
  return testEnv.authenticatedContext('admin1', { admin: true }).firestore()
}
function dbSignedOut() {
  return testEnv.unauthenticatedContext().firestore()
}

function newRoom(hostId) {
  return {
    hostId: hostId,
    hostName: 'Gabriel',
    shotNumber: 0,
    stage: 'shoot',
    stripSlots: {},
    closed: false,
    createdAt: Date.now(),
  }
}

function newMember() {
  return { name: 'Joash', deviceType: 'Phone', joinedAt: Date.now(), lastSeen: Date.now() }
}

function newPhoto(ownerId, shotNumber) {
  return { ownerId: ownerId, name: 'Joash', shotNumber: shotNumber, image: 'data:image/jpeg;base64,AAAA', createdAt: Date.now() }
}

// Set up data directly, skipping the rules (like an admin tool would)
async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data)
  })
}

// A room 1234 hosted by 'host', with 'host' and 'guest' as members
async function seedRoom(changes = {}) {
  await seed('rooms/1234', { ...newRoom('host'), ...changes })
  await seed('rooms/1234/members/host', newMember())
  await seed('rooms/1234/members/guest', newMember())
}

// ---------- Rooms ----------

test('signed-out users cannot read or create rooms', async () => {
  await seedRoom()
  await assertFails(getDoc(doc(dbSignedOut(), 'rooms/1234')))
  await assertFails(setDoc(doc(dbSignedOut(), 'rooms/5555'), newRoom('nobody')))
})

test('a user can create a room as its host', async () => {
  await assertSucceeds(setDoc(doc(dbAs('host'), 'rooms/5555'), newRoom('host')))
})

test('a user cannot create a room pretending someone else is the host', async () => {
  await assertFails(setDoc(doc(dbAs('stranger'), 'rooms/5555'), newRoom('host')))
})

test('new rooms start at shoot (the old "camera" stage is gone)', async () => {
  await assertSucceeds(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), stage: 'shoot' }))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5556'), { ...newRoom('host'), stage: 'camera' }))
})

test('a room code must be 4 digits, and a new room must start empty', async () => {
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/abcd'), newRoom('host')))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), stage: 'decorate' }))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), shotNumber: 7 }))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), closed: true }))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), isAdmin: true }))
})

test('anyone signed in can look up one room, but only admins can list all rooms', async () => {
  await seedRoom()
  await assertSucceeds(getDoc(doc(dbAs('stranger'), 'rooms/1234')))
  await assertFails(getDocs(collection(dbAs('stranger'), 'rooms')))
  await assertSucceeds(getDocs(query(collection(dbAsAdmin(), 'rooms'), where('closed', '==', false))))
})

test('admins can list and count everything the admin dashboard shows; others cannot', async () => {
  await seedRoom()
  const admin = dbAsAdmin()
  await assertSucceeds(getDocs(query(collection(admin, 'rooms'), orderBy('createdAt', 'desc'), limit(200))))
  for (const name of ['users', 'rooms', 'templates', 'stickers', 'strips', 'reports']) {
    await assertSucceeds(getCountFromServer(collection(admin, name)))
    await assertSucceeds(getDocs(collection(admin, name)))
  }
  await assertSucceeds(getCountFromServer(query(collection(admin, 'strips'), where('ownerId', '==', 'alice'))))
  await assertFails(getCountFromServer(collection(dbAsAccount('alice'), 'strips')))
  await assertFails(getCountFromServer(collection(dbAsAccount('alice'), 'rooms')))
})

test('only admins can list the members of every room at once', async () => {
  await seedRoom()
  await assertSucceeds(getDocs(collectionGroup(dbAsAdmin(), 'members')))
  await assertFails(getDocs(collectionGroup(dbAs('stranger'), 'members')))
})

test('members can press the shutter (+1 only)', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { shotNumber: 1, shotStartedBy: 'Joash' }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { shotNumber: 5, shotStartedBy: 'Joash' }))
})

test('people who are not in the room cannot change it', async () => {
  await seedRoom()
  await assertFails(updateDoc(doc(dbAs('stranger'), 'rooms/1234'), { shotNumber: 1, shotStartedBy: 'X' }))
  await assertFails(updateDoc(doc(dbAs('stranger'), 'rooms/1234'), { closed: true }))
})

// ---------- What members may change in a room ----------

test('members can move the room to another step, but only to a real step', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { stage: 'decorate', furthestStage: 'decorate', visitedStages: ['shoot', 'decorate'] }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stage: 'hacked' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stage: 5 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { furthestStage: 'nowhere' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { visitedStages: ['shoot', 'nowhere'] }))
  await assertFails(updateDoc(doc(dbAs('stranger'), 'rooms/1234'), { stage: 'pick' }))
})

test('members cannot change the host, creation time, shutter counter or keep, and cannot add unknown fields', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { hostId: 'guest' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { hostName: 'Hacked' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { createdAt: 0 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { shotNumber: 10 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { keep: true }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { somethingNew: 'x' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stage: 'pick', somethingNew: 'x' }))
})

test('strip slots: photo ids in slots 0 to 11, and nothing else', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'stripSlots.9': 'photoA', stripLayoutId: 'film-3-cut' }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'stripSlots.0': null, 'stripEdits.0': null, 'stripCrops.0': null }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'stripSlots.12': 'photoA' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'stripSlots.x': 'photoA' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'stripSlots.1': 123 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'stripSlots.1': 'x'.repeat(41) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripSlots: 'not a map' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripLayoutId: 'x'.repeat(61) }))
})

test('crops and edits are small maps per slot', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'stripCrops.2': { zoom: 1.5, x: 0, y: 0 } }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'stripEdits.2': { filter: 'bw', brightness: 10, contrast: 0, saturation: 0 } }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'stripEdits.2': 'bw' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'stripEdits.2': { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 } }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'stripCrops.13': { zoom: 1 } }))
})

function templateFrame(changes = {}) {
  return {
    id: 't1', name: 'My frame', aspect: 0.3, slots: [{ x: 6, y: 3, w: 88, h: 20 }], shape: 'rounded',
    background: '#FFFFFF', border: '#1A1A2E', caption: 'Hi', captionColor: '#1A1A2E', thumbnailUrl: null,
    ...changes,
  }
}

test('a template frame in the room: checked fields, and its picture must be a safe link', async () => {
  await seedRoom()
  const db = dbAs('guest')
  const storageLink = 'https://firebasestorage.googleapis.com/v0/b/x/o/templates%2Fa%2Fb%2Fthumbnail.png?alt=media&token=1'
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { stripStyleId: 't1', stripCustomTemplate: templateFrame({ thumbnailUrl: storageLink }) }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { stripCustomTemplate: templateFrame({ thumbnailUrl: 'data:image/png;base64,AAAA' }) }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { stripStyleId: 'cream', stripCustomTemplate: null }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripCustomTemplate: templateFrame({ thumbnailUrl: 'https://evil.example/track.png' }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripCustomTemplate: templateFrame({ thumbnailUrl: 'data:image/svg+xml;base64,AAAA' }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripCustomTemplate: templateFrame({ thumbnailUrl: storageLink + '") ; x' }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripCustomTemplate: templateFrame({ shape: 'star' }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripCustomTemplate: templateFrame({ slots: [] }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripCustomTemplate: { ...templateFrame(), extra: 1 } }))
})

test('only the host can set startTemplateId and virtualFriends', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('host'), 'rooms/1234'), { startTemplateId: 't1' }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { startTemplateId: 't2' }))
  await assertSucceeds(updateDoc(doc(dbAs('host'), 'rooms/1234'), { virtualFriends: ['a', 'b'] }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { virtualFriends: ['a'] }))
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { virtualFriends: 'a' }))
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { virtualFriends: Array(21).fill('a') }))
})

test('stickers: a list of at most 40', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { stripStickers: [{ id: 1, src: 'data:image/png;base64,AAAA', x: 50, y: 50 }] }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { stripStickers: [] }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripStickers: 'nope' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripStickers: Array(41).fill({ id: 1 }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { stripStickers: [{ id: 2 }], stage: 'pick' }))
})

test('video timeline and saved edits', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { videoTimeline: [{ clipId: 'c1', start: 0, end: 3 }], videoEditing: null }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'editedVideos.e1': { name: 'Edit 1', timeline: [], createdAt: 1 } }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { videoTimeline: [], videoEditing: 'e1', stage: 'video' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { videoTimeline: 'x' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { videoTimeline: Array(31).fill({}) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { videoEditing: 5 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { editedVideos: 'x' }))
})

function aTrack(changes = {}) {
  return { id: '123', name: 'Song', artist_name: 'Band', duration: 120, audio: 'https://prod-1.storage.jamendo.com/x.mp3', waveform: '[1,2,3]', musicinfo: { speed: 'high' }, ...changes }
}

test('music: the shared mixer is checked, and the saved mix must be this room\'s file', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'mixer.speedA': 1.2 }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'mixer.trackA': aTrack(), 'mixer.startA': 0 }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { music: { audioPath: 'music/1234/mix.wav', duration: 15 } }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'mixer.speedA': 9 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'mixer.volumeA': 'loud' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'mixer.crossfade': 2 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'mixer.extra': 1 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'mixer.trackA': aTrack({ audio: 'javascript:alert(1)' }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'mixer.trackA': aTrack({ waveform: 'x'.repeat(20001) }) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'mixer.trackA': { ...aTrack(), extra: 1 } }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { music: { audioPath: 'music/9999/mix.wav', duration: 15 } }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { music: { audioPath: 'strips/someone/x.jpg', duration: 15 } }))
})

test('photo or video mode', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { captureMode: 'video' }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { captureMode: 'x' }))
})

test('export: format, name and the job are checked', async () => {
  await seedRoom()
  const db = dbAs('guest')
  const job = { status: 'pending', format: 'gif', name: 'Our day', progress: 0, updatedAt: 1 }
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { stage: 'share', furthestStage: 'share', exportFormat: 'gif', exportName: 'Our day', exportJob: job }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'exportJob.progress': 0.5, 'exportJob.label': 'Working', 'exportJob.updatedAt': 2 }))
  await assertSucceeds(updateDoc(doc(db, 'rooms/1234'), { 'exportJob.status': 'done', 'exportJob.shareId': 'abc' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { exportFormat: 'exe' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { exportName: 'x'.repeat(81) }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'exportJob.status': 'hacked' }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'exportJob.extra': 1 }))
  await assertFails(updateDoc(doc(db, 'rooms/1234'), { 'exportJob.progress': 5 }))
})

test('leaving a room saves lastActive as a number', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { lastActive: Date.now() }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { lastActive: 'now' }))
})

// ---------- Video clips in a room ----------

function newClip(ownerId, clipId, changes = {}) {
  return {
    ownerId: ownerId, name: 'Guest', shotNumber: 1, mime: 'video/webm', mirrored: true, createdAt: Date.now(),
    path: 'clips/1234/' + ownerId + '/' + clipId + '.webm',
    ...changes,
  }
}

test('clips: members add their own clip, and only members (and admins) can see them', async () => {
  await seedRoom()
  await assertSucceeds(setDoc(doc(dbAs('guest'), 'rooms/1234/clips/c1'), newClip('guest', 'c1')))
  await assertSucceeds(setDoc(doc(dbAs('host'), 'rooms/1234/clips/c2'), newClip('host', 'c2', { mime: 'video/mp4', path: 'clips/1234/host/c2.mp4' })))
  await assertSucceeds(getDoc(doc(dbAs('host'), 'rooms/1234/clips/c1')))
  await assertSucceeds(getDoc(doc(dbAsAdmin(), 'rooms/1234/clips/c1')))
  await assertFails(getDoc(doc(dbAs('stranger'), 'rooms/1234/clips/c1')))
  await assertFails(getDoc(doc(dbSignedOut(), 'rooms/1234/clips/c1')))
})

test('clips: no posting as someone else, no strange files, no extra fields, no changes', async () => {
  await seedRoom()
  const db = dbAs('guest')
  await assertFails(setDoc(doc(dbAs('stranger'), 'rooms/1234/clips/c1'), newClip('stranger', 'c1')))
  await assertFails(setDoc(doc(db, 'rooms/1234/clips/c1'), newClip('host', 'c1')))
  await assertFails(setDoc(doc(db, 'rooms/1234/clips/c1'), newClip('guest', 'c1', { path: 'clips/1234/host/c1.webm' })))
  await assertFails(setDoc(doc(db, 'rooms/1234/clips/c1'), newClip('guest', 'c1', { path: 'clips/9999/guest/c1.webm' })))
  await assertFails(setDoc(doc(db, 'rooms/1234/clips/c1'), newClip('guest', 'c1', { path: 'strips/guest/c1.jpg' })))
  await assertFails(setDoc(doc(db, 'rooms/1234/clips/c1'), newClip('guest', 'c1', { mime: 'text/html' })))
  await assertFails(setDoc(doc(db, 'rooms/1234/clips/c1'), newClip('guest', 'c1', { extra: 1 })))
  await assertFails(setDoc(doc(db, 'rooms/1234/clips/c1'), newClip('guest', 'c1', { mirrored: 'yes' })))
  await seed('rooms/1234/clips/c3', newClip('guest', 'c3'))
  await assertFails(updateDoc(doc(db, 'rooms/1234/clips/c3'), { name: 'Hacked' }))
  await assertFails(deleteDoc(doc(db, 'rooms/1234/clips/c3')))
  await assertSucceeds(deleteDoc(doc(dbAsAdmin(), 'rooms/1234/clips/c3')))
})

test('clips cannot be added to a closed room', async () => {
  await seedRoom({ closed: true })
  await assertFails(setDoc(doc(dbAs('guest'), 'rooms/1234/clips/c1'), newClip('guest', 'c1')))
})

test('other lists inside a room are blocked', async () => {
  await seedRoom()
  await assertFails(setDoc(doc(dbAs('guest'), 'rooms/1234/music/m1'), { anything: true }))
  await assertFails(getDoc(doc(dbAs('host'), 'rooms/1234/music/m1')))
  // members keep their own strict rules
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234/members/host'), { name: 'Hacked' }))
})

test('members can close a room, but a closed room cannot be reopened or changed', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { closed: true }))
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { closed: false }))
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { stage: 'pick' }))
})

test('an admin can close any room', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAsAdmin(), 'rooms/1234'), { closed: true }))
})

test('a room can be created with lastActive, but only as a number', async () => {
  await assertSucceeds(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), lastActive: Date.now() }))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5556'), { ...newRoom('host'), lastActive: 'now' }))
})

test('a member can write lastActive when leaving, and only while the room is open', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { lastActive: Date.now() }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { lastActive: 'yesterday' }))
  await assertFails(updateDoc(doc(dbAs('stranger'), 'rooms/1234'), { lastActive: Date.now() }))
})

test('only an admin can mark a room keep', async () => {
  await seedRoom()
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { keep: true }))
  await assertFails(updateDoc(doc(dbAs('stranger'), 'rooms/1234'), { keep: true }))
  await assertSucceeds(updateDoc(doc(dbAsAdmin(), 'rooms/1234'), { keep: true }))
  await assertFails(updateDoc(doc(dbAsAdmin(), 'rooms/1234'), { keep: 'yes' }))
  // members still cannot switch it off
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { keep: false }))
})

test('nobody can delete a room', async () => {
  await seedRoom()
  await assertFails(deleteDoc(doc(dbAs('host'), 'rooms/1234')))
})

// ---------- Members ----------

test('a user can join an open room as themselves only', async () => {
  await seedRoom()
  await assertSucceeds(setDoc(doc(dbAs('newbie'), 'rooms/1234/members/newbie'), newMember()))
  await assertFails(setDoc(doc(dbAs('newbie'), 'rooms/1234/members/someoneElse'), newMember()))
})

test('a user cannot join a closed room or a room that does not exist', async () => {
  await seedRoom({ closed: true })
  await assertFails(setDoc(doc(dbAs('newbie'), 'rooms/1234/members/newbie'), newMember()))
  await assertFails(setDoc(doc(dbAs('newbie'), 'rooms/9999/members/newbie'), newMember()))
})

test('member documents are checked field by field', async () => {
  await seedRoom()
  await assertFails(setDoc(doc(dbAs('newbie'), 'rooms/1234/members/newbie'), { ...newMember(), name: '' }))
  await assertFails(setDoc(doc(dbAs('newbie'), 'rooms/1234/members/newbie'), { ...newMember(), deviceType: 'Toaster' }))
  await assertFails(setDoc(doc(dbAs('newbie'), 'rooms/1234/members/newbie'), { ...newMember(), role: 'host' }))
})

test('heartbeat: I can update my own lastSeen, not someone else\'s', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234/members/guest'), { lastSeen: Date.now() }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234/members/host'), { lastSeen: Date.now() }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234/members/guest'), { joinedAt: 0 }))
})

test('I can leave (delete my member doc) but not remove others', async () => {
  await seedRoom()
  await assertSucceeds(deleteDoc(doc(dbAs('guest'), 'rooms/1234/members/guest')))
  await assertFails(deleteDoc(doc(dbAs('guest'), 'rooms/1234/members/host')))
})

test('signed-in users can see the members list (to check if the room is full)', async () => {
  await seedRoom()
  await assertSucceeds(getDocs(collection(dbAs('stranger'), 'rooms/1234/members')))
})

// ---------- Photos ----------

test('members can add a photo as themselves', async () => {
  await seedRoom({ shotNumber: 1 })
  await assertSucceeds(addDoc(collection(dbAs('guest'), 'rooms/1234/photos'), newPhoto('guest', 1)))
})

test('photos: not as someone else, not from outside the room, not for a future shot', async () => {
  await seedRoom({ shotNumber: 1 })
  await assertFails(addDoc(collection(dbAs('guest'), 'rooms/1234/photos'), newPhoto('host', 1)))
  await assertFails(addDoc(collection(dbAs('stranger'), 'rooms/1234/photos'), newPhoto('stranger', 1)))
  await assertFails(addDoc(collection(dbAs('guest'), 'rooms/1234/photos'), newPhoto('guest', 2)))
})

test('photos must be a JPEG data URL', async () => {
  await seedRoom({ shotNumber: 1 })
  const notAnImage = { ...newPhoto('guest', 1), image: '<script>alert(1)</script>' }
  await assertFails(addDoc(collection(dbAs('guest'), 'rooms/1234/photos'), notAnImage))
})

test('only members can see photos, and nobody can edit them', async () => {
  await seedRoom({ shotNumber: 1 })
  await seed('rooms/1234/photos/p1', newPhoto('guest', 1))
  await assertSucceeds(getDocs(collection(dbAs('host'), 'rooms/1234/photos')))
  await assertFails(getDocs(collection(dbAs('stranger'), 'rooms/1234/photos')))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234/photos/p1'), { name: 'X' }))
  await assertFails(deleteDoc(doc(dbAs('guest'), 'rooms/1234/photos/p1')))
  await assertSucceeds(deleteDoc(doc(dbAsAdmin(), 'rooms/1234/photos/p1')))
})

test('an admin can see and delete the video clips of any room', async () => {
  await seedRoom({ shotNumber: 1 })
  await seed('rooms/1234/clips/c1', { ownerId: 'guest', name: 'Guest', shotNumber: 1, path: 'clips/1234/guest/c1.webm', createdAt: 1 })
  await assertFails(getDocs(collection(dbAs('stranger'), 'rooms/1234/clips')))
  await assertSucceeds(getDocs(collection(dbAsAdmin(), 'rooms/1234/clips')))
  await assertFails(updateDoc(doc(dbAsAdmin(), 'rooms/1234/clips/c1'), { name: 'X' }))
  await assertSucceeds(deleteDoc(doc(dbAsAdmin(), 'rooms/1234/clips/c1')))
})

// ---------- User profiles ----------

test('an account can create and rename its own profile', async () => {
  await assertSucceeds(setDoc(doc(dbAsAccount('alice'), 'users/alice'), { displayName: 'Alice', createdAt: Date.now() }))
  await assertSucceeds(updateDoc(doc(dbAsAccount('alice'), 'users/alice'), { displayName: 'Alice Tan' }))
})

test('guests cannot create a profile', async () => {
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'users/g1'), { displayName: 'Guest', createdAt: Date.now() }))
})

test('nobody can write someone else\'s profile', async () => {
  await seed('users/alice', { displayName: 'Alice', createdAt: 1 })
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'users/alice'), { displayName: 'Hacked', createdAt: 1 }))
  await assertFails(updateDoc(doc(dbAsAccount('bob'), 'users/alice'), { displayName: 'Hacked' }))
})

test('profiles cannot have extra fields (e.g. making yourself admin or unbanning yourself)', async () => {
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'users/alice'), { displayName: 'Alice', createdAt: 1, admin: true }))
  await seed('users/alice', { displayName: 'Alice', createdAt: 1, banned: true })
  await assertFails(updateDoc(doc(dbAsAccount('alice'), 'users/alice'), { banned: false }))
  await assertFails(updateDoc(doc(dbAsAccount('alice'), 'users/alice'), { createdAt: 2 }))
})

test('profile names must be 1-30 characters', async () => {
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'users/alice'), { displayName: '', createdAt: 1 }))
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'users/alice'), { displayName: 'x'.repeat(31), createdAt: 1 }))
})

test('profile pictures: only my own uploaded file, no other links', async () => {
  const mine = 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/avatars%2Falice%2Favatar.jpg?alt=media&token=abc'
  const someoneElses = 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/avatars%2Fbob%2Favatar.jpg?alt=media&token=abc'
  await seed('users/alice', { displayName: 'Alice', createdAt: 1 })
  const alice = doc(dbAsAccount('alice'), 'users/alice')
  await assertSucceeds(updateDoc(alice, { photoURL: mine }))
  await assertSucceeds(updateDoc(alice, { photoURL: '' }))
  await assertFails(updateDoc(alice, { photoURL: someoneElses }))
  await assertFails(updateDoc(alice, { photoURL: 'https://evil.example.com/picture.jpg' }))
  await assertFails(updateDoc(alice, { googlePhotoURL: 'https://lh3.googleusercontent.com/a/xyz=s96-c' })) // no other picture fields
})

test('signed-in users can read one profile but not list all users', async () => {
  await seed('users/alice', { displayName: 'Alice', createdAt: 1 })
  await assertSucceeds(getDoc(doc(dbAsGuest('g1'), 'users/alice')))
  await assertFails(getDocs(collection(dbAsGuest('g1'), 'users')))
  await assertFails(getDoc(doc(dbSignedOut(), 'users/alice')))
})

// ---------- Templates, stickers, strips ----------

// An account with a confirmed (verified) email
function dbAsVerified(uid) {
  return testEnv.authenticatedContext(uid, { email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore()
}

function newTemplate(uid, id, changes = {}) {
  return {
    ownerId: uid,
    ownerName: 'Alice',
    name: 'Retro 4-cut',
    slotCount: 4,
    categories: ['cute'],
    visibility: 'private',
    status: 'active',
    saveCount: 0,
    thumbnailPath: 'templates/' + uid + '/' + id + '/thumbnail.png',
    dataPath: 'templates/' + uid + '/' + id + '/project.json',
    createdAt: 1,
    updatedAt: 1,
    ...changes,
  }
}

function newSticker(uid, id, changes = {}) {
  return {
    ownerId: uid,
    ownerName: 'Alice',
    name: 'main character energy',
    kind: 'static',
    categories: ['cute'],
    visibility: 'private',
    status: 'active',
    saveCount: 0,
    imagePath: 'stickers/' + uid + '/' + id + '/image',
    createdAt: 1,
    updatedAt: 1,
    ...changes,
  }
}

async function seedAlice(changes = {}) {
  await seed('users/alice', { displayName: 'Alice', createdAt: 1, ...changes })
}

test('an account can save a private template', async () => {
  await seedAlice()
  await assertSucceeds(setDoc(doc(dbAsAccount('alice'), 'templates/t1'), newTemplate('alice', 't1')))
})

test('guests cannot save templates', async () => {
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'templates/t1'), newTemplate('g1', 't1', { ownerName: 'G' })))
})

test('templates: cannot post as someone else or under a fake name', async () => {
  await seedAlice()
  await seed('users/bob', { displayName: 'Bob', createdAt: 1 })
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'templates/t1'), newTemplate('alice', 't1')))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'templates/t1'), newTemplate('bob', 't1', { ownerName: 'Alice' })))
})

test('templates: must start active with 0 saves, and files must be in my own folder', async () => {
  await seedAlice()
  const db = dbAsAccount('alice')
  await assertFails(setDoc(doc(db, 'templates/t1'), newTemplate('alice', 't1', { status: 'hidden' })))
  await assertFails(setDoc(doc(db, 'templates/t1'), newTemplate('alice', 't1', { saveCount: 999 })))
  await assertFails(setDoc(doc(db, 'templates/t1'), newTemplate('alice', 't1', { thumbnailPath: 'templates/bob/t1/thumbnail.png' })))
  await assertFails(setDoc(doc(db, 'templates/t1'), newTemplate('alice', 't1', { slotCount: 50 })))
})

test('only verified emails can make something public', async () => {
  await seedAlice()
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'templates/t1'), newTemplate('alice', 't1', { visibility: 'public' })))
  await assertSucceeds(setDoc(doc(dbAsVerified('alice'), 'templates/t1'), newTemplate('alice', 't1', { visibility: 'public' })))
})

test('the owner can make a template public/private, but not change status, saveCount or owner', async () => {
  await seedAlice()
  await seed('templates/t1', newTemplate('alice', 't1'))
  const db = dbAsVerified('alice')
  await assertSucceeds(updateDoc(doc(db, 'templates/t1'), { visibility: 'public', updatedAt: 2 }))
  await assertFails(updateDoc(doc(db, 'templates/t1'), { status: 'active', saveCount: 50 }))
  await assertFails(updateDoc(doc(db, 'templates/t1'), { ownerId: 'bob' }))
})

// A card picture's fields, as saveTemplate / saveSticker save them (see "Card pictures" in studio.js)
function cardOf(path) {
  return {
    cardPath: path,
    cardUrl: 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/' + encodeURIComponent(path) + '?alt=media&token=abc',
  }
}

test('items can have a card picture, but only their own file in Storage', async () => {
  await seedAlice()
  const db = dbAsAccount('alice')
  await assertSucceeds(setDoc(doc(db, 'templates/t1'), newTemplate('alice', 't1', cardOf('templates/alice/t1/card.webp'))))
  await assertSucceeds(setDoc(doc(db, 'stickers/s1'), newSticker('alice', 's1', cardOf('stickers/alice/s1/card.png'))))
  await assertSucceeds(setDoc(doc(db, 'stickers/s2'), newSticker('alice', 's2', cardOf('stickers/alice/s2/image'))))

  // Someone else's file, another item's file, a file that is not a card, or a link somewhere else
  await assertFails(setDoc(doc(db, 'templates/t2'), newTemplate('alice', 't2', cardOf('templates/bob/t2/card.webp'))))
  await assertFails(setDoc(doc(db, 'templates/t3'), newTemplate('alice', 't3', cardOf('templates/alice/t1/card.webp'))))
  await assertFails(setDoc(doc(db, 'templates/t4'), newTemplate('alice', 't4', cardOf('templates/alice/t4/project.json'))))
  await assertFails(setDoc(doc(db, 'templates/t5'), newTemplate('alice', 't5', {
    cardPath: 'templates/alice/t5/card.webp',
    cardUrl: 'https://example.com/templates%2Falice%2Ft5%2Fcard.webp?x',
  })))
  await assertFails(setDoc(doc(db, 'templates/t6'), newTemplate('alice', 't6', { cardUrl: cardOf('templates/alice/t6/card.webp').cardUrl })))
})

test('the owner can replace a template card when editing it', async () => {
  await seedAlice()
  await seed('templates/t1', newTemplate('alice', 't1', cardOf('templates/alice/t1/card.webp')))
  const db = dbAsAccount('alice')
  await assertSucceeds(updateDoc(doc(db, 'templates/t1'), { ...cardOf('templates/alice/t1/card.png'), updatedAt: 2 }))
  await assertFails(updateDoc(doc(db, 'templates/t1'), { ...cardOf('templates/bob/x/card.png'), updatedAt: 3 }))
})

test('banned accounts cannot save or change templates', async () => {
  await seedAlice({ banned: true })
  await seed('templates/t1', newTemplate('alice', 't1'))
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'templates/t2'), newTemplate('alice', 't2')))
  await assertFails(updateDoc(doc(dbAsAccount('alice'), 'templates/t1'), { name: 'New name', updatedAt: 2 }))
})

test('who can see a template: owner always, others only if public and not hidden', async () => {
  await seed('templates/private1', newTemplate('alice', 'private1'))
  await seed('templates/public1', newTemplate('alice', 'public1', { visibility: 'public' }))
  await seed('templates/hidden1', newTemplate('alice', 'hidden1', { visibility: 'public', status: 'hidden' }))
  await assertSucceeds(getDoc(doc(dbAsAccount('alice'), 'templates/private1')))
  await assertFails(getDoc(doc(dbAsAccount('bob'), 'templates/private1')))
  await assertSucceeds(getDoc(doc(dbAsGuest('g1'), 'templates/public1')))
  await assertFails(getDoc(doc(dbAsGuest('g1'), 'templates/hidden1')))
  await assertSucceeds(getDoc(doc(dbAsAccount('alice'), 'templates/hidden1')))
  await assertSucceeds(getDoc(doc(dbAsAdmin(), 'templates/hidden1')))
  await assertFails(getDoc(doc(dbSignedOut(), 'templates/public1')))
})

test('only admins can hide a template; only the owner or an admin can delete it', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  await assertFails(updateDoc(doc(dbAsAccount('bob'), 'templates/t1'), { status: 'hidden' }))
  await assertSucceeds(updateDoc(doc(dbAsAdmin(), 'templates/t1'), { status: 'hidden' }))
  await assertFails(deleteDoc(doc(dbAsAccount('bob'), 'templates/t1')))
  await assertSucceeds(deleteDoc(doc(dbAsAccount('alice'), 'templates/t1')))
})

test('stickers follow the same rules (create, kind, visibility)', async () => {
  await seedAlice()
  await assertSucceeds(setDoc(doc(dbAsAccount('alice'), 'stickers/s1'), newSticker('alice', 's1')))
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'stickers/s2'), newSticker('alice', 's2', { kind: 'virus' })))
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'stickers/s3'), newSticker('alice', 's3', { visibility: 'public' })))
  await assertFails(getDoc(doc(dbAsAccount('bob'), 'stickers/s1')))
})

test('a strip saved from the Share page can be a PNG, GIF or MP4, and remember its share', async () => {
  await seedAlice()
  const alice = dbAsAccount('alice')
  const strip = { ownerId: 'alice', title: 'Room 1234', imagePath: 'strips/alice/s1.mp4', format: 'mp4', createdAt: 1 }
  await assertSucceeds(setDoc(doc(alice, 'strips/s1'), strip))
  await assertSucceeds(setDoc(doc(alice, 'strips/s2'), { ...strip, imagePath: 'strips/alice/s2.gif', format: 'gif', shareId: 'k3j9x0q7m2ab' }))
  await assertSucceeds(setDoc(doc(alice, 'strips/s3'), { ...strip, imagePath: 'strips/alice/s3.png', format: 'png' }))
  // the file ending must be the format, and the path must be mine
  await assertFails(setDoc(doc(alice, 'strips/s4'), { ...strip, imagePath: 'strips/alice/s4.gif' }))
  await assertFails(setDoc(doc(alice, 'strips/s5'), { ...strip, imagePath: 'strips/bob/s5.mp4' }))
  // only png, gif, mp4
  await assertFails(setDoc(doc(alice, 'strips/s6'), { ...strip, imagePath: 'strips/alice/s6.exe', format: 'exe' }))
  // shareId is text, and not a long one; other extra fields are not allowed
  await assertFails(setDoc(doc(alice, 'strips/s7'), { ...strip, imagePath: 'strips/alice/s7.mp4', shareId: 123 }))
  await assertFails(setDoc(doc(alice, 'strips/s8'), { ...strip, imagePath: 'strips/alice/s8.mp4', shareId: 'x'.repeat(41) }))
  await assertFails(setDoc(doc(alice, 'strips/s9'), { ...strip, imagePath: 'strips/alice/s9.mp4', extra: true }))
  // guests cannot save, and nobody else can read it
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'strips/s10'), { ...strip, ownerId: 'g1', imagePath: 'strips/g1/s10.mp4' }))
  await assertFails(getDoc(doc(dbAsAccount('bob'), 'strips/s2')))
})

test('strips are private to the owner', async () => {
  await seedAlice()
  const strip = { ownerId: 'alice', title: 'Room 1234', imagePath: 'strips/alice/st1.jpg', createdAt: 1 }
  await assertSucceeds(setDoc(doc(dbAsAccount('alice'), 'strips/st1'), strip))
  await assertSucceeds(getDoc(doc(dbAsAccount('alice'), 'strips/st1')))
  await assertFails(getDoc(doc(dbAsAccount('bob'), 'strips/st1')))
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'strips/st2'), { ...strip, imagePath: 'strips/bob/st2.jpg' }))
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'strips/st3'), { ...strip, ownerId: 'g1', imagePath: 'strips/g1/st3.jpg' }))
})

test('listing: I can list my own templates and public ones, but not everyone\'s', async () => {
  await seed('templates/t1', newTemplate('alice', 't1'))
  await seed('templates/t2', newTemplate('bob', 't2', { ownerName: 'Bob' }))
  const aliceDb = dbAsAccount('alice')
  await assertSucceeds(getDocs(query(collection(aliceDb, 'templates'), where('ownerId', '==', 'alice'))))
  await assertSucceeds(getDocs(query(collection(aliceDb, 'templates'), where('visibility', '==', 'public'), where('status', '==', 'active'))))
  await assertFails(getDocs(collection(aliceDb, 'templates')))
})

// ---------- Categories ----------

test('templates and stickers need 1 to 3 categories from the list, no repeats', async () => {
  await seedAlice()
  const db = dbAsAccount('alice')
  await assertSucceeds(setDoc(doc(db, 'templates/t1'), newTemplate('alice', 't1', { categories: ['birthday', 'friends', 'cute'] })))
  await assertFails(setDoc(doc(db, 'templates/t2'), newTemplate('alice', 't2', { categories: [] })))
  await assertFails(setDoc(doc(db, 'templates/t3'), newTemplate('alice', 't3', { categories: ['birthday', 'friends', 'cute', 'love'] })))
  await assertFails(setDoc(doc(db, 'templates/t4'), newTemplate('alice', 't4', { categories: ['cute', 'cute'] })))
  await assertFails(setDoc(doc(db, 'templates/t5'), newTemplate('alice', 't5', { categories: ['not-a-category'] })))
  await assertFails(setDoc(doc(db, 'stickers/s1'), newSticker('alice', 's1', { categories: 'cute' })))
})

test('the owner can rename and change categories', async () => {
  await seedAlice()
  await seed('templates/t1', newTemplate('alice', 't1'))
  const db = dbAsAccount('alice')
  await assertSucceeds(updateDoc(doc(db, 'templates/t1'), { ownerName: 'Alice', name: 'New', categories: ['love'], updatedAt: 2 }))
  await assertFails(updateDoc(doc(db, 'templates/t1'), { categories: ['virus'], updatedAt: 3 }))
  await assertFails(updateDoc(doc(dbAsAccount('bob'), 'templates/t1'), { categories: ['love'], updatedAt: 3 }))
})

// ---------- Marketplace: browsing ----------

test('guests can browse the marketplace (public, active), filtered by category and sorted', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  const guestDb = dbAsGuest('g1')
  const marketplace = [where('visibility', '==', 'public'), where('status', '==', 'active')]
  await assertSucceeds(getDocs(query(collection(guestDb, 'templates'), ...marketplace, orderBy('createdAt', 'desc'), limit(24))))
  await assertSucceeds(getDocs(query(collection(guestDb, 'stickers'), ...marketplace, where('categories', 'array-contains', 'cute'), orderBy('saveCount', 'desc'), limit(24))))
  // Without both filters the results could include private or hidden items, so it is refused
  await assertFails(getDocs(query(collection(guestDb, 'templates'), where('visibility', '==', 'public'))))
  await assertFails(getDocs(query(collection(dbSignedOut(), 'templates'), ...marketplace)))
})

// ---------- Marketplace: saving ----------

// Save item {type}/{id} as {uid}: the bookmark and saveCount + {change}, in one batch
function saveBatch(db, uid, type, id, change = 1) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'users/' + uid + '/saved/' + id), { type: type, savedAt: Date.now() })
  batch.update(doc(db, type + '/' + id), { saveCount: increment(change) })
  return batch.commit()
}

function unsaveBatch(db, uid, type, id) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'users/' + uid + '/saved/' + id))
  batch.update(doc(db, type + '/' + id), { saveCount: increment(-1) })
  return batch.commit()
}

async function savedCount(type, id) {
  let count
  await testEnv.withSecurityRulesDisabled(async (context) => {
    count = (await getDoc(doc(context.firestore(), type + '/' + id))).data().saveCount
  })
  return count
}

test('an account can save a public item: the bookmark and saveCount + 1 together', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  await assertSucceeds(saveBatch(dbAsAccount('bob'), 'bob', 'templates', 't1'))
  assert.equal(await savedCount('templates', 't1'), 1)
  await assertSucceeds(getDoc(doc(dbAsAccount('bob'), 'users/bob/saved/t1')))
})

test('saveCount cannot be faked: no change without the bookmark, no +2, no bookmark without +1', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  const db = dbAsAccount('bob')
  await assertFails(updateDoc(doc(db, 'templates/t1'), { saveCount: increment(1) }))
  await assertFails(updateDoc(doc(db, 'templates/t1'), { saveCount: 999 }))
  await assertFails(saveBatch(db, 'bob', 'templates', 't1', 2))
  await assertFails(setDoc(doc(db, 'users/bob/saved/t1'), { type: 'templates', savedAt: 1 }))
  await assertFails(saveBatch(db, 'bob', 'stickers', 't1')) // wrong type for this item
})

test('the same account cannot save an item twice', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  const db = dbAsAccount('bob')
  await assertSucceeds(saveBatch(db, 'bob', 'templates', 't1'))
  await assertFails(saveBatch(db, 'bob', 'templates', 't1'))
  assert.equal(await savedCount('templates', 't1'), 1)
})

test('cannot save private or hidden items, as a guest, as a banned account, or into someone else\'s list', async () => {
  await seed('templates/private1', newTemplate('alice', 'private1'))
  await seed('templates/hidden1', newTemplate('alice', 'hidden1', { visibility: 'public', status: 'hidden' }))
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  await seed('users/banned1', { displayName: 'Banned', createdAt: 1, banned: true })
  await assertFails(saveBatch(dbAsAccount('bob'), 'bob', 'templates', 'private1'))
  await assertFails(saveBatch(dbAsAccount('bob'), 'bob', 'templates', 'hidden1'))
  await assertFails(saveBatch(dbAsGuest('g1'), 'g1', 'templates', 't1'))
  await assertFails(saveBatch(dbAsAccount('banned1'), 'banned1', 'templates', 't1'))
  await assertFails(saveBatch(dbAsAccount('bob'), 'carol', 'templates', 't1'))
})

test('unsave: the bookmark goes and saveCount - 1 together', async () => {
  await seed('stickers/s1', newSticker('alice', 's1', { visibility: 'public', saveCount: 5 }))
  await seed('users/bob/saved/s1', { type: 'stickers', savedAt: 1 })
  const db = dbAsAccount('bob')
  await assertFails(deleteDoc(doc(db, 'users/bob/saved/s1'))) // without taking 1 off
  await assertSucceeds(unsaveBatch(db, 'bob', 'stickers', 's1'))
  assert.equal(await savedCount('stickers', 's1'), 4)
  // Someone who never saved it cannot take 1 off
  await assertFails(updateDoc(doc(dbAsAccount('carol'), 'stickers/s1'), { saveCount: increment(-1) }))
})

test('unsave still works after the owner made the item private or deleted it', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { saveCount: 1 })) // now private
  await seed('users/bob/saved/t1', { type: 'templates', savedAt: 1 })
  await seed('users/bob/saved/gone', { type: 'templates', savedAt: 1 })
  const db = dbAsAccount('bob')
  await assertSucceeds(unsaveBatch(db, 'bob', 'templates', 't1'))
  await assertSucceeds(deleteDoc(doc(db, 'users/bob/saved/gone')))
})

test('my saved list is private to me', async () => {
  await seed('users/bob/saved/t1', { type: 'templates', savedAt: 1 })
  await assertSucceeds(getDocs(collection(dbAsAccount('bob'), 'users/bob/saved')))
  await assertFails(getDocs(collection(dbAsAccount('carol'), 'users/bob/saved')))
  await assertFails(updateDoc(doc(dbAsAccount('bob'), 'users/bob/saved/t1'), { savedAt: 2 }))
})

// ---------- Marketplace: reports ----------

function newReport(reporterId, changes = {}) {
  return {
    type: 'templates',
    itemId: 't1',
    ownerId: 'alice',
    reporterId: reporterId,
    reason: 'inappropriate',
    details: 'Rude words in the frame',
    status: 'open',
    createdAt: 1,
    ...changes,
  }
}

test('an account can report a marketplace item once', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  const db = dbAsAccount('bob')
  await assertSucceeds(setDoc(doc(db, 'reports/t1_bob'), newReport('bob')))
  await assertFails(setDoc(doc(db, 'reports/t1_bob'), newReport('bob', { reason: 'spam' })))
  await assertSucceeds(getDoc(doc(db, 'reports/t1_bob')))
})

test('reports: no faking the reporter or id, no guests, no own items, no private items, fields checked', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  await seed('templates/private1', newTemplate('alice', 'private1'))
  const db = dbAsAccount('bob')
  await assertFails(setDoc(doc(db, 'reports/t1_carol'), newReport('carol')))
  await assertFails(setDoc(doc(db, 'reports/t1_bob'), newReport('carol')))
  await assertFails(setDoc(doc(db, 'reports/anything'), newReport('bob')))
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'reports/t1_g1'), newReport('g1')))
  await assertFails(setDoc(doc(dbAsAccount('alice'), 'reports/t1_alice'), newReport('alice')))
  await assertFails(setDoc(doc(db, 'reports/private1_bob'), newReport('bob', { itemId: 'private1' })))
  await assertFails(setDoc(doc(db, 'reports/t1_bob'), newReport('bob', { ownerId: 'someone' })))
  await assertFails(setDoc(doc(db, 'reports/t1_bob'), newReport('bob', { reason: 'bored' })))
  await assertFails(setDoc(doc(db, 'reports/t1_bob'), newReport('bob', { details: 'x'.repeat(301) })))
  await assertFails(setDoc(doc(db, 'reports/t1_bob'), newReport('bob', { status: 'resolved' })))
})

test('only the reporter and admins can see a report; only admins can list and close them', async () => {
  await seed('reports/t1_bob', newReport('bob'))
  await assertFails(getDoc(doc(dbAsAccount('alice'), 'reports/t1_bob')))
  await assertFails(getDocs(collection(dbAsAccount('bob'), 'reports')))
  await assertSucceeds(getDocs(collection(dbAsAdmin(), 'reports')))
  await assertFails(updateDoc(doc(dbAsAccount('bob'), 'reports/t1_bob'), { status: 'dismissed' }))
  await assertSucceeds(updateDoc(doc(dbAsAdmin(), 'reports/t1_bob'), { status: 'resolved' }))
  // Checking "did I already report this?" works even before there is a report
  await assertSucceeds(getDoc(doc(dbAsAccount('carol'), 'reports/t1_carol')))
})

// ---------- Everything else ----------

// ---------- Admin ----------

function newLog(adminId, changes = {}) {
  return { adminId: adminId, action: 'hide', targetType: 'templates', targetId: 't1', reason: 'Rude words', createdAt: 1, ...changes }
}

test('only admins can list user profiles (e.g. banned accounts)', async () => {
  await seed('users/alice', { displayName: 'Alice', createdAt: 1, banned: true })
  await assertSucceeds(getDocs(query(collection(dbAsAdmin(), 'users'), where('banned', '==', true))))
  await assertFails(getDocs(query(collection(dbAsAccount('bob'), 'users'), where('banned', '==', true))))
})

test('admins can hide an item, close its reports and log it in one batch', async () => {
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  await seed('reports/t1_bob', newReport('bob'))
  const db = dbAsAdmin()
  const batch = writeBatch(db)
  batch.update(doc(db, 'templates/t1'), { status: 'hidden' })
  batch.update(doc(db, 'reports/t1_bob'), { status: 'resolved' })
  batch.set(doc(db, 'adminLog/log1'), newLog('admin1'))
  await assertSucceeds(batch.commit())
})

test('the admin log: only admins write it, as themselves, and nobody can change or delete it', async () => {
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'adminLog/x'), newLog('bob')))
  await assertFails(setDoc(doc(dbAsAdmin(), 'adminLog/x'), newLog('someoneElse')))
  await assertFails(setDoc(doc(dbAsAdmin(), 'adminLog/x'), newLog('admin1', { action: 'ban' }))) // bans are logged by the server
  await assertFails(setDoc(doc(dbAsAdmin(), 'adminLog/x'), newLog('admin1', { extra: true })))
  await seed('adminLog/old', newLog('admin1'))
  await assertSucceeds(getDocs(collection(dbAsAdmin(), 'adminLog')))
  await assertFails(getDocs(collection(dbAsAccount('bob'), 'adminLog')))
  await assertFails(updateDoc(doc(dbAsAdmin(), 'adminLog/old'), { reason: 'changed' }))
  await assertFails(deleteDoc(doc(dbAsAdmin(), 'adminLog/old')))
})

test('a banned account cannot save, report or create items', async () => {
  await seed('users/bob', { displayName: 'Bob', createdAt: 1, banned: true })
  await seed('templates/t1', newTemplate('alice', 't1', { visibility: 'public' }))
  await assertFails(saveBatch(dbAsAccount('bob'), 'bob', 'templates', 't1'))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'reports/t1_bob'), newReport('bob')))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'stickers/s1'), newSticker('bob', 's1', { ownerName: 'Bob' })))
})

// ---------- Folders (stickerCategories) ----------

function newFolder(ownerId, changes = {}) {
  return { ownerId: ownerId, name: 'Cute', type: 'sticker', itemIds: [], createdAt: 1, updatedAt: 1, ...changes }
}

test('folders: an account makes, renames, fills and deletes its own', async () => {
  const db = dbAsAccount('alice')
  await assertSucceeds(setDoc(doc(db, 'stickerCategories/f1'), newFolder('alice')))
  await assertSucceeds(updateDoc(doc(db, 'stickerCategories/f1'), { name: 'Love', updatedAt: 2 }))
  await assertSucceeds(updateDoc(doc(db, 'stickerCategories/f1'), { itemIds: ['s1', 's2'], updatedAt: 3 }))
  await assertSucceeds(getDocs(query(collection(db, 'stickerCategories'), where('ownerId', '==', 'alice'))))
  await assertSucceeds(deleteDoc(doc(db, 'stickerCategories/f1')))
})

test('folders: private to the owner, accounts only, checked fields', async () => {
  await seed('stickerCategories/f1', newFolder('alice'))
  await assertFails(getDoc(doc(dbAsAccount('bob'), 'stickerCategories/f1')))
  await assertFails(getDoc(doc(dbSignedOut(), 'stickerCategories/f1')))
  await assertFails(updateDoc(doc(dbAsAccount('bob'), 'stickerCategories/f1'), { name: 'Mine', updatedAt: 2 }))
  await assertFails(deleteDoc(doc(dbAsAccount('bob'), 'stickerCategories/f1')))
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'stickerCategories/f2'), newFolder('g1')))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'stickerCategories/f3'), newFolder('alice')))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'stickerCategories/f3'), newFolder('bob', { name: '' })))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'stickerCategories/f3'), newFolder('bob', { name: 'x'.repeat(21) })))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'stickerCategories/f3'), newFolder('bob', { type: 'video' })))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'stickerCategories/f3'), newFolder('bob', { extra: 1 })))
  await assertFails(updateDoc(doc(dbAsAccount('alice'), 'stickerCategories/f1'), { ownerId: 'bob' }))
  await assertFails(updateDoc(doc(dbAsAccount('alice'), 'stickerCategories/f1'), { itemIds: 'x', updatedAt: 2 }))
})

test('folders: a banned account cannot make or change them', async () => {
  await seed('users/bob', { displayName: 'Bob', createdAt: 1, banned: true })
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'stickerCategories/f1'), newFolder('bob')))
})

test('a collection nobody wrote a rule for is blocked, even for signed-in users', async () => {
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'musicMixes/m1'), { a: 1 }))
  await assertFails(getDoc(doc(dbAsAccount('alice'), 'musicMixes/m1')))
  await assertFails(setDoc(doc(dbAsAdmin(), 'musicMixes/m1'), { a: 1 }))
})

test('the strict collections stay strict', async () => {
  await seed('templates/t1', newTemplate('alice', 't1'))
  await assertFails(getDoc(doc(dbAsAccount('bob'), 'templates/t1')))
  await assertFails(setDoc(doc(dbAsGuest('g1'), 'users/g1'), { anything: true }))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'reports/x'), { anything: true }))
  await assertFails(setDoc(doc(dbAsAccount('bob'), 'users/bob/saved/t1'), { anything: true }))
})
