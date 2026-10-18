// Tests for firestore.rules. Runs against a local copy of Firestore (the "emulator"),
// never the real database. Run with:  npm run test:rules   (needs Java installed)
//
// assertSucceeds(...) = this read/write SHOULD be allowed
// assertFails(...)    = this read/write SHOULD be blocked

import { test, before, beforeEach, after } from 'node:test'
import fs from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore'

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
    stage: 'camera',
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

test('a room code must be 4 digits, and a new room must start empty', async () => {
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/abcd'), newRoom('host')))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), shotNumber: 7 }))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), closed: true }))
  await assertFails(setDoc(doc(dbAs('host'), 'rooms/5555'), { ...newRoom('host'), isAdmin: true }))
})

test('anyone signed in can look up one room, but not list all rooms', async () => {
  await seedRoom()
  await assertSucceeds(getDoc(doc(dbAs('stranger'), 'rooms/1234')))
  await assertFails(getDocs(collection(dbAs('stranger'), 'rooms')))
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

test('members can change stage and strip slots, but not the host', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { stage: 'strip' }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { stage: 'hacked' }))
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { 'stripSlots.2': 'photoA' }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { 'stripSlots.9': 'photoA' }))
  await assertFails(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { hostId: 'guest' }))
})

test('members can close a room, but a closed room cannot be reopened or changed', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAs('guest'), 'rooms/1234'), { closed: true }))
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { closed: false }))
  await assertFails(updateDoc(doc(dbAs('host'), 'rooms/1234'), { stage: 'strip' }))
})

test('an admin can close any room', async () => {
  await seedRoom()
  await assertSucceeds(updateDoc(doc(dbAsAdmin(), 'rooms/1234'), { closed: true }))
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

test('signed-in users can read one profile but not list all users', async () => {
  await seed('users/alice', { displayName: 'Alice', createdAt: 1 })
  await assertSucceeds(getDoc(doc(dbAsGuest('g1'), 'users/alice')))
  await assertFails(getDocs(collection(dbAsGuest('g1'), 'users')))
  await assertFails(getDoc(doc(dbSignedOut(), 'users/alice')))
})

// ---------- Everything else ----------

test('any other collection is blocked', async () => {
  await assertFails(setDoc(doc(dbAs('host'), 'anything/else'), { a: 1 }))
  await assertFails(getDoc(doc(dbAs('host'), 'secrets/x')))
})
