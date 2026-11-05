import {
  test, expect, createRoom, waitForCamera, takePhotos, makeStrip, nextStage, adminDb,
} from './support/fixtures.js'

// Photobooth rooms with more than one person, and a strip all the way to its public share page.
// Each test makes its own NEW room, so it never depends on a room someone else can change.

test('a friend joins by code, sees the shared photos, follows the host, and is sent home when the room closes', async ({ page, browser }) => {
  test.setTimeout(120000)

  // (1) setup: the host makes a room, a friend (another browser, so another guest) joins it with the code
  const code = await createRoom(page, 'Host')
  const friendContext = await browser.newContext()
  const friend = await friendContext.newPage()
  await friend.goto('/')
  await friend.getByLabel('Your name').fill('Friend')
  await friend.getByLabel('4-digit room code').fill(code)
  await friend.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(friend).toHaveURL('/room/' + code + '/shoot', { timeout: 20000 })

  // Both are in the room: the host sees the friend's face in the stage bar
  await expect(page.locator('.faces').getByAltText('Friend')).toBeAttached({ timeout: 15000 })
  expect((await adminDb.collection('rooms/' + code + '/members').get()).size).toBe(2)

  // (2) the host presses the shutter: the countdown runs on every device, so EVERYONE takes a photo,
  // and both photos show up in both galleries (synchronised countdown + shared gallery)
  await waitForCamera(page)
  await takePhotos(page, 2)
  await expect(friend.locator('.gallery-count').locator('visible=true')).toHaveText('2', { timeout: 15000 })
  await expect(friend.getByAltText('Photo by Host').locator('visible=true').first()).toBeVisible()
  await expect(page.getByAltText('Photo by Friend').locator('visible=true').first()).toBeVisible()

  // The host moves on: everyone moves with them
  await nextStage(page, 'pick')
  await expect(friend).toHaveURL('/room/' + code + '/pick', { timeout: 15000 })

  // (3) the host closes the room: the friend goes back to the home page, which says so
  await page.getByRole('button', { name: 'Close room' }).click()
  await page.getByRole('dialog', { name: 'Close this room for everyone?' }).getByRole('button', { name: 'Close room' }).click()
  await expect(friend).toHaveURL(/\/\?closed=/, { timeout: 15000 })
  await expect(friend.getByText('Room ' + code + ' was closed.')).toBeVisible()
  // A closed room can't be joined again
  await friend.goto('/room/' + code)
  await expect(friend.getByRole('heading', { name: 'Room ' + code + ' has ended' })).toBeVisible({ timeout: 15000 })

  await friendContext.close()
})

test('leaving a room takes me home and out of the members list', async ({ page }) => {
  const code = await createRoom(page, 'Leaver')

  await page.getByRole('button', { name: 'Leave' }).click()

  await expect(page).toHaveURL('/')
  await expect.poll(async () => (await adminDb.collection('rooms/' + code + '/members').get()).size).toBe(0)
})

test('after leaving, the home page offers to go back into the room, until I say not now', async ({ page }) => {
  const code = await createRoom(page, 'Rejoiner')
  await page.getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL('/')

  // The room is still open, so the home page asks (recentRooms.js remembers it on this device)
  const card = page.getByRole('region', { name: 'Go back into room ' + code + '?' })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole('button', { name: 'Rejoin room ' + code }).click()
  await expect(page).toHaveURL('/room/' + code + '/shoot', { timeout: 20000 })

  // Leave again and press Not now: the card goes, and stays gone after a reload
  await page.getByRole('button', { name: 'Leave' }).click()
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole('button', { name: 'Not now' }).click()
  await expect(card).toBeHidden()
  await page.reload()
  await expect(page.getByLabel('Your name')).toBeVisible()
  await expect(card).toBeHidden()
})

test('a room link opened without a name goes home with the code filled in', async ({ page }) => {
  await page.goto('/room/0000')

  await expect(page).toHaveURL(/\/\?/)
  await expect(page.getByLabel('4-digit room code')).toHaveValue('0000')
})

test('a room code that does not exist shows its own page', async ({ page }) => {
  // Pressing Join saves my name on this device, so the room link below doesn't ask for it again
  await page.goto('/')
  await page.getByLabel('Your name').fill('Playwright')
  await page.getByLabel('4-digit room code').fill('0000')
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()

  await page.goto('/room/0000')
  await expect(page.getByRole('heading', { name: "Room 0000 doesn't exist" })).toBeVisible({ timeout: 15000 })
})

test('should make a strip, add a sticker, export it as a PNG and open its public share page', async ({ page, browser }) => {
  test.setTimeout(180000)

  // (1) setup: a full strip in a new room
  const code = await makeStrip(page)

  // (2) Decorate: add the first sticker from the tray, it shows up in the layers list
  await page.locator('section[aria-label="Sticker tray"]').getByRole('button', { name: /^Add / }).first().click()
  await expect(page.getByRole('button', { name: 'Hide this sticker' })).toHaveCount(1)

  // Music (skip it), then Export: a name everyone sees. Nobody picks the format: a still strip with no music
  // is a PNG (chooseExportFormat in exportRules.js)
  await nextStage(page, 'music')
  await nextStage(page, 'export')
  await page.getByLabel('Everyone in the room sees this as you type').fill('E2E strip ' + code)
  await page.getByRole('button', { name: 'Share and download' }).click()

  // Share: the PNG is made in the browser and uploaded, then the link, QR code and Download button show
  await expect(page).toHaveURL(/\/share$/, { timeout: 20000 })
  await expect(page.getByRole('heading', { name: 'E2E strip ' + code })).toBeVisible({ timeout: 60000 })
  await expect(page.getByAltText('QR code of the link to this strip')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download PNG' })).toBeVisible()
  // Guests are asked to log in before saving to My Studio
  await expect(page.getByRole('button', { name: 'Log in to save it to My Studio' })).toBeVisible()

  // (3) assert: anyone with the link (a new browser, a new guest) sees the strip
  const link = await page.locator('a[href*="/s/"]').first().getAttribute('href')
  const shareId = link.match(/\/s\/([^/?#]+)/)[1]
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  await visitor.goto('/s/' + shareId)
  await expect(visitor.getByRole('heading', { name: 'E2E strip ' + code })).toBeVisible({ timeout: 15000 })
  await expect(visitor.getByText('Shared strip')).toBeVisible()
  // The picture really loads (naturalWidth is 0 for a broken picture)
  const strip = visitor.getByRole('img', { name: 'E2E strip ' + code })
  await expect.poll(() => strip.evaluate((img) => img.naturalWidth), { timeout: 15000 }).toBeGreaterThan(0)
  await visitorContext.close()
})
