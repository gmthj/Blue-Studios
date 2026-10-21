# Blue Studios Photobooth (IS216 G3 Group 2)

An online photobooth: friends join one room from their own devices (4-digit code or QR), video call, take photos together with a synchronised countdown, and make a photostrip together. Accounts can save strips, templates and stickers to **My Studio** and share templates and stickers in the **Marketplace**. Moderators have an **Admin** page.

**Live site:** https://blue-studios-mu.vercel.app

---

## Setup

There are two ways to set it up:
- **A. Join the team's project.** Most people want this: it uses the existing Firebase, Agora and Vercel projects (Gabriel has the keys). Do **steps 1 to 5**.
- **B. Your own copy from scratch**, for example a marker running it with their own accounts. First do **"Setting up your own Firebase, Agora and Vercel"** further down, then steps 1 to 5.

### 0. Install the tools

| Tool | Needed for | Install | Check |
| --- | --- | --- | --- |
| [Node.js](https://nodejs.org) LTS (v24 is used) | everything | the installer from nodejs.org | `node -v` |
| [Git](https://git-scm.com) | getting the code | the installer from git-scm.com | `git --version` |
| Vercel CLI | running the app **with** its `/api` functions (video call, admin) | `npm install -g vercel` | `vercel --version` |
| Firebase CLI | deploying the security rules, running the rules tests | `npm install -g firebase-tools` | `firebase --version` |
| *Optional:* Java 21 or newer (e.g. [Adoptium Temurin](https://adoptium.net)) | **only** for running the rules tests on your own laptop (the Firestore emulator runs on Java). **Skip it** unless you change the rules: GitHub runs the tests for you (step 4) | the installer from adoptium.net | `java -version` |

The project uses **npm**. Don't use pnpm or yarn, so there's only one lock file (`package-lock.json`).

### 1. Get the code and install packages

```bash
git clone https://github.com/gmthj/Blue-Studios.git
cd Blue-Studios
npm install
```

**Teammates:** start your feature branch from `main`, for example `git switch -c my-feature origin/main`. Branches made before the sign-in system (19 Oct 2026) get "Missing or insufficient permissions" from Firebase. See [`docs/team/`](docs/team/README.md) for your guide.

### 2. Environment variables (the keys)

1. Copy `.env.example` to a new file called `.env` in the project folder.
2. Fill in the values. **Team:** ask Gabriel for them. **Own copy:** see where each one comes from below.

| Variable | Used by | Secret? | Where it comes from |
| --- | --- | --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | the website (`src/firebase.js`) | no, every visitor's browser gets them; the security rules protect the data | Firebase console > gear icon > **Project settings** > **Your apps** > the web app's config |
| `FIREBASE_SERVICE_ACCOUNT` | the server (`api/`), and the scripts `set-admin` / `set-cors` | **yes** | Firebase console > Project settings > **Service accounts** > **Generate new private key**, then the downloaded `.json` file as **one line of base64** (commands below) |
| `AGORA_APP_ID` | the server (`api/token.js`) | no | Agora console > **Projects** |
| `AGORA_APP_CERTIFICATE` | the server (`api/token.js`) | **yes** | Agora console > Projects > your project > **Primary Certificate** |

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

Paste the result after `FIREBASE_SERVICE_ACCOUNT=`. Then **delete the downloaded `.json` file**: anyone with it has full access to the Firebase project.

- **`.env` must never be committed.** It's in `.gitignore`. Never put a secret in a `VITE_` variable: Vite copies those into the website, where anyone can read them.
- Some teammates' features add their own keys (for example `VITE_JAMENDO_CLIENT_ID` for the music mixer). They're listed in `.env.example` on the branch that uses them.

### 3. Run it on your laptop

**Full app, including the video call and admin (recommended).** The Vercel CLI runs the website **and** the `api/` functions:

```bash
vercel login     # "Continue with GitHub", approve in the browser
vercel link      # Y, pick the team/account, link to the existing "blue-studios" project
vercel dev       # reads .env, opens http://localhost:3000
```

**Website only (faster to start):** `npm run dev`, then open http://localhost:5173. Everything works except what needs `api/`. The video call shows "Live video unavailable", and the admin page can't load accounts or ban anyone.

**Testing with two people on one laptop:** open a second window in **Incognito** (Chrome: Ctrl+Shift+N) at the same address. Incognito has its own login, so it's a different guest. Two normal tabs share one login.

**Phones** need https, so they can't use your laptop's `localhost` (the QR code points to it). Test phones on a Vercel deployment (step 5).

### 4. Firebase CLI: rules, indexes and tests

Only needed if you change `firestore.rules`, `storage.rules` or `firestore.indexes.json`, or want to run the tests.

```bash
firebase login                                # once, with the Google account that has access to the project
firebase deploy --only firestore,storage      # deploys the Firestore rules + indexes and the Storage rules
npm run test:rules                            # OPTIONAL: runs the rules + admin API tests on your laptop (needs Java)
```

- **Running the tests yourself is optional.** GitHub runs `npm run test:rules` automatically (`.github/workflows/rules-tests.yml`) on every pull request and on every push that changes the rules, `api/` or `tests/`. You'll see a ✓ or ✗ next to the commit or pull request, and the details under the repo's **Actions** tab. Run them locally only if you want the result before pushing.

- The project is set in `.firebaserc` (`blue-studios-7cf16`). For your own copy, run `firebase use --add` and pick your project.
- **Don't edit the rules in the Firebase console.** The next deploy overwrites them. Edit the files, test, then deploy.
- The tests never touch the real data: `npm run test:rules` starts local copies of Auth, Firestore and Storage.
- The first time you deploy `storage.rules`, the CLI may ask to let Storage read Firestore (the rules check whether a marketplace item is public). Answer **Y**.

### 5. Deploy to Vercel, and test with your phone

**The team project is already connected.** Every push to GitHub deploys automatically:
- `main` goes to the live site.
- Other branches get their own **preview** address (shown on the pull request and in Vercel > Deployments).

If you change an environment variable on Vercel, it only applies to **new** deployments: go to Deployments, click **...** on the latest one, then **Redeploy**.

**Testing a deployment with a phone:**
1. On your laptop, open the deployment address, type your name, **Create room**, and allow the camera.
2. On your phone, scan the QR code with the camera app, type a name, **Join**, and allow the camera.
3. Check:
   - both of you appear in the call
   - **Switch camera** shows on the phone
   - pressing the round **shutter** button counts 3-2-1 on both devices, and both photos land in the gallery under the same shot
4. Check the token API is protected: open `https://YOUR-ADDRESS/api/token?code=1234` in a browser. It should say `{"error":"Please sign in again"}`.
5. If the video says "Live video unavailable", look in Vercel > **Logs**. A missing `AGORA_...` or `FIREBASE_SERVICE_ACCOUNT` variable is logged there. Add it, then Redeploy.

**Google sign-in on a new address:** add the address under Firebase console > **Authentication** > **Settings** > **Authorized domains**. Otherwise the Google popup fails with `auth/unauthorized-domain`.

### 6. Make yourself an admin (optional)

With `FIREBASE_SERVICE_ACCOUNT` in `.env`, log in to the site once with your account, then:

```bash
npm run set-admin -- you@example.com            # give the admin mark
npm run set-admin -- you@example.com --remove   # take it away
```

Log out and in again: an **Admin** button appears in the navbar. More in [Admin (moderators)](#admin-moderators).

### Setting up your own Firebase, Agora and Vercel (own copy only)

Already done for the team project. Follow these only to run your own copy.

**Firebase** (https://console.firebase.google.com):
1. **Create a project** (Google Analytics off).
2. On the project home page, click the **Web** icon `</>`, give it a nickname, leave Firebase Hosting unticked, then **Register app**. The `firebaseConfig` values go into `.env` as the `VITE_FIREBASE_...` lines.
3. Bottom left: **Upgrade** to the **Blaze** plan. Firebase Storage needs it. Normal testing stays inside the free amounts. Set a **budget alert** (Google Cloud console > Billing > Budgets & alerts), for example $1.
4. **Build > Firestore Database > Create database**: pick a location (we use `asia-southeast1`, Singapore) and **production mode**. Our rules are deployed in step 4 of Setup.
5. **Build > Storage > Get started**: pick a US location such as `us-east1` (it has a no-cost tier) and **production mode**.
6. **Build > Authentication > Get started > Sign-in method**, then turn on all three:
   - **Anonymous** (guests)
   - **Email/Password** (accounts)
   - **Google**: set a support email
7. **Authentication > Settings > Authorized domains**: add your Vercel address(es), for example `your-project.vercel.app`.
8. **Project settings > Service accounts > Generate new private key**: turn it into `FIREBASE_SERVICE_ACCOUNT` (Setup step 2).
9. In the project folder:
   - `firebase use --add` (pick your project)
   - `firebase deploy --only firestore,storage`
   - `npm run set-cors`. This lets the website draw Storage images on a canvas and download template files (it uses `storage.cors.json`).

**Agora** (https://console.agora.io):
1. **Projects > Create**. Choose authentication with **App ID + Token** (secured mode), so it gets an **App Certificate**.
2. Copy the **App ID** into `AGORA_APP_ID`.
3. Open the project's settings (pencil/gear icon). Under **Security**, find **Primary Certificate** and copy it into `AGORA_APP_CERTIFICATE`.
4. Never put the certificate in a file under `src/`, and never commit `.env`.

**Vercel** (https://vercel.com, Hobby plan, "Continue with GitHub"):
1. **Add New... > Project**, then import the GitHub repo. If it isn't listed, click **Adjust GitHub App Permissions**.
2. The Framework Preset is **Vite** (detected automatically), with build command `npm run build` and output folder `dist`.
3. **Environment Variables:** add every variable from your `.env`. Shortcut: paste the whole `.env` content into the first **Key** box and Vercel splits it up.
4. **Deploy.** Then add the Vercel address to Firebase's Authorized domains (Firebase step 7).

---

## Tech stack

- **Vue 3** (`<script setup>` with `ref()` / `computed()`, composables for shared logic) + **Vue Router**, built with **Vite**. `.vue` files are ordered `<script setup>`, `<template>`, `<style scoped>`.
- **Bootstrap 5** for layout and responsive design.
- **Firebase Authentication:** everyone gets a user id (uid). Guests are signed in anonymously, and accounts use email/password or Google.
- **Cloud Firestore** for real-time data (`onSnapshot` listeners), protected by **security rules** (`firestore.rules`).
- **Firebase Storage** for saved strips, template files and stickers, protected by `storage.rules`.
- **Vercel** hosting (https is needed for phone cameras) plus **serverless functions** in `api/`: Agora tokens and admin actions.
- **Firebase Admin SDK** (`firebase-admin`) on the server, to check who is calling our API and to ban accounts.
  - `package.json` has `"overrides": { "jwks-rsa": { "jose": "^5.10.0" } }`. **Don't remove it.** `firebase-admin` uses `jwks-rsa`, which loads `jose` with `require()`, but `jose` 6 only works with `import`, and Vercel's server can't `require()` it (the API crashes with `ERR_REQUIRE_ESM`). `jose` 5 works with both. See "Use of AI" below.
- **Agora Web SDK** (`agora-rtc-sdk-ng`) for the video call, and `agora-token` to make tokens on the server.
- **MediaDevices API** (`getUserMedia`) for the camera, and the **Canvas API** to capture photos and export strips.
- **goqr.me** API for the join QR code. **axios** to call our API.
- **Tests:** `@firebase/rules-unit-testing` with the Firebase emulators and `node --test` (`npm run test:rules`).

## Project structure

```
index.html                 page shell, loads src/main.js
src/main.js                signs in (startAuth), then creates the Vue app with Bootstrap and the router
src/App.vue                navbar (Marketplace, My Studio, Admin, log in/out) + <router-view>
src/router.js              URL -> page (see the routes list in the file); pages for accounts / admins only
src/firebase.js            Firebase config (read from .env), exports db, auth and storage
src/guest.js               guest name saved in localStorage, device type (Phone/Tablet/Computer)
src/room.js                6-person room limit, "is this member still here?" check
src/stripData.js           photostrip layouts, frame styles, sticker tray, filters (Pick + Decorate pages)
src/studio.js              My Studio: save / list / publish / delete templates, stickers, strips; CATEGORIES
src/marketplace.js         marketplace: browse / save / unsave / report
src/admin.js               moderator actions for the admin page (calls /api/admin for accounts)

src/composables/useAuth.js       SHARED login state: user, isAccount, isAdmin, sign up, log in, Google, log out
src/composables/useRoom.js       SHARED room state: room document, members (+ heartbeat), photos
src/composables/useVideoCall.js  SHARED video call (Agora): camera, mic, others' video/audio, switch camera
src/composables/useAdminTab.js   shared loading / busy / message logic for the admin tabs

src/views/HomeView.vue           landing page: create room / join room by code
src/views/LoginView.vue          log in / sign up (email + password, or Google), forgot password
src/views/StudioView.vue         My Studio (/studio, accounts only): strips, templates, stickers, saved items
src/views/MarketplaceView.vue    marketplace (/marketplace, anyone): browse by type, category, newest / most saved
src/views/MarketplaceItemView.vue  one item (/marketplace/templates/{id}): save to My Studio, report
src/views/AdminView.vue          admin page (/admin, admins only); each tab is in src/components/admin/
src/views/TestUploadView.vue     TEMPORARY (/test-upload): makes test templates/stickers. Remove before submission
src/views/RoomLayout.vue         parent page of a room: joins the room + call once, moves everyone with the room's stage
src/views/RoomView.vue           (child, /room/1234) camera, shutter, countdown, join card, call card, gallery
src/views/StripView.vue          (child, /room/1234/strip) "Pick": choose the cut and frame, drag photos into slots
src/views/DecorateView.vue       (child, /room/1234/decorate) filters, stickers, Download JPG, Save to My Studio

src/components/VideoCallCard.vue    the call card: everyone's tiles + Mute/Unmute, Leave, Close room
src/components/VideoTile.vue        one person: live video, name, device type, mute icon
src/components/StreamVideo.vue      a <video> showing my camera
src/components/RoomGallery.vue      the shared gallery (grouped by shot) + Make photostrip button
src/components/StageBar.vue         the step bar on the strip pages (Lobby ... Export) and who is in the room
src/components/PhotoStrip.vue       the shared strip: slots, photos, filters, stickers (drag and drop)
src/components/StorageImage.vue     an <img> of a Firebase Storage file (only loads if the rules allow it)
src/components/MarketplaceCard.vue  one template/sticker in a grid (links to its page)
src/components/ItemDetailsForm.vue  rename a template/sticker and pick its categories
src/components/admin/*.vue          admin tabs: Overview, Reports, Items, Accounts, Rooms, Log

api/token.js               GET /api/token?code=1234 -> Agora token (room members only)
api/admin.js               POST /api/admin (admins only): list, look up, ban, unban accounts; delete rooms
api/_lib/firebaseAdmin.js  server-only Firebase Admin setup + getCaller(req). "_" = not a web address

firestore.rules            Firestore security rules (who can read/write what)
storage.rules              Firebase Storage rules (template files, stickers, strips)
firestore.indexes.json     indexes the marketplace queries need (deployed with the rules)
storage.cors.json          lets the website fetch Storage files / draw them on a canvas (applied with npm run set-cors)
firebase.json, .firebaserc Firebase CLI settings (project, rules files, emulator ports)
tests/                     rules tests (Firestore, Storage) + admin API tests, run with npm run test:rules
.github/workflows/         GitHub runs the tests automatically on pull requests (rules-tests.yml)
scripts/set-admin.mjs      give / remove the admin mark (npm run set-admin -- email)
scripts/set-cors.mjs       apply storage.cors.json to the Storage bucket (npm run set-cors)
docs/team/                 a guide for each teammate on using accounts, My Studio, marketplace and rooms
docs/phase-7-lockdown-prompt.md  instructions for the security lockdown before submission
vercel.json                sends page URLs (/login, /room/...) to index.html: add new page routes here too
.env.example               the environment variables needed (copy to .env)
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
   - **Stays connected between pages:** the call is started by `RoomLayout.vue`, the parent of all the room pages, so switching pages does not drop the call.
   - **Adding it to another page:** make the page a child route of `/room/:code` in `router.js`, and put `<VideoCallCard />` on it.
5. **Synchronised countdown (anyone can press the shutter):** pressing the round shutter button adds 1 to `shotNumber` using a Firestore **transaction**: it only adds 1 if `shotNumber` is still the number this device saw. If two people press at the same moment, the second transaction sees the number has already changed and does nothing, so only one countdown starts. Every device watches `shotNumber` and starts its own 3-2-1 when it goes up.
6. **Capture:** the current video frame is drawn on a canvas, turned into a small JPEG (data URL), and saved to `photos` with the shot number. A white flash fades in shortly before the photo and fades out shortly after it. Devices hear about the shutter at slightly different times, so this makes sure every screen is still lit up when every device takes its photo. The timing, fade length and brightness are the `FLASH_*` settings at the top of `RoomView.vue`.
7. **Shared gallery:** every device listens to `photos`, so new photos appear on everyone's screen. Photos are grouped by shot number.
8. **Switch camera:** after permission is given, we list all cameras with `enumerateDevices()`. If there is more than one, a button cycles through them. Switching swaps the new camera into the track already being sent (`replaceTrack`), so others never see us leave and rejoin. When a phone rotates, the browser rotates the camera picture by itself; tiles use `fit: 'contain'` so portrait and landscape both show fully.
9. **Pages move together (`stage`):** buttons such as "Make photostrip", "Next" and "Back to camera" set the room's `stage` (`'camera'`, `'strip'`, `'decorate'`, ...). `RoomLayout.vue` watches it and sends everyone to the matching page (`STAGE_PATHS`). To add a room page, add a child route in `router.js`, a line in `STAGE_PATHS`, and the URL in `vercel.json`.
10. **Collaborative photostrip:** everything about the strip is saved in the room document, so everyone sees the same strip:
    - **Pick** (`StripView.vue`): the cut (`stripLayoutId`), the frame style (`stripStyleId`), and which photo is in which slot (`stripSlots`). Drag a photo into a slot, or on a phone tap a photo and then a slot. Each slot is saved on its own (`updateDoc(room, { 'stripSlots.2': photoId })`), so two people changing different slots at once don't overwrite each other.
    - **Decorate** (`DecorateView.vue`): a filter and adjustments for each photo (`stripEdits`), and stickers that can be dragged, resized, rotated and layered (`stripStickers`).
    - **Download JPG** draws the strip on a canvas (photos cropped like CSS `object-fit: cover`, with their filters and the stickers). Accounts can also **Save to My Studio**.
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
- **Admins** have the custom claim `admin: true` in their login token (only `scripts/set-admin.mjs` can set it). They can see private and hidden items, hide/unhide items, close reports, list profiles and rooms, close any room and delete room photos. **Admin log** (`adminLog`): only admins can read it or add to it, as themselves, and nobody can change or delete an entry.
- **Storage** (`storage.rules`): files are in a folder named after the owner's uid (`templates/{uid}/...`, `stickers/{uid}/...`, `strips/{uid}/...`). Only the owner (an account) can upload there, only images (or the template's `project.json`) under 2-5 MB. Public files can be downloaded while their Firestore document is public and not hidden.
- **DEV mode (while we are still building, look for `DEV` in the rules files):** so teammates are not blocked, members of an open room can change any room field except its core (`hostId`, `hostName`, `createdAt`, `shotNumber`, `shotStartedBy`, `closed`). New lists inside a room are open to its members. Any **new** top-level collection, and any **new** Storage folder (files under 50 MB, no HTML/SVG/JS/XML), are open to anyone signed in. Users, templates, stickers, strips, reports, members and photos stay strict. **Before submission**, replace the DEV blocks with real rules for each feature, plus tests.

GitHub runs the tests on every pull request (Actions tab). To run them yourself (optional, needs Java): `npm run test:rules`. It starts local copies of Auth, Firestore and Storage, so it never touches the real data. Deploy the rules and indexes with `firebase deploy --only firestore,storage`.

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
- **Overview:** how many accounts (and banned), rooms (and open), templates, stickers, saved strips and open reports there are, plus the latest moderator actions. Each card opens its tab.
- **Reports:** reported items, grouped by item, with each reason; filter open / resolved / dismissed / all. "Hide item" takes it out of the marketplace and closes its reports as resolved. "Dismiss" closes the reports. "Owner's account..." opens the account tab.
- **Items:** every template and sticker (public, private and hidden), with search and filters; hide or unhide.
- **Accounts:** every login, accounts and guests (from Firebase Auth through `/api/admin`), with search and filters (accounts, guests, banned, admins). Pick one to see what they made and reported, then ban or unban it (a reason is required).
- **Rooms:** the newest 200 rooms, open and closed, with who is in each one (green = here now, grey = left). Filter by open/closed, people and stage; sort by any column. Open one to see its photos, delete a photo, close the room, or delete it with everything inside (through `/api/admin`; an open room is closed first so everyone is sent home). Older rooms can be opened by code.
- **Log:** everything moderators did, filterable by action.

**What a ban does** (`api/admin.js`, which uses the Admin SDK because only the server can switch off a login):
1. Turns off the account's login (`disabled`) and logs it out on every device (`revokeRefreshTokens`).
2. Sets `users/{uid}.banned = true`, which the rules check, so even a login token that hasn't expired yet can't create or change anything.
3. Hides all their templates and stickers.
4. Writes the ban to `adminLog`.

Admins can't ban themselves, other admins (remove the mark first), or guests (they have no account). Unbanning turns the login back on; their items stay hidden until an admin unhides them.

## Known limitations

- Members who close the tab without pressing "Leave room" disappear from the list only after about 45 seconds (heartbeat timeout).
- The 6-person limit is checked when joining, not enforced by the security rules (rules cannot count documents): two people joining at the exact same moment could both get in.
- Countdown sync depends on network speed (usually within half a second).
- Room photos are stored as small JPEG text in Firestore (each document max 1 MB), not in Firebase Storage, so they are small and lower quality. Only strips saved to My Studio go to Storage.
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
