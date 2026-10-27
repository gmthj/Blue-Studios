<script setup>
// ref: a value Vue watches (the page updates when it changes). computed: a value worked out from other values.
import { ref, computed } from 'vue'
// updateDoc changes some fields of a Firestore document without touching the others. deleteField() removes a field.
import { updateDoc, deleteField } from 'firebase/firestore'
// useRoom gives the shared room data (the same for every page in the room)
import { useRoom } from '../composables/useRoom.js'
// CLIP_SECONDS: how long a clip is. resolveTimeline: joins a timeline with the clip documents.
// editedVideoList: the saved edits as a list. newEditedVideoId: a new random id for a saved edit.
import { CLIP_SECONDS, MAX_EDIT_SECONDS, resolveTimeline, editedVideoList, newEditedVideoId } from '../clips.js'
import StageBar from '../components/StageBar.vue'
import ClipThumb from '../components/ClipThumb.vue'
import ClipSequencePlayer from '../components/ClipSequencePlayer.vue'
import { askConfirm } from '../composables/useDialog.js'

// The "Video" page (a child of RoomLayout.vue): edit the room's clips into videos for the strip.
//   Left:  a preview that plays the timeline, and the timeline (order the clips and trim each one)
//   Right: the saved edits, and every clip recorded in the room (press Add to put it on the timeline)
// The timeline being worked on is saved in the room document (room.videoTimeline), so everyone sees the same edit.
// "Save to gallery" turns it into a saved edit (room.editedVideos), empties the timeline, and the next edit can
// start from scratch. A clip can be used in as many edits as you like. The saved edits then show up on the Pick
// page, to put in a strip slot (see resolveEditedVideos in clips.js).
// The clips play one after another (hard cuts). Each timeline item is { clipId, start, end } in seconds.

// room: the room document (live). clips: every clip recorded in the room (live). roomRef(): the room's Firestore reference.
const { room, clips, roomRef } = useRoom()

const message = ref('')    // a short message under the Save button, e.g. "Saved as Edit 2"

// ---------- THE TIMELINE ----------

// What the room saved, joined with each clip's document: [ { clip, start, end } ]
// "computed" runs again by itself whenever the room or the clips change.
const entries = computed(() => resolveTimeline(room.value.videoTimeline, clips.value))
// The edit's length: add up (end - start) of every clip
const totalSeconds = computed(() => entries.value.reduce((sum, e) => sum + (e.end - e.start), 0))

// ---- The 15 second limit (MAX_EDIT_SECONDS) ----
// An edit can never be longer than this. Adding a clip that does not fit is blocked, and a trim stops at the limit.
// (0.001 of extra room, because seconds like 0.1 are not exact numbers in a computer)
const EXTRA = 0.001
const secondsLeft = computed(() => Math.max(0, MAX_EDIT_SECONDS - totalSeconds.value))
const canAddClip = computed(() => secondsLeft.value + EXTRA >= CLIP_SECONDS) // room for one more whole clip?
// Only possible if two people add clips at the same moment, which can push the edit over the limit
const overLimit = computed(() => totalSeconds.value > MAX_EDIT_SECONDS + EXTRA)
const limitMessage = ref('') // shown under the meter, e.g. "Only 2 of 4 clips fit"

// The ids of the clips already on the timeline, to show "On timeline" instead of the Add button
const onTimeline = computed(() => new Set(entries.value.map((e) => e.clip.id)))

// The whole list is saved each time (like the stickers). Anyone can edit, the last change wins.
async function saveTimeline(list) {
  message.value = ''
  await updateDoc(roomRef(), { videoTimeline: list }) // every device in the room sees the change straight away
}

// The timeline as a plain list of { clipId, start, end }, ready to change and save
function currentList() {
  return entries.value.map((e) => ({ clipId: e.clip.id, start: e.start, end: e.end }))
}

// Add button: put a clip at the end of the timeline, untrimmed (from 0 to the full length)
async function addClip(clip) {
  if (!canAddClip.value) { // blocked: the button is greyed out, this is for a click that sneaks in
    limitMessage.value = 'No room for another clip: an edit can be ' + MAX_EDIT_SECONDS + ' seconds at most.'
    return
  }
  limitMessage.value = ''
  await saveTimeline([...currentList(), { clipId: clip.id, start: 0, end: CLIP_SECONDS }])
}

// "Add session": put all of a session's clips that are not on the timeline yet at the end, in the order they were recorded
async function addSession(session) {
  const list = currentList()
  let free = secondsLeft.value // how many seconds are still free
  let added = 0
  let skipped = 0
  for (const clip of session.clips) {
    if (onTimeline.value.has(clip.id)) continue // already on the timeline
    if (free + EXTRA >= CLIP_SECONDS) {
      list.push({ clipId: clip.id, start: 0, end: CLIP_SECONDS })
      free -= CLIP_SECONDS
      added++
    } else {
      skipped++ // does not fit
    }
  }
  limitMessage.value = skipped > 0 ? 'Only ' + added + ' of ' + (added + skipped) + ' clips fit: an edit can be ' + MAX_EDIT_SECONDS + ' seconds at most.' : ''
  await saveTimeline(list)
}

// ✕ button: take the clip at this position off the timeline (the clip itself stays in the room)
async function removeClip(index) {
  limitMessage.value = ''
  const list = currentList()
  list.splice(index, 1) // splice(position, 1) removes one item
  await saveTimeline(list)
}

// Swap a clip with the one before it (-1) or after it (+1)
async function moveClip(index, direction) {
  limitMessage.value = ''
  const list = currentList()
  const other = index + direction // the position to swap with
  if (other < 0 || other >= list.length) return // already first or last
  const item = list[index]
  list[index] = list[other]
  list[other] = item
  await saveTimeline(list)
}

// Trim: key is 'start' or 'end' (seconds), event is the slider's @change event.
// The other end is pushed if they would get too close, and a trim that would make the edit longer than the limit
// stops at the limit (the slider jumps back to where it stopped).
async function trim(index, key, event) {
  const value = Number(event.target.value)
  const list = currentList()
  const item = list[index]
  item[key] = value // set the new start or end
  // Keep at least 0.3 seconds between start and end: if you drag one past the other, it pushes the other along
  if (key === 'start' && item.end < value + 0.3) item.end = Math.min(CLIP_SECONDS, value + 0.3)
  if (key === 'end' && item.start > value - 0.3) item.start = Math.max(0, value - 0.3)

  // How long this clip may be: the limit minus all the OTHER clips (never less than the 0.3 minimum)
  const others = totalSeconds.value - (entries.value[index].end - entries.value[index].start)
  const allowed = Math.max(0.3, MAX_EDIT_SECONDS - others)
  limitMessage.value = ''
  if (item.end - item.start > allowed + EXTRA) {
    // too long: keep the end you did NOT move, and stop the moved one at the limit (rounded to 0.1)
    if (key === 'end') item.end = Math.round((item.start + allowed) * 10) / 10
    else item.start = Math.round((item.end - allowed) * 10) / 10
    limitMessage.value = 'The ' + MAX_EDIT_SECONDS + ' second limit is reached: an edit can be ' + MAX_EDIT_SECONDS + ' seconds at most.'
  }
  event.target.value = item[key] // show where the slider really is (it may not be where it was dragged to)
  await saveTimeline(list)
}

// ---------- SAVED EDITS ----------

// The saved edits, oldest first: [ { id, name, timeline, entries, seconds } ]
const editedList = computed(() => editedVideoList(room.value.editedVideos, clips.value))
// The saved edit that is open in the timeline (room.videoEditing), or null if the timeline is a new edit.
// (null also if that edit was deleted meanwhile, so we never save into something that is gone.)
const editingEdit = computed(() => editedList.value.find((e) => e.id === room.value.videoEditing) || null)

// The name of the next new edit: "Edit 1", "Edit 2", ... one more than the biggest number used so far
function nextName() {
  let biggest = 0
  for (const edit of editedList.value) {
    const match = /^Edit (\d+)$/.exec(edit.name)
    if (match) biggest = Math.max(biggest, Number(match[1]))
  }
  return 'Edit ' + (biggest + 1)
}

// "Save to gallery" (a new edit) or "Save changes" (an edit that was opened again).
// Either way the timeline is emptied afterwards, ready for the next edit.
async function saveEdit() {
  const list = currentList()
  if (list.length === 0 || overLimit.value) return // nothing to save, or too long (the button is greyed out too)
  const changes = { videoTimeline: [], videoEditing: null }
  let name
  if (editingEdit.value) {
    name = editingEdit.value.name
    changes['editedVideos.' + editingEdit.value.id + '.timeline'] = list // 'a.b.c' changes only that one field
  } else {
    name = nextName()
    changes['editedVideos.' + newEditedVideoId()] = { name: name, timeline: list, createdAt: Date.now() }
  }
  await updateDoc(roomRef(), changes)
  message.value = 'Saved as ' + name + '! Make another, or go back to Pick.'
}

// Cancel: stop changing a saved edit, and empty the timeline (the saved edit stays as it was)
async function cancelEdit() {
  message.value = ''
  await updateDoc(roomRef(), { videoTimeline: [], videoEditing: null })
}

// Edit button: open a saved edit in the timeline
async function openEdit(edit) {
  // The timeline is replaced, so ask first if there is something in it that would be lost
  if (entries.value.length > 0 && !(await askConfirm({ title: 'Replace the timeline?', message: 'This replaces the timeline you are working on.', confirmLabel: 'Replace' }))) return
  message.value = ''
  await updateDoc(roomRef(), { videoTimeline: edit.timeline, videoEditing: edit.id })
}

// Delete button: remove a saved edit, and take it out of any strip slot that has it
async function deleteEdit(edit) {
  if (!(await askConfirm({ title: 'Delete ' + edit.name + '?', message: 'It is also taken off the strip.', confirmLabel: 'Delete', danger: true }))) return
  message.value = ''
  const changes = { ['editedVideos.' + edit.id]: deleteField() } // deleteField() removes the whole field
  const slots = room.value.stripSlots || {}
  for (const key of Object.keys(slots)) {
    if (slots[key] === edit.id) {
      changes['stripSlots.' + key] = null
      changes['stripEdits.' + key] = null
    }
  }
  if (editingEdit.value && editingEdit.value.id === edit.id) {
    changes.videoTimeline = []
    changes.videoEditing = null
  }
  await updateDoc(roomRef(), changes)
}

// ---------- THE ROOM'S CLIPS ----------

// The clips grouped by session (shot number), Session 1 first: [ { shotNumber, clips: [...] } ]
const sessions = computed(() => {
  const groups = []
  for (const clip of clips.value) {
    let group = groups.find((g) => g.shotNumber === clip.shotNumber)
    if (!group) {
      group = { shotNumber: clip.shotNumber, clips: [] }
      groups.push(group)
    }
    group.clips.push(clip)
  }
  return groups.sort((a, b) => a.shotNumber - b.shotNumber)
})

// Everyone moves to another page together (RoomLayout.vue follows the room's "stage")
async function goToStage(stage) {
  await updateDoc(roomRef(), { stage: stage })
}
</script>

<template>
  <!-- The bar at the top with the 7 steps (this page is step 4, Video) -->
  <StageBar current="video" />

  <!-- Bootstrap grid: 2 columns from "lg" (992px) up, stacked on phones -->
  <div class="row g-3">
    <!-- LEFT: preview and timeline -->
    <div class="col-12 col-lg-7 order-1">
      <div class="panel mb-3">
        <h2 class="h5 fw-bold">Preview</h2>
        <!-- Plays the timeline's clips one after another -->
        <ClipSequencePlayer :entries="entries" />
      </div>

      <div class="panel">
        <div class="d-flex justify-content-between align-items-baseline">
          <!-- Says which saved edit is open, or that this is a new one -->
          <h2 class="h5 fw-bold">{{ editingEdit ? 'Changing ' + editingEdit.name : 'New edit' }}</h2>
          <!-- toFixed(1): one decimal place, e.g. 7.5 -->
          <span class="small" :class="overLimit ? 'text-danger fw-bold' : 'text-muted'">{{ entries.length }} clip(s) · {{ totalSeconds.toFixed(1) }} / {{ MAX_EDIT_SECONDS }}s</span>
        </div>
        <!-- The length meter: the bar fills up to the limit, and turns red if the edit is over it -->
        <div class="progress mb-1" style="height: 8px">
          <div class="progress-bar" :class="{ 'bg-danger': overLimit }" :style="{ width: Math.min(100, (totalSeconds / MAX_EDIT_SECONDS) * 100) + '%' }"></div>
        </div>
        <p class="small text-muted mb-2">
          An edited video can be up to {{ MAX_EDIT_SECONDS }} seconds. A strip with video is exported as a {{ MAX_EDIT_SECONDS }} second video, and shorter videos repeat.
        </p>
        <p v-if="limitMessage" class="small text-danger mb-2">{{ limitMessage }}</p>
        <p v-if="overLimit" class="small text-danger mb-2">
          This edit is over {{ MAX_EDIT_SECONDS }} seconds (someone added a clip at the same time). Remove or trim a clip to save it.
        </p>
        <!-- Only shown while the timeline is empty -->
        <p v-if="entries.length === 0" class="small text-muted mb-0">
          Press Add on a clip (or Add session) to put it here. The clips play one after another, in this order.
        </p>

        <!-- One row per clip on the timeline (v-for repeats the row for each entry) -->
        <ol class="list-unstyled mb-0">
          <li v-for="(entry, index) in entries" :key="entry.clip.id" class="timeline-row">
            <div class="d-flex align-items-center gap-2">
              <span class="badge text-bg-primary">{{ index + 1 }}</span>
              <!-- Who recorded it, which shot, and how long it is after trimming -->
              <span class="small flex-grow-1 text-truncate">{{ entry.clip.name }} · Shot {{ entry.clip.shotNumber }} · {{ (entry.end - entry.start).toFixed(1) }}s</span>
              <!-- ↑ is disabled for the first clip and ↓ for the last (nowhere to move) -->
              <button class="icon-btn" :disabled="index === 0" title="Move earlier" @click="moveClip(index, -1)">↑</button>
              <button class="icon-btn" :disabled="index === entries.length - 1" title="Move later" @click="moveClip(index, 1)">↓</button>
              <button class="icon-btn" title="Take off the timeline" @click="removeClip(index)">✕</button>
            </div>
            <!-- Trim: saved on @change (when the slider is let go), so Firestore is not written on every pixel -->
            <label class="form-label small d-flex justify-content-between mb-0">Start <span>{{ entry.start.toFixed(1) }}s</span></label>
            <input type="range" class="form-range" min="0" :max="CLIP_SECONDS" step="0.1" :value="entry.start"
                   @change="trim(index, 'start', $event)" />
            <label class="form-label small d-flex justify-content-between mb-0">End <span>{{ entry.end.toFixed(1) }}s</span></label>
            <input type="range" class="form-range" min="0" :max="CLIP_SECONDS" step="0.1" :value="entry.end"
                   @change="trim(index, 'end', $event)" />
          </li>
        </ol>

        <!-- Save: a new edit goes to the gallery (the timeline is emptied for the next one). Cancel only when changing a saved edit. -->
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-success flex-fill" :disabled="entries.length === 0 || overLimit" @click="saveEdit">
            {{ editingEdit ? 'Save changes' : 'Save to gallery' }}
          </button>
          <button v-if="editingEdit" class="btn btn-outline-secondary" @click="cancelEdit">Cancel</button>
        </div>
        <p v-if="message" class="small text-success mt-2 mb-0">{{ message }}</p>
      </div>
    </div>

    <!-- RIGHT: the saved edits, the room's clips, and back to Pick -->
    <div class="col-12 col-lg-5 order-2">
      <!-- Only shown once there is a saved edit -->
      <div v-if="editedList.length > 0" class="panel mb-3">
        <h2 class="h5 fw-bold">Saved edits</h2>
        <ul class="list-unstyled mb-0">
          <li v-for="edit in editedList" :key="edit.id" class="saved-row" :class="{ open: editingEdit && editingEdit.id === edit.id }">
            <span class="badge edited-badge">✂ {{ edit.name }}</span>
            <span class="small text-muted flex-grow-1">{{ edit.entries.length }} clip(s) · {{ edit.seconds.toFixed(1) }}s</span>
            <button class="btn btn-outline-primary btn-sm py-0" @click="openEdit(edit)">Edit</button>
            <button class="btn btn-outline-danger btn-sm py-0" @click="deleteEdit(edit)">Delete</button>
          </li>
        </ul>
      </div>

      <div class="panel">
        <h2 class="h5 fw-bold">Room clips</h2>
        <p v-if="clips.length === 0" class="small text-muted">No clips yet. Go back to the camera and record some in Video mode.</p>
        <!-- One box per session, with all its clips (3 per row, col-4) -->
        <section v-for="session in sessions" :key="session.shotNumber" class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <h3 class="h6 mb-0">Session {{ session.shotNumber }}</h3>
            <!-- Puts all of this session's clips on the timeline, in the order they were recorded -->
            <button class="btn btn-outline-primary btn-sm py-0" :disabled="!canAddClip" :title="canAddClip ? '' : 'No room left: ' + MAX_EDIT_SECONDS + ' second limit'" @click="addSession(session)">Add session</button>
          </div>
          <div class="row g-2">
            <div v-for="clip in session.clips" :key="clip.id" class="col-4">
              <ClipThumb :clip="clip" />
              <p class="small text-muted text-truncate mb-1">{{ clip.name }}</p>
              <!-- A clip can be on the timeline once: "On timeline" if it is, otherwise the Add button -->
              <span v-if="onTimeline.has(clip.id)" class="badge text-bg-light">On timeline</span>
              <button v-else class="btn btn-outline-primary btn-sm py-0" :disabled="!canAddClip" :title="canAddClip ? '' : 'No room left: ' + MAX_EDIT_SECONDS + ' second limit'" @click="addClip(clip)">Add</button>
            </div>
          </div>
        </section>

        <!-- Back to the Pick page. The saved edits are there, to drag into a slot like a photo. -->
        <button class="btn btn-primary w-100" @click="goToStage('pick')">Done: back to Pick &rarr;</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A white rounded card, the same look as the Pick and Decorate pages */
.panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* One clip on the timeline: a light grey box */
.timeline-row {
  background: #F4F5F9;
  border-radius: 10px;
  padding: 8px 10px;
  margin-top: 8px;
}

/* One saved edit: its name (purple, like on the Pick page), its length, and the Edit / Delete buttons */
.saved-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
}

/* The saved edit that is open in the timeline */
.saved-row.open {
  background: #EFEBFF;
}

.edited-badge {
  background: #7B61FF;
  color: #fff;
}

/* The small ↑ ↓ ✕ buttons: no border or background, just the symbol */
.icon-btn {
  border: none;
  background: none;
  padding: 0 4px;
  color: #6B7080;
}

/* Greyed out when disabled (e.g. ↑ on the first clip) */
.icon-btn:disabled {
  opacity: 0.3;
}
</style>
