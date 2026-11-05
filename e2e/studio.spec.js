import { test, expect, createAccount, logIn, seedTemplate, seedSticker } from './support/fixtures.js'

// My Studio (StudioView.vue): my templates and stickers, publishing them, and deleting them

function card(page, name) {
  return page.locator('.card').filter({ hasText: name })
}

test('a new account sees the empty sections', async ({ page }) => {
  const account = await createAccount({ name: 'Empty Studio' })
  await logIn(page, account, '/studio')

  await expect(page.getByRole('heading', { name: 'Hey Empty' })).toBeVisible()
  await expect(page.getByText('No strips yet.')).toBeVisible()
  await expect(page.getByText('No templates yet.')).toBeVisible()
  await expect(page.getByText('Nothing saved yet.')).toBeVisible()
})

test('publishing a private template puts it in the marketplace', async ({ page }) => {
  const account = await createAccount()
  const template = await seedTemplate(account, { visibility: 'private' })
  await logIn(page, account, '/studio')

  const item = card(page, template.name)
  await expect(item.getByText('Private')).toBeVisible()
  await item.getByLabel('Show in the marketplace').check()
  await expect(item.getByText('Public', { exact: true })).toBeVisible()

  await page.goto('/marketplace')
  await page.getByLabel('Search by name or maker').fill(template.name)
  await expect(page.getByText('1 result for')).toBeVisible()
})

test('an account with an unconfirmed email cannot publish', async ({ page }) => {
  const account = await createAccount({ verified: false })
  const template = await seedTemplate(account, { visibility: 'private' })
  await logIn(page, account, '/studio')

  await expect(card(page, template.name).getByLabel('Show in the marketplace')).toBeDisabled()
})

test('items hidden by a moderator say so', async ({ page }) => {
  const account = await createAccount()
  const sticker = await seedSticker(account, { status: 'hidden' })
  await logIn(page, account, '/studio')

  await expect(card(page, sticker.name).getByText('Hidden by a moderator')).toBeVisible()
})

test('deleting a template asks first, then removes it', async ({ page }) => {
  const account = await createAccount()
  const template = await seedTemplate(account, { visibility: 'private' })
  await logIn(page, account, '/studio')

  await card(page, template.name).getByRole('button', { name: 'Delete' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete "' + template.name + '"?' })
  // Cancel keeps it
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(card(page, template.name)).toBeVisible()

  await card(page, template.name).getByRole('button', { name: 'Delete' }).click()
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(card(page, template.name)).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('No templates yet.')).toBeVisible()
})
