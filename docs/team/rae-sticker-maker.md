# For Rae: connecting the Sticker Maker to accounts, My Studio, the marketplace and the room

Written by Gabriel (accounts, My Studio, marketplace, security rules).

**In short:** when a logged-in user finishes a sticker, call `saveSticker(...)`. It's uploaded to their account and shows up in **My Studio**, where they can make it public so it appears in the **marketplace**. To show a user's stickers in the room's sticker tray (Germaine's Decorate page), use `listMyItems('stickers')` and `listMySaved()`. **Keys for remove.bg, Gemini and OpenWeatherMap must go through a server function** (section 5), not `VITE_` variables.

---

## 1. What a sticker is in the database

`saveSticker` writes all of this for you:

```
Firestore  stickers/{id}
  ownerId        uid of the account that made it
  ownerName      their profile name (filled in automatically)
  name           1 to 40 characters                          <- from you
  kind           'static', 'animated' or 'dynamic'           <- from you
  categories     1 to 3 ids from CATEGORIES                   <- from you (see section 3)
  visibility     'private' (new) or 'public'                  (the user changes it in My Studio)
  status         'active' or 'hidden'                         (only admins can hide)
  saveCount      how many people saved it from the marketplace
  imagePath      'stickers/{uid}/{id}/image'
  createdAt, updatedAt   milliseconds

Storage  stickers/{uid}/{id}/image    under 2 MB, PNG, JPEG, WebP or GIF
```

New stickers are always **private**. My Studio already lists them with Public/Private, Edit (name and categories) and Delete.

## 2. Saving a sticker

```js
import { saveSticker } from '../studio.js'
import { useAuth } from '../composables/useAuth.js'

const { isAccount } = useAuth()

const id = await saveSticker({
  name: 'main character energy',  // 1 to 40 characters
  kind: 'static',                 // 'static' | 'animated' | 'dynamic'
  categories: ['cute', 'friends'],// 1 to 3, see section 3
  image: blob,                    // a Blob or File: PNG, JPEG, WebP or GIF, under 2 MB
})
```

- **Guests can't save.** It throws `Error('Log in to save to My Studio')`. Check `isAccount.value` first, and show guests a "Log in to save" link (see the basics below).
- **The image type comes from `blob.type`.** The rules only accept `image/png`, `image/jpeg`, `image/webp` and `image/gif`.
  - **SVG is not allowed:** an SVG can contain scripts, so it's blocked on purpose. Turn an SVG or any drawing into a PNG with a canvas first:

```js
// Draw anything (an <img>, an SVG data URL, a canvas) into a PNG Blob, at most maxSide pixels wide/tall
async function toPngBlob(source, maxSide = 600) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = source // a URL or data URL
  })
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
```

  - **Animated stickers:** upload the GIF Blob as it is (`image/gif`). A canvas would flatten it to one frame.
- **Under 2 MB.** remove.bg cut-outs at full size can be bigger, so shrink them with `toPngBlob(url, 800)`.
- **There's no "update" yet:** each `saveSticker` call makes a new sticker. Renaming and changing categories are in My Studio. If you need to replace a sticker's image, ask Gabriel.

### Stickers from GIPHY

A GIPHY result is someone else's GIF on GIPHY's servers. Using it in the room tray straight from its URL is fine. If a user wants to **keep** one in My Studio, download it and save it as `kind: 'animated'`. Be careful about publishing GIPHY content to our marketplace: it's not the user's own work (copyright). It's best to stop GIPHY stickers from being made public, or to say where they came from.

## 3. Categories

Every sticker needs **1 to 3** categories from a fixed list:

```js
import { CATEGORIES, MAX_CATEGORIES } from '../studio.js'
// [{ id: 'birthday', label: 'Birthday' }, { id: 'friends', ... }, 'love', 'graduation', 'holiday', 'cute', 'minimal', 'other']
```

Show them as toggle buttons. `src/components/ItemDetailsForm.vue` has a working picker for up to 3. If none are picked, use `['other']`.

## 4. Showing the user's stickers in the room's sticker tray

Germaine's Decorate page (branch `germaine/drag-and-drop`, file `src/stripData.js`) has a placeholder `STICKERS` list with tabs `'mine'`, `'giphy'` and `'dynamic'`. Each item only needs `{ id, tab, name, src }`, where `src` is an image URL. This turns a user's real stickers into that shape:

```js
import { listMyItems, getFileUrl } from '../studio.js'
import { listMySaved } from '../marketplace.js'
import { useAuth } from '../composables/useAuth.js'

// My own stickers + the ones I saved from the marketplace, as tray items { id, tab, name, src }
export async function loadMyStickerTray() {
  const { isAccount } = useAuth()
  if (!isAccount.value) return [] // guests have no saved stickers

  const mine = await listMyItems('stickers')                 // [{ id, name, kind, imagePath, ... }]
  const saved = (await listMySaved())
    .filter((s) => s.type === 'stickers' && s.item !== null)   // skip ones that are no longer available
    .map((s) => s.item)

  return await Promise.all(mine.concat(saved).map(async (sticker) => ({
    id: sticker.id,
    tab: sticker.kind === 'dynamic' ? 'dynamic' : 'mine',
    name: sticker.name,
    src: await getFileUrl(sticker.imagePath),
  })))
}
```

Agree with Germaine who adds this to the Decorate page and where the file lives (for example `src/stickerTray.js`).

**Good to know:**
- The sticker's `src` is saved into the room document, so everyone in the room sees it. A `getFileUrl` URL works for anyone who has it, so a private sticker placed in a room can be seen by that room. That's expected.
- To draw stickers into the downloaded strip, load them with `crossOrigin = 'anonymous'`. The Storage CORS setting is already done.

## 5. remove.bg, Gemini, OpenWeatherMap: keep the keys on the server

These keys cost money or have a small free quota, and a `VITE_` key can be copied by anyone from the browser. Put each call in an `api/` function that checks who is calling.

**Example: `api/remove-bg.js`**

```js
// Vercel serverless function: POST /api/remove-bg   body { image: '<base64 of a PNG or JPEG, without the data: prefix>' }
// Header: Authorization: Bearer <Firebase ID token>
// Returns the cut-out as a PNG. The remove.bg key stays on the server.
import { getCaller } from './_lib/firebaseAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Only accounts (not guests) can use our remove.bg credits
  const caller = await getCaller(req)
  if (caller === null || caller.firebase.sign_in_provider === 'anonymous') {
    return res.status(401).json({ error: 'Log in to remove backgrounds' })
  }

  const apiKey = process.env.REMOVE_BG_API_KEY
  if (!apiKey) {
    console.error('REMOVE_BG_API_KEY is not set')
    return res.status(500).json({ error: 'Background removal is not available' })
  }

  // Check the input: base64 text only, and not too big (Vercel allows about 4.5 MB per request)
  const image = String((req.body && req.body.image) || '')
  if (image.length === 0 || image.length > 4000000 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return res.status(400).json({ error: 'Invalid image' })
  }

  const form = new FormData()
  form.append('image_file_b64', image)
  form.append('size', 'auto')
  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form,
  })
  if (!response.ok) {
    console.error('remove.bg error', response.status, await response.text()) // details in the Vercel logs only
    return res.status(502).json({ error: 'Could not remove the background' })
  }

  res.setHeader('Content-Type', 'image/png')
  res.send(Buffer.from(await response.arrayBuffer()))
}
```

**Calling it from the browser:**

```js
import axios from 'axios'
import { auth } from '../firebase.js'

async function removeBackground(file) {
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(file)
  })
  const idToken = await auth.currentUser.getIdToken() // proves who is asking
  const response = await axios.post('/api/remove-bg', { image: dataUrl.split(',')[1] }, {
    headers: { Authorization: 'Bearer ' + idToken },
    responseType: 'blob',
  })
  return response.data // a PNG Blob, ready for saveSticker({ ..., image })
}
```

- Use the same pattern for **Gemini** (`api/caption.js`: send the prompt and return the text) and **OpenWeatherMap** (`api/weather.js?city=Singapore`).
  - **Weather:** guests may use it too, so you can skip the account check, but **check the city** (letters and spaces, under 60 characters).
  - **Caching:** save results for about 10 minutes (`res.setHeader('Cache-Control', 's-maxage=600')`) so the free quota lasts.
- **Gemini:** limit the prompt length (for example 200 characters), and never pass the user's text to the model as instructions for anything except the caption.
- Add each key to `.env` with **no** `VITE_` prefix (for example `REMOVE_BG_API_KEY=...`) and list it in `.env.example` with an empty value. Ask Gabriel to add it to Vercel.
- Run `vercel dev` locally (not `npm run dev`) so the `api/` routes exist.
- **GIPHY** keys are meant to be used in the browser, so `VITE_GIPHY_API_KEY` is fine. Set the rating filter (`rating=g` or `pg`) so unsuitable GIFs don't show up.

## 6. "Dynamic" stickers

`kind: 'dynamic'` is for live stickers (weather, time). Only an **image** is stored, so for a dynamic sticker save a preview image. At the moment there's nowhere to store settings such as which city or which time format. If you need that, send Gabriel the fields (for example `config: { type: 'weather', city: 'Singapore' }`) and Gabriel will add them to the rules.

## 7. Checklist

- [ ] A "Save to My Studio" button calls `saveSticker` for accounts, and guests see "Log in to save".
- [ ] Images are PNG/JPEG/WebP/GIF Blobs under 2 MB (no SVG).
- [ ] A category picker (1 to 3 from `CATEGORIES`).
- [ ] remove.bg, Gemini and OpenWeatherMap go through `api/` functions, with no secret `VITE_` keys.
- [ ] You've agreed with Germaine how `loadMyStickerTray()` feeds the Decorate page's tray.
- [ ] You've told Gabriel if you need a `config` field for dynamic stickers.

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
