<script setup>
// ref: a value Vue watches. computed: a value worked out from other values (kept up to date by itself)
// watch: run code when a value changes
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { runTransaction, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useRoom, stageIndex } from '../composables/useRoom.js'
import { resolveEditedVideos } from '../clips.js'
import { roomLayout, roomFrameStyle, safeStickers } from '../stripData.js'
import { chooseExportFormat, stripContents, hasGifSticker } from '../exportRules.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import AppIcon from '../components/AppIcon.vue'

// The "Export" page (a child of RoomLayout.vue): the room names the strip, and "Share and download" moves everyone on.
// Nothing is made here, and nobody chooses the format: the strip decides it (PNG for a still strip with no music,
// MP4 for everything else, see chooseExportFormat in exportRules.js). The Share page makes the file.
// The name is saved on the room, so everyone sees it as it is typed, live:
//   room.exportName    the strip's name (shown on the Share page and in My Studio)

const { code, room, photos, clips, roomRef } = useRoom()

// ---------- THE STRIP (read only here, made on the Pick and Decorate pages) ----------

const layout = computed(() => roomLayout(room.value))         // a custom template brings its own cut and look
const frameStyle = computed(() => roomFrameStyle(room.value))
const slotPhotos = computed(() => room.value.stripSlots || {})
const editedVideos = computed(() => resolveEditedVideos(room.value.editedVideos, clips.value))
const edits = computed(() => room.value.stripEdits || {})
const crops = computed(() => room.value.stripCrops || {}) // where each photo sits in its slot (Pick page)
const stickers = computed(() => safeStickers(room.value.stripStickers))

// The photos as { id: photo }, so a slot can find its photo quickly
const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// ---------- WHICH FORMAT THE STRIP IS EXPORTED AS ----------

const contents = computed(() =>
  stripContents({ layout: layout.value, slotPhotos: slotPhotos.value, photosById: photosById.value, clips: clips.value, editedVideos: editedVideos.value })
)
const hasMusic = computed(() => Boolean(room.value.music && room.value.music.audioPath)) // the mix saved on the Music page

// Looking at the stickers takes a moment (each one is checked to see if it is a GIF), so the button waits for it
const gifSticker = ref(false)
const checking = ref(true)
watch(
  stickers,
  async (list) => {
    checking.value = true
    const found = await hasGifSticker(list)
    if (list === stickers.value) { // (the stickers may have changed again while we looked)
      gifSticker.value = found
      checking.value = false
    }
  },
  { immediate: true }
)

// 'png' or 'mp4' (null while the strip is not finished)
const chosenFormat = computed(() =>
  chooseExportFormat({ complete: contents.value.complete, hasVideo: contents.value.hasVideo, hasMusic: hasMusic.value, hasGifSticker: gifSticker.value })
)

// ---------- THE NAME ----------

const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const suggestedName = computed(() => 'Room ' + code.value + ' · ' + today)

// What is in the box. It follows the room (so everyone sees the same name), except while this person is typing in it.
const nameDraft = ref(room.value.exportName ?? suggestedName.value)
const typing = ref(false)
watch(
  () => room.value.exportName,
  (saved) => {
    if (!typing.value && saved !== undefined) nameDraft.value = saved
  }
)

// Save the name a moment after typing stops, not on every key
let saveTimer = 0
function onNameInput() {
  typing.value = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveName, 400)
}
async function saveName() {
  typing.value = false
  try {
    await updateDoc(roomRef(), { exportName: nameDraft.value.trim() })
  } catch (error) {
    console.error(error)
  }
}
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  if (typing.value) saveName() // do not lose the last letters
})

// ---------- NEXT ----------

const sharing = ref(false)
const canShare = computed(() => !checking.value && !sharing.value && chosenFormat.value !== null && nameDraft.value.trim() !== '')

// Move everyone to the Share page, where the file is made. The job (format and name) is saved on the room in the same write.
// If two people press it at the same moment, the first one wins and the second just joins it: the transaction
// checks the room again, and does nothing if the room has already moved on.
async function shareAndDownload() {
  sharing.value = true
  const format = chosenFormat.value
  const name = nameDraft.value.trim()
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef())
      const data = snap.data()
      if (data.stage === 'share') return // someone was first: we follow them (RoomLayout moves us)
      const changes = {
        stage: 'share',
        exportName: name,
        exportJob: { status: 'pending', format: format, name: name, progress: 0, updatedAt: Date.now() },
      }
      if (stageIndex('share') > stageIndex(data.furthestStage)) changes.furthestStage = 'share'
      tx.update(roomRef(), changes)
    })
  } catch (error) {
    console.error(error)
  }
  sharing.value = false
}
</script>

<template>
  <!-- app-page: the shared Blue Studios look (colours, font, buttons) from pages.css, see design.md -->
  <div class="app-page room-page">
  <!-- The bar at the top with the 7 steps (this page is step 6, Export) -->
  <StageBar current="export" />

  <!-- gx-lg-5: a wide space (3rem) between the strip and the name section; gy-4: more room between them when they are stacked on a phone -->
  <div class="row g-3 gx-md-4 gx-lg-5 gy-4 justify-content-center">
    <!-- The form: the name, then Share and download. On a phone it comes before the strip.
         The strip and the form are two columns of the usual width, together in the middle of the page. -->
    <div class="col-12 col-md-6 col-lg-4 order-1 order-md-2 export-col form-col">
      <!-- no box around it: the name, the button and the hint sit straight on the page -->
      <div class="form-block">
        <h2 class="section-title big-title">Name your photostrip</h2>
        <label for="strip-name" class="field-label">Everyone in the room sees this as you type</label>
        <input
          id="strip-name"
          v-model="nameDraft"
          type="text"
          class="form-control form-control-lg name-input"
          maxlength="40"
          :placeholder="suggestedName"
          @input="onNameInput"
          @blur="typing && saveName()"
        />
        <p class="hint mt-2 mb-0">It is the title on the Share page, and in My Studio if you save it there.</p>

        <button type="button" class="btn btn-primary btn-lg share-button w-100 mt-4" :disabled="!canShare" @click="shareAndDownload">
          {{ sharing ? 'Opening...' : 'Share and download' }}
          <AppIcon v-if="!sharing" name="arrow-right" :size="18" />
        </button>
        <p v-if="!chosenFormat && !checking" class="hint text-center mt-2 mb-0">Finish the strip first: every slot needs a photo or video.</p>
      </div>
    </div>

    <!-- The final strip, with its videos playing: next to the form on a wide screen, below it on a phone -->
    <div class="col-12 col-md-6 col-lg-4 order-2 order-md-1 export-col strip-col">
      <div class="panel big-panel strip-panel">
        <h2 class="section-title big-title">Your strip</h2>
        <div class="strip-stage">
        <!-- mode="view": only shows the strip (no dragging or editing). The videos play and repeat in their slots. -->
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
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Styles follow design.md: the colours are the app-page variables (--brand, --ink, --muted, --line, --soft)
   and the cards (.panel) come from pages.css. */
.room-page {
  padding-bottom: 24px;
}

.hint {
  margin: 0 0 8px;
  font-size: 0.738rem;
  color: var(--muted);
  text-wrap: pretty;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.855rem;
  font-weight: 700;
}

/* Bigger cards, so the page does not look empty: a roomy padding that is smaller on a phone */
.room-page .big-panel {
  padding: clamp(18px, 2.4vw, 24px);
}

.big-title {
  font-size: clamp(1.08rem, 0.945rem + 0.45vw, 1.26rem);
  margin-bottom: 14px;
}

/* The name box: tall, with big letters (the phone zooms in on a small box when you tap it) */
.name-input {
  padding: 12px 14px;
  font-size: 0.945rem;
  border-radius: 12px;
}

/* the big button (Bootstrap's btn-lg is 1.25rem): 10% smaller like the rest of the text here */
.share-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px; /* a big, easy target for a thumb */
  font-size: 1.125rem;
}

/* On a phone and a small tablet there is one column: keep it a comfortable width and in the middle, not stretched */
@media (max-width: 767.98px) {
  .export-col {
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }
}

/* The strip's card is as tall as the form next to it, and the strip is in the middle of it */
.strip-col {
  display: flex;
}

.strip-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.strip-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.strip-stage > :deep(*) {
  flex: 1;
}

/* Side by side: the strip is a little shorter than the usual 82% of the screen (--stage-h is the height PhotoStrip may use),
   so its card is about as tall as the form next to it and does not run off the bottom of the screen.
   On a phone the strip is under the form, so it keeps the usual size. */
@media (min-width: 768px) {
  .strip-stage {
    --stage-h: max(420px, calc(100vh - 230px));
  }
}

/* The form is in the middle of the column (top to bottom), next to the taller strip */
.form-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* The name section has no box, so it only needs a little room at the sides, and its title is not boxed in either */
.form-block {
  padding: 0 4px;
}
</style>
