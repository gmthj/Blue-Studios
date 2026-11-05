<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getGuestName, saveGuestName } from '../guest.js'
import { getUid, useAuth } from '../composables/useAuth.js'
import { isRoomFull, isActive, MAX_PEOPLE } from '../room.js'
import { recentRooms, forgetRoom } from '../recentRooms.js'
import { LAYOUTS } from '../stripData.js'
import { getItem } from '../marketplace.js'
import { qrWithLogo } from '../utils/qrWithLogo.js'
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

// It pops up at the bottom as a small toast and goes away by itself after a few seconds
const showClosedToast = ref(!!closedCode)
let closedToastTimer = null
onMounted(() => {
  if (showClosedToast.value) closedToastTimer = setTimeout(hideClosedToast, 4000)
})

// The cross on the toast, or after 4 seconds
function hideClosedToast() {
  clearTimeout(closedToastTimer)
  showClosedToast.value = false
}

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

// Step 2's picture: the countdown runs 3, 2, 1, then 0 = the flash, once a second.
// Reduced motion: it just stays on 3.
const demoCount = ref(3)
let countTimer = null

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

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    countTimer = setInterval(() => {
      demoCount.value = demoCount.value === 0 ? 3 : demoCount.value - 1
    }, 1000)
  }
})

onUnmounted(() => {
  clearInterval(stripTimer)
  clearInterval(countTimer)
  clearTimeout(closedToastTimer)
})

// ---------- BELOW THE HERO: how it works, the studio, and a last "start a room" ----------

// Step 3's picture: one real strip (the navy 4-cut) filled with the landing photos
const DEMO_STRIP = (() => {
  const layout = LAYOUTS.find((item) => item.id === 'retro-4-cut')
  return {
    src: landingSrc('templates', 'retro-4-cut-navy.png'),
    aspect: layout.aspect,
    photos: layout.slots.map((slot, i) => ({ src: landingSrc('pictures', STRIP_PICTURES[(i + 1) % STRIP_PICTURES.length]), slot })),
  }
})()

// Step 2's picture: four friends' cameras, each on their own device
const DEMO_TILES = [
  { src: landingSrc('pictures', 'cew2.jpg'), name: 'Rae', device: 'phone' },
  { src: landingSrc('pictures', 'sjh1.jpg'), name: 'Joash', device: 'laptop' },
  { src: landingSrc('pictures', 'kjs1.jpg'), name: 'Cha', device: 'phone' },
  { src: landingSrc('pictures', 'cew3.jpg'), name: 'You', device: 'laptop' },
]

// A real QR code of this site (steps 1 and 4). Drawn once, when the page opens.
const siteQr = ref('')
onMounted(async () => {
  try {
    siteQr.value = await qrWithLogo(window.location.origin, 240)
  } catch (error) {
    console.error(error) // just no QR picture
  }
})

// Sections fade up when they scroll into view (once). Without IntersectionObserver, or with reduced
// motion, they are simply there: the hidden state only applies once .reveal-on is on the page.
const revealOn = ref(false)
let revealObserver = null
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('shown')
          revealObserver.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '0px 0px -80px 0px' }
  )
  for (const el of document.querySelectorAll('.landing .reveal')) {
    revealObserver.observe(el)
  }
  revealOn.value = true
})
onUnmounted(() => {
  if (revealObserver) revealObserver.disconnect()
})

// "Start a room" at the bottom: back up to the room card, ready to type a name (or create straight away)
function scrollToStart() {
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  if (nameInput.value) nameInput.value.focus({ preventScroll: true })
}

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
      lastActive: Date.now(), // when someone last left; used by the daily room cleanup (api/cleanup.js)
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

// ---------- GO BACK INTO A ROOM ----------
// Rooms this device was in during the last day (recentRooms.js) that are still open: each one gets a card
// above the room card, "Go back into room 4821?", with Rejoin and Not now. Closed or deleted rooms are forgotten.
const rejoinable = ref([]) // [{ code, people }], newest first

// Is this room still open? Returns its details, or null (and forgets it) if it is closed or gone
async function checkRoom(item) {
  if (item.code === closedCode) {
    forgetRoom(item.code)
    return null
  }
  try {
    const roomSnap = await getDoc(doc(db, 'rooms', item.code))
    if (!roomSnap.exists() || roomSnap.data().closed) {
      forgetRoom(item.code)
      return null
    }
    // Who is in it now (not counting me: I may still show for a few seconds after leaving)
    const members = await getDocs(collection(db, 'rooms', item.code, 'members'))
    const now = Date.now()
    let people = 0
    members.forEach((member) => {
      if (member.id !== getUid() && isActive(member.data(), now)) people = people + 1
    })
    return { code: item.code, people: people }
  } catch (error) {
    console.warn('Could not check room ' + item.code + ':', error)
    return null
  }
}

async function checkRecentRooms() {
  const checked = await Promise.all(recentRooms().slice(0, 3).map(checkRoom))
  rejoinable.value = checked.filter(Boolean)
}
onMounted(checkRecentRooms)

// The beach behind the whole page is drawn on <body> (class beach-page, see the unscoped styles at the end),
// so it scrolls with the page and covers it from the very top (behind the nav) to the very bottom.
onMounted(() => document.body.classList.add('beach-page'))
onUnmounted(() => document.body.classList.remove('beach-page'))

// Rejoin: the same as typing the code and pressing Join (so the name, closed and full checks all run),
// and the code boxes fill in, so it is clear what happened
function rejoinRoom(code) {
  joinCode.value = code
  joinRoom()
}

// "Not now": take it off this device's list, so the card goes away
function forgetRejoin(code) {
  forgetRoom(code)
  rejoinable.value = rejoinable.value.filter((item) => item.code !== code)
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
    <!-- The waves on the beach background: the water and foam as their own layer, washing up the sand and back
         (styles at the end). On <body>, so it lines up with the background picture drawn there. -->
    <Teleport to="body">
      <div class="beach-waves" aria-hidden="true"><div class="beach-wave"></div></div>
    </Teleport>

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
        <!-- "Room 4821 was closed.": a toast at the bottom that goes away by itself -->
        <Teleport to="body">
          <Transition name="closed-toast">
            <div v-if="showClosedToast" class="closed-toast" role="status">
              <span>Room {{ closedCode }} was closed.</span>
              <button type="button" class="closed-toast-close" aria-label="Close" title="Close" @click="hideClosedToast">
                <AppIcon name="close" :size="14" />
              </button>
            </div>
          </Transition>
        </Teleport>

        <!-- Rooms this device was in that are still open: a card for each, laid out like the app's popups
             (icon tile, question, then Not now / Rejoin), in the home page's glass style -->
        <TransitionGroup name="rejoin" tag="div">
          <section
            v-for="item in rejoinable"
            :key="item.code"
            class="rejoin-card glass"
            :aria-labelledby="'rejoin-title-' + item.code"
            :data-test="'rejoin-' + item.code"
          >
            <div class="rejoin-head">
              <span class="rejoin-icon" aria-hidden="true"><AppIcon name="users" :size="20" /></span>
              <div class="rejoin-text">
                <h2 :id="'rejoin-title-' + item.code" class="rejoin-title">Go back into room {{ item.code }}?</h2>
                <p class="rejoin-meta">{{ item.people }}/{{ MAX_PEOPLE }} in the room</p>
              </div>
            </div>
            <div class="rejoin-actions">
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="forgetRejoin(item.code)">Not now</button>
              <button
                type="button"
                class="btn btn-primary btn-sm rejoin-btn"
                :disabled="loading"
                @click="rejoinRoom(item.code)"
              >
                <span v-if="loading && action === 'join' && joinCode === item.code" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                Rejoin room {{ item.code }}
              </button>
            </div>
          </section>
        </TransitionGroup>

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
              <button type="button" class="start-template-remove" aria-label="Don't use this frame" @click="dropStartTemplate">
                <AppIcon name="close" :size="16" />
              </button>
            </div>
            <p v-else-if="startTemplateMissing" class="start-template-missing">
              That frame isn't available any more, so the room will start with the default frame.
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

    <!-- HOW IT WORKS: 4 steps, each with a small picture made from the app's own pieces.
         Phones: one column. md (768px) and up: the picture and the words side by side, swapping sides each step. -->
    <section id="how-it-works" class="how" :class="{ 'reveal-on': revealOn }">
      <div class="section-head reveal">
        <p class="eyebrow">How it works</p>
        <h2 class="section-title">Get your photostrip in four steps</h2>
      </div>

      <ol class="steps">
        <!-- 1. Start a room -->
        <li class="step reveal">
          <div class="step-visual glass">
            <div class="v-room">
              <div class="v-phone">
                <span class="v-label">Room</span>
                <div class="v-code">
                  <span v-for="digit in ['4', '8', '2', '1']" :key="digit">{{ digit }}</span>
                </div>
                <span class="v-pill"><AppIcon name="users" :size="12" /> 4 of {{ MAX_PEOPLE }} here</span>
              </div>
              <div class="v-qr">
                <img v-if="siteQr" :src="siteQr" alt="" />
                <span>Scan to join</span>
              </div>
            </div>
          </div>
          <div class="step-text">
            <span class="step-num">1</span>
            <h3 class="step-title">Start a room, share the code</h3>
            <p class="step-body">Type your name and create a room. Friends join with the 4-digit code or by scanning the QR code, up to {{ MAX_PEOPLE }} people, no account needed.</p>
          </div>
        </li>

        <!-- 2. Shoot together -->
        <li class="step reveal">
          <div class="step-visual glass">
            <div class="v-shoot">
              <div v-for="tile in DEMO_TILES" :key="tile.name" class="v-tile">
                <img :src="tile.src" alt="" loading="lazy" />
                <span class="v-tile-name"><AppIcon :name="tile.device === 'phone' ? 'camera' : 'laptop'" :size="11" /> {{ tile.name }}</span>
              </div>
              <!-- 3, 2, 1, then a flash (the photo is taken), and again. :key restarts the beat on every number. -->
              <span v-if="demoCount > 0" :key="demoCount" class="v-count" aria-hidden="true">{{ demoCount }}</span>
              <span v-else key="flash" class="v-flash" aria-hidden="true"></span>
            </div>
          </div>
          <div class="step-text">
            <span class="step-num">2</span>
            <h3 class="step-title">Shoot on one countdown</h3>
            <p class="step-body">Anyone presses the shutter and a 3-2-1 runs on every screen at once, so everyone's camera snaps (or records a clip) at the same moment. Add face filters, or put friends into one camera with Virtual Friends.</p>
          </div>
        </li>

        <!-- 3. Make the strip together -->
        <li class="step reveal">
          <div class="step-visual glass">
            <div class="v-make">
              <div class="v-strip" :style="{ '--aspect': DEMO_STRIP.aspect }">
                <img
                  v-for="(photo, i) in DEMO_STRIP.photos"
                  :key="i"
                  :src="photo.src"
                  class="v-strip-photo"
                  :style="{ left: photo.slot.x - 1 + '%', top: photo.slot.y - 1 + '%', width: photo.slot.w + 2 + '%', height: photo.slot.h + 2 + '%' }"
                  alt=""
                  loading="lazy"
                />
                <img :src="DEMO_STRIP.src" class="v-strip-frame" alt="" loading="lazy" />
                <span class="v-sticker s1" aria-hidden="true">💖</span>
                <span class="v-sticker s2" aria-hidden="true">✨</span>
                <span class="v-sticker s3" aria-hidden="true">🌸</span>
              </div>
              <span class="v-cursor c1" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2 1l11 6-5 1.5L6 14z" /></svg><span class="v-cursor-name">Rae</span></span>
              <span class="v-cursor c2" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2 1l11 6-5 1.5L6 14z" /></svg><span class="v-cursor-name">Joash</span></span>
            </div>
          </div>
          <div class="step-text">
            <span class="step-num">3</span>
            <h3 class="step-title">Make the strip together</h3>
            <p class="step-body">Everyone picks the photos, the frame and the stickers on the same strip, live. Cut the clips into a video, then mix a soundtrack for it.</p>
          </div>
        </li>

        <!-- 4. Export and share -->
        <li class="step reveal">
          <div class="step-visual glass">
            <div class="v-share">
              <div class="v-formats">
                <span class="v-format">PNG</span>
                <span class="v-format on">MP4</span>
              </div>
              <div class="v-share-card">
                <img v-if="siteQr" :src="siteQr" alt="" class="v-share-qr" />
                <div class="v-share-side">
                  <span class="v-link">/s/k3j9x0q7</span>
                  <span class="v-download"><AppIcon name="download" :size="14" /> Downloaded</span>
                  <span class="v-saved"><AppIcon name="check" :size="14" /> Saved to My Studio</span>
                </div>
              </div>
            </div>
          </div>
          <div class="step-text">
            <span class="step-num">4</span>
            <h3 class="step-title">Export and share</h3>
            <p class="step-body">A PNG, or an MP4 when there's video, music or a moving sticker. It downloads on everyone's device, with a link and a QR code to pass on, and goes into My Studio if you have an account.</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- THE STUDIO: the tools beyond the photobooth, as a grid of cards with a small picture each.
         Phones: one column. sm: 2. lg: 3, where Frame maker, Video strip and Marketplace are twice as wide,
         so the 6 cards fill 3 full rows. -->
    <section class="studio" :class="{ 'reveal-on': revealOn }">
      <div class="section-head reveal">
        <p class="eyebrow">More than a photobooth</p>
        <h2 class="section-title">Your own little studio</h2>
        <p class="section-lead">Make the pieces once, use them in every room.</p>
      </div>

      <div class="bento">
        <article class="tile glass tile-wide reveal">
          <div class="tile-art art-frames" aria-hidden="true">
            <span class="fr fr-a"><i></i><i></i><i></i><i></i></span>
            <span class="fr fr-b"><i></i><i></i><i></i></span>
            <span class="fr fr-c"><i></i><i></i><i></i><i></i></span>
          </div>
          <h3 class="tile-title"><AppIcon name="layout" :size="18" /> Frame maker</h3>
          <p class="tile-text">Drag photo slots, shapes, tape and text onto a strip, or start from a template preset.</p>
        </article>

        <article class="tile glass reveal">
          <div class="tile-art art-stickers" aria-hidden="true">
            <span>🐻</span><span>🍓</span><span>⭐</span>
          </div>
          <h3 class="tile-title"><AppIcon name="sparkle" :size="18" /> Sticker maker</h3>
          <p class="tile-text">Cut out a photo, draw, add text, even animate it.</p>
        </article>

        <article class="tile glass reveal">
          <div class="tile-art art-wave" aria-hidden="true">
            <span v-for="n in 18" :key="n" :style="{ '--h': [30, 55, 80, 45, 95, 60, 35, 70, 100, 50, 75, 40, 85, 55, 30, 65, 45, 25][n - 1] + '%' }"></span>
          </div>
          <h3 class="tile-title"><AppIcon name="music" :size="18" /> Music mixer</h3>
          <p class="tile-text">Layer beats and loops into a soundtrack for your MP4.</p>
        </article>

        <article class="tile glass tile-wide reveal">
          <div class="tile-art art-film" aria-hidden="true">
            <span v-for="n in 4" :key="n" class="film-cell"></span>
            <span class="film-play"><AppIcon name="play-fill" :size="16" /></span>
          </div>
          <h3 class="tile-title"><AppIcon name="scissors" :size="18" /> Video strip</h3>
          <p class="tile-text">Trim everyone's clips into one video that plays inside the frame.</p>
        </article>

        <article class="tile glass reveal">
          <div class="tile-art art-friends" aria-hidden="true">
            <img v-for="file in ['cew1.jpg', 'kjs1.jpg', 'sjh1.jpg']" :key="file" :src="landingSrc('pictures', file)" alt="" loading="lazy" />
          </div>
          <h3 class="tile-title"><AppIcon name="users" :size="18" /> Virtual Friends</h3>
          <p class="tile-text">Apart? The host puts everyone into one camera, so you stand together.</p>
        </article>

        <article class="tile glass tile-wide reveal">
          <div class="tile-art art-market" aria-hidden="true">
            <span class="mk mk-1"></span><span class="mk mk-2"></span><span class="mk mk-3"></span>
          </div>
          <h3 class="tile-title"><AppIcon name="shop" :size="18" /> Marketplace</h3>
          <p class="tile-text">Share your frames and stickers, and save other people's.</p>
          <router-link to="/marketplace" class="feature-link">
            Browse the <span class="text-nowrap">marketplace <AppIcon name="arrow-right" :size="14" /></span>
          </router-link>
        </article>
      </div>
    </section>

    <!-- LAST CALL: back up to the room card -->
    <section class="cta reveal" :class="{ 'reveal-on': revealOn }">
      <div class="cta-card">
        <div>
          <h2 class="cta-title">Ready when your friends are</h2>
          <p class="cta-text">Free, in the browser, on any phone or laptop.</p>
        </div>
        <button type="button" class="btn btn-light btn-lg cta-btn" @click="scrollToStart">
          <AppIcon name="camera" :size="18" /> Start a room
        </button>
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
  color: var(--ink); /* black, not grey: easy to read over the sea */
  font-size: clamp(1.05rem, 0.95rem + 0.4vw, 1.25rem);
  font-weight: 500; /* medium, so the thin strokes don't get lost in the waves */
  line-height: 1.6;
  /* A soft white glow behind the letters lifts them off the photo, with no visible box */
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.9), 0 0 4px rgba(255, 255, 255, 0.8);
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

/* ---------- REJOIN: rooms this device was in that are still open ---------- */
/* Laid out like the app's popups (AppDialog.vue): icon tile and question, buttons on the right below */
.rejoin-card {
  margin-bottom: 12px;
  padding: 18px 20px;
  border-radius: 20px;
  transition: opacity 350ms var(--ease-out), transform 350ms var(--ease-out);
}

/* Slides in gently when the rooms have been checked */
@starting-style {
  .rejoin-card {
    opacity: 0;
    transform: translateY(8px);
  }
}

/* "Not now": fades and shrinks away */
.rejoin-leave-active {
  transition: opacity 200ms ease, transform 200ms var(--ease-out);
}

.rejoin-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

.rejoin-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

/* The soft blue icon tile, the same as the popups' */
.rejoin-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  color: var(--brand);
  background: var(--brand-tint);
}

.rejoin-text {
  min-width: 0;
}

.rejoin-title {
  margin: 0;
  padding-top: 2px;
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.rejoin-meta {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

.rejoin-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.rejoin-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Narrow phones: full-width buttons, Rejoin on top (like the popups) */
@media (max-width: 400px) {
  .rejoin-actions {
    flex-direction: column-reverse;
  }

  .rejoin-btn {
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rejoin-card,
  .rejoin-leave-active {
    transition: none;
  }
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
  border-color: var(--danger, #E5484D);
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
  color: var(--ink); /* black, not grey: easy to read over the sea */
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
  border-color: var(--danger, #E5484D);
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

@media (hover: hover) and (pointer: fine) {
  .start-template-remove:hover {
    color: var(--ink);
    background: rgba(255, 255, 255, 0.7);
  }
}

.start-template-remove:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.start-template-missing {
  margin-bottom: 14px;
  color: var(--ink); /* black, not grey: easy to read over the sea */
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

/* ---------- SECTIONS BELOW THE HERO ---------- */
.how,
.studio,
.cta {
  margin-bottom: 72px;
}

/* scroll-margin-top: the "How it works" link stops a little above the section, not right on its edge */
.how {
  margin-top: 24px;
  scroll-margin-top: 24px;
}

.section-head {
  max-width: 620px;
  margin: 0 auto 32px;
  text-align: center;
}

.eyebrow {
  display: inline-block;
  margin-bottom: 10px;
  padding: 4px 12px;
  border-radius: 999px;
  color: var(--brand);
  background: var(--brand-tint);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-title {
  /* block, not the flex row from styles/pages.css (made for a title + count pill): in a flex row the text sits
     on the left and the section head's text-align: center does nothing */
  display: block;
  margin-bottom: 10px;
  font-size: clamp(1.6rem, 1.1rem + 2vw, 2.4rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
  text-wrap: balance;
}

.section-lead {
  margin: 0;
  color: var(--ink); /* black, not grey: easy to read over the sea */
  font-size: 1rem;
  text-wrap: pretty;
}

/* Fade up into view (only once the page has turned it on, see revealOn in the script) */
.reveal-on .reveal,
.reveal-on.reveal {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 600ms var(--ease-out), transform 600ms var(--ease-out);
}

.reveal-on .reveal.shown,
.reveal-on.reveal.shown {
  opacity: 1;
  transform: none;
}

/* ---------- HOW IT WORKS: the steps ---------- */
.steps {
  display: flex;
  flex-direction: column;
  gap: 40px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  gap: 20px;
  align-items: center;
}

/* md and up: picture and words side by side, the picture swapping sides each step */
@media (min-width: 768px) {
  .steps {
    gap: 56px;
  }

  .step {
    grid-template-columns: 1.1fr 1fr;
    gap: 48px;
  }

  .step:nth-child(even) .step-visual {
    order: 2;
  }
}

.step-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: 24px;
  overflow: hidden;
  border-radius: 28px;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 12px;
  border-radius: 12px;
  color: #ffffff;
  background: var(--brand);
  box-shadow: 0 6px 16px rgba(47, 91, 234, 0.35);
  font-weight: 800;
}

.step-title {
  margin-bottom: 8px;
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.step-body {
  margin: 0;
  max-width: 46ch;
  color: var(--ink); /* black, not grey: easy to read over the sea */
  font-size: 0.98rem;
  line-height: 1.6;
  text-wrap: pretty;
}

/* Step 1: the phone with the room code, and the QR code */
.v-room {
  display: flex;
  align-items: center;
  gap: 20px;
}

.v-phone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 190px;
  padding: 22px 16px;
  border: 6px solid var(--ink);
  border-radius: 30px;
  background: #ffffff;
  box-shadow: 0 16px 32px rgba(20, 23, 43, 0.18);
  transform: rotate(-4deg);
}

.v-label {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.v-code {
  display: flex;
  gap: 6px;
}

.v-code span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 40px;
  border: 1.5px solid var(--brand);
  border-radius: 9px;
  color: var(--brand);
  background: var(--brand-tint);
  font-size: 1.2rem;
  font-weight: 800;
}

.v-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  color: #15803D;
  background: #DCFCE7;
  font-size: 0.72rem;
  font-weight: 700;
}

.v-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(20, 23, 43, 0.14);
  transform: rotate(5deg);
}

.v-qr img {
  width: 104px;
  height: 104px;
}

.v-qr span {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
}

/* Step 2: four cameras and a big 3 */
.v-shoot {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  width: min(100%, 360px);
}

.v-tile {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 14px;
  background: #0E1020;
}

.v-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.v-tile-name {
  position: absolute;
  left: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  color: #ffffff;
  background: rgba(14, 16, 32, 0.6);
  font-size: 0.68rem;
  font-weight: 600;
}

.v-count {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  border: 4px solid #ffffff;
  border-radius: 50%;
  color: #ffffff;
  background: var(--brand);
  box-shadow: 0 0 0 8px rgba(47, 91, 234, 0.25), 0 12px 28px rgba(47, 91, 234, 0.45);
  font-size: 2.6rem;
  font-weight: 800;
  transform: translate(-50%, -50%);
  animation: count-beat 1s var(--ease-out) infinite;
}

/* The shutter going off: a white flash over the 4 cameras */
.v-flash {
  position: absolute;
  inset: -4px;
  border-radius: 14px;
  background: #ffffff;
  pointer-events: none;
  animation: demo-flash 700ms ease-out forwards;
}

@keyframes demo-flash {
  0% { opacity: 0.9; }
  100% { opacity: 0; }
}

@keyframes count-beat {
  0% { transform: translate(-50%, -50%) scale(1.12); }
  60%, 100% { transform: translate(-50%, -50%) scale(1); }
}

/* Step 3: a real strip, stickers, and friends' cursors */
.v-make {
  position: relative;
  padding: 8px 56px;
}

.v-strip {
  position: relative;
  width: 132px;
  aspect-ratio: var(--aspect);
  border-radius: 6px;
  box-shadow: 0 18px 36px rgba(20, 23, 43, 0.25);
  transform: rotate(-3deg);
}

.v-strip-photo,
.v-strip-frame {
  position: absolute;
  object-fit: cover;
}

.v-strip-frame {
  inset: 0;
  width: 100%;
  height: 100%;
}

.v-sticker {
  position: absolute;
  font-size: 1.7rem;
  filter: drop-shadow(0 2px 3px rgba(20, 23, 43, 0.25));
}

.v-sticker.s1 { top: 8%; right: -14px; transform: rotate(12deg); }
.v-sticker.s2 { top: 46%; left: -16px; }
.v-sticker.s3 { bottom: 6%; right: -10px; transform: rotate(-10deg); }

.v-cursor {
  position: absolute;
  display: inline-flex;
  align-items: flex-start;
  gap: 2px;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
}

.v-cursor svg {
  width: 16px;
  height: 16px;
}

.v-cursor.c1 { top: 22%; right: 0; animation: cursor-a 4s ease-in-out infinite; }
.v-cursor.c1 svg { fill: #E5484D; stroke: #fff; stroke-width: 1.2; }
.v-cursor.c2 { bottom: 18%; left: 0; animation: cursor-b 5s ease-in-out infinite; }
.v-cursor.c2 svg { fill: #12A594; stroke: #fff; stroke-width: 1.2; }

/* The name in a coloured tag just below and right of the arrow, like a shared cursor */
.v-cursor-name {
  margin-top: 12px;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--tag);
}

.v-cursor.c1 { --tag: #E5484D; }
.v-cursor.c2 { --tag: #12A594; }

@keyframes cursor-a {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-14px, 10px); }
}

@keyframes cursor-b {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(12px, -12px); }
}

/* Step 4: the formats and the share card */
.v-share {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.v-formats {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
}

.v-format {
  padding: 6px 16px;
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.v-format.on {
  color: #ffffff;
  background: var(--brand);
}

.v-share-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 16px 32px rgba(20, 23, 43, 0.16);
}

.v-share-qr {
  width: 96px;
  height: 96px;
}

.v-share-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.v-link {
  padding: 4px 10px;
  border-radius: 8px;
  color: var(--brand);
  background: var(--brand-tint);
  font-size: 0.78rem;
  font-weight: 700;
}

.v-download,
.v-saved {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 700;
}

.v-download { color: var(--ink); }
.v-saved { color: #15803D; }

/* ---------- THE STUDIO: grid of tools ---------- */
.bento {
  display: grid;
  gap: 16px;
}

@media (min-width: 576px) {
  .bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 992px) {
  .bento {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tile-wide {
    grid-column: span 2;
  }
}

.tile {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-radius: 24px;
  transition: transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .tile:hover {
    transform: translateY(-3px);
  }
}

.tile-art {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  margin-bottom: 16px;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.55);
}

.tile-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 1.05rem;
  font-weight: 800;
}

.tile-title :deep(svg),
.tile-title > * {
  color: var(--brand);
}

.tile-text {
  margin: 0;
  color: var(--ink); /* black, not grey: easy to read over the sea */
  font-size: 0.9rem;
  line-height: 1.5;
}

/* Frame maker: three little strips with their slots */
.art-frames {
  gap: 14px;
}

.fr {
  display: grid;
  gap: 4px;
  padding: 6px;
  border-radius: 6px;
  box-shadow: 0 6px 14px rgba(20, 23, 43, 0.15);
}

.fr i {
  display: block;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
}

.fr-a { width: 44px; height: 96px; grid-template-rows: repeat(4, 1fr); background: #2F5BEA; transform: rotate(-6deg); }
.fr-b { width: 70px; height: 84px; grid-template-rows: repeat(3, 1fr); background: #F5A3C7; }
.fr-c { width: 76px; height: 76px; grid-template-columns: 1fr 1fr; background: #14172B; transform: rotate(6deg); }

/* Sticker maker: stickers with a white cut-out edge */
.art-stickers {
  gap: 12px;
  font-size: 2.6rem;
}

.art-stickers span {
  filter: drop-shadow(0 0 0 #fff) drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(0 6px 8px rgba(20, 23, 43, 0.2));
}

.art-stickers span:nth-child(1) { transform: rotate(-10deg); }
.art-stickers span:nth-child(3) { transform: rotate(10deg); }

/* Video strip: a film strip with a play button */
.art-film {
  position: relative;
  gap: 6px;
  padding: 0 16px;
  background: #14172B;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.85) 2px, transparent 2.5px),
    radial-gradient(circle, rgba(255, 255, 255, 0.85) 2px, transparent 2.5px);
  background-size: 14px 14px, 14px 14px;
  background-position: 0 6px, 0 calc(100% - 6px);
  background-repeat: repeat-x;
}

.film-cell {
  width: 52px;
  height: 64px;
  border-radius: 4px;
  background: linear-gradient(160deg, #7FA3FF, #2F5BEA);
}

.film-cell:nth-child(2) { background: linear-gradient(160deg, #FFC2DA, #E5487A); }
.film-cell:nth-child(3) { background: linear-gradient(160deg, #A7F3D0, #12A594); }
.film-cell:nth-child(4) { background: linear-gradient(160deg, #FDE68A, #F59E0B); }

.film-play {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: var(--brand);
  background: #ffffff;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

/* Music mixer: waveform bars */
.art-wave {
  gap: 4px;
  padding: 0 18px;
}

.art-wave span {
  flex: 1;
  height: var(--h);
  max-height: 90px;
  border-radius: 999px;
  background: linear-gradient(var(--brand), #7FA3FF);
}

/* Virtual Friends: faces overlapping in one camera */
.art-friends {
  background: linear-gradient(160deg, #1E2340, #0E1020);
}

.art-friends img {
  width: 72px;
  height: 72px;
  margin: 0 -10px;
  border: 3px solid #ffffff;
  border-radius: 50%;
  object-fit: cover;
}

.art-friends img:nth-child(2) {
  position: relative;
  z-index: 1;
  width: 84px;
  height: 84px;
}

/* Marketplace: a little fan of cards */
.art-market {
  position: relative;
}

.mk {
  position: absolute;
  width: 62px;
  height: 84px;
  border: 3px solid #ffffff;
  border-radius: 10px;
  box-shadow: 0 8px 18px rgba(20, 23, 43, 0.18);
}

.mk-1 { background: linear-gradient(160deg, #FFC2DA, #E5487A); transform: translateX(-46px) rotate(-12deg); }
.mk-2 { z-index: 1; background: linear-gradient(160deg, #7FA3FF, #2F5BEA); }
.mk-3 { background: linear-gradient(160deg, #A7F3D0, #12A594); transform: translateX(46px) rotate(12deg); }

/* text-nowrap in the template keeps the arrow on the same line as the last word */
.feature-link {
  display: inline-block;
  margin-top: 10px;
  color: var(--brand);
  font-size: 0.875rem;
  font-weight: 700;
  text-decoration: none;
}

@media (hover: hover) and (pointer: fine) {
  .feature-link:hover {
    text-decoration: underline;
  }
}

/* ---------- LAST CALL ---------- */
.cta-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 32px;
  border-radius: 28px;
  color: #ffffff;
  background:
    radial-gradient(circle at 85% 20%, rgba(255, 255, 255, 0.22), transparent 45%),
    linear-gradient(135deg, #2F5BEA, #2449C4 60%, #1B2F8F);
  box-shadow: 0 20px 48px rgba(47, 91, 234, 0.35);
}

.cta-title {
  margin-bottom: 6px;
  font-size: clamp(1.4rem, 1rem + 1.6vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.cta-text {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
}

.landing .cta-btn {
  color: var(--brand);
  background: #ffffff;
  border-color: #ffffff;
}

@media (hover: hover) and (pointer: fine) {
  .landing .cta-btn:hover {
    color: var(--brand-dark);
    background: #F2F5FF;
  }
}

/* Phones: the step pictures a little smaller */
@media (max-width: 575.98px) {
  .step-visual {
    min-height: 240px;
    padding: 18px;
  }

  .v-phone {
    width: 160px;
  }

  .v-code span {
    width: 26px;
    height: 34px;
    font-size: 1rem;
  }

  .v-qr img {
    width: 80px;
    height: 80px;
  }

  .cta-card {
    padding: 24px;
  }
}

/* Reduced motion: nothing moves on its own */
@media (prefers-reduced-motion: reduce) {
  .v-count,
  .v-cursor.c1,
  .v-cursor.c2 {
    animation: none;
  }

  .tile:hover {
    transform: none;
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

<style>
/* The landing page's background (not scoped: it is on <body>, see onMounted). It scrolls with the page:
   the beach photo at the top, then sand all the way down. Both pictures are made from the original photo
   (public/images/beautiful-tropical-beach-...jpg): beach-top.jpg is the photo with its bottom edge blended into
   sand-tile.jpg, a strip of its own sand that repeats top to bottom without a seam.
   --beach-h: the photo's height. At least the screen's height, and tall enough to fill the width (it is 3:2),
   so it always covers like "cover" did. The sand tile is the same width and 980/1600 as tall, and starts
   right where the photo ends. A 30% white wash on top softens it so the text is easy to read. */
body.beach-page {
  --beach-h: max(100vh, 66.67vw);
  /* The photo sits this much higher than the top of the page (some sky is cut off), so the shoreline and
     waves are higher up the first screen. The sand continues underneath, so nothing shows below it. */
  --beach-shift: calc(var(--beach-h) * 0.1);
  background:
    linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3)),
    url('/images/beach-top.jpg') center calc(-1 * var(--beach-shift)) / auto var(--beach-h) no-repeat,
    url('/images/sand-tile.jpg') center calc(var(--beach-h) - var(--beach-shift)) / auto calc(var(--beach-h) * 0.6125) repeat-y;
  /* Sand colour under the wash: shows while the pictures load, and fills the scrollbar gutter */
  background-color: rgb(182, 163, 153);
}

/* The waves: public/images/beach-wave.webp is the shallow water and foam cut out of beach-top.jpg (see-through
   everywhere else, with the 30% wash already in it), placed exactly over the same spot of the background.
   It stretches down from its top edge, so the far sea stays still and the foam runs up the sand, then slides
   back. Only transform is animated, so it stays smooth on phones. The numbers are where the cut-out sits in the
   1600 x 2400 photo: from 66.25% of its height, 22.5% tall. */
.beach-waves {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1; /* behind the page, in front of the body's background */
  width: 100%;
  height: var(--beach-h);
  overflow: hidden; /* the wave is wider than the screen on phones: no sideways scrolling */
  pointer-events: none;
}

.beach-wave {
  position: absolute;
  top: calc(var(--beach-h) * 0.6625 - var(--beach-shift)); /* moved up with the photo */
  left: 50%;
  width: calc(var(--beach-h) * 1.5);
  height: calc(var(--beach-h) * 0.225);
  margin-left: calc(var(--beach-h) * -0.75); /* centred like the background (margin, so transform is free) */
  background: url('/images/beach-wave.webp') center / 100% 100% no-repeat;
  transform-origin: top;
  will-change: transform;
  animation: beach-wave-wash 7s infinite;
}

/* Rushes in a little quicker than it drains back, like a real wave */
@keyframes beach-wave-wash {
  0% {
    transform: scaleY(1);
    animation-timing-function: cubic-bezier(0.33, 0, 0.3, 1);
  }
  38% {
    transform: scaleY(1.12);
    animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  }
  100% {
    transform: scaleY(1);
  }
}

/* Only on the landing page (the layer is removed with the page, this is just in case) */
body:not(.beach-page) .beach-waves {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .beach-wave {
    animation: none;
  }
}

/* The "room was closed" toast (not scoped: it is drawn on <body>). The same dark pill as the Sticker Maker's. */
.closed-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 1060;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 6px 6px 6px 18px;
  border-radius: 999px;
  background: var(--ink, #14172B);
  color: #ffffff;
  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: 0 12px 32px rgba(20, 23, 43, 0.2);
  transform: translateX(-50%);
}

/* The cross: a round 32px button, easy to hit */
.closed-toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #B9BECC;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.closed-toast-close:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 1px;
}

@media (hover: hover) and (pointer: fine) {
  .closed-toast-close:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }
}

.closed-toast-enter-active,
.closed-toast-leave-active {
  transition: opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), transform 300ms cubic-bezier(0.23, 1, 0.32, 1);
}

.closed-toast-enter-from,
.closed-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

@media (prefers-reduced-motion: reduce) {
  .closed-toast-enter-active,
  .closed-toast-leave-active {
    transition: opacity 200ms ease;
  }

  .closed-toast-enter-from,
  .closed-toast-leave-to {
    transform: translateX(-50%);
  }
}
</style>
