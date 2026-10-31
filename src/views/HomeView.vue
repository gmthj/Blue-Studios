<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName, saveGuestName } from '../guest.js'
import { getUid, useAuth } from '../composables/useAuth.js'
import { isRoomFull, MAX_PEOPLE } from '../room.js'
import { LAYOUTS } from '../stripData.js'
import { getItem } from '../marketplace.js'
import AppIcon from '../components/AppIcon.vue'
import StorageImage from '../components/StorageImage.vue'

const route = useRoute()
const router = useRouter()

const { user, isAccount } = useAuth()

// The name shown in the room (rooms allow up to 20 characters).
// Signed in: the account's name. Guest (or an account with no name): the name typed last time.
function startingName() {
  if (isAccount.value && user.value.displayName) {
    return user.value.displayName.slice(0, 20)
  }
  return getGuestName()
}
const name = ref(startingName())

// Logging in or out while this page is open: switch to the new account's name
watch(
  () => user.value && user.value.uid,
  () => {
    name.value = startingName()
  },
)
// If the user scanned the QR code, the link is /?code=1234, so we pre-fill the code
const joinCode = ref(route.query.code || '')
const errorMessage = ref('')
const loading = ref(false)
const action = ref('') // 'join' or 'create': which button shows the loading spinner

// "Use template" in the marketplace or My Studio opens /?template={id}: the new room starts with that
// template as its photostrip frame (RoomLayout.vue sets it once the host is in the room)
const startTemplate = ref(null) // the templates/{id} document
const startTemplateMissing = ref(false)

watch(
  () => route.query.template,
  async (id) => {
    startTemplate.value = null
    startTemplateMissing.value = false
    if (typeof id !== 'string' || id === '') return
    try {
      const template = await getItem('templates', id)
      if (route.query.template !== id) return // changed while loading
      startTemplate.value = template
      startTemplateMissing.value = !template
    } catch (error) {
      console.error(error)
      startTemplateMissing.value = true
    }
  },
  { immediate: true },
)

// The x on the template card: make a normal room instead
function dropStartTemplate() {
  const query = { ...route.query }
  delete query.template
  router.replace({ path: '/', query: query })
}

// Shown after a room is closed (RoomLayout.vue sends everyone to /?closed=1234)
const closedCode = route.query.closed || ''

// True when exactly 4 digits are typed. /^[0-9]{4}$/ means: start, 4 digits (0-9), end.
const codeComplete = computed(() => {
  return /^[0-9]{4}$/.test(joinCode.value.trim())
})

// ---------- ROOM CODE BOXES ----------
// The 4 boxes are just for show: there is one real (invisible) <input> on top of them. One input means
// pasting a code, deleting, and the phone's number keyboard all work normally.
const codeInput = ref(null)
const codeFocused = ref(false)
const codeInvalid = ref(false) // true for a moment after a letter is typed: the boxes shake red

// Only digits, at most 4 (/\D/g = anything that is not a digit)
function onCodeInput(event) {
  const typed = event.target.value
  const digits = typed.replace(/\D/g, '').slice(0, 4)
  joinCode.value = digits
  // Put the clean code back into the input, so the letter does not stay in it
  event.target.value = digits

  if (/\D/.test(typed)) {
    // Turn the shake off and on again, so typing another letter mid-shake starts it again
    codeInvalid.value = false
    requestAnimationFrame(() => {
      codeInvalid.value = true
    })
  }
}

// The box the next digit goes into (the last box once all 4 are typed), highlighted while typing
const activeBox = computed(() => {
  return Math.min(joinCode.value.length, 3)
})

// ---------- PHOTOSTRIP PICTURE (behind the room card, xl and up) ----------
// It cycles through the templates, filling each one with the next pictures.
// The files are in public/images/landing. To add or swap one, put the file in the folder and list it here
// (a browser cannot list a folder by itself).
const LANDING = '/images/landing/'

const STRIP_PICTURES = [
  '2021-11-08_05-11-05_2.jpg',
  'ahh cat.png',
  'elmo.jpg',
  '2021-11-08_05-11-05_3.jpg',
  'bluestudios.jpeg',
  'cew1.jpg',
  'cew2.jpg',
  'cew3.jpg',
  'sjh1.jpg',
  'kjs1.jpg',
]

// A template is a frame picture with see-through holes where the photos go.
// layout = an id from LAYOUTS in stripData.js: the holes must be in the same places as that layout's slots.
// tilt = how far the strip leans (degrees)
const STRIP_TEMPLATES = [
  { file: 'retro-4-cut-cream.png', layout: 'retro-4-cut', tilt: 4 },
  { file: 'polaroid-2x2-pink.png', layout: 'polaroid-2x2', tilt: -3 },
  { file: 'film-3-cut-black.png', layout: 'film-3-cut', tilt: 3 },
  { file: 'retro-4-cut-navy.png', layout: 'retro-4-cut', tilt: -4 },
]

const SHOW_EACH_STRIP_FOR = 4000 // milliseconds

// The address of a file. encodeURI turns spaces in names (like "ahh cat.png") into %20.
function landingSrc(folder, file) {
  return encodeURI(LANDING + folder + '/' + file)
}

// How many strips have been shown so far (goes up every few seconds),
// and which picture the current strip starts with (each strip carries on where the last one stopped)
const stripCount = ref(0)
const firstPicture = ref(0)

// The strip on screen now: its template, layout, and one picture per slot
const currentStrip = computed(() => {
  const template = STRIP_TEMPLATES[stripCount.value % STRIP_TEMPLATES.length]
  const layout = LAYOUTS.find((item) => item.id === template.layout)

  const photos = layout.slots.map((slot, i) => {
    const file = STRIP_PICTURES[(firstPicture.value + i) % STRIP_PICTURES.length]
    return { src: landingSrc('pictures', file), slot }
  })

  return {
    key: stripCount.value,
    src: landingSrc('templates', template.file),
    aspect: layout.aspect,
    tilt: template.tilt,
    photos,
  }
})

let stripTimer = null

onMounted(() => {
  // Load every picture now, so a new strip does not appear with empty holes
  for (const file of STRIP_PICTURES) {
    new Image().src = landingSrc('pictures', file)
  }
  for (const template of STRIP_TEMPLATES) {
    new Image().src = landingSrc('templates', template.file)
  }

  stripTimer = setInterval(() => {
    firstPicture.value += currentStrip.value.photos.length
    stripCount.value++
  }, SHOW_EACH_STRIP_FOR)
})

onUnmounted(() => {
  clearInterval(stripTimer)
})

const FEATURES = [
  {
    icon: 'camera',
    title: 'Shoot together on any device',
    text: 'Everyone joins from their own phone or laptop with a code or QR, and the countdown starts on every screen at once.',
  },
  {
    icon: 'layout',
    title: 'Design your own strip',
    text: "Drag-and-drop frames and layouts, then fill them with the room's photos together.",
  },
  {
    icon: 'music',
    title: 'Stickers, video and music',
    text: 'Make stickers, cut a video strip, mix a track, and share templates in the marketplace.',
    link: '/marketplace',
  },
]

// The name box: shakes red (like the code boxes) when Join or Create is pressed without a name
const nameInput = ref(null)
const nameInvalid = ref(false)

// Returns true if a name was typed, otherwise shows an error
function checkName() {
  if (name.value.trim() === '') {
    errorMessage.value = 'Please enter your name first.'
    // Turn the shake off and on again, so pressing the button again shakes it again
    nameInvalid.value = false
    requestAnimationFrame(() => {
      nameInvalid.value = true
    })
    nameInput.value.focus() // ready to type the name straight away
    return false
  }
  saveGuestName(name.value.trim())
  return true
}

async function createRoom() {
  errorMessage.value = ''
  if (!checkName()) return
  loading.value = true
  action.value = 'create'

  try {
    // Keep picking a random code from 0000 to 9999 until we find one that is not already used.
    // padStart(4, '0') adds zeros in front, e.g. 42 -> '0042'
    let code = ''
    let roomSnap = null
    do {
      code = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      roomSnap = await getDoc(doc(db, 'rooms', code))
    } while (roomSnap.exists())

    // Create the room document. The room code is used as the document id.
    await setDoc(doc(db, 'rooms', code), {
      hostId: getUid(),
      hostName: name.value.trim(),
      shotNumber: 0,   // goes up by 1 every time someone presses the shutter
      stage: 'shoot', // which step the whole room is on: shoot, pick, ... (ROOM_STAGES in useRoom.js)
      stripSlots: {},  // the photostrip everyone is making: { 0: photoId, 1: photoId, ... }
      closed: false,
      createdAt: Date.now(),
    })

    router.push({
      path: '/room/' + code + '/shoot',
      query: startTemplate.value ? { template: startTemplate.value.id } : {},
    })
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not create room. Check your internet connection.'
  }
  loading.value = false
}

async function joinRoom() {
  errorMessage.value = ''
  if (!checkName()) return
  if (!codeComplete.value) return

  const code = joinCode.value.trim()
  loading.value = true
  action.value = 'join'
  try {
    const roomSnap = await getDoc(doc(db, 'rooms', code))
    if (!roomSnap.exists()) {
      errorMessage.value = 'Room ' + code + ' does not exist.'
    } else if (roomSnap.data().closed) {
      errorMessage.value = 'Room ' + code + ' has been closed.'
    } else if (await isRoomFull(code, getUid())) {
      errorMessage.value = 'Room ' + code + ' is full (' + MAX_PEOPLE + ' people max).'
    } else {
      router.push('/room/' + code)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not join room. Check your internet connection.'
  }
  loading.value = false
}
</script>


<template>
  <!-- Landing page: what Blue Studios is, plus creating or joining a room straight away -->
  <div class="landing">
    <!--
      HERO: a CSS grid with 3 parts (intro, room card, photostrip picture). Each screen shape places them
      differently (see HERO LAYOUT in the styles). The room card is always on screen without scrolling.
        phones:                      room card, then the intro, then the photostrip
        phones held sideways and
        tablets held upright:        a wide two-column card on top, then the intro next to the photostrip
        lg (992px) and up:           intro | room card | photostrip (a smaller one below xl)
      Everything shows on every screen; only the places change.
    -->
    <section class="hero">
      <div class="hero-intro">
        <span class="hero-badge"><AppIcon name="sparkle" :size="13" /> Free &middot; no booth needed</span>
        <h1 class="hero-title">Take a photostrip together, from anywhere.</h1>
        <p class="hero-lead">
          Create a room, share a 4-digit code and shoot on one synchronised countdown, with friends on their own
          phones and laptops.
        </p>
      </div>

      <!-- Photostrips that change every few seconds, just a picture (aria-hidden: screen readers skip it) -->
      <div class="strip-scene" aria-hidden="true">
        <!-- The stage keeps the same size for every template, so the page does not jump when the strip changes.
             :key changes for every strip, so Vue makes a new one: the new strip slides in while the old one fades out. -->
        <div class="strip-stage">
          <Transition name="strip-swap">
            <div
              :key="currentStrip.key"
              class="strip"
              :style="{ '--aspect': currentStrip.aspect, '--tilt': currentStrip.tilt + 'deg' }"
            >
              <!-- The photos sit under the template, each one in its slot (x, y, w, h are percentages).
                   Each photo is 1% bigger than its hole on every side, so no thin gap shows at the edges. -->
              <img
                v-for="(photo, i) in currentStrip.photos"
                :key="i"
                :src="photo.src"
                class="strip-photo"
                :style="{
                  left: photo.slot.x - 1 + '%',
                  top: photo.slot.y - 1 + '%',
                  width: photo.slot.w + 2 + '%',
                  height: photo.slot.h + 2 + '%',
                }"
                alt=""
              />
              <img :src="currentStrip.src" class="strip-template" alt="" />
            </div>
          </Transition>
        </div>
      </div>

      <div class="room-col">
        <div v-if="closedCode" class="alert alert-info">Room {{ closedCode }} was closed.</div>

        <div class="room-card glass">
          <div class="card-name">
            <label for="nameInput" class="field-label">Your name</label>
            <input
              id="nameInput"
              ref="nameInput"
              v-model="name"
              type="text"
              class="form-control name-input"
              :class="{ invalid: nameInvalid }"
              placeholder="e.g. Cha Eun-woo"
              maxlength="20"
              @animationend="nameInvalid = false"
            />
          </div>

          <div class="card-join">
            <h2 class="card-heading">Got a room code?</h2>
            <p class="card-sub">Join your friends' room, no account needed.</p>
            <div class="d-flex align-items-center gap-2 gap-sm-3">
              <!-- One real input, invisible, on top of the 4 boxes (see ROOM CODE BOXES in the script) -->
              <div class="code-boxes" :class="{ invalid: codeInvalid }" @animationend="codeInvalid = false">
                <input
                  ref="codeInput"
                  :value="joinCode"
                  class="code-input"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="4"
                  aria-label="4-digit room code"
                  @input="onCodeInput"
                  @focus="codeFocused = true"
                  @blur="codeFocused = false"
                  @keyup.enter="joinRoom"
                />
                <span
                  v-for="i in 4"
                  :key="i"
                  class="code-box"
                  :class="{ filled: joinCode[i - 1], active: codeFocused && activeBox === i - 1 }"
                  aria-hidden="true"
                >{{ joinCode[i - 1] }}</span>
              </div>

              <!-- When a full code is typed (or it came from a QR code), Join becomes the main button: filled in -->
              <button
                class="btn btn-join"
                :class="codeComplete ? 'btn-primary join-ready' : 'btn-outline-primary'"
                :disabled="!codeComplete || loading"
                @click="joinRoom"
              >
                <span v-if="loading && action === 'join'" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                Join
              </button>
            </div>
          </div>

          <div class="card-create">
            <div class="or-divider"><span>or</span></div>

            <!-- "Use template": the frame the new room starts with -->
            <div v-if="startTemplate" class="start-template">
              <div class="start-template-thumb">
                <StorageImage :src="startTemplate.cardUrl" :path="startTemplate.thumbnailPath" :alt="startTemplate.name" priority />
              </div>
              <div class="flex-grow-1 min-w-0">
                <p class="start-template-label">Your room will use</p>
                <p class="start-template-name text-truncate" :title="startTemplate.name">{{ startTemplate.name }}</p>
              </div>
              <button type="button" class="start-template-remove" aria-label="Don't use this template" @click="dropStartTemplate">
                <AppIcon name="close" :size="16" />
              </button>
            </div>
            <p v-else-if="startTemplateMissing" class="start-template-missing">
              That template isn't available any more, so the room will start with the default frame.
            </p>

            <!-- Code typed: Create steps back to a small outline button, so Join is clearly the one to press -->
            <button
              class="btn btn-create"
              :class="codeComplete ? 'btn-outline-primary create-quiet' : 'btn-primary btn-lg w-100'"
              :disabled="loading"
              @click="createRoom"
            >
              <span v-if="loading && action === 'create'" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <AppIcon v-else name="plus" :size="18" />
              Create a new room
            </button>
            <p class="card-sub text-center mt-2 mb-0">
              You'll be the host and get a code to share. Up to {{ MAX_PEOPLE }} people per room.
            </p>
          </div>

          <div v-if="errorMessage" class="room-error" role="alert">{{ errorMessage }}</div>
        </div>
      </div>
    </section>

    <!-- FEATURES: 1 column on phones, 3 from md (768px) up -->
    <section id="how-it-works" class="features">
      <p class="eyebrow">How it works</p>
      <div class="row g-3">
        <div v-for="feature in FEATURES" :key="feature.title" class="col-12 col-md-4 feature-col">
          <div class="feature-card glass">
            <span class="feature-icon"><AppIcon :name="feature.icon" :size="20" /></span>
            <div>
              <h2 class="feature-title">{{ feature.title }}</h2>
              <p class="feature-text">{{ feature.text }}</p>
              <router-link v-if="feature.link" :to="feature.link" class="feature-link">
                Browse the <span class="text-nowrap">marketplace <AppIcon name="arrow-right" :size="14" /></span>
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Colours and font from the Figma landing page design */
.landing {
  --brand: #2F5BEA;
  --brand-dark: #2449C4;
  --brand-tint: #E8EEFF;
  --ink: #14172B;
  --muted: #6B7080;
  --line: #E3E6EE;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  color: var(--ink);
}

/* Tropical beach photo behind the whole screen (fixed, so it stays put while the page scrolls),
   with a soft white wash on top so the text stays easy to read */
.landing::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.55)),
    url('/images/beautiful-tropical-beach-sea-ocean-with-white-cloud-blue-sky-copyspace.jpg') center / cover no-repeat;
}

/* Bootstrap buttons in the brand blue (Bootstrap 5.3 reads these variables), with rounder corners */
.landing .btn {
  border-radius: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 160ms var(--ease-out), color 150ms ease, background-color 150ms ease,
    border-color 150ms ease, box-shadow 150ms ease;
}

.landing .btn-primary {
  --bs-btn-bg: var(--brand);
  --bs-btn-border-color: var(--brand);
  --bs-btn-hover-bg: var(--brand-dark);
  --bs-btn-hover-border-color: var(--brand-dark);
  --bs-btn-active-bg: var(--brand-dark);
  --bs-btn-active-border-color: var(--brand-dark);
  --bs-btn-disabled-bg: var(--brand);
  --bs-btn-disabled-border-color: var(--brand);
}

.landing .btn-outline-primary {
  --bs-btn-color: var(--brand);
  --bs-btn-border-color: var(--brand);
  --bs-btn-hover-bg: var(--brand);
  --bs-btn-hover-border-color: var(--brand);
  --bs-btn-active-bg: var(--brand-dark);
  --bs-btn-active-border-color: var(--brand-dark);
  --bs-btn-disabled-color: var(--brand);
  --bs-btn-disabled-border-color: var(--brand);
}

/* White button with a thin border, for the less important action */
.landing .btn-soft {
  --bs-btn-bg: #ffffff;
  --bs-btn-border-color: var(--line);
  --bs-btn-hover-bg: #F4F5F9;
  --bs-btn-hover-border-color: var(--line);
  --bs-btn-active-bg: #EEF0F6;
  --bs-btn-active-border-color: var(--line);
  color: var(--ink);
}

/* Shrinks a little when pressed, so you can feel it was clicked */
.landing .btn:active:not(:disabled) {
  transform: scale(0.97);
}

/* ---------- HERO LAYOUT ----------
   One grid, its parts placed by name (grid-template-areas) for each screen shape.
   Phones: the room card first, so it is on screen straight away, then the intro, then the photostrip. */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'card'
    'intro'
    'strip';
  align-items: center;
  gap: 40px;
  padding-top: 8px;
  margin-bottom: 64px;
}

.hero-intro {
  grid-area: intro;
}

.room-col {
  grid-area: card;
}

.strip-scene {
  grid-area: strip;
}

/* Tablets held upright, and phones held sideways (too short for the card on top of the intro):
   a wide card across the top, then the intro with the photostrip next to it */
@media (min-width: 768px) and (max-width: 991.98px) and (min-height: 501px),
  (max-width: 991.98px) and (orientation: landscape) and (max-height: 500px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) 14rem;
    grid-template-areas:
      'card card'
      'intro strip';
    gap: 32px 40px;
    padding-top: 24px;
  }
}

/* lg: intro | room card | a narrow photostrip */
@media (min-width: 992px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) 22rem 9rem;
    grid-template-areas: 'intro card strip';
    gap: 36px;
    padding-top: 32px;
    margin-bottom: 96px;
  }
}

/* xl: intro | room card | photostrip, all full size */
@media (min-width: 1200px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) 25rem minmax(0, 0.55fr);
    gap: 48px;
  }
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  margin-bottom: 20px;
  border-radius: 999px;
  color: #D6336C;
  background: #FDE7EE;
  font-size: 0.85rem;
  font-weight: 600;
}

/* clamp(smallest, grows with the screen width, biggest) */
.hero-title {
  margin-bottom: 20px;
  font-size: clamp(2.4rem, 1.2rem + 4.2vw, 4.4rem);
  text-wrap: balance; /* lines of similar length, no single word left on the last line */
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -0.035em;
}

/* lg / xl: the intro shares the row, so the headline is a little smaller */
@media (min-width: 992px) {
  .hero-title {
    font-size: clamp(2.6rem, 0.4rem + 3.2vw, 4rem);
  }
}

.hero-lead {
  max-width: 34rem;
  margin-bottom: 28px;
  color: var(--muted);
  font-size: clamp(1.05rem, 0.95rem + 0.4vw, 1.25rem);
  line-height: 1.6;
  text-wrap: pretty;
}

/* ---------- ROOM CARD ---------- */
/* The "Room was closed" alert sits in the same column, so it is always as wide as the card */

/* Laptops with short screens: a tighter card, so all of it fits under the navbar */
@media (min-width: 992px) and (max-height: 760px) {
  .hero {
    padding-top: 16px;
  }

  .room-card {
    padding: 20px 24px;
  }

  .name-input {
    margin-bottom: 16px;
  }

  .or-divider {
    margin: 16px 0 12px;
  }
}

/* Liquid glass: see-through white that blurs the beach behind it, a bright rim along the top edge
   and a soft shadow underneath. Shared by the room card and the feature cards. */
.glass {
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.38));
  -webkit-backdrop-filter: blur(20px) saturate(170%);
  backdrop-filter: blur(20px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -1px 0 rgba(255, 255, 255, 0.25),
    0 12px 32px rgba(20, 23, 43, 0.1);
}

/* Browsers without backdrop blur get a more solid card so the text stays readable */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass {
    background: rgba(255, 255, 255, 0.9);
  }
}

.room-card {
  padding: 20px;
  border-radius: 20px;
}

@media (min-width: 576px) {
  .room-card {
    padding: 28px;
  }
}

.field-label {
  margin-bottom: 6px;
  font-size: 0.85rem;
  font-weight: 600;
}

/* font-size 16px: smaller makes iPhones zoom in when the box is tapped */
.name-input {
  margin-bottom: 24px;
  padding: 10px 14px;
  border-color: var(--line);
  border-radius: 12px;
  font-size: 16px;
}

.name-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 4px rgba(47, 91, 234, 0.15);
}

/* No name typed: red and shaking, the same as the code boxes (code-shake is further down) */
.name-input.invalid {
  border-color: #EF4444;
  background: #FEF3F2;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
  animation: code-shake 360ms var(--ease-out);
}

.card-heading {
  margin-bottom: 2px;
  font-size: 1.1rem;
  font-weight: 700;
}

.card-sub {
  margin-bottom: 14px;
  color: var(--muted);
  font-size: 0.875rem;
}

/* The 4 boxes. The real input covers them all, so a tap anywhere on them types into it.
   They share the row with Join (flex: 1), so there is never an empty gap between them and the button. */
.code-boxes {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  min-width: 0;
}

.code-input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  font-size: 16px; /* stops iPhones zooming in */
  cursor: text;
}


.code-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: 0;
  max-width: 72px;
  height: clamp(52px, 14vw, 62px);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  background: #F7F8FB;
  font-size: 1.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
}

.code-box.filled {
  background: #ffffff;
  border-color: #C9CEDB;
}

/* The box the next digit goes into */
.code-box.active {
  border-color: var(--brand);
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(47, 91, 234, 0.15);
}

/* A letter was typed: the boxes turn red and shake side to side, like a "no" head shake */
.code-boxes.invalid {
  animation: code-shake 360ms var(--ease-out);
}

.code-boxes.invalid .code-box {
  border-color: #EF4444;
  background: #FEF3F2;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
}

@keyframes code-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}

@keyframes code-flash {
  to { opacity: 1; }
}

.btn-join {
  flex-shrink: 0;
  min-width: 84px;
  height: clamp(52px, 14vw, 62px);
  padding: 0 clamp(14px, 4vw, 24px);
}

/* Full code: Join gets bigger text (filled in by the class in the template) */
.btn-join.join-ready {
  font-size: 1.15rem;
}

/* Full code: Create shrinks to a normal-size button in the middle (instead of full width) */
.btn-create.create-quiet {
  display: flex;
  width: fit-content;
  margin: 0 auto;
}

/* "Your room will use ...": the template from "Use template", above the Create button */
.start-template {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 8px 8px 8px 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--brand-tint);
}

.start-template-thumb {
  width: 40px;
  height: 56px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
  background: #ffffff;
}

.min-w-0 {
  min-width: 0;
}

.start-template-label {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.start-template-name {
  margin: 0;
  font-weight: 700;
}

.start-template-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 0;
  border-radius: 10px;
  color: var(--muted);
  background: transparent;
}

.start-template-remove:hover {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.7);
}

.start-template-remove:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.start-template-missing {
  margin-bottom: 14px;
  color: var(--muted);
  font-size: 0.85rem;
}

/* A line with "or" in the middle */
.or-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0 16px;
  color: var(--muted);
  font-size: 0.8rem;
}

.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}

.room-error {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 12px;
  color: #B42318;
  background: #FEF3F2;
  font-size: 0.875rem;
}

/* Wide card (tablets held upright, phones held sideways): the name and the code side by side,
   Create across the bottom. align-items: end lines the name box up with the code boxes. */
@media (min-width: 768px) and (max-width: 991.98px) and (min-height: 501px),
  (max-width: 991.98px) and (orientation: landscape) and (max-height: 500px) {
  .room-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: end;
    gap: 0 32px;
  }

  .card-create,
  .room-error {
    grid-column: 1 / -1;
  }

  .name-input {
    height: clamp(52px, 14vw, 62px);
    margin-bottom: 0;
  }

  .btn-create:not(.create-quiet) {
    max-width: 24rem;
    margin: 0 auto;
    display: flex;
  }
}

/* Phones held sideways: the screen is short, so the card is a little tighter.
   (max-width too: a short desktop window is also landscape and short, but has room for the normal card) */
@media (max-width: 991.98px) and (orientation: landscape) and (max-height: 500px) {
  .room-card {
    gap: 0 20px;
    padding: 16px 20px;
  }

  .or-divider {
    margin: 14px 0 10px;
  }
}

/* ---------- PHOTOSTRIP PICTURE ----------
   Shown on every screen. Below xl it is smaller (a narrow column or under the intro).
   On phones it is centred under the intro. */
.strip-scene {
  position: relative;
  width: 100%;
  min-width: 0;
  padding: 24px 0;
}

@media (max-width: 1199.98px) {
  .strip-stage {
    height: 320px;
  }
}

@media (max-width: 767.98px) and (orientation: portrait) {
  .strip-scene {
    width: 15rem;
    justify-self: center;
    padding-top: 0;
  }
}

/* Every template fits inside this box (as big as it can, keeping its shape), so the page never jumps.
   container-type: size lets .strip measure the box with cqw / cqh (1cqw = 1% of the box's width). */
.strip-stage {
  display: grid;
  place-items: center;
  width: 100%;
  /* never taller than the window (minus the navbar), so a short laptop window does not cut it off */
  height: min(clamp(380px, 31vw, 460px), max(240px, 100svh - 140px));
  container-type: size;
}

/* The strip: as wide as the box allows, or as tall, whichever comes first (--aspect = width / height).
   grid-area 1 / 1: while changing, the old and new strips sit in the same spot, on top of each other.
   It slides up and tilts into place each time a new one appears. */
.strip {
  grid-area: 1 / 1;
  position: relative;
  width: min(100cqw, 100cqh * var(--aspect));
  aspect-ratio: var(--aspect);
  border-radius: 6px;
  box-shadow: 0 24px 48px rgba(20, 23, 43, 0.16);
  transform: rotate(var(--tilt));
  animation: strip-in 700ms var(--ease-out) backwards;
  transition: transform 300ms var(--ease-out);
}

/* Mouse over it: it straightens a little (only with a mouse, phones have no hover) */
@media (hover: hover) and (pointer: fine) {
  .strip:hover {
    transform: rotate(calc(var(--tilt) / 2)) translateY(-4px);
  }
}

@keyframes strip-in {
  from {
    opacity: 0;
    transform: rotate(0deg) translateY(24px);
  }
}

/* The old strip: fades out and lifts away while the new one slides in */
.strip-swap-leave-active {
  transition: opacity 400ms ease, transform 400ms var(--ease-out);
}

.strip-swap-leave-to {
  opacity: 0;
  transform: rotate(var(--tilt)) translateY(-16px) scale(0.97);
}

/* object-fit: cover fills the slot without stretching (the edges are cut off instead) */
.strip-photo {
  position: absolute;
  object-fit: cover;
}

/* The frame on top of the photos; its see-through holes show the photos underneath */
.strip-template {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 6px;
}

/* ---------- FEATURES ---------- */
/* scroll-margin-top: the "How it works" link stops a little above the section, not right on its edge */
.features {
  margin-bottom: 48px;
  scroll-margin-top: 24px;
}

.eyebrow {
  margin-bottom: 12px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Each column is a container, so the card can change layout depending on its own width (@container below) */
.feature-col {
  container-type: inline-size;
}

.feature-card {
  display: flex;
  gap: 16px;
  height: 100%;
  padding: 20px;
  border-radius: 20px;
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: var(--brand);
  background: var(--brand-tint);
}

.feature-title {
  margin-bottom: 4px;
  font-size: 1.05rem;
  font-weight: 700;
}

.feature-text {
  margin-bottom: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

/* text-nowrap in the template keeps the arrow on the same line as the last word */
.feature-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--brand);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}

.feature-link:hover {
  text-decoration: underline;
}

/* Narrow cards (3 across on a tablet): icon above the text, so the text gets the full width */
@container (max-width: 320px) {
  .feature-card {
    flex-direction: column;
    gap: 12px;
  }
}

/* Reduced motion: the strip just appears, nothing slides or tilts */
@media (prefers-reduced-motion: reduce) {
  .strip {
    animation: none;
  }

  .strip:hover {
    transform: rotate(var(--tilt));
  }

  /* The strips still change, but just fade */
  .strip-swap-leave-to {
    transform: rotate(var(--tilt));
  }

  .landing .btn:active:not(:disabled) {
    transform: none;
  }

  /* No shaking, the boxes just flash red. (Still an animation, so "animationend" turns the red off again.) */
  .code-boxes.invalid,
  .name-input.invalid {
    animation-name: code-flash;
  }
}
</style>
