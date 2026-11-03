import { test, expect } from '@playwright/test'

test('should create a room and open the Shoot step', async ({ page }) => {
  // (1) setup
  await page.goto('/')

  // (2) actions
  await page.getByLabel('Your name').fill('Playwright')
  await page.getByRole('button', { name: 'Create a new room' }).click()

  // (3) assert: the address is /room/ + 4 digits + /shoot
  await expect(page).toHaveURL(/\/room\/\d{4}\/shoot/)
})
