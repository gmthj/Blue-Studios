import { ref, computed } from 'vue'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, query, orderBy, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase.js'
import { isActive, HEARTBEAT_MS } from '../room.js'
import { roomLayout, emptySlotIndexes, emptySlotsMessage } from '../stripData.js'
import { resolveEditedVideos } from '../clips.js'
import { showNotice } from './useDialog.js'

// SHARED room state for every page inside a room (camera page, strip page, future pages).
//
// The refs are created ONCE, here outside the useRoom() function. So every page that calls
// useRoom() gets the SAME refs: when the room changes in Firestore, every page sees it.
//
// Usage in a page:
//   const { room, activeMembers, photos, clips, roomRef } = useRoom()
//   goToStage('pick')    move the whole room to another step (see STAGES below)

const code = ref('')      // the room code, e.g. '0427'
const room = ref(null)    // the room document: { hostId, hostName, shotNumber, stage, stripSlots, closed, ... }
const members = ref([])   // every member document in the room
const photos = ref([])    // every photo taken in the room (oldest first)
const clips = ref([])     // every video clip recorded in the room (oldest first), see clips.js
const now = ref(Date.now()) // updated every heartbeat, so activeMembers is re-checked

let memberRef = null
let stopRoomListener = null
let stopMembersListener = null
let stopPhotosListener = null
let stopClipsListener = null
let heartbeatTimer = null

// Only the members who are still here (their device updated lastSeen recently)
const activeMembers = computed(() => {
  return members.value.filter((member) => isActive(member, now.value))
})

// The Firestore reference to this room's document (for updateDoc etc.)
function roomRef() {
  return doc(db, 'rooms', code.value)
}

// ---------- STAGES ----------
// The room's steps, in order. The whole group is always on the same one: room.stage.
//   id        the stage's name, used everywhere: room.stage, <StageBar current="pick" />,
//             and the end of the page's URL (/room/4821/pick, see router.js)
//   hasPage   false if that page is not in the app yet (the stage bar cannot open it)
// room.furthestStage is the furthest stage the room has reached, so the stage bar knows which
// steps people can jump back (and forward again) to. room.visitedStages lists the steps it has really been on. RoomLayout.vue keeps it up to date.
export const ROOM_STAGES = [
  { id: 'shoot', label: 'Shoot', hasPage: true },       // /room/4821/shoot    (RoomView)
  { id: 'pick', label: 'Pick', hasPage: true },         // /room/4821/pick     (StripView)
  { id: 'video', label: 'Video', hasPage: true },       // /room/4821/video    (VideoView)
  { id: 'decorate', label: 'Decorate', hasPage: true }, // /room/4821/decorate (DecorateView)
  { id: 'music', label: 'Music', hasPage: true },       // /room/4821/music    (MusicView)
  { id: 'export', label: 'Export', hasPage: true },     // /room/4821/export   (ExportView)
  { id: 'share', label: 'Share', hasPage: true },       // /room/4821/share    (ShareView)
]

// Position of a stage in ROOM_STAGES (0 = shoot). A missing stage counts as shoot.
export function stageIndex(stageId) {
  return Math.max(ROOM_STAGES.findIndex((stage) => stage.id === stageId), 0)
}

// How far the room has got: the furthest stage reached (rooms made before furthestStage existed
// use the stage they are on now)
const furthestIndex = computed(() => {
  if (!room.value) return 0
  return Math.max(stageIndex(room.value.furthestStage), stageIndex(room.value.stage))
})

// The steps the room has really been on (room.visitedStages), for the ticks in the stage bar. Skipping ahead
// (Quick export) leaves the steps in between out. Rooms made before visitedStages existed count every step
// up to the furthest one as visited.
const visitedStageIds = computed(() => {
  if (!room.value) return new Set()
  if (Array.isArray(room.value.visitedStages)) return new Set([...room.value.visitedStages, room.value.stage])
  return new Set(ROOM_STAGES.filter((stage, index) => index <= furthestIndex.value).map((stage) => stage.id))
})

// ---------- EVERY FRAME MUST BE FILLED ----------
// Decorate and every stage after it need a photo or video in every slot of the strip.
// This is checked here, in goToStage, so it holds for every way of moving on: Pick's Next / Export,
// the stage bar, and the back / forward buttons on the later pages.
// RoomLayout.vue also sends the room back to Pick if it is ever on a later stage with an empty slot.
export function needsFullStrip(stageId) {
  return stageIndex(stageId) >= stageIndex('decorate')
}

// The slots of the strip that are still empty, as indexes (0 = the first slot)
const emptyStripSlots = computed(() => {
  if (!room.value) return []
  const slots = room.value.stripSlots || {}
  const photoIds = new Set(photos.value.map((photo) => photo.id))
  const clipIds = new Set(clips.value.map((clip) => clip.id))
  const edited = resolveEditedVideos(room.value.editedVideos, clips.value)
  // a slot is filled by a photo, a clip, or an edited video (that still has clips)
  return emptySlotIndexes(roomLayout(room.value).slots.length, (i) => {
    const id = slots[i]
    return !!(id && (photoIds.has(id) || clipIds.has(id) || (edited[id] && edited[id].entries.length > 0)))
  })
})

// true once the photos and clips have arrived from Firestore (before that, every slot looks empty)
const mediaLoaded = ref(false)
let photosLoaded = false
let clipsLoaded = false

// Can the room move to this stage? Says which slots are empty if not.
// Goes up by one every time a move is refused because a frame is empty, so the Pick page can make the
// empty frames flash (StripView.vue watches it)
const fullStripBlocked = ref(0)

async function checkFullStrip(stageId) {
  if (!needsFullStrip(stageId) || emptyStripSlots.value.length === 0) return true
  fullStripBlocked.value++
  await showNotice({
    title: 'Fill every slot to continue',
    message: emptySlotsMessage(emptyStripSlots.value) + ' Go to Pick and drag a photo or video into each slot before moving on.',
    confirmLabel: 'OK',
    icon: 'layout',
  })
  return false
}

// Move everyone to another stage (RoomLayout.vue follows room.stage, on every device)
// extraFields: other room fields to save in the same write, e.g. goToStage('share', { exportJob: { ... } })
// Returns false (and moves no one) if the stage needs every frame filled and one is still empty.
async function goToStage(stageId, extraFields = {}) {
  if (!(await checkFullStrip(stageId))) return false
  const changes = { ...extraFields, stage: stageId }
  if (stageIndex(stageId) > furthestIndex.value) {
    changes.furthestStage = stageId
  }
  await updateDoc(roomRef(), changes)
  return true
}

// The room moved to a stage: remember it (furthestStage, and visitedStages for the ticks in the stage bar).
// Every device may write the same value at about the same time, which is fine (arrayUnion adds it only once).
async function saveProgress() {
  if (!room.value) return
  const reached = room.value.stage
  const changes = {}
  if (stageIndex(reached) > stageIndex(room.value.furthestStage)) changes.furthestStage = reached
  if (!Array.isArray(room.value.visitedStages)) {
    // A room made before visitedStages existed: start from the steps it counted as reached
    changes.visitedStages = ROOM_STAGES.filter((stage, index) => index <= furthestIndex.value).map((stage) => stage.id)
  } else if (!room.value.visitedStages.includes(reached)) {
    changes.visitedStages = arrayUnion(reached)
  }
  if (Object.keys(changes).length === 0) return
  try {
    await updateDoc(roomRef(), changes)
  } catch (error) {
    console.error(error)
  }
}

// Called once by RoomLayout.vue when we enter a room
async function enterRoom(roomCode, uid, name, deviceType) {
  code.value = roomCode
  memberRef = doc(db, 'rooms', roomCode, 'members', uid)

  // Clear anything left over from a previous room
  room.value = null
  members.value = []
  photos.value = []
  clips.value = []
  mediaLoaded.value = false
  photosLoaded = false
  clipsLoaded = false

  // Save (or update) my member document. Keep my original joinedAt if I was already in the room.
  const existing = await getDoc(memberRef)
  const data = { name: name, deviceType: deviceType, lastSeen: Date.now() }
  if (!existing.exists()) {
    data.joinedAt = Date.now()
  }
  await setDoc(memberRef, data, { merge: true }) // merge: only change these fields

  // Load the room once now (so pages can use it straight away), then listen for changes
  const roomSnap = await getDoc(roomRef())
  room.value = roomSnap.data()
  stopRoomListener = onSnapshot(roomRef(), (snapshot) => {
    room.value = snapshot.data()
  })

  // Listen to the members list
  const membersQuery = query(collection(db, 'rooms', roomCode, 'members'), orderBy('joinedAt'))
  stopMembersListener = onSnapshot(membersQuery, (snapshot) => {
    const list = []
    snapshot.forEach((memberDoc) => {
      list.push({ id: memberDoc.id, ...memberDoc.data() })
    })
    members.value = list
    now.value = Date.now()
  })

  // Listen to the photos, so new photos from anyone appear straight away
  const photosQuery = query(collection(db, 'rooms', roomCode, 'photos'), orderBy('createdAt'))
  stopPhotosListener = onSnapshot(photosQuery, (snapshot) => {
    const list = []
    snapshot.forEach((photoDoc) => {
      list.push({ id: photoDoc.id, ...photoDoc.data() })
    })
    photos.value = list
    photosLoaded = true
    mediaLoaded.value = photosLoaded && clipsLoaded
  })

  // Listen to the video clips, the same way
  const clipsQuery = query(collection(db, 'rooms', roomCode, 'clips'), orderBy('createdAt'))
  stopClipsListener = onSnapshot(clipsQuery, (snapshot) => {
    const list = []
    snapshot.forEach((clipDoc) => {
      list.push({ id: clipDoc.id, ...clipDoc.data() })
    })
    clips.value = list
    clipsLoaded = true
    mediaLoaded.value = photosLoaded && clipsLoaded
  })

  // Heartbeat: every 15 seconds, tell the others I am still here
  heartbeatTimer = setInterval(async () => {
    now.value = Date.now()
    try {
      await updateDoc(memberRef, { lastSeen: Date.now() })
    } catch (error) {
      console.error(error)
    }
  }, HEARTBEAT_MS)
}

// removeMember = true when pressing "Leave room" (removes me from the members list straight away)
async function exitRoom(removeMember) {
  if (stopRoomListener) stopRoomListener()
  if (stopMembersListener) stopMembersListener()
  if (stopPhotosListener) stopPhotosListener()
  if (stopClipsListener) stopClipsListener()
  stopRoomListener = null
  stopMembersListener = null
  stopPhotosListener = null
  stopClipsListener = null
  clearInterval(heartbeatTimer)

  if (removeMember && memberRef) {
    await deleteDoc(memberRef)
  }
  // (We keep room/members/photos as they are, so the page on screen does not break while we
  //  navigate away. enterRoom() clears them when we join the next room.)
}

export function useRoom() {
  return { code, room, activeMembers, photos, clips, roomRef, enterRoom, exitRoom, furthestIndex, visitedStageIds, goToStage, fullStripBlocked, saveProgress, emptyStripSlots, mediaLoaded }
}
