import { test, expect, createRoom } from './support/fixtures.js'

test('should create a room and open the Shoot step', async ({ page }) => {
  // (1) setup + (2) actions: type a name and press "Create a new room" (see createRoom in support/fixtures.js)
  const code = await createRoom(page)

  // (3) assert: the address is /room/ + 4 digits + /shoot
  await expect(page).toHaveURL('/room/' + code + '/shoot')
})
