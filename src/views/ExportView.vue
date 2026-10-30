<script setup>
// ref: a value Vue watches. computed: a value worked out from other values (kept up to date by itself)
// watch: run code when a value changes
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { runTransaction, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useRoom, stageIndex } from '../composables/useRoom.js'
import { resolveEditedVideos } from '../clips.js'
import { roomLayout, roomFrameStyle } from '../stripData.js'
import { FORMATS, exportOptions, stripContents, hasGifSticker } from '../exportRules.js'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'

// The "Export" page (a child of RoomLayout.vue): the room chooses HOW to export the strip and what to call it.
// Nothing is made here. "Share and download" moves everyone to the Share page, where the file is made.
// What is chosen is saved on the room, so everyone sees the same choice, live:
//   room.exportFormat  'png' | 'gif' | 'mp4'
//   room.exportName    the strip's name (shown on the Share page and in My Studio)
// Which formats can be chosen is decided by exportRules.js (e.g. no PNG if the strip has a video).

const { code, room, photos, clips, roomRef, goToStage } = useRoom()
// (the room's saved format and name are used by the Share page too, see ShareView.vue)

// ---------- THE STRIP (read only here, made on the Pick and Decorate pages) ----------

const layout = computed(() => roomLayout(room.value))         // a custom template brings its own cut and look
const frameStyle = computed(() => roomFrameStyle(room.value))
const slotPhotos = computed(() => room.value.stripSlots || {})
const editedVideos = computed(() => resolveEditedVideos(room.value.editedVideos, clips.value))
const edits = computed(() => room.value.stripEdits || {})
const crops = computed(() => room.value.stripCrops || {}) // where each photo sits in its slot (Pick page)
const stickers = computed(() => room.value.stripStickers || [])

// The photos as { id: photo }, so a slot can find its photo quickly
const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// ---------- WHICH FORMATS CAN BE CHOSEN ----------

const contents = computed(() =>
  stripContents({ layout: layout.value, slotPhotos: slotPhotos.value, photosById: photosById.value, clips: clips.value, editedVideos: editedVideos.value })
)
const hasMusic = computed(() => Boolean(room.value.music && room.value.music.audioPath)) // the mix saved on the Music page

// Looking at the stickers takes a moment (each one is checked to see if it is a GIF), so the cards wait for it
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

const options = computed(() =>
  exportOptions({ complete: contents.value.complete, hasVideo: contents.value.hasVideo, hasMusic: hasMusic.value, hasGifSticker: gifSticker.value })
)

const FORMAT_INFO = {
  png: { name: 'PNG', blurb: 'A still picture of your strip' },
  gif: { name: 'GIF', blurb: 'A looping animation, no sound' },
  mp4: { name: 'MP4', blurb: 'A video with your music' },
}

// The chosen format: what the room saved, if it can still be used. If not (or nothing was chosen yet), the best one
// that can be: MP4, then GIF, then PNG. null if nothing can be chosen (the strip is not finished).
const chosenFormat = computed(() => {
  const saved = room.value.exportFormat
  if (saved && options.value[saved] && options.value[saved].available) return saved
  return ['mp4', 'gif', 'png'].find((format) => options.value[format].available) || null
})

async function chooseFormat(format) {
  if (checking.value || !options.value[format].available) return
  await updateDoc(roomRef(), { exportFormat: format })
}

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
        exportFormat: format,
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
  <!-- The bar at the top with the 7 steps (this page is step 7, Export) -->
  <StageBar current="export" />

  <div class="row g-3">
    <!-- LEFT: the final strip, with its videos playing -->
    <div class="col-12 col-lg-4 order-2 order-lg-1">
      <div class="panel">
        <h2 class="h5 fw-bold">Your strip</h2>
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

    <!-- MIDDLE: the format -->
    <div class="col-12 col-lg-4 order-1 order-lg-2">
      <div class="panel">
        <h2 class="h5 fw-bold">Export</h2>
        <p class="small text-muted mb-2">Format</p>

        <!-- One card per format. A card that cannot be chosen is blurred, with the reason on top of it. -->
        <div class="d-grid gap-2">
          <div v-for="format in FORMATS" :key="format" class="format-wrap">
            <div
              class="format-card"
              :class="{ selected: chosenFormat === format, locked: checking || !options[format].available }"
              role="radio"
              :aria-checked="chosenFormat === format"
              :aria-disabled="checking || !options[format].available"
              :tabindex="checking || !options[format].available ? -1 : 0"
              @click="chooseFormat(format)"
              @keydown.enter="chooseFormat(format)"
              @keydown.space.prevent="chooseFormat(format)"
            >
              <div>
                <div class="fw-bold">{{ FORMAT_INFO[format].name }}</div>
                <div class="small text-muted">{{ FORMAT_INFO[format].blurb }}</div>
              </div>
              <span class="radio-dot"></span>
            </div>
            <span v-if="!checking && !options[format].available" class="lock-reason">{{ options[format].reason }}</span>
          </div>
        </div>

        <!-- PNG and GIF cannot carry the music: say so, and point to MP4 if it can be chosen -->
        <p v-if="chosenFormat && options[chosenFormat].musicLost" class="small text-warning-emphasis bg-warning-subtle rounded p-2 mt-3 mb-0">
          Your music won't be included in a {{ FORMAT_INFO[chosenFormat].name }}.
          <template v-if="options.mp4.available">Choose MP4 to keep it.</template>
        </p>
      </div>
    </div>

    <!-- RIGHT: the name, and on to the Share page -->
    <div class="col-12 col-lg-4 order-3">
      <div class="panel">
        <h2 class="h5 fw-bold">Name your photostrip</h2>
        <label for="strip-name" class="small text-muted mb-1">Everyone in the room sees this as you type</label>
        <input
          id="strip-name"
          v-model="nameDraft"
          type="text"
          class="form-control"
          maxlength="40"
          :placeholder="suggestedName"
          @input="onNameInput"
          @blur="typing && saveName()"
        />
        <p class="small text-muted mt-2">It is the title on the Share page, and in My Studio if you save it there.</p>

        <button class="btn btn-primary w-100 mt-2" :disabled="!canShare" @click="shareAndDownload">
          {{ sharing ? 'Opening...' : 'Share and download' }}
        </button>
        <p v-if="!chosenFormat && !checking" class="small text-muted text-center mt-1 mb-0">Finish the strip first: every slot needs a photo or video.</p>

        <hr />
        <button class="btn btn-outline-secondary btn-sm" @click="goToStage('music')">&larr; Music</button>
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

/* wraps a format card, so the reason can sit on top of it without being blurred too */
.format-wrap {
  position: relative;
}

.format-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 2px solid #e3e6ef;
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.format-card:hover:not(.locked) {
  border-color: #b9c6f7;
}

.format-card.selected {
  border-color: #2f5bea;
  background: #f1f4ff;
}

/* Cannot be chosen: blurred and faded */
.format-card.locked {
  filter: blur(2.5px);
  opacity: 0.55;
  cursor: not-allowed;
  user-select: none;
}

/* The round button on the right of a card: filled when chosen */
.radio-dot {
  flex: none;
  width: 18px;
  height: 18px;
  border: 2px solid #b8bdd0;
  border-radius: 50%;
}

.selected .radio-dot {
  border-color: #2f5bea;
  background: radial-gradient(#2f5bea 45%, transparent 50%);
}

/* The reason a card is blurred, in the middle of it, sharp. Lets taps through to the card. */
.lock-reason {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: #1a1a2e;
  pointer-events: none;
}
</style>
