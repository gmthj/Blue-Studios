// Firestore tools: doc() makes a reference to a document, collection() to a list of documents,
// setDoc() saves a document
import { doc, collection, setDoc } from 'firebase/firestore'
// Storage tools: ref() points at a file in Firebase Storage, uploadBytes() uploads a file to it
import { ref, uploadBytes } from 'firebase/storage'
// db and storage are our connections to Firestore and Storage (set up in firebase.js)
import { db, storage } from './firebase.js'
// getUid() gives the id of the person who is signed in (guests included)
import { getUid } from './composables/useAuth.js'
// getFileUrl(path) turns a Storage path into a link we can download or play
import { getFileUrl } from './studio.js'

// Video clips taken on the camera page (Video mode). A clip is like a photo: everyone's camera
// records at the same moment, and the clips are shared in the room gallery.
//
// A document can hold at most 1 MB, far too small for video, so the file goes in Firebase Storage
// and the room only keeps a small document that points to it:
//   Storage  clips/{code}/{uid}/{clipId}.webm   (.mp4 on Safari)
//   Firestore rooms/{code}/clips/{clipId}  { ownerId, name, shotNumber, path, mime, mirrored, createdAt }

// How long every clip is, in seconds. Used when recording, and as the longest a trim can be.
export const CLIP_SECONDS = 3

// The longest an edited video can be, in seconds (all its trimmed clips added up). Strips with video are
// also exported as videos of this length (shorter videos repeat), so every video strip is the same length.
export const MAX_EDIT_SECONDS = 15

// ---------- Recording ----------

// The video format this browser can record (Chrome and Firefox: webm, Safari: mp4)
function clipMimeType() {
  // Our favourite first. isTypeSupported asks the browser "can you record this format?"
  const types = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  // find() gives the first format the browser supports. '' means "let the browser choose".
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

// Record a camera stream (a MediaStream) for some seconds. Gives back the video as a Blob.
// It returns a Promise: the caller writes "await recordStream(...)" and waits until recording is finished.
export function recordStream(stream, seconds) {
  return new Promise((resolve, reject) => {
    const type = clipMimeType()
    // MediaRecorder is the browser's built-in video recorder. It records the camera stream we give it.
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : {})
    const chunks = [] // the recorder hands over the video in pieces, we collect them here
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data) // keep each piece
    }
    // When the recorder has stopped, glue the pieces into one Blob (a file-like object) and finish the Promise
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
    recorder.onerror = (event) => reject(event.error) // if recording fails, the caller's "catch" runs
    recorder.start()
    setTimeout(() => recorder.stop(), seconds * 1000) // stop after the given number of seconds
  })
}

// ---------- Saving ----------

// Upload a recorded clip, then add it to the room's clip list (the file first, then the document that points to it)
export async function uploadClip(code, blob, { name, shotNumber, mirrored }) {
  const uid = getUid() // who is uploading
  const clipId = doc(collection(db, 'rooms', code, 'clips')).id // a new random id
  const mime = blob.type.split(';')[0] // 'video/webm;codecs=vp8' -> 'video/webm'
  // Where the file goes in Storage, e.g. clips/0224/Gmyz.../JECb....webm (a folder per room, then per person)
  const path = 'clips/' + code + '/' + uid + '/' + clipId + (mime === 'video/mp4' ? '.mp4' : '.webm')

  // 1. Upload the video file
  await uploadBytes(ref(storage, path), blob, { contentType: mime })
  // 2. Add the small document to the room's list. Everyone's gallery listens to this list, so the clip appears.
  await setDoc(doc(db, 'rooms', code, 'clips', clipId), {
    ownerId: uid,            // who recorded it
    name: name,              // their name, shown under the clip
    shotNumber: shotNumber,  // which shot (countdown) it belongs to, so it is grouped with that shot's photos
    path: path,              // where the file is in Storage
    mime: mime,              // the video format
    mirrored: mirrored,      // true if the selfie camera was flipped, so it is flipped back when shown
    createdAt: Date.now(),   // when it was saved (the list is sorted by this)
  })
  return clipId
}

// ---------- Editing: the timeline ----------
// The Video page has one timeline being worked on, saved in the room document:
//   room.videoTimeline = [ { clipId, start, end }, ... ]    start / end in seconds (the trim), in playing order
//   room.videoEditing  = the id of the saved edit being changed (null: a new edit)
// When it is saved to the gallery it becomes an edited video, and the timeline is emptied for the next one:
//   room.editedVideos = { editId: { name: 'Edit 1', timeline: [ { clipId, start, end } ], createdAt }, ... }
// An edited video only points at clips by id, so the same clip can be used in as many edits as you like.
// An edited video can be put in a strip slot like a photo: the slot holds the edit's id (room.stripSlots).

const MIN_TRIM_SECONDS = 0.3 // a clip on the timeline is never shorter than this

// The room's timeline joined with the clip documents: [ { clip, start, end } ].
// Clips that no longer exist are left out, and start / end are kept inside the clip.
export function resolveTimeline(timeline, clips) {
  const entries = []
  for (const item of timeline || []) { // "|| []": a room with no timeline yet has nothing to loop over
    const clip = clips.find((c) => c.id === item.clipId) // find the clip document this item points to
    if (!clip) continue // the clip is gone, skip this item
    // start: at least 0, and early enough that MIN_TRIM_SECONDS are left before the end of the clip
    const start = Math.min(Math.max(0, item.start || 0), CLIP_SECONDS - MIN_TRIM_SECONDS)
    // end: at most the clip's length, and at least MIN_TRIM_SECONDS after the start
    const end = Math.min(CLIP_SECONDS, Math.max(item.end || CLIP_SECONDS, start + MIN_TRIM_SECONDS))
    entries.push({ clip: clip, start: start, end: end })
  }
  return entries
}

// The saved edited videos, ready to play: { editId: { id, name, createdAt, timeline, entries, seconds } }
// entries = the timeline joined with the clips (see resolveTimeline), seconds = how long the edit is.
export function resolveEditedVideos(editedVideos, clips) {
  const result = {}
  for (const [id, edit] of Object.entries(editedVideos || {})) {
    const entries = resolveTimeline(edit.timeline, clips)
    result[id] = {
      id: id,
      name: edit.name,
      createdAt: edit.createdAt,
      timeline: edit.timeline || [],
      entries: entries,
      seconds: entries.reduce((sum, e) => sum + (e.end - e.start), 0),
    }
  }
  return result
}

// The edited videos as a list, oldest first (for showing them one after another)
export function editedVideoList(editedVideos, clips) {
  return Object.values(resolveEditedVideos(editedVideos, clips)).sort((a, b) => a.createdAt - b.createdAt)
}

// A new random id for an edited video (the same kind Firestore uses for documents, made without the internet)
export function newEditedVideoId() {
  return doc(collection(db, 'rooms')).id
}

// ---------- Playing clips ----------
// A clip is downloaded once and kept in memory as a local "blob:" address. A video from
// MediaRecorder cannot jump to a time (for trimming) when it is played straight from the internet,
// but it can when it is played from a local address.

const urlCache = new Map() // path -> Promise of a blob: address (so each clip is only downloaded once)

export function getClipUrl(clip) {
  if (!urlCache.has(clip.path)) { // not downloaded yet
    const promise = getFileUrl(clip.path)             // 1. ask Storage for the download link
      .then((url) => fetch(url))                      // 2. download the video
      .then((response) => response.blob())            // 3. read it as a file-like Blob
      .then((blob) => URL.createObjectURL(blob))      // 4. make a local "blob:" address that points to it
    promise.catch(() => urlCache.delete(clip.path)) // so a failed download can be tried again
    urlCache.set(clip.path, promise) // remember it, so the next caller gets the same download
  }
  return urlCache.get(clip.path)
}
