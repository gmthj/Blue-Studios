<script setup>
// ref: a value Vue watches. computed: a value worked out from other values (kept up to date by itself)
import { ref, computed, onBeforeUnmount } from 'vue'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { MAX_EDIT_SECONDS, resolveEditedVideos } from '../clips.js'
import { createScene, recordScene } from '../stripRender.js'
import { LAYOUTS, FRAME_STYLES } from '../stripData.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'

// The "Export" page (a child of RoomLayout.vue): make an MP4 of a strip that has video in it.
// A strip with only photos is downloaded from the Decorate page (JPG), so it is not exported here.
// The MP4 is always MAX_EDIT_SECONDS long (15 seconds): videos that are shorter repeat until it ends.
// "Make MP4" works in two steps: the page plays the strip on a hidden canvas and records it (stripRender.js),
// then FFmpeg.wasm turns the recording into an MP4 (ffmpeg.js). FFmpeg is about 30 MB, so it is only downloaded
// when the button is pressed. The MP4 has no sound yet (the Music Mixer is not part of the strip yet).

// room: the room document (live). photos / clips: everything taken in the room. roomRef(): the room's Firestore reference.
const { code, room, photos, clips, roomRef } = useRoom()

const VIDEO_WIDTH = 480 // the MP4 is this many pixels wide (the height follows the strip's shape)
const FPS = 15          // frames per second

const busy = ref(false)     // true while the MP4 is being made
const status = ref('')      // what is happening now, e.g. "Recording..."
const progress = ref(0)     // 0 to 1, for the progress bar
const errorMessage = ref('')
const result = ref(null)    // the finished MP4: { blob, url, filename }

let leftPage = false // true once this page is closed, so a recording that is still running stops
onBeforeUnmount(() => {
  leftPage = true
  if (result.value) URL.revokeObjectURL(result.value.url) // free the memory of the MP4
})

// ---------- THE STRIP (read only here, made on the Pick and Decorate pages) ----------

const layout = computed(() => LAYOUTS.find((l) => l.id === room.value.stripLayoutId) || LAYOUTS[0])
const frameStyle = computed(() => FRAME_STYLES.find((s) => s.id === room.value.stripStyleId) || FRAME_STYLES[0])
const slotPhotos = computed(() => room.value.stripSlots || {})
const editedVideos = computed(() => resolveEditedVideos(room.value.editedVideos, clips.value))
const edits = computed(() => room.value.stripEdits || {})
const stickers = computed(() => room.value.stripStickers || [])

// The photos as { id: photo }, so a slot can find its photo quickly
const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// The slots that have a video, in slot order: [ { slot, label, seconds } ]
// A slot holds the id of a photo, a clip, or a saved edit (see StripView.vue), so look the id up in each.
const videoSlots = computed(() => {
  const list = []
  for (let i = 0; i < layout.value.slots.length; i++) {
    const id = slotPhotos.value[i]
    const edit = editedVideos.value[id]
    const clip = clips.value.find((c) => c.id === id)
    if (edit && edit.entries.length > 0) {
      list.push({ slot: i + 1, label: '✂ ' + edit.name, seconds: edit.seconds })
    } else if (clip) {
      list.push({ slot: i + 1, label: 'Video by ' + clip.name, seconds: null })
    }
  }
  return list
})

// ---------- MAKING THE MP4 ----------

// Save a Blob (a file made in the browser) to the user's device: a temporary link is made and clicked
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function makeMp4() {
  busy.value = true
  errorMessage.value = ''
  progress.value = 0
  if (result.value) { // a new MP4 replaces the old one
    URL.revokeObjectURL(result.value.url)
    result.value = null
  }

  try {
    // 1. Download the photos, stickers and videos, so every frame can be drawn quickly
    status.value = 'Getting the videos ready...'
    const scene = await createScene({
      layout: layout.value,
      frameStyle: frameStyle.value,
      photosById: photosById.value,
      slotPhotos: slotPhotos.value,
      edits: edits.value,
      stickers: stickers.value,
      clips: clips.value,
      editedVideos: editedVideos.value,
    })

    // 2. Play the strip and record it (takes as long as the video: MAX_EDIT_SECONDS)
    status.value = 'Recording the strip... keep this page open'
    const recording = await recordScene(scene, {
      width: VIDEO_WIDTH,
      fps: FPS,
      seconds: MAX_EDIT_SECONDS,
      onProgress: (p) => (progress.value = p),
      isCancelled: () => leftPage,
    })
    if (!recording) return // the page was closed

    // 3. Turn it into an MP4. Safari already records an MP4, so it needs no converting (and no 30 MB download).
    let blob = recording
    if (!recording.type.includes('mp4')) {
      progress.value = 0
      status.value = 'Loading the converter... (the first time takes a while)'
      const { toMp4 } = await import('../ffmpeg.js') // only downloaded now
      status.value = 'Making the MP4...'
      blob = await toMp4(recording, FPS, (p) => (progress.value = p))
    }

    if (leftPage) return
    result.value = { blob: blob, url: URL.createObjectURL(blob), filename: 'photostrip-' + code.value + '.mp4' }
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not make the MP4: ' + (error.message || 'please try again.')
  }
  status.value = ''
  busy.value = false
}

// Everyone moves to another page together (RoomLayout.vue follows the room's "stage")
async function goToStage(stage) {
  await updateDoc(roomRef(), { stage: stage })
}
</script>

<template>
  <!-- The bar at the top with the 7 steps (this page is step 7, Export) -->
  <StageBar current="export" />

  <div class="row g-3">
    <!-- LEFT: the strip, with its videos playing -->
    <div class="col-12 col-md-6 col-lg-5 order-2 order-md-1">
      <div class="panel">
        <h2 class="h5 fw-bold">Your strip</h2>
        <!-- mode="view": only shows the strip (no dragging or editing). The videos play and repeat in their slots. -->
        <!-- While recording, the preview is hidden: the page has enough to do, especially on a phone -->
        <p v-if="busy" class="small text-muted">The strip is being recorded...</p>
        <PhotoStrip
          v-else
          mode="view"
          :layout="layout"
          :frame-style="frameStyle"
          :photos-by-id="photosById"
          :slot-photos="slotPhotos"
          :edits="edits"
          :stickers="stickers"
          :clips="clips"
          :edited-videos="editedVideos"
        />
      </div>
    </div>

    <!-- RIGHT: what will be exported -->
    <div class="col-12 col-md-6 col-lg-7 order-1 order-md-2">
      <div class="panel">
        <h2 class="h5 fw-bold">Export video</h2>

        <!-- A strip with video: say what is in it and how long the MP4 will be -->
        <template v-if="videoSlots.length > 0">
          <p class="small text-muted">
            Your video will be <strong>{{ MAX_EDIT_SECONDS }} seconds</strong> long. Videos that are shorter repeat until it ends.
          </p>
          <ul class="list-unstyled small">
            <li v-for="v in videoSlots" :key="v.slot">
              <span class="badge text-bg-light">Slot {{ v.slot }}</span>
              {{ v.label }}<span v-if="v.seconds !== null"> · {{ v.seconds.toFixed(1) }}s</span>
            </li>
          </ul>
          <p class="small text-muted">
            It takes about {{ MAX_EDIT_SECONDS }} seconds to record, then a little longer to make the MP4. There is no sound yet.
          </p>
          <button class="btn btn-primary" :disabled="busy" @click="makeMp4">
            {{ result ? 'Make it again' : 'Make MP4' }}
          </button>

          <!-- Progress while it works -->
          <div v-if="busy" class="mt-3">
            <p class="small mb-1"><span class="spinner-border spinner-border-sm me-2"></span>{{ status }}</p>
            <div class="progress" style="height: 8px">
              <div class="progress-bar" :style="{ width: Math.round(progress * 100) + '%' }"></div>
            </div>
          </div>
          <p v-if="errorMessage" class="small text-danger mt-3 mb-0">{{ errorMessage }}</p>

          <!-- The finished MP4: a preview and the download button -->
          <div v-if="result" class="mt-3">
            <video :src="result.url" class="result-video" controls loop playsinline></video>
            <p class="small text-muted mb-1">{{ (result.blob.size / 1024 / 1024).toFixed(1) }} MB</p>
            <button class="btn btn-success" @click="downloadBlob(result.blob, result.filename)">Download {{ result.filename }}</button>
          </div>
        </template>

        <!-- A strip with only photos: nothing to export here -->
        <template v-else>
          <p class="small text-muted">
            This strip has no video, so there is nothing to export as an MP4. Photo strips are downloaded from the Decorate page.
          </p>
        </template>

        <hr />
        <button class="btn btn-outline-secondary btn-sm" :disabled="busy" @click="goToStage('decorate')">&larr; Decorate</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A white rounded card, the same look as the other pages */
.panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* The finished MP4's preview: not taller than the screen */
.result-video {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
  background: #000;
  margin-bottom: 4px;
}
</style>
