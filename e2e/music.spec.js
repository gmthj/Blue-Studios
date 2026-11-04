import { test, expect, makeStrip, nextStage } from './support/fixtures.js'

// The whole flow, in a NEW room each time, so the test never depends on a room someone else can change:
// create a room → take 4 photos → put them in the 4 frames → Decorate → Music → mix a song
// The song is our own file (e2e/files/test-song.wav, a 19 s tune), uploaded with "Or use your own song",
// so the test doesn't depend on Jamendo's song server.
test('should make a photostrip, then load a song, preview the mix and update it after choosing another part', async ({ page }) => {
  test.setTimeout(120000)   // longer than the others: 4 photos, each with a 3 s countdown

  // (1) setup: a strip in a new room (create, 4 photos, fill the 4 frames: see makeStrip in support/fixtures.js)
  await makeStrip(page)

  // (2) actions
  await nextStage(page, 'music')

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
