import {
  test, expect, createAccount, logIn, seedTemplate, seedSticker, seedReport, adminDb, uniq,
} from './support/fixtures.js'

// The admin page (AdminView.vue and components/admin/). Admin accounts get the admin mark like
// scripts/set-admin.mjs gives it. Bans and the account list go through /api/admin (a Vercel function
// the test server doesn't run), so that test answers it itself and checks what the page sent.

let admin
let maker
let reporter
test.beforeAll(async () => {
  admin = await createAccount({ name: 'Admin ' + uniq(), admin: true })
  maker = await createAccount({ name: 'Maker ' + uniq() })
  reporter = await createAccount({ name: 'Reporter ' + uniq() })
})

async function itemStatus(item) {
  return (await adminDb.doc(item.type + '/' + item.id).get()).data().status
}

test('accounts without the admin mark are sent home', async ({ page }) => {
  await logIn(page, maker)
  await page.goto('/admin')

  await expect(page).toHaveURL('/')
  await expect(page.locator('nav.app-nav').getByRole('link', { name: 'Admin' })).toHaveCount(0)
})

test('admins see the dashboard and every tab', async ({ page }) => {
  await logIn(page, admin)
  await page.locator('nav.app-nav').getByRole('link', { name: 'Admin' }).click()

  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent moderator actions' })).toBeVisible()
  for (const tab of ['Reports', 'Items', 'Accounts', 'Rooms', 'Log', 'Overview']) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(page).toHaveURL(new RegExp('tab=' + tab.toLowerCase()))
    await expect(page.getByText('Loading...')).toHaveCount(0, { timeout: 15000 })
  }
})

test('a reported item can be hidden from the Reports tab', async ({ page }) => {
  const template = await seedTemplate(maker)
  await seedReport(template, reporter, { reason: 'spam', details: 'Same thing posted ' + uniq() })
  await logIn(page, admin, '/admin?tab=reports')

  const report = page.locator('.card').filter({ hasText: template.name })
  await expect(report.getByText('Spam')).toBeVisible()
  await report.getByPlaceholder('Note for the log (optional)').fill('e2e: spam')
  await report.getByRole('button', { name: 'Hide item' }).click()

  await expect(page.getByText('Hidden, and its reports closed.')).toBeVisible()
  expect(await itemStatus(template)).toBe('hidden')
  const reportDoc = await adminDb.doc('reports/' + template.id + '_' + reporter.uid).get()
  expect(reportDoc.data().status).toBe('resolved')

  // It's in the log, with the note
  await page.getByRole('tab', { name: 'Log' }).click()
  await page.getByLabel('Search the log').fill('e2e: spam')
  await expect(page.getByText('e2e: spam').first()).toBeVisible()
})

test('a report can be dismissed, leaving the item up', async ({ page }) => {
  const sticker = await seedSticker(maker)
  await seedReport(sticker, reporter, { reason: 'other' })
  await logIn(page, admin, '/admin?tab=reports')

  const report = page.locator('.card').filter({ hasText: sticker.name })
  await report.getByRole('button', { name: 'Dismiss (nothing wrong)' }).click()

  await expect(page.getByText('Reports dismissed.')).toBeVisible()
  await expect(page.locator('.card').filter({ hasText: sticker.name })).toHaveCount(0) // only open reports are listed
  expect(await itemStatus(sticker)).toBe('active')
})

test('items can be hidden and unhidden from the Items tab', async ({ page }) => {
  const template = await seedTemplate(maker)
  await logIn(page, admin, '/admin?tab=items')

  await page.getByLabel('Search items').fill(template.name)
  const item = page.locator('.card').filter({ hasText: template.name })
  await expect(item.getByText('Public')).toBeVisible()

  await item.getByRole('button', { name: 'Hide' }).click()
  const ask = page.getByRole('dialog', { name: 'Hide "' + template.name + '" from the marketplace?' })
  await ask.getByRole('button', { name: 'Hide item' }).click()
  await expect(item.getByText('Hidden')).toBeVisible()
  expect(await itemStatus(template)).toBe('hidden')

  await item.getByRole('button', { name: 'Unhide' }).click()
  await expect(item.getByText('Public')).toBeVisible()
  expect(await itemStatus(template)).toBe('active')
})

test('an account can be banned from the Accounts tab (through /api/admin)', async ({ page }) => {
  const target = {
    uid: maker.uid, email: maker.email, displayName: maker.name, isAccount: true, providers: ['password'],
    disabled: false, banned: false, admin: false, createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(),
  }
  const sent = []
  await page.route('**/api/admin', async (route) => {
    const body = route.request().postDataJSON()
    sent.push({ body, auth: route.request().headers().authorization })
    if (body.action === 'list') return route.fulfill({ json: { accounts: [target], nextPageToken: '' } })
    if (body.action === 'lookup') return route.fulfill({ json: target })
    if (body.action === 'ban') return route.fulfill({ json: { hiddenCount: 2, account: { ...target, banned: true, disabled: true } } })
    return route.fulfill({ status: 400, json: { error: 'Unknown action' } })
  })
  await logIn(page, admin, '/admin?tab=accounts')

  await page.getByRole('row').filter({ hasText: maker.email }).click()
  await page.getByPlaceholder('Reason (required, saved in the log)').fill('e2e ban')
  await page.getByRole('button', { name: 'Ban account' }).click()
  await page.getByRole('dialog', { name: 'Ban ' + maker.name + '?' }).getByRole('button', { name: 'Ban account' }).click()

  await expect(page.getByText('Banned. 2 item(s) hidden.')).toBeVisible()
  const ban = sent.find((call) => call.body.action === 'ban')
  expect(ban.body).toEqual({ action: 'ban', uid: maker.uid, reason: 'e2e ban' })
  expect(ban.auth).toMatch(/^Bearer .+/) // the admin's login token, which the server checks
})

test('a room can be opened by its code and closed from the Rooms tab', async ({ page }) => {
  // A free room code
  let code
  do {
    code = String(1000 + Math.floor(Math.random() * 9000))
  } while ((await adminDb.doc('rooms/' + code).get()).exists)
  await adminDb.doc('rooms/' + code).set({
    hostId: maker.uid, hostName: 'Host ' + uniq(), shotNumber: 0, stage: 'shoot',
    stripSlots: {}, closed: false, createdAt: Date.now(), lastActive: Date.now(),
  })
  await logIn(page, admin, '/admin?tab=rooms')

  await page.getByLabel('Search rooms').fill(code)
  await page.getByRole('button', { name: 'Open code' }).click()
  const roomDialog = page.locator('dialog[aria-labelledby="room-dialog-title"]')
  await expect(roomDialog).toBeVisible()
  await roomDialog.getByRole('button', { name: 'Close room' }).click()
  await page.getByRole('dialog', { name: 'Close room ' + code + '?' }).getByRole('button', { name: 'Close room' }).click()

  await expect(page.getByText('Room closed.').first()).toBeVisible()
  await expect(roomDialog.locator('.badge', { hasText: 'Closed' })).toBeVisible()
  expect((await adminDb.doc('rooms/' + code).get()).data().closed).toBe(true)
})
