// Shared helpers for the end-to-end tests. Import test and expect from here instead of '@playwright/test':
//
//   import { test, expect, createAccount, logIn } from './support/fixtures.js'
//
// The app runs against the Firebase emulators (see playwright.config.js), so these helpers can set up data
// directly with the Admin SDK, skipping the security rules (like an admin tool would): accounts, admins,
// marketplace items and reports. Everything gets a random name, so tests never get in each other's way
// and never need the emulators to be emptied.
import { test as base, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

export const PROJECT_ID = 'demo-blue-studios'
export const BUCKET = PROJECT_ID + '.appspot.com'

// The Admin SDK finds the emulators through these
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'

const adminApp = getApps()[0] || initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET })
export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
const bucket = getStorage(adminApp).bucket()

// /api/* are Vercel functions (video call tokens, admin bans, weather...). The test server (Vite) doesn't run them,
// so by default they answer like a server that is down. A test can answer one itself with page.route(...):
// routes added later are tried first.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(
      (url) => url.port === '5174' && url.pathname.startsWith('/api/'),
      (route) => route.fulfill({ status: 503, json: { error: 'Not available in the end-to-end tests' } }),
    )
    // The floating video call window is remembered on each device (VideoCallCard.vue). Start it minimised, at the
    // top right, so it never covers the Back / Next buttons at the bottom of the room pages.
    await page.addInitScript(() => {
      localStorage.setItem('callMinimised', 'true')
      localStorage.setItem('callDock', JSON.stringify({ x: 8, y: 64, right: true, bottom: false }))
      // The Pick page's first-time tips (StripView.vue) would sit over the gallery the tests drag from
      localStorage.setItem('pick-tips-seen', '1')
    })
    await use(page)
  },
})
export { expect }

// A short random id, e.g. 'k3x9q2'
export function uniq() {
  return Math.random().toString(36).slice(2, 8)
}

// ---------- Accounts ----------

// Make an account (email + password) straight in the Auth emulator, with its public profile.
//   admin: true    gives it the admin mark (like scripts/set-admin.mjs)
//   verified: false   its email is not confirmed yet (it can't publish to the marketplace)
// Returns { uid, email, password, name }
export async function createAccount({ name = 'Tester ' + uniq(), admin = false, verified = true } = {}) {
  const email = 'e2e-' + uniq() + uniq() + '@example.com'
  const password = 'password-' + uniq()
  const user = await adminAuth.createUser({ email, password, displayName: name, emailVerified: verified })
  if (admin) await adminAuth.setCustomUserClaims(user.uid, { admin: true })
  await adminDb.doc('users/' + user.uid).set({ displayName: name, createdAt: Date.now() })
  return { uid: user.uid, email, password, name }
}

// Log in through the log in page, like a person would. Waits until the app has moved on from /login.
export async function logIn(page, account, redirect) {
  await page.goto(redirect ? '/login?redirect=' + encodeURIComponent(redirect) : '/login')
  await fillLogIn(page, account)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })
}

export async function fillLogIn(page, account) {
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.locator('form').getByRole('button', { name: 'Log in' }).click()
}

// ---------- Marketplace items ----------

// A 1 x 1 blue PNG, for template and sticker pictures
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk8P/PAAMmAiRRsc0yAAAAAElFTkSuQmCC',
  'base64',
)

// Upload a file to the Storage emulator, and return its download link (like getDownloadURL in the app)
async function upload(path, data, contentType) {
  const token = randomUUID()
  await bucket.file(path).save(data, { contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } } })
  return 'http://127.0.0.1:9199/v0/b/' + BUCKET + '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token
}

// A plain 4-cut frame, in the shape the frame editor saves (projectData in useFrameEditor.js),
// so "Use template" and "Open in Frame Editor" can load it
function templateProject(name) {
  const slots = [
    { x: 6, y: 3, w: 88, h: 20 },
    { x: 6, y: 25, w: 88, h: 20 },
    { x: 6, y: 47, w: 88, h: 20 },
    { x: 6, y: 69, w: 88, h: 20 },
  ]
  return {
    templateName: name,
    version: 1,
    activeLayout: 'custom',
    stripLayoutId: 'custom',
    slotCount: 4,
    slots,
    slotRects: slots,
    aspect: 3 / 10,
    shape: 'square',
    background: '#FFFFFF',
    border: '#1A1A2E',
    caption: name,
    captionColor: '#1A1A2E',
  }
}

// A template in the marketplace (public and active unless changed). owner: from createAccount.
export async function seedTemplate(owner, changes = {}) {
  const ref = adminDb.collection('templates').doc()
  const folder = 'templates/' + owner.uid + '/' + ref.id + '/'
  const name = changes.name || 'Template ' + uniq()
  await upload(folder + 'thumbnail.png', PNG, 'image/png')
  await upload(folder + 'project.json', Buffer.from(JSON.stringify(templateProject(name))), 'application/json')
  const cardUrl = await upload(folder + 'card.png', PNG, 'image/png')
  const now = Date.now()
  const data = {
    ownerId: owner.uid,
    ownerName: owner.name,
    name,
    slotCount: 4,
    categories: ['cute'],
    visibility: 'public',
    status: 'active',
    saveCount: 0,
    thumbnailPath: folder + 'thumbnail.png',
    dataPath: folder + 'project.json',
    cardPath: folder + 'card.png',
    cardUrl,
    createdAt: now,
    updatedAt: now,
    ...changes,
  }
  await ref.set(data)
  return { id: ref.id, type: 'templates', ...data }
}

// A sticker in the marketplace (public and active unless changed)
export async function seedSticker(owner, changes = {}) {
  const ref = adminDb.collection('stickers').doc()
  const imagePath = 'stickers/' + owner.uid + '/' + ref.id + '/image'
  const cardUrl = await upload(imagePath, PNG, 'image/png')
  const now = Date.now()
  const data = {
    ownerId: owner.uid,
    ownerName: owner.name,
    name: changes.name || 'Sticker ' + uniq(),
    kind: 'static',
    categories: ['cute'],
    visibility: 'public',
    status: 'active',
    saveCount: 0,
    imagePath,
    cardPath: imagePath,
    cardUrl,
    createdAt: now,
    updatedAt: now,
    ...changes,
  }
  await ref.set(data)
  return { id: ref.id, type: 'stickers', ...data }
}

// A report about an item (see MarketplaceItemDialog.vue), from reporter (from createAccount)
export async function seedReport(item, reporter, changes = {}) {
  const data = {
    type: item.type,
    itemId: item.id,
    ownerId: item.ownerId,
    reporterId: reporter.uid,
    reason: 'spam',
    details: '',
    status: 'open',
    createdAt: Date.now(),
    ...changes,
  }
  await adminDb.doc('reports/' + item.id + '_' + reporter.uid).set(data)
  return data
}

// ---------- Rooms ----------

// Create a new room from the home page, and wait for the Shoot step. Returns the room code, e.g. '4821'.
export async function createRoom(page, name = 'Playwright') {
  await page.goto('/')
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Create a new room' }).click()
  await expect(page).toHaveURL(/\/room\/\d{4}\/shoot/, { timeout: 20000 })
  return page.url().match(/\/room\/(\d{4})\//)[1]
}

// Wait until the camera on the Shoot step shows a picture. Pressing the shutter before then takes no photo.
export async function waitForCamera(page) {
  await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Starting your camera...')).toBeHidden({ timeout: 15000 })
  // videoWidth is 0 until the first frame arrives. expect.poll keeps asking until the answer passes.
  const camera = page.locator('.camera-page video').first()
  await expect.poll(() => camera.evaluate((video) => video.videoWidth), { timeout: 15000 }).toBeGreaterThan(0)
}

// Take photos until the gallery has `count` (each one has a 3 s countdown).
// Now and then a press doesn't start the countdown, so press again, like a person would.
// toPass() runs the block again until everything in it passes.
export async function takePhotos(page, count) {
  const galleryCount = page.locator('.gallery-count').locator('visible=true')
  for (let i = 1; i <= count; i++) {
    await expect(async () => {
      // Already have this many (a slow earlier photo arrived)? Then there's nothing to take.
      if ((await galleryCount.count()) > 0 && Number(await galleryCount.textContent()) >= i) return
      await page.getByRole('button', { name: 'Take a photo' }).click()
      await expect(galleryCount).toHaveText(String(i), { timeout: 8000 })
    }).toPass({ timeout: 40000 })
  }
}

// Pick: tap a photo, then tap a frame, for every frame (the same as dragging, but easier to test)
export async function fillStrip(page, name = 'Playwright', slots = 4) {
  for (let i = 0; i < slots; i++) {
    await page.getByAltText('Photo by ' + name).nth(i).click()
    await page.locator('[data-test="slot-' + i + '"]').click()
  }
}

// Press the room's Next button and wait for the next step's address, e.g. nextStage(page, 'pick')
export async function nextStage(page, stage) {
  await page.locator('[data-test="stage-next"]').click()
  await expect(page).toHaveURL(new RegExp('/' + stage + '$'), { timeout: 20000 })
}

// A whole strip, in a NEW room: create it, take 4 photos, put them in the 4 frames, and go on to Decorate.
// Returns the room code.
export async function makeStrip(page, name = 'Playwright') {
  const code = await createRoom(page, name)
  await waitForCamera(page)
  await takePhotos(page, 4)
  await nextStage(page, 'pick')
  await fillStrip(page, name)
  await nextStage(page, 'decorate')
  return code
}
