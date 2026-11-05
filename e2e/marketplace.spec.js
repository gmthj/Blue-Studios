import { test, expect, createAccount, logIn, seedTemplate, seedSticker, uniq } from './support/fixtures.js'

// Browsing, searching, saving and reporting marketplace items (MarketplaceView.vue, MarketplaceItemDialog.vue).
// Every test makes its own items with a random word in their names, and searches for that word,
// so items from other tests never get in the way.

let maker
test.beforeAll(async () => {
  maker = await createAccount({ name: 'Maker ' + uniq() })
})

async function search(page, text) {
  await page.getByLabel('Search by name or maker').fill(text)
}

test('guests see public items only, and search finds them', async ({ page }) => {
  const tag = uniq()
  await seedTemplate(maker, { name: 'Public ' + tag })
  await seedTemplate(maker, { name: 'Private ' + tag, visibility: 'private' })
  await seedTemplate(maker, { name: 'Hidden ' + tag, status: 'hidden' })

  await page.goto('/marketplace')
  await expect(page.getByRole('heading', { name: 'Marketplace' })).toBeVisible()
  await search(page, tag)

  await expect(page.getByText('1 result for "' + tag + '"')).toBeVisible()
  await expect(page.getByText('Public ' + tag)).toBeVisible()
  await expect(page.getByText('Private ' + tag)).toHaveCount(0)
  await expect(page.getByText('Hidden ' + tag)).toHaveCount(0)
})

test('the Stickers tab shows stickers', async ({ page }) => {
  const tag = uniq()
  await seedSticker(maker, { name: 'Sticker ' + tag })

  await page.goto('/marketplace')
  await page.getByRole('tab', { name: 'Stickers' }).click()
  await expect(page).toHaveURL(/type=stickers/)
  await search(page, tag)

  await expect(page.getByText('Sticker ' + tag)).toBeVisible()
})

test('a guest opening an item is asked to log in to save it', async ({ page }) => {
  const template = await seedTemplate(maker)

  await page.goto('/marketplace?type=templates&item=templates:' + template.id)
  const dialog = page.getByRole('dialog', { name: template.name })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Use frame' })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Log in to save' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Report' })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
})

test('a private item\'s link shows "This isn\'t available"', async ({ page }) => {
  const template = await seedTemplate(maker, { visibility: 'private' })

  await page.goto('/marketplace?type=templates&item=templates:' + template.id)

  await expect(page.getByText("This isn't available")).toBeVisible()
})

test('an account can save an item to My Studio, and remove it again', async ({ page }) => {
  const sticker = await seedSticker(maker)
  const fan = await createAccount()
  await logIn(page, fan)

  await page.goto('/marketplace?type=stickers&item=stickers:' + sticker.id)
  const dialog = page.getByRole('dialog', { name: sticker.name })
  await dialog.getByRole('button', { name: 'Save to My Studio' }).click()
  await expect(dialog.getByRole('button', { name: 'Saved to My Studio' })).toBeVisible()

  await page.goto('/studio')
  const saved = page.locator('section').filter({ has: page.getByRole('heading', { name: /Saved/ }) })
  await expect(saved.getByText(sticker.name)).toBeVisible()
  await saved.getByRole('button', { name: 'Remove' }).click()
  await expect(saved.getByText(sticker.name)).toHaveCount(0)
})

test('an account can report an item, once', async ({ page }) => {
  const template = await seedTemplate(maker)
  const reporter = await createAccount()
  await logIn(page, reporter)

  await page.goto('/marketplace?type=templates&item=templates:' + template.id)
  const dialog = page.getByRole('dialog', { name: template.name })
  await dialog.getByRole('button', { name: 'Report' }).click()
  await dialog.getByLabel("What's wrong?").selectOption('spam')
  await dialog.getByLabel('More details (optional)').fill('Posted over and over')
  await dialog.getByRole('button', { name: 'Send report' }).click()

  await expect(dialog.getByText('You reported this.')).toBeVisible()
  // Opening it again remembers the report
  await page.reload()
  await expect(page.getByRole('dialog', { name: template.name }).getByText('You reported this.')).toBeVisible()
})

test('makers see their own item as theirs, with no Save or Report', async ({ page }) => {
  const template = await seedTemplate(maker)
  await logIn(page, maker)

  await page.goto('/marketplace?type=templates&item=templates:' + template.id)
  const dialog = page.getByRole('dialog', { name: template.name })

  await expect(dialog.getByRole('link', { name: 'Manage it in My Studio' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save to My Studio' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Report' })).toHaveCount(0)
})

test('"Use frame" starts a room with that frame', async ({ page }) => {
  const template = await seedTemplate(maker)

  await page.goto('/marketplace?type=templates&item=templates:' + template.id)
  await page.getByRole('dialog', { name: template.name }).getByRole('link', { name: 'Use frame' }).click()

  await expect(page).toHaveURL('/?template=' + template.id)
  await expect(page.getByText('Your room will use')).toBeVisible()
  await expect(page.locator('.start-template-name')).toHaveText(template.name)
  await page.getByLabel('Your name').fill('Playwright')
  await page.getByRole('button', { name: 'Create a new room' }).click()
  await expect(page).toHaveURL(/\/room\/\d{4}\/shoot/, { timeout: 20000 })
})
