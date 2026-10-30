import { ref, computed } from 'vue'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase.js'
import { isActive, HEARTBEAT_MS } from '../room.js'

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
// steps people can jump back (and forward again) to. RoomLayout.vue keeps it up to date.
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

// Move everyone to another stage (RoomLayout.vue follows room.stage, on every device)
// extraFields: other room fields to save in the same write, e.g. goToStage('share', { exportJob: { ... } })
async function goToStage(stageId, extraFields = {}) {
  const changes = { ...extraFields, stage: stageId }
  if (stageIndex(stageId) > furthestIndex.value) {
    changes.furthestStage = stageId
  }
  await updateDoc(roomRef(), changes)
}

// The room moved further than ever before (by anyone, from any page): remember it.
// Every device may write the same value at about the same time, which is fine.
async function saveProgress() {
  if (!room.value) return
  const reached = room.value.stage
  if (stageIndex(reached) > stageIndex(room.value.furthestStage)) {
    try {
      await updateDoc(roomRef(), { furthestStage: reached })
    } catch (error) {
      console.error(error)
    }
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
  })

  // Listen to the video clips, the same way
  const clipsQuery = query(collection(db, 'rooms', roomCode, 'clips'), orderBy('createdAt'))
  stopClipsListener = onSnapshot(clipsQuery, (snapshot) => {
    const list = []
    snapshot.forEach((clipDoc) => {
      list.push({ id: clipDoc.id, ...clipDoc.data() })
    })
    clips.value = list
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
  return { code, room, activeMembers, photos, clips, roomRef, enterRoom, exitRoom, furthestIndex, goToStage, saveProgress }
}
