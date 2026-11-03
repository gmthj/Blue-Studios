import { defineConfig } from '@playwright/test'

// End-to-end tests (Week 10c): Playwright opens a real browser and uses the app like a person would.
// The tests are in e2e/, not tests/, because tests/ has the Vitest *.spec.js files.
// Run them with: npm run test:e2e   (then npx playwright show-report to see the results)
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,   // rooms and songs come from the internet, so allow up to 60 s per test
  use: {
    baseURL: 'http://localhost:5173',
    // Not in the slides: rooms ask for the camera, so give Chromium a fake one and say yes automatically
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  // Only Chromium: it's the only browser with a fake camera for tests
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Starts the app (npm run dev) before the tests, or uses it if it's already running
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
