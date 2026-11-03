// Deleting a room for good. Shared by api/admin.js (an admin presses Delete) and api/cleanup.js (the daily sweep).
// Done on the server because the browser cannot find a room's sub-lists to delete them, and a Firestore
// document's sub-lists are NOT deleted with it.

import { adminDb, adminStorage } from './firebaseAdmin.js'

// Close the room (so anyone still inside is sent home, RoomLayout.vue), delete the document with
// everything under it (members, photos, clips, and any list teammates added), then its video files.
// room: the room's snapshot, already read by the caller
export async function deleteRoomEverything(code, room) {
  const roomRef = adminDb().doc('rooms/' + code)
  if (room.data().closed !== true) {
    await roomRef.update({ closed: true })
  }
  await adminDb().recursiveDelete(roomRef)
  await deleteRoomFiles(code)
}

// Delete a room's video clip files in Storage (clips/{code}/..., see clips.js). Deleting the room's
// documents does not delete them. Skipped when the bucket name is not set (the tests).
async function deleteRoomFiles(code) {
  const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET
  if (!bucketName) return
  try {
    await adminStorage().bucket(bucketName).deleteFiles({ prefix: 'clips/' + code + '/' })
  } catch (error) {
    console.error('Could not delete the files of room ' + code, error) // the room itself is already gone
  }
}
