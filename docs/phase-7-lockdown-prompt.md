# Phase 7 prompt: security lockdown before submission

> **How to use:** paste everything below the line into Claude Code, opened in this repo, once all
> teammates' features are merged and working. Ideally do it 1 to 2 weeks before submission, so there's time to fix what it finds.

---

You are helping Gabriel Tan, Project Lead of **Blue Studios**, an IS216 group web app. It's an online photobooth: friends join a room with a 4-digit code or QR, video call, take synced photos, and make photostrips. It has accounts, My Studio, a marketplace for templates and stickers, and an admin (moderator) system. The stack is Vue 3 (`<script setup>`, composables), Vue Router, Vite, Bootstrap 5, Firebase (Auth, Firestore, Storage, on the Blaze plan, Storage in us-east1), and Vercel serverless functions in `api/`.

This is **phase 7: the security lockdown**. During development, parts of the security rules were deliberately left open so teammates weren't blocked. Your job is to close them properly, remove temporary things, and do a final security review, **without breaking any feature**.

## Read first

- `README.md`, especially "Security rules", "Admin (moderators)", "Marketplace" and "My Studio".
- `firestore.rules` and `storage.rules`. Search for **`DEV`**: every block marked `DEV` / `TODO lockdown` is what you're replacing.
- `tests/firestore.rules.test.js`, `tests/storage.rules.test.js`, `tests/admin.api.test.js`. Run them all with `npm run test:rules` (it needs Java and starts the Auth, Firestore and Storage emulators).
- `docs/team/*.md`: the guides each teammate got. They list the data each feature was expected to store and what each teammate was asked to send Gabriel ("send Gabriel the final shape").
- `git log --oneline -40` and `git branch -a`: find out which teammate branches are merged and what changed since 19 Oct 2026.

## How Gabriel likes to work (follow this)

- **Don't commit and don't deploy.** Make the changes, run the tests and the build, then give Gabriel a suggested commit message and the deploy command. Gabriel commits and deploys.
- **Anything in the Firebase, Google Cloud or Vercel consoles, Gabriel does.** Give **step-by-step console walkthroughs**: which page, which button, what to type, and what to check afterwards.
- **Code style:** match the existing code. It's student code that has to be easy to read: simple names, plain-English comments explaining *why*, no clever tricks. Teammates and markers must be able to follow it.
- **Before anything that's hard to undo, or that affects the live site, explain it and ask first.**
- Report honestly: what was tested, what wasn't, and what's still a risk.

## The tasks

### 1. Find out what the merged features actually store

Gabriel needs to see this before you write any rule.

- Search the code for every Firestore and Storage write and read: `setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `writeBatch`, `runTransaction`, `collection(`, `doc(`, `uploadBytes`, `ref(storage`, `getDownloadURL`, `saveField`, `saveFields`.
- Make a table for each collection and subcollection, and for each room field and Storage folder:
  - field names and types
  - who writes them (which page or function, and whether a guest, member, owner or admin)
  - realistic size limits
  - what is read, and by whom
- **Room document fields:** teammates added things like `stage` values, `stripLayoutId`, `stripStyleId`, `stripSlots` (more than 4 slots), `stripEdits`, `stripStickers`, `stripTemplate`, and music state. Check each one in the code and don't guess.
- Compare with what `docs/team/*.md` expected. Point out anything surprising, for example a field that holds big data URLs in the room document (the 1 MB limit), or a writer that could be anyone.
- **Show Gabriel the table and get a yes before writing rules.**

### 2. Replace the DEV blocks with real rules

**In `firestore.rules`:**
- `devRoomChange()` (members can change any room field except the core):
  - Replace it with one small function per kind of change, in the same style as `pressShutter()` / `closeRoom()`.
  - Each function uses `onlyChanged([...])` and checks types, allowed values and sizes. For example: the `stage` names, `stripSlots` keys `'0'`–`'11'` with a photo id string or `null`, `stripStickers` as a list of at most about 40, and strings with maximum lengths.
  - Rules can't check every item in a list. Check the list's size and type, and make sure the page treats each item as untrusted. `docs/team/germaine-photo-editor-and-selector.md` has an `isSafeImage` example; check that it's actually used.
- **The DEV room sub-lists block** (`match /{listName}/{docId=**}` inside rooms): replace it with a `match` for each sub-list that's really used (for example clips), with field checks, members only.
- **The DEV new-collections block** (`match /{collectionName}/{docId=**}` at the end): replace it with real rules for each collection that's really used. Then **delete the block**, so anything else is blocked by default again. Keep the protected list in mind (`rooms`, `users`, `templates`, `stickers`, `strips`, `reports`, `adminLog`).
- Update the "DEV MODE" header comment at the top of the file.

**In `storage.rules`:**
- Replace the DEV `match /{folder}/{allPaths=**}` block with a `match` for each folder that's really used.
- Use owner folders (`{uid}` in the path) or room-member checks (with `firestore.exists` / `firestore.get` on the members document), plus content types and size limits.
- Keep blocking HTML, SVG, JavaScript and XML.
- Then delete the DEV block and update the header comment.

**Tests:**
- Delete the tests marked `DEV`.
- For every new rule, add tests showing both what **is** allowed and what **isn't**: other users, guests, signed-out visitors, wrong types, too big, extra fields.
- **All tests must pass.** If a teammate's real usage fails a rule, fix the rule or ask Gabriel. Never loosen a rule just to make a test pass.

### 3. Remove temporary things

- ~~**The `/test-upload` page**~~: already removed (page, route and README line).
- Any other placeholder data a teammate left in that's no longer used (for example placeholder `STICKERS` / `LAYOUTS` in `src/stripData.js`). **Ask Gabriel before deleting a teammate's code.**
- **Leave alone:** `scripts/set-admin.mjs`, `scripts/set-cors.mjs`, and the emulator branch in `api/_lib/firebaseAdmin.js`. The tests need that branch, and it only runs when `FIREBASE_AUTH_EMULATOR_HOST` is set, which it never is on Vercel.

### 4. Review the server functions (`api/`)

For each file in `api/` except `_lib`, including any a teammate added (for example remove.bg, Gemini or weather), check:
- [ ] It only allows the HTTP method it needs.
- [ ] It checks the caller with `getCaller(req)` where it should. Accounts only where it costs money; `admin === true` where it's admin-only.
- [ ] It checks every input: type, length, pattern. URLs and ids are never pasted into requests unchecked.
- [ ] Secrets come only from `process.env` with **no** `VITE_` prefix, and are never sent back or logged.
- [ ] Errors to the browser are generic, and details go only to `console.error`.
- [ ] Paid APIs have some protection against being run up: accounts only, input size limits, and caching where it makes sense. Mention to Gabriel if real rate limiting is worth adding.
- [ ] `grep -rn "VITE_" src/ .env.example`: no secret key has a `VITE_` name. Firebase web config, the Agora **App ID**, the Jamendo client id and the GIPHY key are public by design. Anything else needs a reason.

### 5. Look for secrets in the repo and its history

- Check `git ls-files` for `.env`, `.env.local` or `*.json` key files: they must not be tracked. Check `.gitignore`.
- Search the history: `git log -p --all -S "private_key"` and `git log -p --all -S "AGORA_APP_CERTIFICATE="`, then look at what's found.
- If a real secret was ever committed, **stop and tell Gabriel**. The key must be **rotated** (a new one made and the old one deleted in the console), because removing it from git isn't enough. Walk Gabriel through it.

### 6. Console steps for Gabriel (write walkthroughs, don't do them)

Write each as numbered steps, with what to check afterwards. After each one, ask Gabriel to test log in, Google sign-in, a room with a video call, and the marketplace.

**a) Restrict the browser API key** (Google Cloud console → APIs & Services → Credentials → the "Browser key (auto created by Firebase)"):
- **Website restrictions** (HTTP referrers):
  - the production domain `https://blue-studios-mu.vercel.app/*`
  - the Vercel preview pattern for this project. Find the real pattern from a preview URL, for example `https://blue-studios-*-gabriel-tans-projects-d48c7787.vercel.app/*`
  - `https://blue-studios-7cf16.firebaseapp.com/*` (the Google sign-in page uses it)
  - `http://localhost:5173/*` and `http://localhost:3000/*` (for local development)
- **API restrictions:** only the APIs the web app uses: Identity Toolkit API, Token Service API, Cloud Firestore API, Cloud Storage for Firebase API, and Firebase Installations API if it's listed as used.
- Warn Gabriel that a wrong restriction breaks login for everyone, and give the steps to undo it.

**b) Firebase Auth → Settings → Authorized domains:** keep only the production domain, the Vercel domain(s) used, `localhost` and the firebaseapp.com domain. Remove anything unknown.

**c) Budget alert** (Google Cloud → Billing → Budgets & alerts), if there isn't one yet: for example about $5 a month, with email alerts at 50%, 90% and 100%. The project is on the Blaze plan, so it can be charged.

**d) Optional, ask Gabriel:** Firebase **App Check** with reCAPTCHA. It makes it much harder for scripts outside our site to use our Firestore and Storage. Explain the work involved (a new SDK setup, debug tokens for local development, then turning on enforcement for each service) and the risk (turning enforcement on too early blocks real users). Only do it if Gabriel wants it.

**e) Storage CORS** (`storage.cors.json`, applied with `npm run set-cors`): it's set to `origin: ["*"]` for GET/HEAD only, because each Vercel preview has its own address. That's acceptable, because CORS doesn't decide who can read a file; `storage.rules` and the download token do. Ask Gabriel whether to narrow it to the production domain plus localhost. The catch: preview builds then can't export strips with Storage images.

### 7. Security headers in `vercel.json`

- Add safe headers for all paths:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`, and/or `Content-Security-Policy: frame-ancestors 'none'`
  - `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`. The camera and microphone are needed for rooms. Add geolocation only if the weather sticker uses it.
- **Don't** add `Cross-Origin-Opener-Policy: same-origin` or `Cross-Origin-Embedder-Policy: require-corp`. They break Google sign-in (the popup) and cross-origin images. `same-origin-allow-popups` is OK if you want COOP.
- A full `Content-Security-Policy` is optional and easy to get wrong with Agora, Firebase, GIPHY and Jamendo. Only add one if you list every domain the app really loads, and test every page. Otherwise leave it out and tell Gabriel why.
- Afterwards, Gabriel tests on a Vercel preview: Google sign-in, a room with camera and video call, image export, and the marketplace.

### 8. Front-end checks

- `grep -rn "v-html" src/`: there should be none. If there is, user text must never go into it.
- Open redirects: the login `?redirect=` must only allow paths on our own site. Check `redirectTo` in `LoginView.vue` and any new redirect code.
- Pages for accounts or admins use `meta.requiresAccount` / `meta.requiresAdmin` in `router.js`. This only hides pages; the rules are the real protection, so check the rules cover it.
- Images from users (sticker `src`, `frameUrl`) are only loaded from our own Storage, data URLs, or a trusted host.

### 9. Dependencies

- Run `npm audit`. Explain each real issue in plain words, and fix it with normal updates (`npm update`, or a specific version) if that's safe. **Don't run `npm audit fix --force`** without asking: it can install breaking major versions.
- Keep the `"overrides": { "jwks-rsa": { "jose": "^5.10.0" } }` in `package.json`. It stops a Vercel crash (see the README's "Use of AI").
- If any branch added a second lock file (`pnpm-lock.yaml`, `yarn.lock`), the project uses npm. Ask Gabriel before removing it.

### 10. Update the docs

- **README "Security rules":** remove the DEV mode paragraph and describe the final rules for each feature, in the same short style as the existing bullets.
- Add a short "Security summary" section that a marker can read in a minute: identity (anonymous plus account linking), rules (deny by default, field checks, tests), the server functions, admin and bans, Storage, the API key restrictions, and the headers.
- If Gabriel asks, add a "Use of AI" entry in the README's style describing this lockdown.

### 11. Check everything, and report

- `npm run test:rules`: all tests must pass. Say how many.
- `npm run build`: it must succeed.
- Give Gabriel a **manual test checklist** for a Vercel preview, covering:
  - a guest creating a room and a second device joining by code
  - the video call
  - the shutter syncing on both devices
  - the Pick, Decorate, Video, Music and Export pages working for every member
  - signing up with email and with Google, and confirming the email
  - My Studio: save a strip, delete, make a template or sticker public
  - the marketplace: browse as a guest, save and unsave, report
  - admin: hide a reported item, ban and unban a test account, and check the Log
  - checking that a non-admin can't open `/admin`
- Give the deploy command (`firebase deploy --only firestore,storage`) and a suggested commit message. Don't commit.
- **Report:** what changed, what was tested, what's waiting on Gabriel in the consoles, and any risks left (for example, no App Check).
