import { test, expect, createAccount, logIn, fillLogIn, uniq } from './support/fixtures.js'

// Sign up, log in, log out, and editing my profile (LoginView.vue, useAuth.js, ProfileDialog.vue)

test('a guest can sign up, and becomes an account', async ({ page }) => {
  const name = 'New ' + uniq()
  await page.goto('/login?mode=signup')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill('e2e-signup-' + uniq() + uniq() + '@example.com')
  await page.getByLabel('Password', { exact: true }).fill('a-good-password')
  await page.getByRole('button', { name: 'Create account' }).click()

  // Back home, with the account links in the navbar
  await expect(page).toHaveURL('/', { timeout: 15000 })
  const nav = page.locator('nav.app-nav')
  await expect(nav.getByRole('link', { name: 'My Studio' })).toBeVisible()
  await nav.getByRole('link', { name: 'My Studio' }).click()
  await expect(page.getByRole('heading', { name: 'Hey ' + name.split(' ')[0] })).toBeVisible()
})

test('sign up checks the password length', async ({ page }) => {
  await page.goto('/login?mode=signup')
  await page.getByLabel('Name').fill('Short')
  await page.getByLabel('Email').fill('e2e-short-' + uniq() + '@example.com')
  await page.getByLabel('Password', { exact: true }).fill('abc')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('a wrong password shows an error, without saying if the email exists', async ({ page }) => {
  const account = await createAccount()
  await page.goto('/login')
  await fillLogIn(page, { ...account, password: 'not-the-password' })

  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.')
  await expect(page).toHaveURL(/\/login/)
})

test('logging in goes back to the page that asked for it, and logging out makes me a guest again', async ({ page }) => {
  const account = await createAccount({ name: 'Logan Tester' })

  await page.goto('/studio')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await fillLogIn(page, account)

  await expect(page).toHaveURL('/studio', { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Hey Logan' })).toBeVisible()

  await page.locator('nav.app-nav').getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('nav.app-nav').getByRole('link', { name: 'My Studio' })).toHaveCount(0)
  // My Studio is for accounts again
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/login/)
})

test('the password can be shown to check it', async ({ page }) => {
  await page.goto('/login')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('secret-words')

  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
})

test('I can change my name in Edit profile', async ({ page }) => {
  const account = await createAccount({ name: 'Before Name' })
  await logIn(page, account, '/studio')
  await expect(page.getByRole('heading', { name: 'Hey Before' })).toBeVisible()

  await page.locator('nav.app-nav').getByRole('button', { name: 'Edit profile' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit profile' })
  await dialog.getByLabel('Name').fill('After Name')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Hey After' })).toBeVisible()
  // Still there after a refresh: it was saved, not just shown
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hey After' })).toBeVisible()
})
