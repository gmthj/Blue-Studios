import { defineConfig } from '@playwright/test'

// End-to-end tests (Week 10c): Playwright opens a real browser and uses the app like a person would.
// The tests are in e2e/, not tests/, because tests/ has the Vitest *.spec.js files.
// Run them with: npm run test:e2e   (then npx playwright show-report to see the results)
//
// The app runs against the Firebase EMULATORS (local copies of Auth, Firestore and Storage, like npm run test:rules),
// not the real project. So the tests can make accounts and admins, and never touch real data. Needs Java,
// and the Firebase CLI (npm install -g firebase-tools).
//
// Two servers are started before the tests (or reused if they are already running):
//   1. the emulators, with our security rules (e2e/emulator/prepare.mjs copies them first)
//   2. the app on port 5174 (not 5173, so a normal npm run dev on the real project is never used by mistake),
//      told to use the emulators by VITE_USE_EMULATORS (see src/firebase.js)
const PROJECT_ID = 'demo-blue-studios'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  // The tests share one set of emulators, but each makes its own rooms and accounts, so they can run side by side.
  // Rooms use the camera and the CPU (countdowns, photos, files), so not too many at once.
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Rooms ask for the camera, so give Chromium a fake one and say yes automatically
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  // Only Chromium: it's the only browser with a fake camera for tests
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node e2e/emulator/prepare.mjs && firebase emulators:start --only auth,firestore,storage --config e2e/.emulator/firebase.json --project ' + PROJECT_ID,
      // The Storage emulator starts last; it answers 403 (no permission to list) once it is up
      url: 'http://127.0.0.1:9199/v0/b/' + PROJECT_ID + '.appspot.com/o',
      reuseExistingServer: true,
      timeout: 120000,
      stdout: 'ignore',
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      // Vite uses these before anything in .env, so the app talks to the emulators' demo project
      env: {
        VITE_USE_EMULATORS: 'true',
        VITE_FIREBASE_API_KEY: 'demo-key',
        VITE_FIREBASE_AUTH_DOMAIN: PROJECT_ID + '.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
        VITE_FIREBASE_STORAGE_BUCKET: PROJECT_ID + '.appspot.com',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
        VITE_FIREBASE_APP_ID: '1:0:web:0',
      },
    },
  ],
})
