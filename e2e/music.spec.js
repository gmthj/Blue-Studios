import { test, expect } from '@playwright/test'

// The whole flow, in a NEW room each time, so the test never depends on a room someone else can change:
// create a room → take 4 photos → put them in the 4 frames → Decorate → Music → mix a song
// The song is our own file (e2e/files/test-song.wav, a 19 s tune), uploaded with "Or use your own song",
// so the test doesn't depend on Jamendo's song server.
test('should make a photostrip, then load a song, preview the mix and update it after choosing another part', async ({ page }) => {
  test.setTimeout(120000)   // longer than the others: 4 photos, each with a 3 s countdown

  // (1) setup: create a room
  await page.goto('/')
  await page.getByLabel('Your name').fill('Playwright')
  await page.getByRole('button', { name: 'Create a new room' }).click()
  await expect(page).toHaveURL(/\/room\/\d{4}\/shoot/)

  // (2) actions
  // The floating video call window can cover buttons and photos (e.g. "Mix soundtrack" on a 1280×720 screen),
  // so minimise it first, like a user would. It stays small on every step of the room.
  await page.getByRole('button', { name: 'Minimise' }).click()

  // Shoot: wait for the camera first. Pressing the shutter before it's ready takes no photo (takePhoto in RoomView.vue).
  // The shutter shows first, so "Starting your camera..." is already on screen when we wait for it to go.
  await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Starting your camera...')).toBeHidden({ timeout: 15000 })
  // Then wait until the camera shows a picture (videoWidth is 0 until the first frame arrives).
  // Not in the slides: expect.poll keeps asking until the answer passes; evaluate reads a value from the page.
  const camera = page.locator('.camera-page video').first()
  await expect.poll(() => camera.evaluate((video) => video.videoWidth), { timeout: 15000 }).toBeGreaterThan(0)

  // 4 photos (the fake camera from playwright.config.js). Wait for each one to reach the gallery.
  // Now and then a press doesn't start the countdown, so press again, like a person would.
  // Not in the slides: toPass() runs the block again until everything in it passes.
  const galleryCount = page.locator('.gallery-count').locator('visible=true')
  for (let i = 1; i <= 4; i++) {
    await expect(async () => {
      // Already have this many (a slow earlier photo arrived)? Then there's nothing to take.
      if ((await galleryCount.count()) > 0 && Number(await galleryCount.textContent()) >= i) return
      await page.getByRole('button', { name: 'Take a photo' }).click()
      await expect(galleryCount).toHaveText(String(i), { timeout: 8000 })
    }).toPass({ timeout: 40000 })
  }
  await page.getByRole('button', { name: 'Make photostrip' }).click()
  await expect(page).toHaveURL(/\/pick$/)

  // Pick: tap a photo, then tap a frame, for every frame (the same as dragging, but easier to test)
  for (let i = 0; i < 4; i++) {
    await page.getByAltText('Photo by Playwright').nth(i).click()
    await page.locator('[data-test="slot-' + i + '"]').click()
  }
  await page.locator('[data-test="pick-next"]').click()
  await expect(page).toHaveURL(/\/decorate$/)

  await page.getByRole('button', { name: 'Mix soundtrack' }).click()
  await expect(page).toHaveURL(/\/music$/)

  // Music: upload our song, then use it (a new room starts in simple mode, so there's one deck and a "Use" button)
  await page.getByLabel('Or use your own song').setInputFiles('e2e/files/test-song.wav')
  const song = page.locator('.track').filter({ hasText: 'test-song' })
  await song.getByRole('button', { name: 'Use' }).click({ timeout: 30000 })   // waits for the upload to finish
  await expect(page.getByRole('heading', { name: 'test-song' })).toBeVisible()
  await expect(page.getByText('Loading song...')).toBeHidden({ timeout: 30000 })

  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByText('Preview matches your sliders')).toBeVisible({ timeout: 15000 })   // making the 15 s mix takes a few seconds

  // Move the 15 s part with the arrow keys (the waveform is a real slider underneath)
  const time = page.locator('.time').first()
  const player = page.locator('audio')
  const timeBefore = await time.textContent()
  const previewBefore = await player.getAttribute('src')   // the address of the preview file
  await page.getByLabel('Drag to choose the part').focus()
  await page.keyboard.press('ArrowRight')

  // (3) assert: the part moved, and the preview updated by itself (a new file, so a new address).
  // Not "Updating preview...": it can come and go too fast to check.
  await expect(time).not.toHaveText(timeBefore)
  await expect(player).not.toHaveAttribute('src', previewBefore, { timeout: 15000 })
  await expect(page.getByText('Preview matches your sliders')).toBeVisible({ timeout: 15000 })
})
