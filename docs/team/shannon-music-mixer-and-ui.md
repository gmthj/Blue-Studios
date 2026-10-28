# For Shannon: Music Mixer in the room, and restyling Gabriel's pages (UI/UX)

Written by Gabriel (rooms, accounts, landing, login/sign up, My Studio, marketplace, security rules). Your branch is `music-mixer`.

**In short:**
- **Music Mixer:** it's a room page. While we build, the rules let room members save any room field, so a shared music choice works now. Send Gabriel the final shape before submission (section 1).
- **UI/UX:** you're welcome to restyle all of Gabriel's pages. Section 3 lists the few attributes and checks that must stay, because they're security or password-manager fixes rather than design.
- **Accounts** (originally your area) are now built: section 2 explains what exists, so the design can match.

---

## 1. Music Mixer in the room

Your branch adds `{ path: 'music', component: MusicView }` as a child of `/room/:code`. That's right: `RoomLayout.vue` keeps the video call running across all room pages.

**To make the whole room move to the music page together:**
- Germaine's branch adds `STAGE_PATHS` to `RoomLayout.vue`, with `music: '/music'` already written as a comment. Uncomment it once both branches are merged.
- The page that moves the room on calls `updateDoc(roomRef(), { stage: 'music' })`.
- The open development rules allow any stage name. Confirm `'music'` with Gabriel so it's in the final rules.
- Add `{ "source": "/room/:code/music", "destination": "/index.html" }` to `vercel.json`.

**If everyone in the room should hear or see the same music choice**, save it in the room document. That works now with the open development rules. Before submission, send Gabriel the exact shape so it can be checked, for example:

```
room.music = {
  trackId: '1234567',          // Jamendo track id, string up to 20 characters
  trackName: 'Summer Breeze',  // up to 100 characters (shown to everyone)
  audioUrl: 'https://...',     // must start with https://prod-1.storage.jamendo.com/ (or wherever Jamendo serves files)
  volume: 80,                  // whole number 0-100
  startAt: 12.5                // seconds into the track
}
```

Only room members can change it, and only while the room is open. That's the same as the rest of the room.

**Jamendo's client id** (`VITE_JAMENDO_CLIENT_ID`) is visible to anyone in the browser. That's OK for Jamendo's read-only API, because it's an app id rather than a password. Never put a **client secret** in a `VITE_` variable. If one is ever needed, it goes in an `api/` function (see the basics below).

**Merging:** your branch still has the old `VideoCallCard.vue`, `useVideoCall.js` and `guest.js` from `main`. Take **Gabriel's** versions of those when merging, and keep both sides' routes in `router.js` and lines in `.env.example`.

## 2. What exists for accounts (so the design can match)

| Page | URL | Who | File |
| --- | --- | --- | --- |
| Landing | `/` | everyone | `src/views/HomeView.vue` |
| Log in / Sign up | `/login`, `/login?mode=signup` | everyone | `src/views/LoginView.vue` |
| My Studio (the "gallery") | `/studio` | accounts only (guests are sent to log in) | `src/views/StudioView.vue` |
| Marketplace | `/marketplace?type=templates&category=cute&sort=popular` | everyone, guests too | `src/views/MarketplaceView.vue` |
| Marketplace item (popup) | any page + `?item=templates:{id}` or `?item=stickers:{id}` | everyone (save and report need an account) | `src/components/MarketplaceItemDialog.vue` |

**Shared pieces:**
- `src/App.vue`: the navbar has Marketplace, plus My Studio, name and Log out for accounts, or Log in and Sign up for guests. It's hidden inside rooms, because logging out there would drop you from the room. It also holds the "please confirm your email" reminder.
- `src/components/MarketplaceCard.vue`: one item in a grid. `StorageImage.vue`: an image from Firebase Storage. `ItemDetailsForm.vue`: rename and pick categories.
- **Who is logged in:** `useAuth()` in `src/composables/useAuth.js` returns `user` and `isAccount`. Use `v-if="isAccount"` to show account-only things.
- **States:**
  - Guest or account.
  - Email confirmed or not: making things public needs a confirmed email.
  - An item is private, public, or hidden by a moderator: shown with a yellow "Hidden by a moderator" badge.
  - An empty state for each list.
- **Still to come:** an **admin page** (moderators: reports, hiding items, banning accounts). It isn't in the Figma.

**Styling:** everything is plain Bootstrap 5 for now. The cleanest way to bring in the Figma look everywhere at once is to override Bootstrap's variables in **one** stylesheet imported in `src/main.js`, after Bootstrap. Then you don't need to edit each page:

```css
/* src/theme.css  (import './theme.css' in main.js, AFTER bootstrap.min.css) */
:root {
  --bs-primary: #2F5BEA;
  --bs-primary-rgb: 47, 91, 234;
  --bs-body-font-family: 'Inter', system-ui, sans-serif;
  --bs-border-radius: 0.75rem;
}
.btn-primary { --bs-btn-bg: #2F5BEA; --bs-btn-border-color: #2F5BEA; --bs-btn-hover-bg: #2449c7; }
```

## 3. Please keep these when restyling (they're security or behaviour, not looks)

You can change classes, layout, colours, wording and order freely. These need to stay:

**`LoginView.vue`:**
- `<form :key="mode" ...>`: rebuilds the form when switching between Log in and Sign up, so password managers don't put the email in the Name box.
- The **email** input keeps `name="username"`, `type="email"` and `autocomplete="username"`. The **password** input keeps `name="password"` and `:autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"`.
- The **name** input keeps `name="name"`, `autocomplete="name"` and `data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"`. These stop password managers filling it.
- **Error messages stay vague:** they never say whether an email has an account (that would let people check who uses our app). "Forgot password" always shows the same message.
- The `?redirect=` handling (`redirectTo`) must stay. It only allows going back to pages on our own site.

**`App.vue`:**
- Keep the navbar hidden inside rooms (`v-if="!inRoom"`).
- Keep the `authError` alert, which shows if even guest sign-in fails.

**Everywhere:**
- Show user-made text (names, template names, captions) with `{{ }}` only, **never `v-html`**. `{{ }}` is safe from script injection, and `v-html` isn't.
- Buttons that only make sense for accounts use `v-if="isAccount"`. Keep the check when moving buttons around. (The rules block guests anyway, but they'd see errors.)
- The **Public/Private** switch is disabled until the email is confirmed. Keep the disabled state and its explanation.

**Accessibility (part of UI/UX):**
- Every input has a `<label for>`.
- Icon-only buttons need `aria-label`.
- Keep the visible focus outline.

## 4. Checklist

- [ ] `STAGE_PATHS` and `vercel.json` are updated, and the `music` stage name and the shape of any shared music data are sent to Gabriel for the final rules.
- [ ] No secret keys in `VITE_` variables.
- [ ] The restyle uses one theme stylesheet, and the section 3 attributes and checks are kept.
- [ ] You've told Gabriel about the admin page design if you'd like it to match.

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
