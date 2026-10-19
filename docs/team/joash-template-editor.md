# For Joash: connecting the Template Editor to accounts, My Studio and the marketplace

Written by Gabriel (accounts, My Studio, marketplace, security rules). Your branch is `template-editor-joash`.

**In short:** right now the editor saves frames in the browser (IndexedDB, `saveFrameToDB`) and downloads a PNG. After this, a logged-in user can also save a frame **to their account** with one function call. It then shows up in **My Studio**, where they can make it public so it appears in the **marketplace**. Gabriel's code does the uploading, the database and the security. You call `saveTemplate(...)` and `loadTemplateProject(...)`.

---

## 1. What a template is in the database

You don't write any of this yourself (`saveTemplate` does), but it helps to know what's stored.

```
Firestore  templates/{id}
  ownerId        uid of the account that made it
  ownerName      their profile name (filled in automatically)
  name           1 to 40 characters                     <- from you
  slotCount      whole number 1 to 12                    <- from you
  categories     1 to 3 ids from CATEGORIES              <- from you (see section 4)
  visibility     'private' (new) or 'public'             (the user changes it in My Studio)
  status         'active' or 'hidden'                    (only admins can hide)
  saveCount      how many people saved it from the marketplace (only changes through saving)
  thumbnailPath  'templates/{uid}/{id}/thumbnail.png'
  dataPath       'templates/{uid}/{id}/project.json'
  createdAt, updatedAt   milliseconds (Date.now())

Storage
  templates/{uid}/{id}/thumbnail.png   the picture: under 2 MB, PNG/JPEG/WebP/GIF
  templates/{uid}/{id}/project.json    your projectData as JSON: under 5 MB
```

- New templates are always **private**. Only the owner sees them until they switch on "Public" in My Studio, which needs a confirmed email.
- My Studio already shows the user's templates (thumbnail, name, slot count, categories, saves). It also handles Public/Private, Edit (name and categories) and Delete. You don't need to build any of that.

## 2. Saving a frame to the account

```js
import { saveTemplate } from '../studio.js'
import { useAuth } from '../composables/useAuth.js'

const { isAccount } = useAuth()

// thumbnail: a PNG Blob. projectData: any plain object (your editor's project). categories: see section 4.
const id = await saveTemplate({ name, slotCount, categories, thumbnail, projectData })        // NEW template: returns its id
await saveTemplate({ id, name, slotCount, categories, thumbnail, projectData })                // UPDATE the same template
```

- **Guests can't save to an account.** `saveTemplate` throws `Error('Log in to save to My Studio')`. Check `isAccount.value` first, and for guests show a "Log in to save" link (see the basics below).
- **Keep the id it returns.** Save it next to the frame, for example as `cloudId` in your IndexedDB record or in a ref. Pass it back the next time the same frame is saved, or you'll create a duplicate.
- **Only the owner can update.** If the user opened someone else's template (from the marketplace), save **without** `id` so it becomes their own new template. See section 5.
- It throws if `categories` isn't 1 to 3 valid ids, so it never sends something the rules would reject.

### Turning what you already have into the right types

`captureEditablePng(stripEl, projectData)` already returns `{ blob, thumbnail }`. `thumbnail` is a PNG **data URL**, and `blob` is the PNG with the project embedded in it. Use either. A data URL becomes a Blob like this:

```js
const thumbnailBlob = await (await fetch(thumbnail)).blob() // data URL -> Blob (type image/png)
```

**Size limits:**
- The picture must be **under 2 MB**. With `pixelRatio: 2` a tall strip can get close. If an upload fails, shrink it first:

```js
// Make a PNG Blob no taller/wider than maxSide pixels
async function shrinkPng(blob, maxSide = 1400) {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
```

- `projectData` must be **under 5 MB** as JSON. If `canvasElements` holds uploaded images as data URLs, a few big photos can go over. Keep images inside the frame small.

### A Save button, all together

```js
async function saveToMyStudio() {
  if (!isAccount.value) return // the button shows "Log in to save" for guests instead
  const { thumbnail } = await captureEditablePng(stripRef.value, projectData)
  const thumbnailBlob = await shrinkPng(await (await fetch(thumbnail)).blob())
  cloudId.value = await saveTemplate({
    id: cloudId.value || undefined, // undefined the first time = new template
    name: templateName.value.trim().slice(0, 40) || 'Untitled frame',
    slotCount: slotCount.value,
    categories: chosenCategories.value, // e.g. ['birthday', 'cute']
    thumbnail: thumbnailBlob,
    projectData: projectData,
  })
  notify('Saved to My Studio')
}
```

You can keep IndexedDB as the "drafts on this device" feature for guests, or drop it. That's your choice.

## 3. Opening a saved template in the editor

```js
import { loadTemplateProject } from '../studio.js'
import { getItem } from '../marketplace.js'

const template = await getItem('templates', templateId) // null if it doesn't exist or this user may not see it
if (template) {
  const projectData = await loadTemplateProject(template) // your projectData object, exactly as saved
  applySnapshot(projectData)
}
```

**One thing still to agree with Gabriel:**
- `loadTemplateProject` downloads the file with `fetch`. That works now: the Storage CORS setting is done.
- Linking to the editor: My Studio's "+ New frame" button links to `/template-editor`, and it switches on automatically once your route exists. For "Open in editor", the suggestion is the URL `/template-editor?template={id}`: you read `route.query.template` and Gabriel adds the link in My Studio. Agree the name with Gabriel.

## 4. Categories

Every template needs **1 to 3** categories, so people can filter the marketplace. The list is fixed, and the rules reject anything else:

```js
import { CATEGORIES, MAX_CATEGORIES, categoryLabel } from '../studio.js'
// CATEGORIES = [{ id: 'birthday', label: 'Birthday' }, { id: 'friends', label: 'Friends' }, { id: 'love', label: 'Love' },
//               { id: 'graduation', label: 'Graduation' }, { id: 'holiday', label: 'Holiday' }, { id: 'cute', label: 'Cute' },
//               { id: 'minimal', label: 'Minimal' }, { id: 'other', label: 'Other' }]
// MAX_CATEGORIES = 3
```

Show them as toggle buttons in your save dialog. `src/components/ItemDetailsForm.vue` has a working example of picking up to 3. If the user doesn't pick any, use `['other']`. Want a new category? Ask Gabriel: it has to be added to both `CATEGORIES` and the rules (`isCategories` in `firestore.rules`).

## 5. Templates from the marketplace

Users can save other people's public templates (bookmarks: "Saved from the marketplace" in My Studio). If they open one in your editor:
- They can **read** it (`getItem` + `loadTemplateProject`), because it's public.
- They **can't overwrite** it, because it isn't theirs. Check `template.ownerId === getUid()`. If it isn't, save **without `id`**, which makes a copy that belongs to them. Show "Save a copy" instead of "Save".

## 6. Germaine needs where the photo slots are

Germaine's Pick page puts the room's photos into a frame's slots. Germaine's layouts look like this (`src/stripData.js` on `germaine/drag-and-drop`):

```js
{ id: 'retro-4-cut', name: 'Retro 4-cut', aspect: 3 / 10,   // strip width / height
  slots: [ { x: 6, y: 3, w: 88, h: 20 }, ... ] }           // each slot in PERCENT of the strip (0-100)
```

Your editor places slots with CSS classes (`layout-1x4`, `.cutout-slot`), so the saved `projectData` doesn't say **where** each slot is. Please add the slot positions to `projectData` when saving. That's all Germaine needs:

```js
// Where each photo slot is, in percent of the strip, so other pages can place photos without the editor
function measureSlots(stripEl) {
  const box = stripEl.getBoundingClientRect()
  return Array.from(stripEl.querySelectorAll('.cutout-slot')).map((el) => {
    const r = el.getBoundingClientRect()
    return {
      x: ((r.left - box.left) / box.width) * 100,
      y: ((r.top - box.top) / box.height) * 100,
      w: (r.width / box.width) * 100,
      h: (r.height / box.height) * 100,
    }
  })
}

projectData.slotRects = measureSlots(stripRef.value)
projectData.aspect = stripRef.value.offsetWidth / stripRef.value.offsetHeight
```

Measure while the cut-outs are **visible**. Hidden elements can measure as 0×0 if they use `display: none`.

Also agree with Germaine which picture goes **over** the photos: it needs **transparent holes** where the slots are. If the thumbnail you upload is that overlay, Germaine can use it directly. Your export engine has a `photobooth_overlay` type that may already be it.

## 7. Merging your branch

- **`src/App.vue`:** you hide the navbar on `/template-editor`, and Gabriel's version adds account buttons and hides the navbar in rooms. Keep Gabriel's file and add your condition to it:

```js
const isEditor = computed(() => route.path === '/template-editor')
```

Then wrap the page so the editor gets the full screen, as you had it: `<template v-if="isEditor"><router-view /></template>`, with Gabriel's whole navbar, alerts and `<main>` in the `v-else`.
- **`src/router.js` and `vercel.json`:** keep both sides' lines (yours adds `/template-editor`).
- **`package.json`:** your branch adds `pnpm-lock.yaml` and `pnpm-workspace.yaml`, but the project uses **npm** (`package-lock.json`). Please install your packages with `npm install <package>` so there's only one lock file.

## 8. Checklist

- [ ] The Save button calls `saveTemplate` for accounts, and guests see "Log in to save".
- [ ] The returned id is kept and passed back on later saves.
- [ ] The thumbnail is a PNG Blob under 2 MB, and projectData is under 5 MB.
- [ ] A category picker (1 to 3 from `CATEGORIES`).
- [ ] `slotRects` and `aspect` are added to projectData (for Germaine).
- [ ] You've agreed the "Open in editor" link with Gabriel.
- [ ] `/template-editor?template={id}` opens a saved template, and it's saved as a copy if it's not the user's own.

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
