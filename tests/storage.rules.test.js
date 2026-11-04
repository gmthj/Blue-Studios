// Tests for storage.rules. Runs against local copies of Storage and Firestore (the "emulators"),
// never the real project. Run with:  npm run test:rules   (needs Java installed)

import { test, before, beforeEach, after } from 'node:test'
import fs from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'

let testEnv


before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-blue-studios',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: fs.readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
})

after(async () => {
  await testEnv.cleanup()
})

function storageAs(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' }, ...claims }).storage()
}
function storageAsGuest(uid) {
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).storage()
}
function storageAsAdmin() {
  return storageAs('admin1', { admin: true })
}

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const png = { contentType: 'image/png' }
const json = { contentType: 'application/json' }
const jpeg = { contentType: 'image/jpeg' }

// Put a file / Firestore document in place without the rules (like an admin tool)
async function seedFile(path, metadata) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), path), PNG, metadata)
  })
}
async function seedDoc(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data)
  })
}

test('an account can upload a template thumbnail and project file into its own folder', async () => {
  const storage = storageAs('alice')
  await assertSucceeds(uploadBytes(ref(storage, 'templates/alice/t1/thumbnail.png'), PNG, png))
  await assertSucceeds(uploadBytes(ref(storage, 'templates/alice/t1/project.json'), PNG, json))
})

test('nobody can upload into someone else\'s folder, and guests cannot upload', async () => {
  await assertFails(uploadBytes(ref(storageAs('bob'), 'templates/alice/t1/thumbnail.png'), PNG, png))
  await assertFails(uploadBytes(ref(storageAsGuest('g1'), 'templates/g1/t1/thumbnail.png'), PNG, png))
})

test('uploads must be the right type, name and size', async () => {
  const storage = storageAs('alice')
  await assertFails(uploadBytes(ref(storage, 'templates/alice/t1/thumbnail.png'), PNG, { contentType: 'text/html' }))
  await assertFails(uploadBytes(ref(storage, 'templates/alice/t1/evil.exe'), PNG, png))
  const tooBig = new Uint8Array(3 * 1024 * 1024)
  await assertFails(uploadBytes(ref(storage, 'templates/alice/t1/thumbnail.png'), tooBig, png))
})

test('a template project file has no size limit (pictures from the editor are inside it), but must be JSON', async () => {
  const storage = storageAs('alice')
  await assertSucceeds(uploadBytes(ref(storage, 'templates/alice/t1/project.json'), new Uint8Array(25 * 1024 * 1024), json))
  await assertFails(uploadBytes(ref(storageAs('bob'), 'templates/alice/t1/project.json'), PNG, json))
  await assertFails(uploadBytes(ref(storage, 'templates/alice/t1/project.json'), PNG, { contentType: 'text/html' }))
})

test('private template files: only the owner (and admins) can download', async () => {
  await seedDoc('templates/t1', { ownerId: 'alice', visibility: 'private', status: 'active' })
  await seedFile('templates/alice/t1/thumbnail.png', png)
  await assertSucceeds(getBytes(ref(storageAs('alice'), 'templates/alice/t1/thumbnail.png')))
  await assertSucceeds(getBytes(ref(storageAsAdmin(), 'templates/alice/t1/thumbnail.png')))
  await assertFails(getBytes(ref(storageAs('bob'), 'templates/alice/t1/thumbnail.png')))
})

test('public template files: anyone signed in can download, until an admin hides it', async () => {
  await seedDoc('templates/t1', { ownerId: 'alice', visibility: 'public', status: 'active' })
  await seedFile('templates/alice/t1/thumbnail.png', png)
  await assertSucceeds(getBytes(ref(storageAsGuest('g1'), 'templates/alice/t1/thumbnail.png')))

  await seedDoc('templates/t1', { ownerId: 'alice', visibility: 'public', status: 'hidden' })
  await assertFails(getBytes(ref(storageAsGuest('g1'), 'templates/alice/t1/thumbnail.png')))
})

test('sticker images follow the same rules', async () => {
  await assertSucceeds(uploadBytes(ref(storageAs('alice'), 'stickers/alice/s1/image'), PNG, png))
  await assertFails(uploadBytes(ref(storageAs('bob'), 'stickers/alice/s1/image'), PNG, png))
  await seedDoc('stickers/s1', { ownerId: 'alice', visibility: 'public', status: 'active' })
  await assertSucceeds(getBytes(ref(storageAs('bob'), 'stickers/alice/s1/image')))
})

test('card pictures (small copies for the grids) can be uploaded next to the item, up to 1 MB', async () => {
  const storage = storageAs('alice')
  const webp = { contentType: 'image/webp' }
  await assertSucceeds(uploadBytes(ref(storage, 'templates/alice/t1/card.webp'), PNG, webp))
  await assertSucceeds(uploadBytes(ref(storage, 'stickers/alice/s1/card.png'), PNG, png))
  await assertFails(uploadBytes(ref(storageAs('bob'), 'stickers/alice/s1/card.webp'), PNG, webp))
  await assertFails(uploadBytes(ref(storage, 'stickers/alice/s1/evil.exe'), PNG, png))
  await assertFails(uploadBytes(ref(storage, 'templates/alice/t1/card.webp'), new Uint8Array(1.5 * 1024 * 1024), webp))
})

test('strips are private: only the owner can upload and download', async () => {
  await assertSucceeds(uploadBytes(ref(storageAs('alice'), 'strips/alice/st1.jpg'), PNG, jpeg))
  await assertFails(uploadBytes(ref(storageAs('alice'), 'strips/alice/st1.jpg'), PNG, png))
  await assertSucceeds(getBytes(ref(storageAs('alice'), 'strips/alice/st1.jpg')))
  await assertFails(getBytes(ref(storageAs('bob'), 'strips/alice/st1.jpg')))
})

test('video clips: an admin can play and delete them', async () => {
  const webm = { contentType: 'video/webm' }
  await seedFile('clips/1234/alice/c1.webm', webm)
  await assertSucceeds(getBytes(ref(storageAsAdmin(), 'clips/1234/alice/c1.webm')))
  await assertFails(getBytes(ref(storageAs('bob'), 'clips/1234/alice/c1.webm')))
  await assertFails(deleteObject(ref(storageAs('bob'), 'clips/1234/alice/c1.webm')))
  await assertSucceeds(deleteObject(ref(storageAsAdmin(), 'clips/1234/alice/c1.webm')))
})

test('profile pictures: the owner uploads a small JPEG, anyone signed in can see it', async () => {
  await assertSucceeds(uploadBytes(ref(storageAs('alice'), 'avatars/alice/avatar.jpg'), PNG, jpeg))
  await assertSucceeds(getBytes(ref(storageAsGuest('g1'), 'avatars/alice/avatar.jpg')))
  await assertFails(uploadBytes(ref(storageAs('bob'), 'avatars/alice/avatar.jpg'), PNG, jpeg))
  await assertFails(uploadBytes(ref(storageAsGuest('g1'), 'avatars/g1/avatar.jpg'), PNG, jpeg))
  await assertFails(uploadBytes(ref(storageAs('alice'), 'avatars/alice/avatar.jpg'), PNG, png))
  await assertFails(uploadBytes(ref(storageAs('alice'), 'avatars/alice/avatar.jpg'), new Uint8Array(1024 * 1024), jpeg))
})

test('only the owner or an admin can delete files', async () => {
  await seedFile('templates/alice/t1/thumbnail.png', png)
  await assertFails(deleteObject(ref(storageAs('bob'), 'templates/alice/t1/thumbnail.png')))
  await assertSucceeds(deleteObject(ref(storageAs('alice'), 'templates/alice/t1/thumbnail.png')))
})

// ---------- Video clips and music (only people in the room) ----------

const webm = { contentType: 'video/webm' }
const mp4 = { contentType: 'video/mp4' }
const wav = { contentType: 'audio/wav' }
const mp3 = { contentType: 'audio/mpeg' }

// Room 1234 with 'alice' and 'bob' as members ('carol' is not in it)
async function seedRoomMembers() {
  await seedDoc('rooms/1234/members/alice', { name: 'Alice' })
  await seedDoc('rooms/1234/members/bob', { name: 'Bob' })
}

test('clips: a member uploads into their own folder, and the other members can play it', async () => {
  await seedRoomMembers()
  await assertSucceeds(uploadBytes(ref(storageAsGuest('alice'), 'clips/1234/alice/c1.webm'), PNG, webm))
  await assertSucceeds(uploadBytes(ref(storageAsGuest('alice'), 'clips/1234/alice/c2.mp4'), PNG, mp4))
  await assertSucceeds(getBytes(ref(storageAsGuest('bob'), 'clips/1234/alice/c1.webm')))
})

test('clips: not for people outside the room, not in someone else\'s folder, not the wrong type or size', async () => {
  await seedRoomMembers()
  await assertFails(uploadBytes(ref(storageAsGuest('carol'), 'clips/1234/carol/c1.webm'), PNG, webm))
  await assertFails(uploadBytes(ref(storageAsGuest('bob'), 'clips/1234/alice/c1.webm'), PNG, webm))
  await assertFails(uploadBytes(ref(storageAsGuest('alice'), 'clips/1234/alice/c1.webm'), PNG, { contentType: 'text/html' }))
  await assertFails(uploadBytes(ref(storageAsGuest('alice'), 'clips/1234/alice/c1.html'), PNG, webm))
  await assertFails(uploadBytes(ref(storageAsGuest('alice'), 'clips/1234/alice/c1.mp4'), PNG, webm))
  await assertFails(uploadBytes(ref(storageAsGuest('alice'), 'clips/1234/alice/c1.webm'), new Uint8Array(51 * 1024 * 1024), webm))
  await seedFile('clips/1234/alice/c9.webm', webm)
  await assertFails(getBytes(ref(storageAsGuest('carol'), 'clips/1234/alice/c9.webm')))
  await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), 'clips/1234/alice/c9.webm')))
  // a clip cannot be replaced or deleted by a member
  await assertFails(uploadBytes(ref(storageAsGuest('alice'), 'clips/1234/alice/c9.webm'), PNG, webm))
  await assertFails(deleteObject(ref(storageAsGuest('alice'), 'clips/1234/alice/c9.webm')))
})

test('music: members save the mix and upload songs; outsiders cannot', async () => {
  await seedRoomMembers()
  await assertSucceeds(uploadBytes(ref(storageAsGuest('alice'), 'music/1234/mix.wav'), PNG, wav))
  await assertSucceeds(uploadBytes(ref(storageAsGuest('bob'), 'music/1234/mix.wav'), PNG, wav))
  await assertSucceeds(getBytes(ref(storageAsGuest('bob'), 'music/1234/mix.wav')))
  await assertSucceeds(uploadBytes(ref(storageAsGuest('alice'), 'music/1234/uploads/alice/1700000000000'), PNG, mp3))
  await assertSucceeds(getBytes(ref(storageAsGuest('bob'), 'music/1234/uploads/alice/1700000000000')))
  await assertFails(uploadBytes(ref(storageAsGuest('carol'), 'music/1234/mix.wav'), PNG, wav))
  await assertFails(uploadBytes(ref(storageAsGuest('carol'), 'music/1234/uploads/carol/1'), PNG, mp3))
  await assertFails(getBytes(ref(storageAsGuest('carol'), 'music/1234/mix.wav')))
  await assertFails(uploadBytes(ref(storageAsGuest('bob'), 'music/1234/uploads/alice/2'), PNG, mp3))
})

test('music: only audio, only the right names, and size limits', async () => {
  await seedRoomMembers()
  const alice = storageAsGuest('alice')
  await assertFails(uploadBytes(ref(alice, 'music/1234/mix.wav'), PNG, { contentType: 'text/html' }))
  await assertFails(uploadBytes(ref(alice, 'music/1234/mix.wav'), PNG, mp3))
  await assertFails(uploadBytes(ref(alice, 'music/1234/mix.wav'), new Uint8Array(21 * 1024 * 1024), wav))
  await assertFails(uploadBytes(ref(alice, 'music/1234/other.wav'), PNG, wav))
  await assertFails(uploadBytes(ref(alice, 'music/1234/uploads/alice/1'), PNG, { contentType: 'image/svg+xml' }))
  await assertFails(uploadBytes(ref(alice, 'music/1234/uploads/alice/1'), PNG, { contentType: 'text/html' }))
  await assertFails(uploadBytes(ref(alice, 'music/1234/uploads/alice/evil.html'), PNG, mp3))
  await assertFails(uploadBytes(ref(alice, 'music/1234/uploads/alice/1'), new Uint8Array(16 * 1024 * 1024), mp3))
})

test('music: admins can listen and delete', async () => {
  await seedFile('music/1234/mix.wav', wav)
  await assertSucceeds(getBytes(ref(storageAsAdmin(), 'music/1234/mix.wav')))
  await assertSucceeds(deleteObject(ref(storageAsAdmin(), 'music/1234/mix.wav')))
})

test('everything else is closed: new folders, and HTML, SVG, JavaScript and XML anywhere', async () => {
  await seedRoomMembers()
  await assertFails(uploadBytes(ref(storageAsGuest('alice'), 'videos/1234/v1.webm'), PNG, webm))
  await assertFails(uploadBytes(ref(storageAs('alice'), 'misc/alice/a.png'), PNG, png))
  await assertFails(getBytes(ref(storageAsGuest('alice'), 'misc/alice/a.png')))
  const alice = storageAs('alice')
  for (const type of ['text/html', 'image/svg+xml', 'application/javascript', 'text/javascript', 'application/xml', 'text/xml']) {
    await assertFails(uploadBytes(ref(alice, 'stickers/alice/s1/image'), PNG, { contentType: type }))
    await assertFails(uploadBytes(ref(alice, 'strips/alice/x1.jpg'), PNG, { contentType: type }))
    await assertFails(uploadBytes(ref(alice, 'shares/alice/x1.png'), PNG, { contentType: type }))
  }
})
