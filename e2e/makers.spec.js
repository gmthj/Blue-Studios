import { test, expect, createAccount, logIn, seedTemplate, adminDb, uniq } from './support/fixtures.js'

// The two makers: the Frame Editor (FrameEditorView.vue, useFrameEditor.js) and the Sticker Maker
// (StickerMakerView.vue). What they make is saved to My Studio as a private template or sticker.

async function itemsOf(type, owner) {
  const snapshot = await adminDb.collection(type).where('ownerId', '==', owner.uid).get()
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

test.describe('Frame Editor', () => {
  test('an account can save a new frame to My Studio', async ({ page }) => {
    const account = await createAccount()
    const name = 'Frame ' + uniq()
    await logIn(page, account, '/frame-editor')

    // The Save button in the top bar opens the save pop-up, which asks for a name and categories
    await page.getByRole('button', { name: 'Save to My Studio', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Save frame' })
    await dialog.getByLabel('Frame name').fill(name)
    await dialog.getByRole('button', { name: 'Cute', exact: true }).click()
    await dialog.getByRole('button', { name: 'Save to My Studio', exact: true }).click()
    await expect(page.getByText('Saved Successfully!')).toBeVisible({ timeout: 30000 })

    // Saved as a private template, with its files
    const [template] = await itemsOf('templates', account)
    expect(template).toMatchObject({ name, visibility: 'private', status: 'active' })
    expect(template.categories).toContain('cute') // new frames start with 'other' picked too

    await page.goto('/studio')
    await expect(page.locator('.card').filter({ hasText: name })).toBeVisible()
  })

  test('saving someone else\'s template makes my own copy, and leaves theirs alone', async ({ page }) => {
    const maker = await createAccount()
    const original = await seedTemplate(maker)
    const account = await createAccount()
    await logIn(page, account, '/frame-editor?template=' + original.id)
    // Their frame is loaded: its name is in the top bar. It is not linked to their template, so saving makes a new one
    await expect(page.getByLabel('Template name')).toHaveValue(original.name, { timeout: 20000 })

    await page.getByRole('button', { name: 'Save to My Studio', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Save frame' })
    await expect(dialog.getByLabel('Frame name')).toHaveValue(original.name)
    await dialog.getByRole('button', { name: 'Cute', exact: true }).click()
    await dialog.getByRole('button', { name: 'Save to My Studio', exact: true }).click()
    await expect(page.getByText('Saved Successfully!')).toBeVisible({ timeout: 30000 })

    const mine = await itemsOf('templates', account)
    expect(mine).toHaveLength(1)
    expect(mine[0].id).not.toBe(original.id)
    expect(mine[0].name).toBe(original.name)
    const theirs = (await adminDb.doc('templates/' + original.id).get()).data()
    expect(theirs.ownerId).toBe(maker.uid)
    expect(theirs.updatedAt).toBe(original.updatedAt)
  })
})

// Saving a sticker that has no name yet first asks for one (askText in useDialog.js, shown by AppDialog.vue)
async function nameSticker(page, name) {
  const ask = page.getByRole('dialog', { name: 'Name your sticker' })
  await ask.getByLabel('Name').fill(name)
  await ask.getByRole('button', { name: 'Next' }).click()
}

test.describe('Sticker Maker', () => {
  test('guests are asked to log in to save', async ({ page }) => {
    await page.goto('/sticker-maker')
    await page.getByRole('button', { name: /^Add / }).first().click() // an empty sticker can't be saved
    await page.getByRole('button', { name: 'Save to My Studio' }).click()
    await nameSticker(page, 'Guest sticker')

    await expect(page.getByText('You need an account to save stickers to My Studio.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Log in to save' })).toHaveAttribute('href', '/login?redirect=/sticker-maker')
  })

  test('an account can make a sticker and save it to My Studio', async ({ page }) => {
    const account = await createAccount()
    const name = 'Sticker ' + uniq()
    await logIn(page, account, '/sticker-maker')
    await expect(page.getByRole('heading', { name: 'Sticker Maker' })).toBeVisible()

    // Put something on it: the first sticker in the Stickers tool
    await page.getByRole('button', { name: /^Add / }).first().click()

    // An unnamed sticker is named first, then the Save pop-up opens with that name filled in
    await page.getByRole('button', { name: 'Save to My Studio' }).click()
    await nameSticker(page, name)
    const dialog = page.getByRole('dialog', { name: 'Save to My Studio' })
    await expect(dialog.getByLabel('Name')).toHaveValue(name)
    await expect(page.getByLabel('Sticker name')).toHaveValue(name) // the top bar too
    // A category is needed: the save checks it first
    await dialog.getByRole('button', { name: 'Save sticker' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Pick at least one category or folder.')
    await dialog.getByRole('button', { name: 'Cute', exact: true }).click()
    await dialog.getByRole('button', { name: 'Save sticker' }).click()

    await expect(page.getByRole('status').filter({ hasText: '"' + name + '" was saved to My Studio.' })).toBeVisible({ timeout: 30000 })
    const [sticker] = await itemsOf('stickers', account)
    expect(sticker).toMatchObject({ name, kind: 'static', visibility: 'private', categories: ['cute'] })

    await page.goto('/studio')
    await expect(page.locator('.card').filter({ hasText: name })).toBeVisible()
  })
})
