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

test('strips are private: only the owner can upload and download', async () => {
  await assertSucceeds(uploadBytes(ref(storageAs('alice'), 'strips/alice/st1.jpg'), PNG, jpeg))
  await assertFails(uploadBytes(ref(storageAs('alice'), 'strips/alice/st1.jpg'), PNG, png))
  await assertSucceeds(getBytes(ref(storageAs('alice'), 'strips/alice/st1.jpg')))
  await assertFails(getBytes(ref(storageAs('bob'), 'strips/alice/st1.jpg')))
})

test('only the owner or an admin can delete files', async () => {
  await seedFile('templates/alice/t1/thumbnail.png', png)
  await assertFails(deleteObject(ref(storageAs('bob'), 'templates/alice/t1/thumbnail.png')))
  await assertSucceeds(deleteObject(ref(storageAs('alice'), 'templates/alice/t1/thumbnail.png')))
})

// DEV: new folders are open to signed-in users while teammates build (delete this test at lockdown)
test('DEV: new folders are open to signed-in users (under 50 MB), but not the strict folders', async () => {
  const guest = testEnv.authenticatedContext('g1', { firebase: { sign_in_provider: 'anonymous' } }).storage()
  await assertSucceeds(uploadBytes(ref(guest, 'clips/1234/c1.webm'), PNG, { contentType: 'video/webm' }))
  await assertSucceeds(getBytes(ref(storageAsGuest('g2'), 'clips/1234/c1.webm')))
  await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), 'clips/1234/c1.webm')))
  await assertFails(uploadBytes(ref(guest, 'templates/g1/t1/thumbnail.png'), PNG, png))
  // no web pages or scripts (they could be used for phishing from a Firebase address)
  await assertFails(uploadBytes(ref(guest, 'clips/1234/page.html'), PNG, { contentType: 'text/html' }))
  await assertFails(uploadBytes(ref(guest, 'clips/1234/x.svg'), PNG, { contentType: 'image/svg+xml' }))
})
