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

src/composables/useAuth.js        SHARED login state: who is signed in (guests are signed in anonymously)
src/composables/useRoom.js        SHARED room state: room document, members (+ heartbeat), photos
src/composables/useVideoCall.js   SHARED video call (Agora): camera, mic, others' video/audio, switch camera

src/components/VideoCallCard.vue  the call card: everyone's tiles + Mute/Unmute, Leave, Close room
src/components/VideoTile.vue      one person: live video, name, device type, mute icon (all tiles the same size)
src/components/RoomGallery.vue    the shared gallery (grouped by shot) + Make photostrip button
src/components/StreamVideo.vue    a <video> showing a camera stream (my camera)

src/views/HomeView.vue    create room / join room by code
src/views/RoomLayout.vue  parent page for a room: joins the room + call once, shows a child page
src/views/RoomView.vue    (child) camera, shutter, countdown, join card, call card, gallery
src/views/StripView.vue   (child) call card, collaborative photostrip, export as JPG

api/token.js             Vercel serverless function: GET /api/token?code=1234 -> Agora token (members only)
api/_lib/firebaseAdmin.js  server-only Firebase Admin setup + getCaller(req) (who is calling). "_" = not a web address
firestore.rules          Firestore security rules: who can read/write what (deploy with the Firebase CLI)
storage.rules            Firebase Storage rules (everything locked until a feature needs Storage)
firebase.json, .firebaserc  Firebase CLI settings (which project, which rules files)
tests/firestore.rules.test.js  tests for firestore.rules (npm run test:rules)
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

1. **Create:** the host picks a random code from `0000` to `9999` that is not in use and creates `rooms/{code}`.
2. **Join:** the Join button only turns on (and becomes the main button) once 4 digits are typed. `RoomLayout.vue` checks the room exists, is not closed and is not full, then joins it **once** for all the room's pages:
   - **Members:** each person has a document in `members`. Every device listens with `onSnapshot`, so the list updates live.
   - **Heartbeat:** every 15 seconds each device updates its `lastSeen` time. A member not seen for 45 seconds (closed the tab) is no longer shown or counted.
   - **Room limit:** at most 6 people at once (1 host + 5 guests). Before joining, we count the active members (`isRoomFull` in `room.js`). Someone already in the room (e.g. refreshing) is always let back in.
3. **Shared state (composables):** `useRoom.js` and `useVideoCall.js` create their `ref()`s once, outside the function, so every page and component that calls them shares the same room and the same call.
4. **Video call:** each device asks our server for a token (`GET /api/token?channel=blue-studios-{code}&uid={uid}`), joins that Agora channel and sends ("publishes") its camera. When Agora says someone published video or audio (`user-published` event), we subscribe; `VideoTile.vue` plays their video, and audio just plays.
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
- **Any other collection is blocked.** If you add a new collection (e.g. templates), add rules for it in `firestore.rules` and tests in `tests/firestore.rules.test.js`, or every read/write will fail with "Missing or insufficient permissions".

Run the tests with `npm run test:rules` (needs Java). It starts a local copy of Firestore, so it never touches the real data. Deploy the rules with `firebase deploy --only firestore:rules,storage`.

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

-


