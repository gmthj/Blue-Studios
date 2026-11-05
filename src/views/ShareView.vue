<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { playSound } from '../sounds.js'
import { useRoute, useRouter } from 'vue-router'
import { runTransaction, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useRoom } from '../composables/useRoom.js'
import { useAuth, getUid } from '../composables/useAuth.js'
import { getGuestName } from '../guest.js'
import { resolveEditedVideos } from '../clips.js'
import { roomLayout, roomFrameStyle, safeStickers } from '../stripData.js'
import { buildExportFile } from '../exportFile.js'
import { createOverallProgress } from '../exportProgress.js'
import { newShareId, createShare, getShare } from '../shares.js'
import { saveStripFile, hasSavedShare } from '../studio.js'
import StageBar from '../components/StageBar.vue'
import SharedStrip from '../components/SharedStrip.vue'
import LogoProgress from '../components/LogoProgress.vue'
import AppIcon from '../components/AppIcon.vue'

// The "Share" page (a child of RoomLayout.vue): the strip is made as a file (PNG, GIF or MP4), uploaded, and given a
// link and a QR code. Everyone in the room is here together, but only ONE device makes the file:
//   room.exportJob = { status, format, name, by, byName, progress, label, updatedAt, shareId, error }
//   'pending'  waiting for a device to take it. The Export page's "Share and download" starts it.
//   'working'  a device (by) is making it. It writes progress and updatedAt every few seconds, so everyone sees a progress bar.
//   'done'     shareId says where it is (shares.js). Everyone then sees the strip, the QR code and the link,
//              the file downloads on every device by itself, and accounts get it saved to My Studio by itself.
//   'failed'   something went wrong (error). Anyone can press "Try again".
// If the device making it disappears (updatedAt is older than STALE_MS), another device takes over.

const { code, room, photos, clips, roomRef, goToStage, exitRoom } = useRoom()
const { isAccount } = useAuth()
const route = useRoute() // route.fullPath is this page's address, /room/4821/share (for "log in, then come back here")
const router = useRouter()
const uid = getUid()
const myName = getGuestName()

const STALE_MS = 20000 // a working device that has not written for this long is gone
const BEAT_MS = 2000   // how often the working device writes its progress

const job = computed(() => room.value.exportJob || null)
const building = ref(false) // true while THIS device is making the file
const progress = ref(0)
const label = ref('')
let leftPage = false

// ---------- THE STRIP (read only here) ----------

const layout = computed(() => roomLayout(room.value))
const frameStyle = computed(() => roomFrameStyle(room.value))
const slotPhotos = computed(() => room.value.stripSlots || {})
const editedVideos = computed(() => resolveEditedVideos(room.value.editedVideos, clips.value))
const edits = computed(() => room.value.stripEdits || {})
const crops = computed(() => room.value.stripCrops || {})
const stickers = computed(() => safeStickers(room.value.stripStickers))
const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// ---------- TAKING THE JOB ----------

// Can a device take this job? It is waiting, or its device has gone quiet.
function isTakeable(current) {
  return current && (current.status === 'pending' || (current.status === 'working' && Date.now() - current.updatedAt > STALE_MS))
}

// Every device tries, and the room document decides who wins: the transaction reads the job again and only writes if it is still free
async function tryTake() {
  if (leftPage || building.value || !isTakeable(job.value)) return
  let won = false
  try {
    await runTransaction(db, async (tx) => {
      won = false
      const snap = await tx.get(roomRef())
      const current = snap.data().exportJob
      if (!isTakeable(current)) return
      tx.update(roomRef(), {
        exportJob: { ...current, status: 'working', by: uid, byName: myName, progress: 0, label: 'Getting your strip ready...', updatedAt: Date.now() },
      })
      won = true
    })
  } catch (error) {
    console.error(error)
    return
  }
  if (won) build()
}

// Is this device still the one that should be making the file? (not if the page was closed, or someone took over)
function stillMine() {
  return !leftPage && job.value && job.value.by === uid && job.value.status === 'working'
}

async function build() {
  building.value = true
  progress.value = 0
  label.value = 'Getting your strip ready...'
  const { format, name } = job.value
  const audioPath = room.value.music && room.value.music.audioPath
  // ONE bar for all the stages (recording, converting, saving...): each stage only says how far it is (see exportProgress.js)
  const overall = createOverallProgress(format, Boolean(audioPath), (value) => (progress.value = value))

  // While working, tell the room how far we are (and that we are still here)
  const beat = setInterval(() => {
    if (!stillMine()) return
    updateDoc(roomRef(), { 'exportJob.progress': progress.value, 'exportJob.label': label.value, 'exportJob.updatedAt': Date.now() }).catch(console.error)
  }, BEAT_MS)

  try {
    const file = await buildExportFile({
      format: format,
      strip: {
        layout: layout.value,
        frameStyle: frameStyle.value,
        photosById: photosById.value,
        slotPhotos: slotPhotos.value,
        edits: edits.value,
        crops: crops.value,
        stickers: stickers.value,
        clips: clips.value,
        editedVideos: editedVideos.value,
      },
      audioPath: audioPath,
      onStatus: (text) => (label.value = text),
      progress: overall,
      isCancelled: () => !stillMine(),
    })
    if (!file || !stillMine()) return // cancelled: someone else has the job now, or we left

    label.value = 'Saving your link...'
    overall.creep('save') // uploading does not say how far it is, so the bar creeps on
    const made = await createShare({ id: newShareId(), title: name, format: format, file: file, roomCode: code.value })
    await updateDoc(roomRef(), { 'exportJob.status': 'done', 'exportJob.shareId': made.id, 'exportJob.progress': 1, 'exportJob.updatedAt': Date.now() })
    overall.finish()
  } catch (error) {
    console.error(error)
    if (stillMine()) {
      await updateDoc(roomRef(), { 'exportJob.status': 'failed', 'exportJob.error': String(error.message || 'Something went wrong.').slice(0, 300) }).catch(console.error)
    }
  } finally {
    clearInterval(beat)
    overall.stop()
    building.value = false
  }
}

// "Try again" after a failure: the job is waiting again, and a device takes it
async function tryAgain() {
  await updateDoc(roomRef(), { 'exportJob.status': 'pending', 'exportJob.error': '', 'exportJob.progress': 0 })
}

// Look for a job to take now, when the job changes, and every few seconds (to notice a device that went quiet)
let watchTimer = 0
onMounted(() => {
  tryTake()
  watchTimer = setInterval(tryTake, 5000)
})
watch(job, tryTake)

onBeforeUnmount(() => {
  leftPage = true
  clearInterval(watchTimer)
  // Leaving in the middle: hand the job back, so another device can take it
  if (building.value) updateDoc(roomRef(), { 'exportJob.status': 'pending' }).catch(console.error)
})

// ---------- THE FINISHED SHARE ----------

const share = ref(null)
let firstCheck = true // the first check runs when the page opens
watch(
  () => job.value && job.value.status === 'done' && job.value.shareId,
  async (id) => {
    const justFinished = !firstCheck
    firstCheck = false
    share.value = id ? await getShare(id).catch((error) => console.error(error) || null) : null
    if (!share.value) return
    // Just made (not when opening a strip that was already done): a happy sound, and the file downloads by itself
    if (justFinished) {
      playSound('success')
      autoDownload(share.value)
    }
    autoSave(share.value)
  },
  { immediate: true }
)

// Download the file without anyone pressing Download. The file is stored with "Content-Disposition: attachment"
// (createShare in shares.js), so opening its address saves it and the page stays where it is.
// The Download button is still there, e.g. for a browser that blocks downloads nobody clicked.
function autoDownload(made) {
  const link = document.createElement('a')
  link.href = made.fileUrl
  link.download = ''
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// What everyone sees while it is being made
const shownProgress = computed(() => (building.value ? progress.value : (job.value && job.value.progress) || 0))
const shownLabel = computed(() => (building.value ? label.value : (job.value && job.value.label) || ''))

// ---------- LOG IN TO SAVE (guests) ----------

// Go to the login page, and come back to this page after (redirect: the login page brings the user back here, where Save is waiting).
// Logging in to an existing account makes us a NEW member of the room (a different user id). The old place would
// still count for up to 45 seconds, so if everyone logs in at once the room could look full. So we leave our place first.
async function goToLogin() {
  try {
    await exitRoom(true) // true: remove me from the members list straight away
  } catch (error) {
    console.error(error) // not fatal: the old place just times out by itself
  }
  router.push('/login?redirect=' + encodeURIComponent(route.fullPath))
}

// ---------- SAVE TO MY STUDIO (accounts only) ----------

const saving = ref(false)
const saved = ref(false)
const saveMessage = ref('')
let savingShareId = '' // the share being saved right now, so it is never saved twice at the same time

// Accounts: save it to My Studio by itself, once (also after logging in from "Log in to save it")
async function autoSave(made) {
  if (!isAccount.value || saved.value || savingShareId === made.id) return
  savingShareId = made.id
  try {
    if (await hasSavedShare(made.id)) {
      saved.value = true
      saveMessage.value = 'Saved to My Studio.'
      return
    }
  } catch (error) {
    console.error(error) // could not check: try to save anyway
  } finally {
    savingShareId = ''
  }
  await saveToStudio()
}

async function saveToStudio() {
  if (saving.value || saved.value || !share.value) return
  saving.value = true
  savingShareId = share.value.id
  saveMessage.value = ''
  try {
    const blob = await (await fetch(share.value.fileUrl)).blob() // the file is in Storage, so this works on any device
    await saveStripFile({ title: share.value.title, file: blob, format: share.value.format, shareId: share.value.id })
    saved.value = true
    saveMessage.value = 'Saved to My Studio.'
  } catch (error) {
    console.error(error)
    saveMessage.value = 'Could not save it to My Studio. Please try again.'
  }
  saving.value = false
  savingShareId = ''
}

// Logged in on this page (coming back from "Log in to save it"): save it now
watch(isAccount, (now) => {
  if (now && share.value) autoSave(share.value)
})
</script>

<template>
  <!-- app-page: the shared Blue Studios look (colours, font, buttons) from pages.css, see design.md -->
  <div class="app-page room-page">
  <StageBar current="share" />

  <!-- Finished: the strip, the QR code, the link, and Download -->
  <div v-if="share">
    <h1 class="page-title text-center mb-3">{{ share.title }}</h1>
    <SharedStrip :share="share">
      <!-- Accounts can keep it in My Studio. Guests would lose it, so they are asked to log in. -->
      <!-- Saved by itself; the button is only there to try again if that failed -->
      <router-link v-if="isAccount && saved" to="/studio" class="btn btn-outline-secondary w-100 mt-2 d-inline-flex align-items-center justify-content-center gap-2">
        <AppIcon name="check" :size="16" /> Saved to My Studio
      </router-link>
      <button v-else-if="isAccount" type="button" class="btn btn-outline-secondary w-100 mt-2" :disabled="saving" @click="saveToStudio">
        {{ saving ? 'Saving to My Studio...' : 'Save to My Studio' }}
      </button>
      <button v-else type="button" class="btn btn-outline-secondary w-100 mt-2" @click="goToLogin">Log in to save it to My Studio</button>
      <p v-if="saveMessage && !saved" class="hint mt-2 mb-0" role="status">{{ saveMessage }}</p>
    </SharedStrip>
  </div>

  <!-- Still being made, or something went wrong. Only this: no preview of the strip, and no box around it,
       in the middle of the page (across and up and down). -->
  <div v-else class="loader-screen">
    <div class="loader-content">
        <template v-if="job && job.status === 'failed'">
          <h2 class="section-title">That didn't work</h2>
          <p class="error-box" role="alert">{{ job.error }}</p>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-primary" @click="tryAgain">Try again</button>
            <button type="button" class="btn btn-outline-secondary step-link" @click="goToStage('export')">
              <AppIcon name="arrow-left" :size="16" /> Export
            </button>
          </div>
        </template>
        <template v-else-if="!job">
          <h2 class="section-title">Nothing to share yet</h2>
          <p class="hint">Choose a format and press "Share and download" on the Export page.</p>
          <button type="button" class="btn btn-outline-secondary step-link" @click="goToStage('export')">
            <AppIcon name="arrow-left" :size="16" /> Export
          </button>
        </template>
        <template v-else>
          <!-- The same words on every device: which device is making the file is whichever took the job first, so it is not said -->
          <h2 class="section-title">Making your {{ job.format.toUpperCase() }}</h2>
          <!-- The logo fills up as the file is made. One bar for all the stages: it only goes up. -->
          <LogoProgress :progress="shownProgress" />
          <p class="making" role="status">{{ shownLabel || 'Starting...' }}</p>
          <p class="hint mt-3 mb-0">Keep this page open until it is done. It appears here for everyone in the room.</p>
        </template>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Styles follow design.md: the colours are the app-page variables, the cards (.panel) come from pages.css */
.room-page {
  padding-bottom: 24px;
}

.hint {
  margin: 0 0 12px;
  font-size: 0.85rem;
  color: var(--muted);
  text-wrap: pretty;
}

/* The error colours from design.md */
.error-box {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.85rem;
  color: #B42318;
  background: #FEF3F2;
  text-wrap: pretty;
}

/* The loading screen: no box, in the middle of the page across and up and down (under the step bar) */
.loader-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  /* as tall as the space under the step bar, so the logo is in the middle of what is left (dvh: on a phone the
     address bar moves, so this follows it where the browser knows dvh) */
  min-height: calc(100vh - 150px);
  min-height: calc(100dvh - 150px);
  padding: 16px 0;
}

.loader-content {
  width: min(100%, 460px);
  text-align: center;
}

.loader-content .section-title {
  justify-content: center;
  font-size: clamp(1.3rem, 1.1rem + 0.8vw, 1.7rem);
}

.loader-content .d-flex {
  justify-content: center;
}

/* "Recording the video..." under the logo */
.making {
  margin: 0 0 8px;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
}
</style>
