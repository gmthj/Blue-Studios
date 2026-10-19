# For Germaine: the Pick and Decorate pages with the room, rules, templates, stickers and My Studio

Written by Gabriel (rooms, accounts, My Studio, marketplace, security rules). Your branch is `germaine/drag-and-drop`.

**In short:**
1. The security rules are **open for room fields while we build**, so your new fields (`stripLayoutId`, `stripStyleId`, `stripEdits`, `stripStickers`, the `decorate` stage, more slots) work. Section 2 is what the rules will check **later**, at lockdown. Please check it's right.
2. Real templates (from Joash's editor, My Studio and the marketplace) can replace `LAYOUTS` and `FRAME_STYLES` (section 4).
3. Real stickers (from Rae's sticker maker) can replace the placeholder `STICKERS` (section 5).
4. "Save to My Studio" for the finished strip (section 6).

---

## 1. What you get from the room

```js
import { useRoom } from '../composables/useRoom.js'

const { code, room, activeMembers, photos, roomRef } = useRoom()
// code.value          '4821'
// room.value          the room document (live): { hostId, hostName, shotNumber, stage, stripSlots, closed, ... }
// activeMembers.value [{ id: uid, name, deviceType, ... }] people in the room right now
// photos.value        [{ id, ownerId, name, shotNumber, image: 'data:image/jpeg;base64,...', createdAt }]
// roomRef()           the Firestore reference of rooms/{code}, for updateDoc(roomRef(), {...})
```

`RoomLayout.vue` joins the room and the video call once for all room pages, and it moves everyone to the page that matches `room.stage`. Your `STAGE_PATHS` change to `RoomLayout.vue` is a good idea and fits with Gabriel's version.

**The rules already check:**
- Only **members** of an **open** room can change it.
- Photos can only be added by members, as themselves, for a shot that has happened, as a JPEG under about 900 KB. They can't be edited afterwards.

## 2. What the rules will check later (please check this list)

**Right now (development)** members of an open room can change any room field except the room's core (`hostId`, `hostName`, `createdAt`, `shotNumber`, `shotStartedBy`, `closed`). So nothing in this section blocks you today.

Before submission, Gabriel will lock the room down again to exactly what the pages use. From your code, this is the list. **Tell Gabriel if anything is wrong or missing**, and keep it up to date as your pages change.

| Field | Shape the rules would check | Written by |
| --- | --- | --- |
| `stage` | one of `'camera'`, `'strip'`, `'decorate'`, `'video'`, `'music'`, `'export'` | `goToStage()` |
| `stripLayoutId` | a string, 1 to 60 characters (a built-in layout id or a template id) | `chooseLayout()` (also resets `stripSlots` and `stripEdits` to `{}`) |
| `stripStyleId` | a string, 1 to 60 characters | `chooseStyle()` |
| `stripSlots` | a map with keys `'0'` to `'11'`, each a photo id (string) or `null` | `placePhoto()`, `clearSlot()` |
| `stripEdits` | a map with keys `'0'` to `'11'`, each `{ filter, brightness, contrast, saturation }` or `null` | `updateEdit()` |
| `stripStickers` | a list of at most **40** stickers | `saveStickers(list)` |
| `stripTemplate` | (new, see section 4) a map `{ id, name, aspect, slots, frameUrl }` | when a real template is chosen |

**Limits to keep in mind:**
- **The whole room document must stay under 1 MB** (a Firestore limit). Never put photo data URLs or big images in `stripStickers[].src`: use a Storage URL (`getFileUrl`) or a small SVG data URL like your badges.
- **Rules can't look inside every item of a list.** They can check that `stripStickers` is a list of at most 40 items, but not each sticker's fields. So the page should treat each sticker as untrusted when it shows it (next point).
- **Only show sticker images from places we trust.** Any room member can write any `src`. Before showing one (and before drawing it on the export canvas), check it starts with `https://firebasestorage.googleapis.com/`, `data:image/`, or the GIPHY host (`https://media.giphy.com/`), and skip it otherwise:

```js
const SAFE_IMAGE_STARTS = ['https://firebasestorage.googleapis.com/', 'data:image/', 'https://media.giphy.com/']
function isSafeImage(src) {
  return typeof src === 'string' && SAFE_IMAGE_STARTS.some((start) => src.startsWith(start))
}
// in the template: v-for="s in stickers.filter((s) => isSafeImage(s.src))"
```

- `by` (who placed a sticker) is just a display name, not proof of who placed it. That's fine for showing, but don't use it for permissions.

## 3. Using the real user id

The basics (end of this file) explain that `getGuestId()` is gone. Your branch still has the old `VideoCallCard.vue`, `useVideoCall.js` and `guest.js` from `main`. When you merge, **take Gabriel's versions** of those three files. Your `DecorateView` only uses `getGuestName()`, which still exists. To get "me" inside a room:

```js
import { getUid } from '../composables/useAuth.js'
const myId = getUid()            // matches member.id in activeMembers, and photo.ownerId
```

## 4. Real templates instead of `LAYOUTS` / `FRAME_STYLES`

Templates are made in Joash's editor and saved to accounts (`templates/{id}` in Firestore). Where to get them:

```js
import { listMyItems, getFileUrl } from '../studio.js'
import { listMySaved, listPublicItems } from '../marketplace.js'

const mine = await listMyItems('templates')                                      // "Mine" (accounts only)
const saved = (await listMySaved()).filter((s) => s.type === 'templates' && s.item).map((s) => s.item)  // "Saved"
const popular = (await listPublicItems({ type: 'templates', sort: 'popular' })).items                  // marketplace

// each template: { id, name, slotCount, categories, thumbnailPath, dataPath, ownerId, ownerName, visibility, ... }
// thumbnail: <StorageImage :path="t.thumbnailPath" :alt="t.name" />
```

**Two things to plan for:**

1. **Other people in the room may not be allowed to read the template.** A host's **private** template can only be read by the host. So when someone chooses a template, copy what the room needs **into the room document**. Then everyone can draw it without reading the template:

```js
import { loadTemplateProject, getFileUrl } from '../studio.js'

async function chooseTemplate(template) {
  const project = await loadTemplateProject(template) // works: the Storage CORS setting is done
  await updateDoc(roomRef(), {
    stripLayoutId: template.id,
    stripTemplate: {
      id: template.id,
      name: template.name,
      aspect: project.aspect,         // width / height (Joash is adding this)
      slots: project.slotRects,       // [{ x, y, w, h }] in percent (Joash is adding this)
      frameUrl: await getFileUrl(template.thumbnailPath), // works for everyone in the room
    },
    stripSlots: {},
    stripEdits: {},
  })
}
```

2. **Slot positions:** right now Joash's saved project doesn't say where each slot is. Joash's guide asks for `slotRects` and `aspect` to be added, in the same percent format as your `LAYOUTS`. Agree with Joash on which picture is the frame overlay (it needs transparent holes for the photos).

Until that's ready, keep the built-in `LAYOUTS` as the "Default" group, with real templates added as "Mine" and "Saved".

## 5. Real stickers instead of the placeholder `STICKERS`

Rae's guide has a function `loadMyStickerTray()` that returns the user's own and saved stickers in exactly your tray shape `{ id, tab, name, src }`. Agree with Rae who adds it and where. Guests get an empty list, so keep a few built-in stickers for them.

## 6. "Save to My Studio" for the finished strip

On `account-system`, the strip page has a **Save to My Studio** button for accounts. Your new `StripView.vue` replaces that file, so the button needs to move to your Decorate page, next to Download JPG. It's the same canvas you already draw for the download:

```js
import { saveStrip } from '../studio.js'
import { useAuth } from '../composables/useAuth.js'

const { isAccount } = useAuth()
const savedToStudio = ref(false)

async function saveToStudio() {
  const canvas = await drawStripCanvas()      // the canvas your downloadJpg() draws (split it out into its own function)
  const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  await saveStrip({ title: 'Room ' + code.value + ' · ' + date, image: image }) // title: 1 to 40 characters
  savedToStudio.value = true
}
```

```vue
<button v-if="isAccount" class="btn btn-primary btn-sm" :disabled="savedToStudio" @click="saveToStudio">
  {{ savedToStudio ? 'Saved to My Studio ✓' : 'Save to My Studio' }}
</button>
```

**Rules for strips:**
- The image must be a **JPEG under 5 MB**.
- Strips are always private to the user who saved them, and each person saves their own copy.
- If the canvas has Storage images on it (template frames, stickers), `toBlob` only works if the images were loaded with `img.crossOrigin = 'anonymous'`. The Storage CORS setting is already done.

Saw Jun Han's Export step may take over the final download and save later. Agree with Jun Han who owns the button.

## 7. Merging your branch with `account-system`

| File | What to do |
| --- | --- |
| `src/views/StripView.vue` | Keep **yours**, then add the "Save to My Studio" button back on the Decorate page (section 6). |
| `src/views/RoomLayout.vue` | Keep Gabriel's identity code (`getUid`, `uid`) **and** your `STAGE_PATHS` / `followStage()` change. |
| `VideoCallCard.vue`, `useVideoCall.js`, `guest.js` | Take **Gabriel's** versions. |
| `src/router.js` | Keep both sides' routes (yours adds `decorate`). |
| `vercel.json` | Keep both sides' lines (yours adds `/room/:code/decorate`). |

After merging, run the app, go through Shoot → Pick → Decorate in a room, and watch the browser console. A `permission-denied` error means you're writing somewhere that's still strict (see the table in the basics). Tell Gabriel which write it was.

## 8. Checklist

- [ ] You've checked the section 2 list with Gabriel (it becomes the real rules at lockdown).
- [ ] Sticker `src` is checked with `isSafeImage` before showing or drawing.
- [ ] The room document stays small (no photo data URLs in stickers).
- [ ] "Save to My Studio" is on the Decorate page (accounts only).
- [ ] Real templates (section 4) once Joash adds `slotRects` and `aspect`, and real stickers (section 5) with Rae.

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
