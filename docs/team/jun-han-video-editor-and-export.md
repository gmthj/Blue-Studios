# For Jun Han: Video Editor and Export & Share with the room, My Studio and the rules

Written by Gabriel (rooms, accounts, My Studio, marketplace, security rules).

**In short:**
- Photos come from the room (`useRoom().photos`).
- A finished JPEG strip can be saved to the user's **My Studio** with `saveStrip(...)`.
- **Saving videos, GIFs and MP4s into My Studio, and public share links, aren't built yet.** Section 4 lists the decisions Gabriel needs from you. Meanwhile, the open development rules let you store room clips and test files in a new Storage folder.
- **Careful with FFmpeg.wasm:** the multi-threaded version needs special page headers that would break Google sign-in and possibly the video call. Use the single-threaded version (section 5).

---

## 1. What you get from the room

```js
import { useRoom } from '../composables/useRoom.js'

const { code, room, activeMembers, photos, roomRef } = useRoom()
// photos.value  [{ id, ownerId, name, shotNumber, image: 'data:image/jpeg;base64,...', createdAt }]
//               image is a JPEG data URL (under ~900 KB), so it can be drawn on a canvas without CORS problems
// room.value.stripSlots    { '0': photoId, '1': photoId, ... }   which photo is in which slot of the strip
// room.value.stage         which page the room is on ('camera', 'strip', 'decorate', ...)
```

- `photos` updates live: new photos appear by themselves.
- Photos **can't be changed** after they're taken (the rules block edits). Filters and edits are stored separately, in `room.stripEdits`, on Germaine's branch.

**Adding your pages to the room flow:** make them child routes of `/room/:code` in `src/router.js` (for example `video` and `export`). Add them to `STAGE_PATHS` in `RoomLayout.vue` (Germaine's branch already has commented-out `video: '/video'`). Add the URLs to `vercel.json`. The `stage` values `'video'` and `'export'` must also be allowed by the rules. They're on the list Germaine is checking with Gabriel, so confirm the names.

## 2. Saving the finished strip to My Studio (JPEG)

```js
import { saveStrip } from '../studio.js'
import { useAuth } from '../composables/useAuth.js'

const { isAccount } = useAuth()

async function saveToStudio(canvas) {
  const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return await saveStrip({ title: 'Room ' + code.value + ' · ' + date, image: image }) // returns the new strip's id
}
```

- **Accounts only.** It throws `Error('Log in to save to My Studio')` for guests, so check `isAccount.value` and show guests "Log in to save" (see the basics below).
- **The rules today:**
  - `image` must be a **JPEG Blob under 5 MB**.
  - `title` must be 1 to 40 characters.
  - Strips are **always private** to the person who saved them.
- The strip appears under "My photostrips" in My Studio, which has Delete.
- Germaine's Decorate page also has a placeholder "Download JPG" and will get "Save to My Studio". Agree with Germaine which page owns the final download and save, so the user doesn't see two different buttons.

## 3. Downloading files (no server needed)

Downloads to the user's device don't touch Firebase, so no rules apply:

```js
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename // e.g. 'photostrip-4821.mp4'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
```

If your canvas draws images from Firebase Storage (template frames, stickers), see "Files in Firebase Storage" in the basics. Load them with `crossOrigin = 'anonymous'`. The Storage CORS setting is already done.

## 4. What needs Gabriel before it can work (send your answers)

### a) Saving videos, GIFs and MP4s to My Studio

`saveStrip` only accepts JPEG today. To save other formats, the rules need to know:
- **Formats:** for example `image/gif` and `video/mp4`. `video/webm` is what `MediaRecorder` makes in Chrome.
- **Biggest file size:** for example 25 MB. Storage costs money, and the free amount is 5 GB for the whole project.
- **How long a video can be:** this is only checked in the browser. The rules can only check the size.

The suggested shape is the same `strips/{id}` document with a `format: 'jpg' | 'gif' | 'mp4' | 'webm'` field, with the file at `strips/{uid}/{id}.{format}`. Gabriel adds the rules and a `saveStrip({ title, image, format })` option.

### b) Recording clips in the room (if the Video step records everyone)

If clips from several people need to be shared in the room, they **can't** go in Firestore: a Firestore document can hold at most 1 MB, which is too small for video. They go in Storage. **During development you can already do this** in any new folder, for example `clips/{code}/{uid}/{clipId}.webm` (any signed-in user, under 50 MB per file). Put the list of clips in `rooms/{code}/clips/{clipId}`, which is open to room members:

```js
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, setDoc } from 'firebase/firestore'
import { storage, db } from '../firebase.js'
import { getUid } from '../composables/useAuth.js'

async function uploadClip(code, clipBlob) {
  const clipId = Date.now().toString()
  const path = 'clips/' + code + '/' + getUid() + '/' + clipId + '.webm'
  await uploadBytes(storageRef(storage, path), clipBlob, { contentType: 'video/webm' })
  await setDoc(doc(db, 'rooms', code, 'clips', clipId), { ownerId: getUid(), path: path, createdAt: Date.now() })
  return await getDownloadURL(storageRef(storage, path))
}
```

For the real rules at lockdown, tell Gabriel:
- whether clips are shared or stay on each device
- the size limit
- whether they're deleted when the room closes

### c) The share page from the Figma (page 14, "bluestudios.app/s/x7Kq2")

Right now **nobody else can open a user's strip**: strips are private. A public share link needs a new collection, for example:

```
shares/{shareId}   { ownerId, stripId, imagePath, createdAt, expiresAt? }
                   readable by ANYONE who has the link (the id is long and random, so it can't be guessed)
```

Plus a page `/s/:shareId`. Decide with Gabriel:
- Should links expire?
- Can the owner turn a link off?
- Should the share page also show the video?

## 5. FFmpeg.wasm: use the single-threaded build

The multi-threaded `@ffmpeg/core-mt` needs `SharedArrayBuffer`, and that only works if every page is served with these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Please don't add them to `vercel.json`.**
- `Cross-Origin-Opener-Policy: same-origin` **breaks Google sign-in**, because the login popup can no longer talk to our page.
- `require-corp` blocks images and scripts from other sites that don't opt in, which can include video-call and Storage files.
- The app is a single-page app, so the headers can't easily be limited to one page.

Use the **single-threaded** core instead. It's slower, but needs no special headers:

```js
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

const ffmpeg = new FFmpeg()
const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm' // single-threaded build (pin the exact version)
await ffmpeg.load({
  coreURL: await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
  wasmURL: await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm'),
})
```

- **Only load FFmpeg when the user presses Export**, not when the page opens. The `.wasm` file is about 30 MB.
- Keep exports short (a few seconds) so phones don't run out of memory.

## 6. Checklist

- [ ] Your pages are child routes of `/room/:code`, added to `STAGE_PATHS` and `vercel.json`, and the stage names are confirmed with Gabriel.
- [ ] JPEG "Save to My Studio" uses `saveStrip` (accounts only), and you've agreed with Germaine who owns the button.
- [ ] You've sent Gabriel the answers for section 4 (formats and size, clips, share links). Clips can be built now with the open development rules.
- [ ] FFmpeg is the single-threaded build, loaded only on Export, with no COOP/COEP headers.

---

## The basics (the same in every guide)

### Where Gabriel's code is

As of 19 Oct 2026, accounts, My Studio, the marketplace and the security rules are on the **`account-system`** branch, not on `main` yet.

**Please base your work on `account-system` now.** The security rules are live for the whole Firebase project, and every branch shares them. They need the user to be signed in, and branches made from the old `main` never sign in. So on an old branch, rooms and everything else get "Missing or insufficient permissions". You have two options:

```bash
# Option A: a fresh branch from account-system, then bring your work across
git fetch origin
git switch -c my-feature-v2 origin/account-system
git merge my-old-branch          # or copy your files over / cherry-pick your commits

# Option B: merge account-system into the branch you already have
git fetch origin
git switch my-old-branch
git merge origin/account-system  # then fix the conflicts as described below
```

After that, run `npm install`: new packages were added (`firebase-admin`, and `@firebase/rules-unit-testing` for the tests).

Some older code from `main` has **changed or gone**. Your branch may still use the old versions:

| Old (on `main` before the merge) | New (from `account-system`) |
| --- | --- |
| `getGuestId()` in `src/guest.js` | **Removed.** Use `getUid()` from `src/composables/useAuth.js`. |
| A random id saved in `localStorage` | A real Firebase user id (`uid`). Every visitor is signed in, and guests are signed in "anonymously". |
| `GET /api/token?channel=...&uid=...` | `GET /api/token?code=1234` with the header `Authorization: Bearer <Firebase ID token>` |
| `startCall(code, guestId)` | `startCall(code, uid)` |
| No security rules | **Every** Firestore and Storage read or write is checked by rules (see below) |

If Git shows a conflict in `guest.js`, `useVideoCall.js`, `VideoCallCard.vue`, `useRoom.js`, `RoomView.vue`, `HomeView.vue` or `room.js`, keep the **`account-system`** version of the identity code (`getUid`, `uid`), then add your own changes back on top.

### Who is signed in: `useAuth()`

`main.js` waits until Firebase has signed the visitor in before showing any page, so these are always ready:

```js
import { useAuth, getUid } from '../composables/useAuth.js'

const { user, isAccount } = useAuth()
// user.value = { uid, isAnonymous, displayName, email, emailVerified }  (a plain copy, it updates by itself)
// isAccount.value = true for email/Google accounts, false for guests

const uid = getUid() // the current user's id (a string such as 'Xk3v9...'), guests included
```

- **Guests** can join rooms, take photos and browse the marketplace.
- **Accounts** can also save things to My Studio, save marketplace items, and report items.
- To show a "Log in to save" button that brings the user back afterwards:

```vue
<router-link v-if="!isAccount" :to="'/login?redirect=' + encodeURIComponent($route.fullPath)">Log in to save</router-link>
```

### Security rules: why a write can suddenly fail

`firestore.rules` and `storage.rules` are checked by Firebase's servers on **every** read and write. Everything is **blocked unless a rule allows it**, and every field of every write is checked: its name, its type and its size.

**For now (while we're still building) the rules are open for your features**, so you aren't blocked. Look for `DEV` in the rules files.

| You want to... | Allowed now? |
| --- | --- |
| Add or change **any field on a room** (`rooms/{code}`), as a member of the open room | Yes, except `hostId`, `hostName`, `createdAt`, `shotNumber`, `shotStartedBy`, `closed` (the room's core) |
| Use a **new list inside a room**, e.g. `rooms/{code}/clips/{id}` | Yes, for members of that room |
| Use a **new top-level collection**, e.g. `musicMixes/{id}` | Yes, for anyone signed in (guests too) |
| Upload to a **new Storage folder**, e.g. `clips/...` | Yes, for anyone signed in. Under 50 MB per file, and no HTML, SVG, JavaScript or XML files |
| Write `users`, `templates`, `stickers`, `strips`, `reports`, a room's `members` or `photos`, or the Storage folders `templates/`, `stickers/` and `strips/` | **Still strict.** Use the functions in `studio.js`, `marketplace.js` and `useRoom.js` |

- If a write fails with **`Missing or insufficient permissions`** (`error.code === 'permission-denied'`), the rules said no. You're probably writing to one of the strict places in the last row, with a field or type they don't allow.
- **Before submission the open parts get locked down again.** Once your data has settled, send Gabriel its exact shape (field names, types, who may write, limits) and Gabriel will write the real rules and tests. Don't edit the rules yourself. They live in `firestore.rules` and `storage.rules`, and the tests in `tests/` (run them with `npm run test:rules`, which needs Java).
- Changing the code in the browser can't get around the rules. That's the point: the rules are the security, and the UI only shows or hides buttons.

### Files in Firebase Storage

Images (template thumbnails, stickers, saved strips) live in Firebase Storage. Firestore documents only hold their **path**, for example `templates/{uid}/{id}/thumbnail.png`.

```js
import { getFileUrl } from '../studio.js'
const url = await getFileUrl(template.thumbnailPath) // an https URL to use in <img :src="url">
```

Or use the ready-made component, which shows a grey box while the image loads or if it isn't allowed:

```vue
<StorageImage :path="template.thumbnailPath" :alt="template.name" />
<!-- import StorageImage from '../components/StorageImage.vue' -->
```

**Drawing Storage images on a `<canvas>`** (for exporting) needs two things. First, the bucket must allow it (CORS). That's done (`storage.cors.json`, applied with `npm run set-cors`). Second, the image must be loaded with `crossOrigin` **before** setting `src`:

```js
const img = new Image()
img.crossOrigin = 'anonymous' // without this, canvas.toBlob() fails ("tainted canvas")
img.src = url
```

A URL from `getFileUrl` works for **anyone who has it**: it contains a secret token. Only put it somewhere the owner meant to share, for example a room the owner is in.

### Secret API keys never go in the frontend

Anything starting with `VITE_` is copied into the JavaScript that every visitor downloads, so anyone can read it. A key that **costs money or has a small free quota** (remove.bg, Gemini, OpenWeatherMap) must stay on the server:

1. Make a file in `api/`, for example `api/remove-bg.js`. Vercel turns it into `POST /api/remove-bg`. Use `api/token.js` as the example to copy.
2. Read the key from `process.env.SOMETHING_KEY`, with **no** `VITE_` prefix. Add it to `.env` (locally) and to Vercel's Environment Variables (Gabriel can do this).
3. Check who is calling with `getCaller(req)` from `api/_lib/firebaseAdmin.js`, so that only our signed-in users can spend our quota.
4. Locally, run `vercel dev` instead of `npm run dev`, or the `api/` routes won't exist.

### Adding a page

1. Add the route in `src/router.js`. Add `meta: { requiresAccount: true }` if guests should be sent to log in first.
2. Add the same URL to `vercel.json` `rewrites`, or refreshing the page on Vercel gives a 404.
3. A page **inside a room** is a child of `/room/:code` (see `RoomLayout.vue`). If the whole room should move to it together, it also needs a `stage` value. The rules only allow listed stages, so tell Gabriel the new stage name.
