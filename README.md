# Blue Studios Photobooth (IS216 G3 Group 2)

An online photobooth where friends join one room from their own devices and take photos together.

Current status: **Photobooth Rooms MVP** (create/join room, QR code, live member list, live video previews, synchronised countdown, shared gallery).

## Tech stack

- Vue 3 (Options API) + Vue Router, built with Vite
- Bootstrap 5 for layout and responsive design
- Firebase Cloud Firestore for real-time data (`onSnapshot` listeners)
- Vercel for hosting (https is needed for phone cameras) + a Vercel serverless function for Agora tokens
- MediaDevices API (`getUserMedia`) for the camera, Canvas API to capture photos
- goqr.me API to generate the join QR code
- Agora Web SDK (`agora-rtc-sdk-ng`) for live video previews, `agora-token` to create tokens on the server
- axios to call our token API

## Project structure

```
index.html               page shell, loads src/main.js
src/main.js              creates the Vue app, adds Bootstrap and the router
src/App.vue              navbar + <router-view>
src/router.js            URL -> page mapping ( /, /room/:code, /room/:code/strip )
src/firebase.js          Firebase config (read from .env), exports db
src/player.js            guest player id + name saved in localStorage
src/views/HomeView.vue   create room / join room by code
src/views/RoomView.vue   camera, countdown, members, live previews, gallery
src/views/StripView.vue  pick 4 room photos for the strip, export as JPG
api/token.js             Vercel serverless function: GET /api/token -> Agora token
vercel.json              sends page URLs (/room/..., /room/.../strip) to index.html (add new page routes here too)
.env.example             list of environment variables needed (copy to .env)
```

## How the room works

Firestore data:

```
rooms/{code}                 { hostId, hostName, shotNumber, createdAt }
rooms/{code}/members/{id}    { name, joinedAt }
rooms/{code}/photos/{auto}   { playerId, name, shotNumber, image, createdAt }
```

1. **Create:** the host picks a random 4-digit code that is not in use and creates `rooms/{code}`.
2. **Join:** each person adds a document to `members`. Every device listens to `members` with `onSnapshot`, so the list updates live.
3. **Synchronised countdown:** the host clicks "Start countdown", which adds 1 to `shotNumber`. Every device listens to the room document. When it sees `shotNumber` go up, it starts its own 3-2-1 countdown. Because all devices receive the change within a fraction of a second, they all snap at about the same time.
4. **Capture:** the current video frame is drawn on a canvas, turned into a small JPEG (data URL), and saved to `photos` with the shot number.
5. **Shared gallery:** every device listens to `photos`, so new photos appear on everyone's screen. Photos are grouped by shot number.
6. **Live previews:** each device asks our server for a token (`GET /api/token?channel=blue-studios-{code}&uid={playerId}`), then joins that Agora video channel and sends ("publishes") its camera. When Agora says another user published video (`user-published` event), we subscribe and play it in a box with their name. The full-quality photo is still taken from each device's own camera.
7. **Switch camera:** after permission is given, we list all cameras with `enumerateDevices()`. If there is more than one, a button cycles through them and the new camera is re-published to Agora.
8. **Photostrip:** "Make photostrip" opens `/room/{code}/strip`, which loads the room's photos once with `getDocs`. Tap a slot, then tap a photo to put it there (it then jumps to the next empty slot). "Download JPG" draws a white strip on a canvas: each photo is cropped to fill its 4:3 slot (like CSS `object-fit: cover`), then `canvas.toDataURL('image/jpeg')` is downloaded with a temporary `<a download>` link.

### Why a token server?

Agora projects have an **App Certificate** (a secret). To join a channel, the browser needs a **token** made with that certificate. If the certificate were in the frontend code, anyone could read it in the browser. So `api/token.js` runs on Vercel's server, reads the certificate from an environment variable, and only sends the browser a token for one channel + one user that expires after 3 hours.

## Environment variables

All keys live in environment variables, not in the code.

| Variable | Used by | Where to find it |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Frontend (`src/firebase.js`) | Firebase console > gear icon > Project settings > Your apps > Config |
| `AGORA_APP_ID` | Server (`api/token.js`) | Agora console > Projects |
| `AGORA_APP_CERTIFICATE` | Server (`api/token.js`), **secret** | Agora console > Projects > your project > Primary Certificate |

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

Test mode allows anyone to read/write for 30 days. Before it expires, update the date in the **Rules** tab (proper rules to be written later).

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

To test with "two people" on one laptop: open a second Chrome window in **Incognito** (Ctrl+Shift+N) at the same address. Incognito has its own localStorage, so it acts as a different player.

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
4. Check: both names appear in "In this room", each device shows the other in **Live previews**, and **Switch camera** appears on the phone.
5. On the laptop (host), press **Start countdown**. Both devices count 3-2-1 and both photos appear in the gallery under the same shot.

To check the token API on its own, open `https://YOUR-URL.vercel.app/api/token?channel=blue-studios-1234&uid=test` in a browser. You should see `{"appId":"...","token":"007..."}`. If you see an error about `AGORA_APP_ID` or `AGORA_APP_CERTIFICATE`, the environment variables are missing in Vercel (then Redeploy).

---

## Known limitations (MVP)

- Members who close the tab without pressing "Leave room" stay in the list.
- Countdown sync depends on network speed (usually within half a second).
- Photos are stored as small JPEG text in Firestore (each document max 1MB) instead of Firebase Storage, to keep setup simple and free.
- No Firestore security rules yet (test mode).
- `/api/token` gives a token to anyone who asks for a `blue-studios-...` channel. Fine for a prototype; a real app would check the user is logged in first.
- Two normal tabs in the same browser share one player id, so Agora treats them as the same user. Use an Incognito window for the second player.

## Use of AI

Initial scaffold and Rooms MVP code drafted with the help of Claude (AI assistant); reviewed and to be understood/modified by the team. (Update this section in README.txt as required by the course.)


