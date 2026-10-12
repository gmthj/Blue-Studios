**IS216 \- Group Project \- Proposal**  

| IS216 Section | Group Number (eLearn) | Group Name |
| :---: | :---: | :---: |
| G3 | Group 2 | Blue Studios |

**Group Members**

|   | Name | SMU Email ID (e.g. jongun.kim.2025) |
| :---: | :---: | :---: |
| 1 | Tan Hiang Joon Gabriel | gabriel.t.2025 |
| 2 | Joash Law Cho Shuen | joash.law.2025 |
| 3 | Germaine Foo Ee Huei | germainefoo.2025 |
| 4 | Saw Jun Han | junhan.saw.2025 |
| 5 | Yang Xin Lei Rae | rae.yang.2025 |
| 6 | Shannon Neo Shi En | shannon.neo.2025 |

 

**Project Overview**  
*(Provide an overall description of the project your team will be working on.)*

An online photobooth that brings the fun of a physical photobooth to the web, so friends can take a photostrip together even when they are not in the same place. One person creates a room and shares a 4-digit room code or QR code; everyone joins from their own phone or laptop and takes photos (or short video clips) together in one synchronised session. The group then designs their own photostrip template in a drag-and-drop frame editor, decorates the shots with filters and personalised stickers they create themselves, adds music, and exports the final photostrip or video strip to download and share.

**Objective(s) of the Project**  
*(Highlight the objective(s) of this project, its significant, uniqueness, for example about solving any existing challenges.)*

* **Make photobooths social across distance:** Physical photobooths need everyone to be in the same place and charge per strip. Our shared rooms let friends in different locations take one strip together for free, using the devices they already own.

* **Give users full creative control:** Most photobooths and online photobooth sites only offer a fixed set of preset frames. Users can design their own templates (layout, number of photos, colours, backgrounds) and save them for reuse.  
* **Make every strip personal:** A built-in sticker/meme maker lets users turn their own images and text into stickers, including animated and live “dynamic” stickers (e.g. current weather or time), instead of choosing from generic sticker packs.  
* **Go beyond still photos:** Users can record short video strips and set them to a soundtrack they mix themselves, combining a photobooth, a simple video editor and a music mixer in one app.

**Uniqueness:** existing online photobooth tools are mostly single-user with preset frames. Our app combines multi-device group sessions, a custom template editor, a sticker creator and video/music editing in one place, so creating and sharing a personalised photostrip becomes a collaborative experience.

**Application Features**  
*(List the key features/functionalities that the application will provide.)*

* **Photobooth Rooms:** A host creates a room and gets a 4-digit code and QR code. Others join from their own devices, and the host starts a synchronised countdown so everyone captures at the same time. All shots appear in a shared room gallery. Supports photo mode and short video mode.  
* **Frame/ Template Editor:** Drag and drop photo slots to design a strip layout; change the number and shape of slots, background colour or image, and apply filters. Templates can be saved and reused.  
* **Photo Editor:** Apply filters and adjustments (brightness, contrast, black & white, vintage, etc.) and drag and drop stickers onto each photo, with resize, rotate and layering.  
* **Video Editor:** Record short clips, arrange and trim them on a timeline, and select background audio.  
* **Frame/ Photo Selector:** Pick a saved frame, then drag photos from the room gallery into each slot and preview the final strip.  
* **Sticker/ Meme Maker:** Upload an image and automatically remove its background, add manual or AI-generated text, and save it as a sticker. Three sticker types: static (simple image), animated (GIF/ keyframes) and dynamic (live data such as current weather or time).  
* **Music Mixer:** A DJ-style two-deck mixer to play two tracks, adjust volume and tempo with sliders and crossfade between them, creating the soundtrack for video strips.  
* **Export & Share:** Download the final strip as an image (PNG), GIF or video (MP4), or share it with a link/ QR code.  
* **User Accounts & Gallery:** Log in to save templates, custom stickers and past photostrips to a personal gallery. Guests can join photobooth rooms without an account.

**List of APIs used**  
*(This list can be tentative. Students are allowed to add more later on.)*

* **MediaDevices API (getUserMedia):** access the device camera (front/back camera on phones, webcam on laptops).

* **MediaRecorder API:** record short video clips for video strips.

* **Canvas API:** apply filters and combine photos, frames and stickers into the final strip image.

* **Web Audio API:** play, mix and crossfade tracks in the music mixer.

* **Firebase (Authentication, Cloud Firestore, Storage):** user login, real-time syncing of rooms and countdowns, and storing photos, templates and stickers.

* **remove.bg API:** remove backgrounds from uploaded images in the sticker maker.

* **GIPHY API:** search and add animated GIF stickers.

* **OpenWeatherMap API:** live weather data for dynamic weather stickers.

* **Google Gemini API:** generate meme captions/ text for stickers.

* **Jamendo API:** browse and stream royalty-free music tracks for the music mixer and video strips.

* **QR Code API (goqr.me):** generate the QR code that others scan to join a room.

**Describe your users & types of device they will be using** (minimum 2 device types)  
**Users**

* **Students and friend groups:** including friends who are apart (e.g. on exchange or in different schools) who want to take a photostrip together.

* **Student clubs and event organisers:** e.g. orientation camps and CCA events, who can create themed templates and stickers for participants to use at their events.

* **Social media users and content creators:** who want personalised, shareable photostrips and short videos.

**Devices**

* **Smartphones:** the main device for joining rooms (scan QR code), taking photos with the front camera and quickly adding stickers. Layout is mobile-first and touch-friendly.

* **Laptops/ desktops:** webcam capture and the more detailed tasks such as the frame editor, video timeline and music mixer, which benefit from a larger screen and mouse drag and drop.

* **Tablets:** can be set up as a shared photobooth “kiosk” at events, using touch drag and drop.

The app will be fully responsive (Bootstrap grid) so every feature works across these device types.

**X-Factor(s)**

*(X-factors are completely OPTIONAL. Students MUST clearly explain WHY they believe this/these is/are X-factors. For example, going beyond what students learn in class. If unsure, make a list first and confirm with your course instructor.)*

*This list can be tentative. Students are allowed to add more later on.)*

We aim to use open source libraries not taught in class:

| Item | Justification |
| ----- | ----- |
| **Konva.js (vue-konva)** | **What is it?** An open-source HTML5 canvas library that turns canvas drawings into objects that can be dragged, resized, rotated and layered, with a Vue wrapper (vue-konva). **How does this benefit our project?** Powers the core drag-and-drop experience: building templates in the frame editor, placing and transforming stickers on photos, and exporting the finished canvas as a high-resolution image. **Why is this an X-factor?** In class we only manipulate DOM elements with Vue. Building an interactive canvas editor with transform handles and layering, and exporting it as an image, goes well beyond what is covered. |
| **Real-time multi-device rooms (Firebase Firestore listeners)** | **What is it?** Using Firestore real-time listeners (onSnapshot) so that every device in a room updates instantly when something changes, without refreshing. **How does this benefit our project?** Lets several people on different devices join one room by code/QR, start a synchronised countdown together and see each other’s photos appear in the shared gallery live. **Why is this an X-factor?** Class covers one-off API calls with axios (request → response). Keeping multiple users’ devices in sync in real time is a different and more complex pattern that is not taught. |
| **FFmpeg.wasm \+ Tone.js** | **What is it?** FFmpeg.wasm is a WebAssembly port of the FFmpeg video tool that runs in the browser. Tone.js is a library built on the Web Audio API for playing and mixing audio. **How does this benefit our project?** Tone.js drives the two-deck music mixer (crossfade, volume, tempo). FFmpeg.wasm combines recorded clips and the mixed soundtrack into an MP4 / GIF entirely in the browser, with no backend server needed. **Why is this an X-factor?** Audio processing and in-browser video encoding with WebAssembly are not covered in class, and allow us to offer video and music features usually only found in native apps. |

**Members and Roles/Responsibilities**

|   | Name | Roles/Responsibilities |
| :---: | :---: | ----- |
| **1** | Tan Hiang Joon Gabriel | Project Lead; Photobooth Rooms (room creation, room code/QR join, synchronised countdown, shared gallery with Firebase real-time listeners) |
| **2** | Joash Law Cho Shuen | Frame / Template Editor (Konva.js drag and drop, saving and loading templates) |
| **3** | Germaine Foo Ee Huei | Photo Editor and Frame / Photo Selector (filters, sticker placement, slotting photos into frames) |
| **4** | Saw Jun Han | Video Editor and Export & Share (MediaRecorder, timeline, FFmpeg.wasm export to PNG/GIF/MP4) |
| **5** | Yang Xin Lei Rae | Sticker / Meme Maker (remove.bg, GIPHY, OpenWeatherMap and Gemini API integration) |
| **6** | Shannon Neo Shi En | Music Mixer (Tone.js, Jamendo API); UI/UX lead (overall design, responsive layout, user accounts & gallery) |