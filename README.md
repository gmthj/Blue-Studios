# IS216 - Group Project (G3 Group 2)
## Blue Studios - Online Photobooth

> Take a photostrip together, from anywhere. Built with Vue 3, Vue Router, Bootstrap 5, Firebase, Agora and Vercel.

Friends join one room from their own phones and laptops (a 4-digit code or a QR code), video call, and take photos together on one synchronised countdown. Then they make the photostrip together: pick the photos and the frame, cut a video, decorate it with stickers, mix a soundtrack, and export it as a PNG, GIF or MP4 with a link and QR code to share. Accounts keep their strips, frames and stickers in **My Studio** and share frames and stickers in the **Marketplace**. Moderators have an **Admin** page.

This README sets the project up from scratch, step by step: a Vue 3 frontend, a Firebase backend (Auth, Firestore, Storage), Vercel serverless functions, and three test suites. Follow the steps below in order.

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | Vue 3 (`<script setup>`, composables), Vue Router, Bootstrap 5 |
| Backend | Firebase Authentication, Cloud Firestore (real-time `onSnapshot` listeners), Firebase Storage, protected by security rules |
| Server functions | Vercel serverless functions in `api/` (video call tokens, admin actions, room cleanup, sticker APIs), Firebase Admin SDK |
| Video call | Agora Web SDK (`agora-rtc-sdk-ng`), tokens made on the server with `agora-token` |
| Media | MediaDevices API (camera), Canvas API, MediaRecorder, FFmpeg.wasm (MP4), gifenc (GIF), Tone.js (music mixer), MediaPipe (face filters) |
| Outside APIs | Jamendo (songs), remove.bg (sticker backgrounds), OpenWeatherMap and OpenStreetMap (live stickers), GIPHY |
| Build tool | Vite |
| Tests | Vitest (components), `@firebase/rules-unit-testing` + Firebase emulators (security rules), Playwright (end-to-end) |
| Hosting | Vercel (https, which phone cameras need) |

## Try it live

Don't want to set up your own Firebase project? Try the deployed app:

**🔗 [blue-studios-mu.vercel.app](https://blue-studios-mu.vercel.app)**

Two demo accounts are available:

| Role  | Email | Password |
|-------|-------|----------|
| User  | `blue.studios.cc+test1@gmail.com` | `ii&ehV47GH3WP&S#XOi!` |

- Log in with the **user** account to try **My Studio**, the **Marketplace**, the **Frame Editor** and the **Sticker Maker**.
- Log in with the **admin** account to explore the **Admin** page (reports, items, accounts, rooms, the moderator log).
- **No account needed for a room.** Type your name and press **Create a new room**. Open the site on a second device (or scan the QR code with your phone), type the 4-digit code and press **Join**. Press the round shutter button: the countdown runs on every device.
- Alternatively, click **Sign up** to make your own free account.

This is a shared demo: please don't enter any real personal information, expect other people to be using the same demo accounts, and remember that the photos you take are seen by everyone in the room.

## Prerequisites

| Tool | Needed for | Check |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) LTS (v24 is used), with npm | everything | `node -v` |
| [Git](https://git-scm.com/) | getting the code | `git --version` |
| Firebase CLI: `npm install -g firebase-tools` | deploying the security rules, the rules and end-to-end tests | `firebase --version` |
| Vercel CLI: `npm install -g vercel` (optional) | `vercel env pull` / `vercel logs`, or running exactly like Vercel with `vercel dev`; `npm run dev` already runs the `api/` functions | `vercel --version` |
| Java 21 or later (e.g. [Adoptium Temurin](https://adoptium.net/)) | **only** for the rules and end-to-end tests on your own laptop (the Firestore emulator runs on Java) | `java -version` |
| Free [Firebase](https://console.firebase.google.com/), [Agora](https://console.agora.io/) and [Vercel](https://vercel.com/) accounts | your own copy (step 2) | |

The project uses **npm**. Don't use pnpm or yarn, so there's only one lock file (`package-lock.json`).

## 1. Clone the repo

```bash
git clone https://github.com/gmthj/Blue-Studios.git
cd Blue-Studios
npm install
```

**Teammates:** you use the team's Firebase, Agora and Vercel projects, so skip steps 2 to 4 and ask Gabriel for the `.env` values (step 5). Start your feature branch from `main`, for example `git switch -c my-feature origin/main`.

## 2. Create your own Firebase and Agora projects

### Firebase

1. Go to the [Firebase console](https://console.firebase.google.com/) and click **Create a project** (Google Analytics off).
2. On the project home page, click the **Web** icon `</>`, give it a nickname, leave Firebase Hosting unticked, then **Register app**. Keep the `firebaseConfig` values for step 5.
3. Bottom left: **Upgrade** to the **Blaze** plan (Firebase Storage needs it). Normal testing stays inside the free amounts. Set a **budget alert** (Google Cloud console → **Billing → Budgets & alerts**), for example $1.
4. **Build → Firestore Database → Create database**: pick a location (we use `asia-southeast1`, Singapore) and **production mode**.
5. **Build → Storage → Get started**: pick a US location such as `us-east1` (it has a no-cost tier) and **production mode**.

### Agora (the video call)

1. In the [Agora console](https://console.agora.io/), go to **Projects → Create**. Choose authentication with **App ID + Token** (secured mode), so the project gets an **App Certificate**.
2. Keep the **App ID**, and the **Primary Certificate** from the project's settings (**Security**), for step 5.

## 3. Deploy the security rules

Firestore and Storage block everything unless a rule allows it, so the app does nothing until the rules are deployed. In the project folder:

```bash
firebase login                             # once
firebase use --add                         # pick your project
firebase deploy --only firestore,storage   # the Firestore rules + indexes, and the Storage rules
```

The first time, the CLI may ask to let Storage read Firestore (the rules check whether a marketplace item is public). Answer **Y**.

The app makes its collections by itself as people use it:

| Collection | Purpose |
| --- | --- |
| `rooms/{code}` | One photobooth room: host, stage, shot number, the shared strip, the video timeline, the mixer, the export |
| `rooms/{code}/members`, `photos`, `clips` | Who is in the room, their photos (small JPEGs), and their video clips (files in Storage) |
| `users/{uid}` | An account's public profile (name, picture), plus `saved/` (marketplace bookmarks) |
| `templates`, `stickers` | Frames and stickers made in the editors, `private` or `public` (in the Marketplace) |
| `strips` | Finished strips saved to My Studio (always private) |
| `shares` | A finished strip opened by its link, `/s/{id}` |
| `reports`, `adminLog` | Marketplace reports, and everything moderators did |
| `stickerCategories` | An account's own folders of stickers and frames |

**Don't edit the rules in the Firebase console**: the next deploy overwrites them. Edit `firestore.rules` / `storage.rules`, test them (step 7), then deploy.

Last, run `npm run set-cors` (after step 5, it needs the service account key). It applies [`storage.cors.json`](storage.cors.json), which lets the website draw Storage images on a canvas and download frame files.

## 4. Configure Firebase Auth

Everyone who opens the app gets a Firebase user: guests are signed in **anonymously**, accounts use email + password or Google. Turn all three on:

1. Go to **Build → Authentication → Get started → Sign-in method**.
2. Turn on **Anonymous**, **Email/Password**, and **Google** (set a support email).
3. Go to **Authentication → Settings → Authorized domains** and add your Vercel address(es), for example `your-project.vercel.app`. Otherwise the Google popup fails with `auth/unauthorized-domain`.

Unlike many apps, email confirmation stays **on**: new accounts can sign in straight away, but they need to click the link in the email before they can publish to the Marketplace.

## 5. Set your environment variables

1. Copy the `.env.example` file and rename it to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in the values:

| Variable | Used by | Secret? | Where it comes from |
| --- | --- | --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | the website ([`src/firebase.js`](src/firebase.js)) | no: every visitor's browser gets them, the security rules protect the data | Firebase console → gear icon → **Project settings → Your apps** → the web app's config |
| `FIREBASE_SERVICE_ACCOUNT` | the server (`api/`), `npm run set-admin`, `npm run set-cors` | **yes** | **Project settings → Service accounts → Generate new private key**, then the downloaded `.json` file as **one line of base64** (below) |
| `AGORA_APP_ID` | the server ([`api/token.js`](api/token.js)) | no | Agora console → **Projects** |
| `AGORA_APP_CERTIFICATE` | the server ([`api/token.js`](api/token.js)) | **yes** | Agora console → your project → **Primary Certificate** |
| `CRON_SECRET` | the server ([`api/cleanup.js`](api/cleanup.js), the daily room cleanup) | **yes** | Make it up: any long random string. Needed on Vercel; in `.env` only to call `/api/cleanup` yourself |
| `VITE_JAMENDO_CLIENT_ID` | the music mixer (Jamendo songs) | no | [devportal.jamendo.com](https://devportal.jamendo.com/) → Applications |
| `REMOVE_BG_API_KEY` | the server ([`api/remove-bg.js`](api/remove-bg.js)) | **yes** | [remove.bg](https://www.remove.bg/api) → API key |
| `OPENWEATHER_API_KEY` | the server ([`api/weather.js`](api/weather.js)) | **yes** | [OpenWeatherMap](https://openweathermap.org/api) → API keys |

Turning the service account `.json` file into one line of base64:

```powershell
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json")) | Set-Clipboard
```
```bash
# macOS
base64 -i path/to/key.json | pbcopy
# Linux
base64 -w0 path/to/key.json
```

Paste the result after `FIREBASE_SERVICE_ACCOUNT=`, then **delete the downloaded `.json` file**: anyone with it has full access to the Firebase project.

`.env` is gitignored: never commit your real keys. Never put a secret in a `VITE_` variable either: Vite copies those into the website, where anyone can read them.

## 6. Run the app

```bash
npm run dev      # the website AND the api/ functions, open http://localhost:5173
```

That's the full app, video call and admin included. A small plugin in [`vite.config.js`](vite.config.js) runs `api/<name>.js` for each request to `/api/<name>`, the way Vercel would:

- It reads the server secrets (`AGORA_APP_CERTIFICATE`, `FIREBASE_SERVICE_ACCOUNT`...) from `.env`, only on your laptop's side. The browser still only gets the `VITE_` variables.
- Editing a file in `api/` applies to the next request, no restart needed. Errors in a function are printed in the `npm run dev` terminal.
- **It uses the real Firebase project and API keys**, like the live site: rooms you make, bans and deletes are real.
- The daily cleanup cron doesn't run locally. To try it, put a `CRON_SECRET` in `.env` and call `http://localhost:5173/api/cleanup?dryRun=1` with the header `Authorization: Bearer <CRON_SECRET>`.
- It only adds the Vercel extras our functions use (`req.query`, `req.body`, `res.status()`, `res.json()`, `res.send()`). If a new function needs another one (for example `req.cookies`), add it to the plugin, or check with `vercel dev`, which runs exactly like Vercel (`vercel login`, `vercel link` to the "blue-studios" project, then `vercel dev`, on port 3000).

You'll land on the home page. Type a name and press **Create a new room** to start shooting, or click **Sign up** to make an account.

- **Two people on one laptop:** open a second window in **Incognito** (Chrome: Ctrl+Shift+N) at the same address. Incognito has its own login, so it's a different guest. Two normal tabs share one login.
- **Phones** need https, so they can't use your laptop's `localhost` (the QR code points to it). Test phones on a Vercel deployment (step 8).

### Becoming an admin (optional)

Moderators are normal accounts with an **admin mark** (a Firebase custom claim `admin: true`), which can only be set with the secret service account key, never from the browser. Sign up on the site once, then, with `FIREBASE_SERVICE_ACCOUNT` in `.env`:

```bash
npm run set-admin -- you@example.com            # give the admin mark
npm run set-admin -- you@example.com --remove   # take it away
```

Log out and back in: an **Admin** button appears in the navbar. See [Admin](#admin) for what it can do.

## 7. Run the tests

There are three test suites. GitHub runs the rules tests and the end-to-end tests on every pull request (`.github/workflows/`), so you'll see a ✓ or ✗ on it and the details under the repo's **Actions** tab. Running them yourself is optional.

| Command | What it tests | Needs |
| --- | --- | --- |
| `npm test` | Components and helper functions, with Vitest (strip export rules, the video editor, the share page, the stage bar, room cleanup rules...) | nothing |
| `npm run test:rules` | The Firestore and Storage security rules, the admin API and the cleanup job: what each kind of user may and may not read or write | Java, Firebase CLI |
| `npm run test:e2e` | The whole app in a real browser, with Playwright | Java, Firebase CLI |

The rules and end-to-end tests never touch real data: they start local copies of Auth, Firestore and Storage (the **Firebase emulators**) with a demo project.

### End-to-end tests

The `e2e/` folder has a [Playwright](https://playwright.dev/) suite that uses the real app in Chromium, with a fake camera, like a person would.

**One-time setup:** install the browser Playwright needs (only once per machine):

```bash
npx playwright install chromium
```

**Run the tests.** You do **not** need to start anything yourself: [`playwright.config.js`](playwright.config.js) starts the emulators, and a copy of the app on port **5174** that talks to them (so your normal `npm run dev` on 5173 is never used). No test accounts to make either: each test makes its own accounts, rooms and marketplace items.

```bash
npm run test:e2e                        # the full suite (about 2 minutes)
npx playwright test e2e/admin.spec.js   # one file
npx playwright test --ui                # interactively, in Playwright's UI mode (great for learning)
npx playwright show-report              # the HTML report of the last run, with a trace of each failed test
```

**What's in the suite:**

| File | What it covers |
| --- | --- |
| `e2e/pages.spec.js` | The home page, the name and room code checks, wrong addresses, and guests being sent to log in for account-only pages |
| `e2e/auth.spec.js` | Signing up, logging in and out, wrong passwords, going back to the page that asked, editing my profile |
| `e2e/studio.spec.js` | My Studio: empty sections, publishing to the Marketplace, unconfirmed emails, hidden items, deleting |
| `e2e/marketplace.spec.js` | Browsing and searching, private and hidden items, saving, reporting, "Use frame" |
| `e2e/admin.spec.js` | The admin page: reports, hiding items, banning an account, closing a room |
| `e2e/createRoom.spec.js` | Creating a room |
| `e2e/room.spec.js` | Two people in a room (join by code, shared photos, following the host, closing), leaving, and a strip from Shoot to its public share page |
| `e2e/music.spec.js` | The music mixer: uploading a song, the preview, and moving the chosen part |
| `e2e/makers.spec.js` | The Frame Editor and the Sticker Maker saving to My Studio |
| `e2e/support/fixtures.js` | Shared helpers (`createAccount`, `logIn`, `seedTemplate`, `seedReport`, `createRoom`, `makeStrip`...) reused across spec files |

`support/fixtures.js` is worth reading first, as it shows the pattern the rest of the suite follows: keep common flows (making an account, logging in, taking 4 photos) in one place and call them from each test, instead of repeating the same clicks everywhere. It sets up data straight in the emulators with the Firebase Admin SDK, and answers the `/api/*` functions with "not available" inside the browser, before they reach the test server (which would run them with the real keys from `.env`), unless a test answers one itself. Import `test` and `expect` from it, not from `@playwright/test`.

The emulators use the real security rules, copied by [`e2e/emulator/prepare.mjs`](e2e/emulator/prepare.mjs) with one change: links to our files may also start with the Storage emulator's address.

## 8. Deploy to Vercel

1. On [Vercel](https://vercel.com/) (Hobby plan, "Continue with GitHub"): **Add New... → Project**, then import the GitHub repo. If it isn't listed, click **Adjust GitHub App Permissions**.
2. The Framework Preset is **Vite** (detected automatically), with build command `npm run build` and output folder `dist`.
3. **Environment Variables:** add every variable from your `.env`. Shortcut: paste the whole `.env` into the first **Key** box and Vercel splits it up.
4. **Deploy.** Then add the Vercel address to Firebase's **Authorized domains** (step 4).

Every push to GitHub then deploys by itself: `main` goes to the live site, and other branches get their own **preview** address (shown on the pull request). If you change an environment variable, it only applies to **new** deployments: **Deployments → ... → Redeploy**.

**Testing a deployment with a phone:**
1. On your laptop, open the deployment, type your name, **Create a new room**, and allow the camera.
2. On your phone, scan the QR code, type a name, **Join**, and allow the camera.
3. Check that both of you appear in the call, and that the shutter counts 3-2-1 on both devices and both photos land in the gallery under the same shot.
4. Check the token API is protected: `https://YOUR-ADDRESS/api/token?code=1234` should say `{"error":"Please sign in again"}`.
5. If the video says "Live video unavailable", look in Vercel → **Logs**: a missing `AGORA_...` or `FIREBASE_SERVICE_ACCOUNT` variable is logged there.

## Project structure

```
src/
├── main.js, App.vue      # Signs in (guest or account), then shows the navbar and the page
├── router.js             # URL → page; pages for accounts / admins only
├── firebase.js           # Firebase setup (db, auth, storage), and the emulators in the tests
├── composables/          # Shared state and logic: useAuth (login), useRoom (the room), useVideoCall (Agora), ...
├── views/                # One page per route: home, login, My Studio, Marketplace, Admin, the editors,
│                         #   and the room's steps (RoomLayout + Shoot, Pick, Video, Decorate, Music, Export, Share)
├── components/           # Reusable UI pieces (PhotoStrip, StageBar, VideoCallCard, MarketplaceCard, ...)
│   ├── admin/            # The admin page's tabs: Overview, Reports, Items, Accounts, Rooms, Log
│   └── frame-editor/     # The Frame Editor's panels
├── studio.js             # My Studio: save / list / publish / delete frames, stickers and strips
├── marketplace.js        # Marketplace: browse, search, save, report
├── admin.js              # Moderator actions (calls /api/admin for accounts)
├── roomCleanup.js        # The room cleanup rules (shared with api/cleanup.js)
├── stripData.js          # Strip layouts, frame styles, filters, safeStickers
├── shares.js             # A finished strip with a link and QR code
├── exportFile.js, stripRender.js, gif.js, ffmpeg.js, mixRender.js   # Building the PNG / GIF / MP4 and the music mix
└── utils/                # Cleaning uploaded SVGs, the QR code with our logo, the frame editor's file format, ...

api/                      # Vercel serverless functions
├── token.js              # GET  /api/token     an Agora token, for room members only
├── admin.js              # POST /api/admin     admins: list, look up, ban, unban accounts; delete rooms
├── cleanup.js            # GET  /api/cleanup   the daily cron: closes / deletes old and empty rooms
├── remove-bg.js          # POST /api/remove-bg accounts: remove a sticker's background (remove.bg)
├── weather.js, place.js  # GET  live weather and place names for the live stickers (cached)
└── _lib/                 # Server-only helpers: Firebase Admin setup, deleting a room ("_" = not a web address)

firestore.rules, storage.rules   # Security rules: who can read / write what
firestore.indexes.json    # Indexes the marketplace queries need
tests/                    # Vitest component tests, rules tests, admin API and cleanup tests
e2e/                      # Playwright end-to-end tests
scripts/                  # set-admin (the admin mark), set-cors (Storage CORS)
vercel.json               # Page URLs → index.html, the daily cleanup cron, security headers
.env.example              # The environment variables needed (copy to .env)
```

## How it works

The rest of this README is the reference: how each part works, for teammates and markers.

### Rooms

```
rooms/{code}                 { hostId, hostName, shotNumber, shotStartedBy, stage, furthestStage, visitedStages, lastActive, keep, closed, createdAt,
                               captureMode, virtualFriends, startTemplateId,
                               stripLayoutId, stripStyleId, stripCustomTemplate, stripSlots, stripCrops, stripEdits, stripStickers,
                               videoTimeline, videoEditing, editedVideos, mixer, music, exportFormat, exportName, exportJob }
rooms/{code}/members/{id}    { name, deviceType, joinedAt, lastSeen }
rooms/{code}/photos/{auto}   { ownerId, name, shotNumber, image, createdAt }
rooms/{code}/clips/{auto}    { ownerId, name, shotNumber, path, mime, mirrored, createdAt }   (the video file is in Storage)
shares/{id}                  { ownerId, title, format, filePath, fileUrl, size, roomCode, createdAt }
stickerCategories/{id}       { ownerId, name, type, itemIds, createdAt, updatedAt }
```

1. **Create:** the host picks a random free 4-digit code and creates `rooms/{code}`.
2. **Join:** the Join button turns on once 4 digits are typed. [`RoomLayout.vue`](src/views/RoomLayout.vue) checks the room exists, is open and isn't full, then joins it once for all the room's pages.
   - **Members:** each person has a document in `members`, which every device listens to, so the list updates live.
   - **Heartbeat:** every 15 seconds each device updates its `lastSeen`. A member not seen for 45 seconds (closed the tab) is no longer shown or counted.
   - **Room limit:** at most 6 people at once (`isRoomFull` in [`room.js`](src/room.js)). Someone already in the room (refreshing) is always let back in.
3. **Video call:** each device gets a token from `/api/token`, joins that Agora channel and publishes its camera. Everyone starts **muted**: the microphone only opens on "Unmute". The call window floats over every room page; drag it anywhere, or minimise it.
4. **Countdown and capture:** see [Concepts to look at](#concepts-to-look-at). Each device draws its camera frame on a canvas and saves a small JPEG to `photos` with the shot number. A white flash covers the moment, so every screen is lit when every device takes its photo (the `FLASH_*` settings in `ShootView.vue`).
5. **Shared gallery:** every device listens to `photos`, grouped by shot.
6. **Switch camera:** with more than one camera, a button cycles through them. It swaps the new camera into the track already being sent (`replaceTrack`), so others never see you leave and rejoin.
7. **The strip, together:** everything about the strip is saved in the room document, so everyone sees the same one. **Pick** saves the layout, the frame and which photo is in which slot (each slot on its own, `'stripSlots.2'`, so two people changing different slots don't overwrite each other). **Decorate** saves each photo's filter and the stickers. **Video**, **Music** and **Export** work the same way, and **Share** builds the file on one device and gives everyone its link and QR code.
8. **Close room:** the host (or anyone, if the host has left) sets `closed: true`; every device ends the call and goes home, and the room can't be joined again. This stops Agora minutes being used by forgotten tabs.
9. **Layout:** the camera page is a Bootstrap `row`, exactly one screen tall (`100dvh`). Phones get one column; tablets and laptops put the camera beside the call and gallery; `xl` screens use three columns.

**Adding a room page:** add a child route of `/room/:code` in `router.js` whose path is the stage's name, and add the stage to `ROOM_STAGES` in `useRoom.js` with `hasPage: true`. Don't add the video call to your page: `RoomLayout.vue` already shows it.

### Accounts

On `/login`, a guest can sign up with email + password or Google. A new account gets a public profile `users/{uid}` (name and picture, never the email) and a verification email. Logging out signs the device back in as a new guest. Log in / out is hidden inside a room, because changing user there would drop you from it.

Firebase stores and hashes the passwords (we never see them), login errors never say whether an email has an account, "Forgot password" shows the same message either way, and `?redirect=` after logging in only goes to pages on our own site.

### My Studio

Accounts have a **My Studio** page (`/studio`) with everything they saved. Each item is a small Firestore document plus its files in Storage:

```
templates/{id}  { ownerId, ownerName, name, slotCount, categories, visibility, status, saveCount, thumbnailPath, dataPath, cardPath, cardUrl, createdAt, updatedAt }
                  Storage: templates/{uid}/{id}/thumbnail.png, project.json, card.webp
stickers/{id}   { ownerId, ownerName, name, kind, categories, visibility, status, saveCount, imagePath, cardPath, cardUrl, createdAt, updatedAt }
                  Storage: stickers/{uid}/{id}/image
strips/{id}     { ownerId, title, imagePath, format, shareId, createdAt }
                  Storage: strips/{uid}/{id}.png / .gif / .mp4
```

- `categories`: 1 to 3 ids from `CATEGORIES` in [`studio.js`](src/studio.js) (`birthday`, `friends`, `love`, `graduation`, `holiday`, `cute`, `minimal`, `other`).
- `visibility`: `'private'` or `'public'` (shown in the Marketplace). New items are private; the owner publishes them in My Studio.
- `status`: `'active'` or `'hidden'` (only admins can hide something).

**Use the functions in `src/studio.js`** instead of writing to Firestore or Storage yourself (the rules check every field, so a hand-written write will probably be blocked):

```js
import { useAuth } from '../composables/useAuth.js'
import { saveTemplate, saveSticker, loadTemplateProject, CATEGORIES } from '../studio.js'

const { isAccount } = useAuth()   // only accounts can save: show "Log in to save" to guests

// Frame Editor: thumbnail is a PNG Blob, projectData is the editor's project object
const id = await saveTemplate({ name, slotCount, categories, thumbnail, projectData })   // a new frame
await saveTemplate({ id, name, slotCount, categories, thumbnail, projectData })          // update it later
const projectData = await loadTemplateProject(template)                                  // open it again

// Sticker Maker: image is a PNG, GIF or WebP Blob (under 2 MB)
await saveSticker({ name, kind: 'static', categories, image })   // kind: 'static', 'animated' or 'dynamic'
```

Pages that draw Storage images on a canvas need the bucket's CORS setting (`npm run set-cors`, already done for the team project) and `img.crossOrigin = 'anonymous'`.

### Marketplace

`/marketplace` shows public frames and stickers that no admin has hidden, to anyone, guests too. The tab, category and sort (newest or most saved) are in the URL, e.g. `/marketplace?type=stickers&category=cute&sort=popular`, so links and the back button keep them. It loads 24 items at a time ("Load more" uses a Firestore `startAfter` cursor).

- **Saving is by reference:** saving writes a bookmark `users/{uid}/saved/{itemId}` and adds 1 to the item's `saveCount` in the same **batch** (both happen or neither). If the owner makes it private or deletes it, it shows as "No longer available" in My Studio.
- **Reports:** accounts can report an item once (`reports/{itemId_uid}`, with a reason and optional details), for the admins to review.
- **Indexes:** each marketplace query needs a Firestore index, listed in [`firestore.indexes.json`](firestore.indexes.json). A new filter or sort shows an error in the browser console with a link that creates the missing index; add it to that file too.

Functions in [`src/marketplace.js`](src/marketplace.js): `listPublicItems`, `searchPublicItems`, `getItem`, `saveItem`, `unsaveItem`, `isSaved`, `listMySaved`, `reportItem`, `hasReported`.

### Admin

The admin page (`/admin`) has six tabs:

| Tab | What it does |
| --- | --- |
| Overview | How many accounts (and banned), rooms (and open), frames, stickers, saved strips and open reports, plus the latest moderator actions |
| Reports | Reported items grouped by item. **Hide item** takes it out of the Marketplace and closes its reports; **Dismiss** closes them |
| Items | Every frame and sticker (public, private, hidden), with search and filters; hide or unhide |
| Accounts | Every login, accounts and guests (from Firebase Auth through `/api/admin`); see what they made, ban or unban (a reason is required) |
| Rooms | The newest 200 rooms with who is in each, and what the daily cleanup will do to it. Open one to delete a photo, close it, **keep** it, or delete it |
| Log | Everything moderators did |

**What a ban does** ([`api/admin.js`](api/admin.js), on the server, because only the Admin SDK can switch off a login):
1. Turns off the account's login and logs it out on every device (`revokeRefreshTokens`).
2. Sets `users/{uid}.banned = true`, which the rules check, so even an unexpired login token can't create or change anything.
3. Hides all their frames and stickers, and writes the ban to `adminLog`.

Admins can't ban themselves, other admins, or guests. Unbanning turns the login back on; their items stay hidden until an admin unhides them.

### Room cleanup

Rooms pile up, so a daily job ([`api/cleanup.js`](api/cleanup.js)) closes and deletes old and empty ones. The rules are in [`src/roomCleanup.js`](src/roomCleanup.js), shared with the admin page, so the Rooms tab always shows what the job will really do. The first rule that is due wins:

| Rule | Room | When | What happens |
| --- | --- | --- | --- |
| R1 | open, **no photos or videos** | nobody there for 1 hour | deleted |
| R2 | closed, no photos or videos | 24 hours since anyone was there | deleted |
| R3 | open, has photos or videos | nobody there for 6 hours | **closed** (kept, so people can still export) |
| R4 | closed, has photos or videos | 30 days since anyone was there | deleted |
| R5 | open | 24 hours since it was made, even with someone in it | closed |
| R6 | **host named "Playwright"** (old automatic test rooms) | 1 hour since it was made | deleted |

- A room with someone in it right now only follows R5. An admin can mark a room **Keep**, and the job never touches it.
- **When it runs:** `vercel.json` has a cron at `0 16 * * *` (midnight in Singapore). The Hobby plan allows one run a day, so "1 hour" means "at the next daily run after 1 hour". A run changes at most 200 rooms.
- It needs `CRON_SECRET` on Vercel, and writes every action to the admin Log as `system`.
- **Try it safely** with a dry run, which only reports what would happen:
  ```powershell
  Invoke-RestMethod -Uri "https://YOUR-ADDRESS/api/cleanup?dryRun=1" -Headers @{ Authorization = "Bearer YOUR_CRON_SECRET" }
  ```

### Security

A short version for markers. The details are in the comments of [`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules), and every rule is tested by `npm run test:rules`.

- **Identity:** everyone is signed in to Firebase Auth, guests anonymously. The rules and the server only trust `request.auth` and the checked ID token, never anything the browser says about itself.
- **Rules:** Firestore and Storage are **deny by default**. Every collection, room field, room list and Storage folder has its own rule that checks who is writing, which fields, their types, allowed values and sizes. Some highlights:
  - **Rooms:** anyone signed in can look up one room by its code, but not list them. Members change a room only in small, checked steps, only while it is open. `hostId`, `createdAt` and `shotNumber` can't be changed by members, and nobody can delete a room (the server does that).
  - **Photos and clips:** only room members can see them, and you can only add your own.
  - **Frames and stickers:** only accounts that aren't banned can save them, as themselves, with their files in their own Storage folder. Only accounts with a **confirmed email** can make one public. Only admins can hide one.
  - **Saved items:** `saveCount` must go up by exactly 1 in the same batch as the bookmark, so it can't be faked.
  - **Reports:** once per account per item; only the reporter and admins can read one.
  - **Admin log:** only admins can add to it, as themselves, and nobody can change or delete an entry.
  - **Storage:** owner folders and room-member checks, content types and size limits. HTML, SVG, JavaScript and XML can never be stored.
- **Lists the rules can't look inside** (stickers in a room): the pages filter them with `safeStickers` in [`src/stripData.js`](src/stripData.js), which drops any sticker whose picture isn't from our Storage, a `data:image/` URL or GIPHY.
- **Server functions (`api/`):** each allows one HTTP method, checks its input, and reads secrets only from variables without a `VITE_` prefix. `token` needs a room member, `admin` an admin, `remove-bg` an account, `cleanup` the `CRON_SECRET`. Errors sent to the browser are generic; the details go to the Vercel logs.
- **Admin mark and bans:** the mark is a custom claim set only by `scripts/set-admin.mjs`. A ban disables the login, logs the person out everywhere and sets `banned`, which the rules check on every write.
- **Uploaded SVGs:** an SVG can contain code, so the Frame Editor cleans every SVG with DOMPurify ([`src/utils/cleanSvg.js`](src/utils/cleanSvg.js)) when it's uploaded and every time it's shown.
- **Browser API key:** the Firebase web key is public by design. It only says which project to talk to; the rules decide what anyone can do. A budget alert warns about unexpected costs.
- **Headers** ([`vercel.json`](vercel.json)): `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and `frame-ancestors 'none'`, and a `Permissions-Policy` allowing the camera, microphone and location only for our own pages. There is no full Content-Security-Policy: Agora, Firebase, GIPHY and Jamendo load from many addresses, and a wrong one would break the video call.
- **Not done:** Firebase App Check, rate limiting on the open API routes, restrictions on the browser API key, and a full CSP.

### Notes for developers

- `package.json` has `"overrides": { "jwks-rsa": { "jose": "^5.10.0" } }`. **Don't remove it.** `firebase-admin` uses `jwks-rsa`, which loads `jose` with `require()`, but `jose` 6 only works with `import`, and Vercel's server can't `require()` it (the API crashes with `ERR_REQUIRE_ESM`). See [Use of AI](#use-of-ai).
- The `localApi` plugin and the `ssr.optimizeDeps` setting in [`vite.config.js`](vite.config.js) are for `npm run dev` only and don't change the build. Keep `noDiscovery: true`: without it, the first call to `/api/` makes Vite pre-bundle `firebase-admin` and reload the page (in a room, the call drops).
- `.vue` files are ordered `<script setup>`, `<template>`, `<style scoped>`. Pages wrapped in `<div class="app-page">` get the shared look from [`src/styles/pages.css`](src/styles/pages.css).


## Use of AI

### Fixing "Live video unavailable" after adding Firebase Admin (Gabriel, 18 Oct 2026)

**Tool:** Claude Code (Claude Opus 5.5)

**Problem:** after `api/token.js` started using `firebase-admin` to check who is calling, live previews stopped working on the Vercel preview ("Live video unavailable").

**What the AI did:**
- Read the Vercel runtime logs (`vercel logs`). Every call to `/api/token` crashed when it started, with `ERR_REQUIRE_ESM`: `jwks-rsa` (a library used inside `firebase-admin`) loads `jose` with `require()`, but `jose` 6 only supports `import`.
- Explained why it only failed on Vercel: Node 24 on our laptops can `require()` such packages, but Vercel's server cannot.
- Reproduced the crash locally by running Node with that feature turned off (`node --no-experimental-require-module`).
- Checked that `jwks-rsa` only uses two `jose` functions (`importJWK`, `exportSPKI`), which also exist in `jose` 5. `jose` 5 supports both `require()` and `import`.
- Added `"overrides": { "jwks-rsa": { "jose": "^5.10.0" } }` to `package.json`, so npm installs `jose` 5 for `jwks-rsa` only.
- Re-tested `/api/token` with a temporary test user and room (deleted afterwards), with the `require()` feature still turned off. Every case gave the expected result: wrong method 405, bad code 400, no or fake sign-in 401, not a member or room closed 403, member of an open room 200 with a token.

**What I did:** reported the bug from the Vercel preview, reviewed the fix, and tested it on the preview with two devices.

**What I learned:** a package can work locally but fail on the server when the Node setup is different, so the server logs (Vercel → Logs) are the first place to look. Some npm packages now only support `import` (ES modules), and `overrides` in `package.json` can pin one dependency's version without changing the others.

## Ethical use

Blue Studios takes photos and video of real people, so use it with care:

- **Ask before you shoot.** Everyone in a room sees every photo and clip, and a shared strip can be opened by anyone with its link. Only take photos of people who know and agree, and don't share someone's strip without asking them.
- **Use your own Firebase project and test data** when you set up your own copy. Don't sign up with anyone else's name, email or photo; use fake, clearly labelled test accounts instead. The end-to-end tests do this for you, in local emulators.
- **Don't share your `.env` or keys.** `FIREBASE_SERVICE_ACCOUNT`, `AGORA_APP_CERTIFICATE`, `CRON_SECRET` and the API keys give real access and can cost real money: never post them in a public repo or a chat.
- **Respect the outside services.** Jamendo songs, GIPHY stickers and remove.bg each have their own terms of use and limits.


## Disclaimer

This project was made for the IS216 course, for educational purposes, and is provided **as-is**, with no warranty of any kind. It is **not** production-ready: see [Known limitations](#known-limitations) and the "Not done" list under [Security](#security). Don't use it to store sensitive personal data. If you run your own copy, you are responsible for your Firebase, Agora and Vercel projects, including any usage costs, the data stored there, and how their access is configured. The authors of this repository **are not liable** for any loss, damage or misuse arising from its use.
