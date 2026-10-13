import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase.js'

// At most 6 people in a room at once: 1 host + 5 guests
export const MAX_PEOPLE = 6

// Every device in a room updates its "lastSeen" time every 15 seconds (see useRoomMembers.js).
// If a member has not been seen for 45 seconds, they closed the page, so we stop counting them.
export const HEARTBEAT_MS = 15 * 1000
export const ACTIVE_MS = 45 * 1000

// Is this member still in the room?
export function isActive(member, now) {
  return member.lastSeen !== undefined && now - member.lastSeen < ACTIVE_MS
}

// Returns true if the room already has 6 active people and I am not one of them
// (if I am already in the room, e.g. after a refresh, I am always allowed back in)
export async function isRoomFull(code, guestId) {
  const snapshot = await getDocs(collection(db, 'rooms', code, 'members'))
  const now = Date.now()

  let activeCount = 0
  let alreadyInRoom = false
  snapshot.forEach((memberDoc) => {
    if (isActive(memberDoc.data(), now)) {
      activeCount = activeCount + 1
      if (memberDoc.id === guestId) {
        alreadyInRoom = true
      }
    }
  })

  return !alreadyInRoom && activeCount >= MAX_PEOPLE
}
