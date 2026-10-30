import { doc, setDoc, getDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from './firebase.js'
import { getUid } from './composables/useAuth.js'

// A finished strip that can be opened by its link (the Share page, see ShareView.vue and PublicShareView.vue).
//   shares/{id}  { ownerId, title, format, filePath, fileUrl, size, roomCode, createdAt }
//   + the file in Storage: shares/{uid}/{id}.png | .gif | .mp4
// Guests can make one too. Anyone who has the link can open it, so the id is a long random text, and nobody can list them.

// A random id that cannot be guessed, e.g. 'k3j9x0q7m2ab'
export function newShareId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

// The link people open, e.g. https://blue-studios-mu.vercel.app/s/k3j9x0q7m2ab (the address of the site we are on)
export function shareLink(id) {
  return window.location.origin + '/s/' + id
}

// The file's name when it is downloaded: the strip's name with only letters and numbers left
function downloadName(title, ext) {
  const clean = title.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-')
  return (clean || 'photostrip') + '.' + ext
}

// Upload the finished file and make it openable by the link. Gives back the share's document.
//   file: { blob, ext, mime } from buildExportFile (exportFile.js)
export async function createShare({ id, title, format, file, roomCode }) {
  const uid = getUid()
  const filePath = 'shares/' + uid + '/' + id + '.' + file.ext
  await uploadBytes(ref(storage, filePath), file.blob, {
    contentType: file.mime,
    cacheControl: 'public, max-age=31536000', // the file of a share never changes
    // "attachment" makes opening the link to the file save it (a plain Download link then works on every device),
    // while a picture or video on a page still shows as normal
    contentDisposition: 'attachment; filename="' + downloadName(title, file.ext) + '"',
  })
  const data = {
    ownerId: uid,
    title: title,
    format: format,
    filePath: filePath,
    fileUrl: await getDownloadURL(ref(storage, filePath)),
    size: file.blob.size,
    roomCode: roomCode,
    createdAt: Date.now(),
  }
  await setDoc(doc(db, 'shares', id), data)
  return { id: id, ...data }
}

// Open a share by its id. Gives back null if there is none.
export async function getShare(id) {
  const snap = await getDoc(doc(db, 'shares', id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}
