import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase.js'

// At most 6 people in a room at once: 1 host + 5 guests
export const MAX_PEOPLE = 6

// Who is still in the room (the 15 second heartbeat and 45 second timeout) lives in roomTiming.js
import { isActive } from './roomTiming.js'
export { HEARTBEAT_MS, ACTIVE_MS, isActive } from './roomTiming.js'

// Returns true if the room already has 6 active people and I am not one of them
// (if I am already in the room, e.g. after a refresh, I am always allowed back in)
export async function isRoomFull(code, uid) {
  const snapshot = await getDocs(collection(db, 'rooms', code, 'members'))
  const now = Date.now()

  let activeCount = 0
  let alreadyInRoom = false
  snapshot.forEach((memberDoc) => {
    if (isActive(memberDoc.data(), now)) {
      activeCount = activeCount + 1
      if (memberDoc.id === uid) {
        alreadyInRoom = true
      }
    }
  })

  return !alreadyInRoom && activeCount >= MAX_PEOPLE
}
