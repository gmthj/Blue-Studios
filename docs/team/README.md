# Team guides: using Gabriel's parts from your feature

Each guide explains what you need from accounts, My Studio, the marketplace, the room and the security rules, with code examples. Each file is complete on its own (the shared basics are at the end of every guide), so you can give just your file to your AI assistant.

| Who | Feature | Guide |
| --- | --- | --- |
| Joash | Template Editor | [joash-template-editor.md](joash-template-editor.md) |
| Rae | Sticker / Meme Maker | [rae-sticker-maker.md](rae-sticker-maker.md) |
| Germaine | Photo Editor + Frame/Photo Selector (Pick, Decorate) | [germaine-photo-editor-and-selector.md](germaine-photo-editor-and-selector.md) |
| Jun Han | Video Editor + Export & Share | [jun-han-video-editor-and-export.md](jun-han-video-editor-and-export.md) |
| Shannon | Music Mixer + UI/UX | [shannon-music-mixer-and-ui.md](shannon-music-mixer-and-ui.md) |

**First, base your work on the `account-system` branch.** The live security rules need users to be signed in, and branches made from the old `main` don't sign in, so they get "permission denied". The steps are in "Where Gabriel's code is" at the end of each guide.

**The security rules are open for development:** room fields, new lists inside rooms, new collections and new Storage folders all work without asking. Accounts, My Studio and the marketplace stay strict, so use the `studio.js` and `marketplace.js` functions for those. Before submission, send Gabriel the final shape of your data for the real rules. Details are in "The basics" at the end of each guide.

**Things that involve more than one person:**
- **Joash → Germaine:** templates need slot positions (`slotRects`, `aspect`) so the Pick page can use them.
- **Rae → Germaine:** `loadMyStickerTray()` feeds the Decorate page's sticker tray.
- **Germaine ↔ Jun Han:** decide who owns the final "Download" and "Save to My Studio" buttons.
- **Germaine, Jun Han, Shannon → Gabriel:** room stage names and the final shape of any new room fields, for the real rules before submission.
- **Done:** the Storage CORS setting, so pages can draw Storage images on a canvas (with `img.crossOrigin = 'anonymous'`) and `loadTemplateProject` works.

Written 19 Oct 2026, from the `account-system` branch. If something here doesn't match the code, the code wins: tell Gabriel so the guide can be fixed.
