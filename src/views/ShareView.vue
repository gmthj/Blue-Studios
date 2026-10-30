<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { runTransaction, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useRoom } from '../composables/useRoom.js'
import { useAuth, getUid } from '../composables/useAuth.js'
import { getGuestName } from '../guest.js'
import { resolveEditedVideos } from '../clips.js'
import { roomLayout, roomFrameStyle } from '../stripData.js'
import { buildExportFile } from '../exportFile.js'
import { newShareId, createShare, getShare } from '../shares.js'
import { saveStripFile } from '../studio.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import SharedStrip from '../components/SharedStrip.vue'

// The "Share" page (a child of RoomLayout.vue): the strip is made as a file (PNG, GIF or MP4), uploaded, and given a
// link and a QR code. Everyone in the room is here together, but only ONE device makes the file:
//   room.exportJob = { status, format, name, by, byName, progress, label, updatedAt, shareId, error }
//   'pending'  waiting for a device to take it. The Export page's "Share and download" starts it.
//   'working'  a device (by) is making it. It writes progress and updatedAt every few seconds, so everyone sees a progress bar.
//   'done'     shareId says where it is (shares.js). Everyone then sees the strip, the QR code and the link.
//   'failed'   something went wrong (error). Anyone can press "Try again".
// If the device making it disappears (updatedAt is older than STALE_MS), another device takes over.

const { code, room, photos, clips, roomRef, goToStage } = useRoom()
const { isAccount } = useAuth()
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
const stickers = computed(() => room.value.stripStickers || [])
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
      audioPath: room.value.music && room.value.music.audioPath,
      onStatus: (text) => (label.value = text),
      onProgress: (p) => (progress.value = p),
      isCancelled: () => !stillMine(),
    })
    if (!file || !stillMine()) return // cancelled: someone else has the job now, or we left

    label.value = 'Saving your link...'
    const made = await createShare({ id: newShareId(), title: name, format: format, file: file, roomCode: code.value })
    await updateDoc(roomRef(), { 'exportJob.status': 'done', 'exportJob.shareId': made.id, 'exportJob.progress': 1, 'exportJob.updatedAt': Date.now() })
  } catch (error) {
    console.error(error)
    if (stillMine()) {
      await updateDoc(roomRef(), { 'exportJob.status': 'failed', 'exportJob.error': error.message || 'Something went wrong.' }).catch(console.error)
    }
  } finally {
    clearInterval(beat)
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
watch(
  () => job.value && job.value.status === 'done' && job.value.shareId,
  async (id) => {
    share.value = id ? await getShare(id).catch((error) => console.error(error) || null) : null
  },
  { immediate: true }
)

// What everyone sees while it is being made
const shownProgress = computed(() => (building.value ? progress.value : (job.value && job.value.progress) || 0))
const shownLabel = computed(() => (building.value ? label.value : (job.value && job.value.label) || ''))

// ---------- SAVE TO MY STUDIO (accounts only) ----------

const saving = ref(false)
const saveMessage = ref('')

async function saveToStudio() {
  saving.value = true
  saveMessage.value = ''
  try {
    const blob = await (await fetch(share.value.fileUrl)).blob() // the file is in Storage, so this works on any device
    await saveStripFile({ title: share.value.title, file: blob, format: share.value.format })
    saveMessage.value = 'Saved to My Studio!'
  } catch (error) {
    console.error(error)
    saveMessage.value = 'Could not save. Please try again.'
  }
  saving.value = false
}
</script>

<template>
  <StageBar current="share" />

  <!-- Finished: the strip, the QR code, the link, and Download -->
  <div v-if="share">
    <h1 class="h3 fw-bold text-center mb-3">{{ share.title }}</h1>
    <SharedStrip :share="share">
      <!-- Accounts can keep it in My Studio. Guests would lose it, so they are asked to log in. -->
      <button v-if="isAccount" class="btn btn-outline-primary w-100 mt-2" :disabled="saving" @click="saveToStudio">
        {{ saving ? 'Saving...' : 'Save to My Studio' }}
      </button>
      <router-link v-else to="/login" class="btn btn-outline-primary w-100 mt-2">Log in to save it to My Studio</router-link>
      <p v-if="saveMessage" class="small mt-2 mb-0">{{ saveMessage }}</p>
    </SharedStrip>
    <p class="mt-3"><button class="btn btn-outline-secondary btn-sm" @click="goToStage('export')">&larr; Export</button></p>
  </div>

  <!-- Still being made, or something went wrong -->
  <div v-else class="row g-3">
    <div class="col-12 col-lg-4">
      <div class="panel">
        <h2 class="h5 fw-bold">Your strip</h2>
        <PhotoStrip
          mode="view"
          :layout="layout"
          :frame-style="frameStyle"
          :photos-by-id="photosById"
          :slot-photos="slotPhotos"
          :edits="edits"
          :crops="crops"
          :stickers="stickers"
          :clips="clips"
          :edited-videos="editedVideos"
        />
      </div>
    </div>
    <div class="col-12 col-lg-8">
      <div class="panel">
        <template v-if="job && job.status === 'failed'">
          <h2 class="h5 fw-bold">That didn't work</h2>
          <p class="small text-danger">{{ job.error }}</p>
          <button class="btn btn-primary me-2" @click="tryAgain">Try again</button>
          <button class="btn btn-outline-secondary" @click="goToStage('export')">&larr; Export</button>
        </template>
        <template v-else-if="!job">
          <h2 class="h5 fw-bold">Nothing to share yet</h2>
          <p class="small text-muted">Choose a format and press "Share and download" on the Export page.</p>
          <button class="btn btn-outline-secondary" @click="goToStage('export')">&larr; Export</button>
        </template>
        <template v-else>
          <h2 class="h5 fw-bold">
            <template v-if="job.status === 'working' && !building">{{ job.byName }} is making your {{ job.format.toUpperCase() }}</template>
            <template v-else>Making your {{ job.format.toUpperCase() }}</template>
          </h2>
          <p class="small mb-1"><span class="spinner-border spinner-border-sm me-2"></span>{{ shownLabel || 'Starting...' }}</p>
          <div class="progress" style="height: 8px">
            <div class="progress-bar" :style="{ width: Math.round(shownProgress * 100) + '%' }"></div>
          </div>
          <p v-if="building" class="small text-muted mt-3 mb-0">Keep this page open and visible until it is done. Everyone in the room is waiting for it.</p>
          <p v-else class="small text-muted mt-3 mb-0">It is being made on {{ job.byName || 'another device' }}'s screen. It appears here when it is done.</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
</style>
