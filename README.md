# Blue Studios Photobooth (IS216 G3 Group 2)

An online photobooth where friends join one room from their own devices and take photos together.

Current status: **Photobooth Rooms MVP** (create/join room, QR code, video call with mute/unmute, synchronised countdown, shared gallery, collaborative photostrip, close room).

## Tech stack

- Vue 3 (`<script setup>` with `ref()` / `computed()`, and composables for shared logic) + Vue Router, built with Vite
- `.vue` files are ordered: `<script setup>`, then `<template>`, then `<style scoped>`
- Bootstrap 5 for layout and responsive design
- Firebase Cloud Firestore for real-time data (`onSnapshot` listeners)
- Firebase Authentication: everyone gets a user id (uid), guests are signed in anonymously
- Vercel for hosting (https is needed for phone cameras) + a Vercel serverless function for Agora tokens
- MediaDevices API (`getUserMedia`) for the camera, Canvas API to capture photos
- goqr.me API to generate the join QR code
- Agora Web SDK (`agora-rtc-sdk-ng`) for the video call (video + audio), `agora-token` to create tokens on the server
- axios to call our token API
- Firebase Admin SDK (`firebase-admin`) on the server, to check who is calling our API
  - `package.json` has `"overrides": { "jwks-rsa": { "jose": "^5.10.0" } }`. Do not remove it: `firebase-admin` uses `jwks-rsa`, which loads `jose` with `require()`, but `jose` 6 only works with `import`, and Vercel's server cannot `require()` it (`ERR_REQUIRE_ESM`, the API crashes). `jose` 5 works with both.
- Firestore security rules (`firestore.rules`), tested with the Firebase emulator

## Project structure

```
index.html               page shell, loads src/main.js
src/main.js              creates the Vue app, adds Bootstrap and the router
src/App.vue              navbar + <router-view>
src/router.js            URL -> page mapping ( /, and /room/:code with child pages '' and 'strip' )
src/firebase.js          Firebase config (read from .env), exports db and auth
src/guest.js             guest name saved in localStorage, device type (Phone/Tablet/Computer)
src/room.js              6-person room limit, "is this member still here?" check

src/composables/useAuth.js        SHARED login state: who is signed in (guests are signed in anonymously), sign up, log in, Google, log out
src/composables/useRoom.js        SHARED room state: room document, members (+ heartbeat), photos
src/composables/useVideoCall.js   SHARED video call (Agora): camera, mic, others' video/audio, switch camera

src/components/VideoCallCard.vue  the call card: everyone's tiles + Mute/Unmute, Leave, Close room
src/components/VideoTile.vue      one person: live video, name, device type, mute icon (all tiles the same size)
src/components/RoomGallery.vue    the shared gallery (grouped by shot) + Make photostrip button
src/components/StreamVideo.vue    a <video> showing a camera stream (my camera)
src/components/StorageImage.vue   an <img> of a file in Firebase Storage (only loads if the storage rules allow it)
src/components/MarketplaceCard.vue  one template/sticker in a marketplace grid (links to its page)
src/components/ItemDetailsForm.vue  rename a template/sticker and pick its categories (My Studio)

src/views/HomeView.vue    create room / join room by code
src/views/LoginView.vue   log in / sign up (email + password, or Google), forgot password
src/views/StudioView.vue  My Studio (/studio, accounts only): my photostrips, templates, stickers, public/private, saved
src/studio.js             save / list / publish / delete My Studio items (templates, stickers, strips), CATEGORIES
src/views/MarketplaceView.vue      marketplace (/marketplace, anyone): browse public templates/stickers by category
src/views/MarketplaceItemView.vue  one item (/marketplace/templates/{id}): save to My Studio, report
src/marketplace.js        browse / save / unsave / report marketplace items
src/views/AdminView.vue   admin page (/admin, admins only): reports, hidden items, accounts (ban), rooms, log
src/admin.js              moderator actions used by the admin page (hide, unhide, reports, rooms, log, calls /api/admin)
src/views/TestUploadView.vue  TEMPORARY (/test-upload): makes test templates/stickers until the editors are merged. Remove before submission
src/views/RoomLayout.vue  parent page for a room: joins the room + call once, shows a child page
src/views/RoomView.vue    (child) camera, shutter, countdown, join card, call card, gallery
src/views/StripView.vue   (child) call card, collaborative photostrip, export as JPG

api/token.js             Vercel serverless function: GET /api/token?code=1234 -> Agora token (members only)
api/admin.js             Vercel serverless function: POST /api/admin (admins only): look up, ban, unban accounts
api/_lib/firebaseAdmin.js  server-only Firebase Admin setup + getCaller(req) (who is calling). "_" = not a web address
scripts/set-admin.mjs    run on your laptop: give or remove the admin mark (npm run set-admin -- email)
scripts/set-cors.mjs     run on your laptop: apply storage.cors.json to the Storage bucket (npm run set-cors)
storage.cors.json        lets pages read Storage files with fetch / draw them on a canvas (GET/HEAD only)
docs/phase-7-lockdown-prompt.md  prompt to give Claude for the security lockdown before submission
firestore.rules          Firestore security rules: who can read/write what (deploy with the Firebase CLI)
storage.rules            Firebase Storage rules: files of templates, stickers and strips
firestore.indexes.json   Firestore indexes the marketplace queries need (deployed with the rules)
firebase.json, .firebaserc  Firebase CLI settings (which project, which rules files)
tests/firestore.rules.test.js  tests for firestore.rules (npm run test:rules)
tests/storage.rules.test.js    tests for storage.rules (npm run test:rules)
tests/admin.api.test.js        tests for api/admin.js against the local Auth + Firestore emulators (npm run test:rules)
vercel.json              sends page URLs (/room/..., /room/.../strip) to index.html (add new page routes here too)
.env.example             list of environment variables needed (copy to .env)
```

## How the room works

Firestore data:

```
rooms/{code}                 { hostId, hostName, shotNumber, shotStartedBy, stage, stripSlots, closed, createdAt }
rooms/{code}/members/{id}    { name, deviceType, joinedAt, lastSeen }
rooms/{code}/photos/{auto}   { ownerId, name, shotNumber, image, createdAt }
```

**Who is who:** when the app opens, `main.js` waits for `startAuth()` (in `useAuth.js`). If nobody is signed in, it signs in **anonymously**: Firebase gives the browser a real user id (`uid`) with no email or password, and remembers it, so a refresh keeps the same uid. The `uid` is used as the member document id, the room's `hostId`, a photo's `ownerId` and the Agora user id. Because Firebase itself checks the uid, the Firestore security rules can trust it (a random id in localStorage could be faked).

**Accounts:** on `/login`, a guest can sign up with email + password or Google. Firebase **links** the new login to the guest user, so the uid does not change and anything made as a guest stays theirs. A new account gets a public profile `users/{uid}` and a verification email (a reminder shows until they click the link). Logging out signs the device back in as a new guest. Log in / log out is hidden inside a room, because changing user in a room would drop you from it. Security: Firebase stores and hashes passwords (we never see them), login errors never say whether an email has an account, "Forgot password" shows the same message either way, and `?redirect=` after login only goes to pages on our own site.

1. **Create:** the host picks a random code from `0000` to `9999` that is not in use and creates `rooms/{code}`.
2. **Join:** the Join button only turns on (and becomes the main button) once 4 digits are typed. `RoomLayout.vue` checks the room exists, is not closed and is not full, then joins it **once** for all the room's pages:
   - **Members:** each person has a document in `members`. Every device listens with `onSnapshot`, so the list updates live.
   - **Heartbeat:** every 15 seconds each device updates its `lastSeen` time. A member not seen for 45 seconds (closed the tab) is no longer shown or counted.
   - **Room limit:** at most 6 people at once (1 host + 5 guests). Before joining, we count the active members (`isRoomFull` in `room.js`). Someone already in the room (e.g. refreshing) is always let back in.
3. **Shared state (composables):** `useRoom.js` and `useVideoCall.js` create their `ref()`s once, outside the function, so every page and component that calls them shares the same room and the same call.
4. **Video call:** each device asks our server for a token (`GET /api/token?code={code}`, see "Who gets a token" below), joins that Agora channel and sends ("publishes") its camera. When Agora says someone published video or audio (`user-published` event), we subscribe; `VideoTile.vue` plays their video, and audio just plays.
   - **Everyone starts muted:** the microphone is not opened when joining. "Unmute" opens the mic and publishes it; "Mute" unpublishes and closes it (so the mic is fully off).
   - **Stays connected between pages:** the call is started by `RoomLayout.vue`, the parent of the camera and strip pages, so switching pages does not drop the call.
   - **Adding it to another page:** make the page a child route of `/room/:code` in `router.js`, and put `<VideoCallCard />` on it.
5. **Synchronised countdown (anyone can press the shutter):** pressing the round shutter button adds 1 to `shotNumber` using a Firestore **transaction**: it only adds 1 if `shotNumber` is still the number this device saw. If two people press at the same moment, the second transaction sees the number has already changed and does nothing, so only one countdown starts. Every device watches `shotNumber` and starts its own 3-2-1 when it goes up.
6. **Capture:** the current video frame is drawn on a canvas, turned into a small JPEG (data URL), and saved to `photos` with the shot number. A white flash fades in shortly before the photo and fades out shortly after it. Devices hear about the shutter at slightly different times, so this makes sure every screen is still lit up when every device takes its photo. The timing, fade length and brightness are the `FLASH_*` settings at the top of `RoomView.vue`.
7. **Shared gallery:** every device listens to `photos`, so new photos appear on everyone's screen. Photos are grouped by shot number.
8. **Switch camera:** after permission is given, we list all cameras with `enumerateDevices()`. If there is more than one, a button cycles through them. Switching swaps the new camera into the track already being sent (`replaceTrack`), so others never see us leave and rejoin. When a phone rotates, the browser rotates the camera picture by itself; tiles use `fit: 'contain'` so portrait and landscape both show fully.
9. **Pages move together (`stage`):** "Make photostrip" sets the room's `stage` to `'strip'`; "Back to camera" sets it to `'camera'`. `RoomLayout.vue` watches `stage` and sends everyone to the matching page.
10. **Collaborative photostrip:** the 4 chosen photo ids are stored in the room document (`stripSlots`), so everyone sees the same strip. Each slot is saved on its own (`updateDoc(room, { 'stripSlots.2': photoId })`), so two people changing different slots at once do not overwrite each other. Which slot you are filling is personal. "Download JPG" draws the strip on a canvas: each photo is cropped to fill its 4:3 slot (like CSS `object-fit: cover`), then downloaded with a temporary `<a download>` link.
11. **Close room:** the host (or anyone, if the host has left) can close the room. This sets `closed: true`; every device sees it, ends the video call and goes back to the home page. Closed rooms cannot be joined. This stops Agora minutes being used by forgotten open tabs.
12. **Layout (Bootstrap grid):** the camera page is a Bootstrap `row` with `col-*` classes, exactly one screen tall (`100dvh`), so the join card, camera and call are always visible and only the gallery scrolls. Room pages use `container-fluid` (full width) so big screens get a bigger camera and bigger call tiles.
    - **xs** (phone upright): one column (`flex-column`): join card, call (sideways row), gallery (sideways row), camera fills the rest (`flex-grow-1`).
    - **sm / md / lg** (phone sideways, tablet, laptop): `col-sm-5 col-md-4` on the left with join card, call and gallery (scrolls); camera on the right.
    - **xl** (1200px+): `col-xl-3 | col-xl-6 | col-xl-3`: join card + call on the left, camera in the middle, gallery on the right. The gallery is shown twice in the code, with `d-xl-none` (in the left column) and `d-none d-xl-block` (own column), so only one is visible at a time.
    - **Call tiles are all the same size:** fixed width (or two equal `minmax(0, 1fr)` columns), badges sit on top of the video, and the name is one line cut off with `text-truncate`.
    - **Shutter button:** sits on the camera view: bottom middle, or on the right edge when a phone is held sideways. Bootstrap breakpoints only check width, so that one case uses `(orientation: landscape) and (max-height: 500px)`.
### Why a token server?

Agora projects have an **App Certificate** (a secret). To join a channel, the browser needs a **token** made with that certificate. If the certificate were in the frontend code, anyone could read it in the browser. So `api/token.js` runs on Vercel's server, reads the certificate from an environment variable, and only sends the browser a token for one channel + one user that expires after 3 hours.

**Who gets a token:** the browser sends its Firebase **ID token** (proof of who is signed in) in the `Authorization: Bearer ...` header. The server asks Firebase to check it (`getCaller` in `api/_lib/firebaseAdmin.js`), then only gives a token if the room exists, is open, and the caller has a member document in it. The Agora user id is the **checked** uid from the ID token, so nobody can join a call pretending to be someone else.

### Security rules

`firestore.rules` is checked by Firebase on its own servers for every read and write, so it protects the data even if someone edits the code in their browser. Everything is blocked unless a rule allows it. In short:

- **Rooms:** anyone signed in can look up one room by code (not list them). Only the host can create it, as themselves. Members can press the shutter (`shotNumber` + 1 only), change `stage`, change strip slots 0-3, and close the room. A closed room cannot be changed or reopened. Nobody can delete a room.
- **Members:** you can only join, update (heartbeat) and leave as yourself, only into an open room, and every field is checked.
- **Photos:** only members can see them. You can only add a photo as yourself (`ownerId`), for a shot that has happened, as a JPEG under about 900KB. Photos cannot be edited.
- **User profiles** (`users/{uid}` `{ displayName, createdAt }`): anyone signed in can read one profile (only admins can list them). Only accounts (not guests) can create one, only their own, and they can only change `displayName` (1-30 characters). The email is not stored in Firestore.
- **Templates, stickers** (`templates/{id}`, `stickers/{id}`): only accounts that are not banned can save them, as themselves, with their real profile name (`ownerName`), and their files must be in their own Storage folder. They need 1 to 3 categories from the fixed list. New items start `private`, `active`, with 0 saves. Only accounts with a **confirmed email** can make one `public`. Who can see one: the owner, admins, and anyone signed in (guests too) if it is public and not hidden. Only admins can change `status` (hide / unhide). Only the owner or an admin can delete.
- **Strips** (`strips/{id}`): always private to the owner.
- **Marketplace browsing:** a list query must ask for `visibility == 'public'` and `status == 'active'`, or it is refused (so nobody can list private or hidden items).
- **Saved** (`users/{uid}/saved/{itemId}`): only I can see my saved list. I can only save items that are in the marketplace, and `saveCount` must go up by exactly 1 in the same batch (and down by 1 when I unsave). So the number cannot be faked, and nobody can save the same thing twice.
- **Reports** (`reports/{itemId_uid}`): accounts (not guests, not banned) can report someone else's marketplace item, once (the id includes their uid). Only the reporter and admins can read a report, and only admins can list or close them.
- **Banned accounts** (`users/{uid}.banned == true`, set by an admin) cannot create or change anything.
- **Admins** have the custom claim `admin: true` in their login token (only `scripts/set-admin.mjs` can set it). They can see private and hidden items, hide/unhide items, close reports, list profiles, close any room and delete room photos. **Admin log** (`adminLog`): only admins can read it or add to it, as themselves, and nobody can change or delete an entry.
- **Storage** (`storage.rules`): files are in a folder named after the owner's uid (`templates/{uid}/...`, `stickers/{uid}/...`, `strips/{uid}/...`). Only the owner (an account) can upload there, only images (or the template's `project.json`) under 2-5 MB. Public files can be downloaded while their Firestore document is public and not hidden.
- **DEV mode (while we are still building, look for `DEV` in the rules files):** so teammates are not blocked, members of an open room can change any room field except its core (`hostId`, `hostName`, `createdAt`, `shotNumber`, `shotStartedBy`, `closed`). New lists inside a room are open to its members. Any **new** top-level collection, and any **new** Storage folder (files under 50 MB, no HTML/SVG/JS/XML), are open to anyone signed in. Users, templates, stickers, strips, reports, members and photos stay strict. **Before submission**, replace the DEV blocks with real rules for each feature, plus tests.

Run the tests with `npm run test:rules` (needs Java). It starts local copies of Auth, Firestore and Storage, so it never touches the real data. Deploy the rules and indexes with `firebase deploy --only firestore,storage`.

## My Studio: saving templates, stickers and strips (for teammates)

> **Each teammate has a step-by-step guide with examples in [`docs/team/`](docs/team/README.md).** This section is the short version.

Accounts have a **My Studio** page (`/studio`) with everything they saved. Each item is a small Firestore document plus its files in Firebase Storage:

```
templates/{id}  { ownerId, ownerName, name, slotCount, categories, visibility, status, saveCount, thumbnailPath, dataPath, createdAt, updatedAt }
                  Storage: templates/{uid}/{id}/thumbnail.png  and  templates/{uid}/{id}/project.json
stickers/{id}   { ownerId, ownerName, name, kind, categories, visibility, status, saveCount, imagePath, createdAt, updatedAt }
                  Storage: stickers/{uid}/{id}/image
strips/{id}     { ownerId, title, imagePath, createdAt }
                  Storage: strips/{uid}/{id}.jpg
```

- `categories`: 1 to 3 ids from `CATEGORIES` in `studio.js` (`birthday`, `friends`, `love`, `graduation`, `holiday`, `cute`, `minimal`, `other`). The owner can change them in My Studio.
- `visibility`: `'private'` or `'public'` (public = shown in the marketplace). The owner changes it in My Studio.
- `status`: `'active'` or `'hidden'` (only admins can hide something).

**Use the functions in `src/studio.js`** instead of writing to Firestore/Storage yourself (the security rules check every field, so a hand-written write will probably be blocked):

```js
import { useAuth } from '../composables/useAuth.js'
import { saveTemplate, saveSticker, loadTemplateProject, CATEGORIES } from '../studio.js'

const { isAccount } = useAuth()   // only accounts can save: show a "Log in to save" button for guests

// categories: 1 to 3 ids, e.g. ['birthday', 'cute']. Show CATEGORIES (each { id, label }) as checkboxes.

// Template editor (Joash): thumbnail is a PNG Blob, projectData is the editor's project object
const id = await saveTemplate({ name, slotCount, categories, thumbnail, projectData })   // new template
await saveTemplate({ id, name, slotCount, categories, thumbnail, projectData })          // update it later
const projectData = await loadTemplateProject(template)                                  // open it again *

// Sticker maker (Rae): image is a PNG, GIF or WebP Blob (under 2 MB)
await saveSticker({ name, kind: 'static', categories, image })   // kind: 'static', 'animated' or 'dynamic'
```

\* `loadTemplateProject` downloads a file with `fetch`, and pages draw Storage images on a canvas. Both need the bucket's CORS setting, which is in `storage.cors.json` and applied with `npm run set-cors` (already done; run it again only if the file changes). Load images with `img.crossOrigin = 'anonymous'`.

## Marketplace

`/marketplace` shows public templates and stickers that an admin has not hidden. Anyone can browse, guests too. The tab, category and sort (newest or most saved) are in the URL, e.g. `/marketplace?type=stickers&category=cute&sort=popular`, so links and the back button keep them. Pages load 24 items at a time ("Load more" uses a Firestore `startAfter` cursor).

- **Saving is by reference:** saving writes a bookmark `users/{uid}/saved/{itemId}` `{ type, savedAt }` and adds 1 to the item's `saveCount` in the same **batch** (both happen or neither). The item itself stays with its owner, so if they make it private or delete it, it shows as "No longer available" in everyone's My Studio.
- **Reports:** accounts can report an item once (`reports/{itemId_uid}` with a reason and optional details). Admins will review them on the admin page.
- **Indexes:** each marketplace query (filters + sort) needs a Firestore index. They are in `firestore.indexes.json`. If you add a new filter or sort, the browser console shows an error with a link that creates the missing index; add it to that file too.

Functions in `src/marketplace.js`: `listPublicItems({ type, category, sort, after })`, `getItem(type, id)`, `saveItem(item)`, `unsaveItem(type, id)`, `isSaved(id)`, `listMySaved()`, `reportItem(item, reason, details)`, `hasReported(item)`.

## Admin (moderators)

Moderators are normal accounts with an **admin mark** (a Firebase custom claim `admin: true`). The mark lives in the login token, so it can only be set with the secret service account key, never from the browser.

**Make someone an admin** (on your laptop, in the project folder, with `FIREBASE_SERVICE_ACCOUNT` in `.env`):

```bash
npm run set-admin -- someone@example.com            # give the mark
npm run set-admin -- someone@example.com --remove   # take it away
```

They then log out and in again (or refresh), and an **Admin** button appears in the navbar.

**The admin page** (`/admin`):
- **Reports:** reported items, grouped by item, with each reason. "Hide item" takes it out of the marketplace and closes its reports as resolved. "Dismiss" closes the reports. "Owner's account..." opens the account tab.
- **Hidden items:** unhide.
- **Accounts:** find an account by email or user id, then ban or unban it (a reason is required).
- **Rooms:** open a room by code to see its photos, delete a photo, or close the room.
- **Log:** everything moderators did.

**What a ban does** (`api/admin.js`, which uses the Admin SDK because only the server can switch off a login):
1. Turns off the account's login (`disabled`) and logs it out on every device (`revokeRefreshTokens`).
2. Sets `users/{uid}.banned = true`, which the rules check, so even a login token that hasn't expired yet can't create or change anything.
3. Hides all their templates and stickers.
4. Writes the ban to `adminLog`.

Admins can't ban themselves, other admins (remove the mark first), or guests (they have no account). Unbanning turns the login back on; their items stay hidden until an admin unhides them.

## Environment variables

All keys live in environment variables, not in the code.

| Variable | Used by | Where to find it |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Frontend (`src/firebase.js`) | Firebase console > gear icon > Project settings > Your apps > Config |
| `AGORA_APP_ID` | Server (`api/token.js`) | Agora console > Projects |
| `AGORA_APP_CERTIFICATE` | Server (`api/token.js`), **secret** | Agora console > Projects > your project > Primary Certificate |
| `FIREBASE_SERVICE_ACCOUNT` | Server (`api/_lib/firebaseAdmin.js`), **secret** | Firebase console > Project settings > Service accounts > Generate new private key, then the .json file as one line of base64 (ask Gabriel) |

- Locally they go in a file called `.env` (copy `.env.example` and fill it in). `.env` is in `.gitignore` and must never be committed.
- On Vercel they go in Project > Settings > Environment Variables.
- Only variables starting with `VITE_` are put into the frontend by Vite. The Agora ones have no `VITE_` prefix on purpose, so they stay on the server.

---

## Setup guide

You need [Node.js](https://nodejs.org) (LTS) installed. Check with `node -v` in a terminal.

### Step 1: Firebase project and Firestore (already done for our group)

1. Go to https://console.firebase.google.com, **Create a project** named `blue-studios`, Analytics off.
2. Click the **Web** icon `</>`, nickname `blue-studios-web`, leave "Firebase Hosting" unticked, **Register app**.
3. Copy the values from the `firebaseConfig` code block into `.env` (the `VITE_FIREBASE_...` lines).
4. Left menu: **Build > Firestore Database > Create database**, location `asia-southeast1 (Singapore)`, **Start in test mode**.

The database is protected by `firestore.rules` (see **Security rules** above), deployed with the Firebase CLI. Do not edit the rules in the console's Rules tab: the next deploy would overwrite them.

Also enable **Build > Authentication > Sign-in method > Anonymous** (guests are signed in anonymously).

### Step 2: Agora App ID and App Certificate

1. Go to https://console.agora.io and log in.
2. Open **Projects** in the left menu (may be called **Project Management** or **All Projects**).
3. Find the `blue-studios` project. The **App ID** is in the list, with a copy icon next to it. Paste it into `.env` as `AGORA_APP_ID=...`.
4. Click the project's **edit/configure** icon (pencil or gear) to open its settings.
5. Under **Security**, find **Primary Certificate** (App Certificate). Click the eye icon to show it, or the copy icon to copy it. Paste it into `.env` as `AGORA_APP_CERTIFICATE=...`.
6. Never put the certificate in any file under `src/`, and never commit `.env`.

### Step 3: Run it on your laptop

Two ways:

**A. Everything, including live previews (recommended)** - uses the Vercel CLI, which runs both Vite and the `/api` function:

```
npm install
npm install -g vercel
vercel login
vercel link
vercel dev
```

- `vercel login`: choose "Continue with GitHub" and approve in the browser.
- `vercel link`: answer **Y** to set up, pick your account, and link to the existing `blue-studios` Vercel project (create it first in Step 4, or let it create a new one).
- `vercel dev` reads your `.env` file and opens the app at **http://localhost:3000**.

**B. Quick frontend only:** `npm run dev`, then open http://localhost:5173. Everything works except live previews, which show "Could not connect to live previews" because Vite alone does not run `/api/token`.

To test with "two people" on one laptop: open a second Chrome window in **Incognito** (Ctrl+Shift+N) at the same address. Incognito has its own localStorage, so it acts as a different guest.

The QR code points to `localhost`, which your phone cannot open. Phones need the deployed https version (Step 4).

### Step 4: Deploy to Vercel

1. Push the code to GitHub (`main` branch of `gmthj/Blue-Studios`).
2. Go to https://vercel.com/signup, choose **Hobby** (free), and **Continue with GitHub**.
3. On the dashboard click **Add New... > Project**.
4. Under **Import Git Repository**, find `Blue-Studios` and click **Import**. If it is not listed, click **Adjust GitHub App Permissions** and give Vercel access to the repo.
5. On the configure screen:
   - Framework Preset: **Vite** (detected automatically)
   - Build Command: `npm run build`, Output Directory: `dist` (the defaults)
   - Open **Environment Variables** and add all 8 variables from your `.env` file. Shortcut: copy the whole content of `.env` and paste it into the first **Key** box; Vercel splits it into separate variables. Check `AGORA_APP_CERTIFICATE` has the real value, not the placeholder.
6. Click **Deploy** and wait about a minute.
7. You get a URL like `https://blue-studios-xxxx.vercel.app`.

From now on, every push to `main` redeploys automatically. If you change an environment variable later, go to **Deployments**, click **...** on the latest one, and choose **Redeploy** (variables only apply to new deployments).

### Step 5: Test with your phone

1. On your laptop, open the `.vercel.app` URL, type your name, **Create room**, and allow the camera.
2. On your phone, scan the QR code with the camera app and open the link.
3. Type a name on the phone, press **Join room**, and allow the camera.
4. Check: both names appear in "In this room" (scroll down), each device shows the other in **Live previews**, and **Switch camera** appears on the phone.
5. On the laptop (host), press the round **shutter button** (anyone can). Both devices count 3-2-1 and both photos appear in the gallery under the same shot.

To check the token API is protected, open `https://YOUR-URL.vercel.app/api/token?code=1234` in a browser. You should see `{"error":"Please sign in again"}` (the browser address bar sends no sign-in token). If live video says "Live video unavailable", check Vercel > Logs: a missing `AGORA_...` or `FIREBASE_SERVICE_ACCOUNT` variable is logged there (then add it and Redeploy).

---

## Known limitations (MVP)

- Members who close the tab without pressing "Leave room" disappear from the list only after about 45 seconds (heartbeat timeout).
- The 6-person limit is checked when joining, not enforced by the security rules (rules cannot count documents): two people joining at the exact same moment could both get in.
- Countdown sync depends on network speed (usually within half a second).
- Photos are stored as small JPEG text in Firestore (each document max 1MB) instead of Firebase Storage, to keep setup simple and free.
- Room codes are only 4 digits, so anyone signed in could guess a code and join an open room. Photos are only visible to people who have joined.
- Two normal tabs in the same browser share one user id (uid), so Agora treats them as the same user. Use an Incognito window for the second guest.
- Testing several unmuted devices in the same physical room causes echo/feedback. Keep all but one muted, or use earphones.
- If a page is opened by refreshing (no tap on the page yet), the browser may block others' audio until you tap anywhere on the page.
- Agora minutes are used by every connected device until it leaves or the room is closed. Close the room when finished testing.

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

**What I learned:** a package can work locally but fail on the server when the Node setup is different, so the server logs (Vercel > Logs) are the first place to look. Some npm packages now only support `import` (ES modules), and `overrides` in `package.json` can pin one dependency's version without changing the others.


