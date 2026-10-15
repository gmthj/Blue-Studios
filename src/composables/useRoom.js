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
//   const { room, activeMembers, photos, roomRef } = useRoom()

const code = ref('')      // the room code, e.g. '0427'
const room = ref(null)    // the room document: { hostId, hostName, shotNumber, stage, stripSlots, closed, ... }
const members = ref([])   // every member document in the room
const photos = ref([])    // every photo taken in the room (oldest first)
const now = ref(Date.now()) // updated every heartbeat, so activeMembers is re-checked

let memberRef = null
let stopRoomListener = null
let stopMembersListener = null
let stopPhotosListener = null
let heartbeatTimer = null

// Only the members who are still here (their device updated lastSeen recently)
const activeMembers = computed(() => {
  return members.value.filter((member) => isActive(member, now.value))
})

// The Firestore reference to this room's document (for updateDoc etc.)
function roomRef() {
  return doc(db, 'rooms', code.value)
}

// Called once by RoomLayout.vue when we enter a room
async function enterRoom(roomCode, guestId, name, deviceType) {
  code.value = roomCode
  memberRef = doc(db, 'rooms', roomCode, 'members', guestId)

  // Clear anything left over from a previous room
  room.value = null
  members.value = []
  photos.value = []

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
  stopRoomListener = null
  stopMembersListener = null
  stopPhotosListener = null
  clearInterval(heartbeatTimer)

  if (removeMember && memberRef) {
    await deleteDoc(memberRef)
  }
  // (We keep room/members/photos as they are, so the page on screen does not break while we
  //  navigate away. enterRoom() clears them when we join the next room.)
}

export function useRoom() {
  return { code, room, activeMembers, photos, roomRef, enterRoom, exitRoom }
}
