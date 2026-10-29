// Tests for storage.rules. Runs against local copies of Storage and Firestore (the "emulators"),
// never the real project. Run with:  npm run test:rules   (needs Java installed)

import { test, before, beforeEach, after } from 'node:test'
import fs from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'

let testEnv

// DEV: storage.rules has a block that opens everything while we build (DEV-OPEN-START ... DEV-OPEN-END).
// Remove it here, so these tests still check the strict rules that remain after the lockdown.
const storageRules = fs.readFileSync('storage.rules', 'utf8')
const strictStorageRules = storageRules.replace(/\/\/ DEV-OPEN-START[\s\S]*?\/\/ DEV-OPEN-END/, '')

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-blue-studios',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: strictStorageRules, host: '127.0.0.1', port: 9199 },
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

// DEV: make sure the open block is still there and can be found (delete this test at lockdown)
test('DEV: storage.rules has exactly one DEV-OPEN block, which the tests remove', () => {
  if (strictStorageRules === storageRules || strictStorageRules.includes('DEV-OPEN-START')) {
    throw new Error('expected one "// DEV-OPEN-START ... // DEV-OPEN-END" block in storage.rules')
  }
})

test('without the DEV block, new folders are closed', async () => {
  await assertFails(uploadBytes(ref(storageAsGuest('g1'), 'videos/1234/v1.webm'), PNG, { contentType: 'video/webm' }))
})
