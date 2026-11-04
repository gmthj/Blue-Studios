import { test, expect } from './support/fixtures.js'

// The pages anyone can open (guests are signed in anonymously by the app), and where guests are sent
// when they open a page for accounts only (router.js).

test.describe('as a guest', () => {
  test('the home page shows the room card and the navbar', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Take a photostrip together, from anywhere.' })).toBeVisible()
    await expect(page.getByLabel('Your name')).toBeVisible()
    await expect(page.getByLabel('4-digit room code')).toBeVisible()
    // Guests see Photobooth and Marketplace, not My Studio or Log out
    const nav = page.locator('nav.app-nav')
    await expect(nav.getByRole('link', { name: 'Marketplace' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'My Studio' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  })

  test('creating a room without a name asks for one', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create a new room' }).click()

    await expect(page.getByRole('alert')).toHaveText('Please enter your name first.')
    await expect(page).toHaveURL('/')
  })

  test('the room code only takes digits, and Join waits for all 4', async ({ page }) => {
    await page.goto('/')
    const code = page.getByLabel('4-digit room code')
    const join = page.getByRole('button', { name: 'Join', exact: true })

    await expect(join).toBeDisabled()
    await code.pressSequentially('1a2')
    await expect(code).toHaveValue('12') // the letter is dropped
    await expect(join).toBeDisabled()
    await code.pressSequentially('34')
    await expect(code).toHaveValue('1234')
    await expect(join).toBeEnabled()
  })

  test('joining a room that does not exist shows an error', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Your name').fill('Playwright')
    // 0000 is never made: new rooms get a random code from 1000 to 9999
    await page.getByLabel('4-digit room code').fill('0000')
    await page.getByRole('button', { name: 'Join', exact: true }).click()

    await expect(page.getByRole('alert')).toHaveText('Room 0000 does not exist.')
  })

  test('a wrong address shows the "page doesn\'t exist" page', async ({ page }) => {
    await page.goto('/this-is-not-a-page')

    await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible()
    await page.getByRole('link', { name: 'Browse the marketplace' }).click()
    await expect(page).toHaveURL(/\/marketplace/)
  })

  test('a shared strip link that does not exist says so', async ({ page }) => {
    await page.goto('/s/not-a-real-share')

    await expect(page.getByRole('heading', { name: "This strip isn't here" })).toBeVisible()
  })

  for (const path of ['/studio', '/frame-editor', '/admin']) {
    test(path + ' sends guests to log in, and back afterwards', async ({ page }) => {
      await page.goto(path)

      await expect(page).toHaveURL('/login?redirect=' + path)
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    })
  }

  test('"Continue as guest" goes back to the home page', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Continue as guest' }).click()

    await expect(page).toHaveURL('/')
  })

  test('the sticker maker opens for guests', async ({ page }) => {
    await page.goto('/sticker-maker')

    await expect(page).toHaveURL('/sticker-maker')
    await expect(page.getByRole('heading').first()).toBeVisible()
  })
})
