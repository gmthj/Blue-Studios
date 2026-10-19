import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage, auth } from './firebase.js'

// Everything an account saves to "My Studio": templates, stickers and photostrips.
//
// Each item has a small Firestore document (name, owner, public/private, ...) and its files in
// Firebase Storage, in a folder named after the owner's uid:
//   templates/{id}  + Storage templates/{uid}/{id}/thumbnail.png and project.json
//   stickers/{id}   + Storage stickers/{uid}/{id}/image
//   strips/{id}     + Storage strips/{uid}/{id}.jpg
// The security rules (firestore.rules, storage.rules) check every field, so these functions
// must send exactly the fields below.
//
// For the template editor (Joash) and sticker maker (Rae):
//   await saveTemplate({ name, slotCount, thumbnail: pngBlob, projectData })          -> new id
//   await saveTemplate({ id, name, slotCount, thumbnail: pngBlob, projectData })      -> update
//   await saveSticker({ name, kind: 'static' | 'animated' | 'dynamic', image: blob }) -> new id
//   const project = await loadTemplateProject(template)                               -> projectData
// Only accounts can save (guests get an error): check useAuth().isAccount first.

// The 3 kinds of item, and their Firestore collection
export const ITEM_TYPES = ['templates', 'stickers', 'strips']

// A new random document id (the same kind Firestore uses), e.g. 'aZ3kQ9...'
function newId(collectionName) {
  return doc(collection(db, collectionName)).id
}

function myUid() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('Log in to save to My Studio')
  }
  return auth.currentUser.uid
}

// My name as saved in my profile (the rules check items show my real name)
async function myName() {
  const profile = await getDoc(doc(db, 'users', myUid()))
  return profile.exists() ? profile.data().displayName : ''
}

// ---------- Saving ----------

// Save a template from the editor. Leave out id to make a new one.
export async function saveTemplate({ id, name, slotCount, thumbnail, projectData }) {
  const uid = myUid()
  const isNew = !id
  const itemId = id || newId('templates')
  const folder = 'templates/' + uid + '/' + itemId + '/'
  const projectFile = new Blob([JSON.stringify(projectData)], { type: 'application/json' })

  // Upload the files first, then the document that points to them
  await uploadBytes(ref(storage, folder + 'thumbnail.png'), thumbnail, { contentType: 'image/png' })
  await uploadBytes(ref(storage, folder + 'project.json'), projectFile, { contentType: 'application/json' })

  const now = Date.now()
  const ownerName = await myName()
  if (isNew) {
    await setDoc(doc(db, 'templates', itemId), {
      ownerId: uid,
      ownerName: ownerName,
      name: name,
      slotCount: slotCount,
      visibility: 'private', // new things are always private; the owner can publish them in My Studio
      status: 'active',
      saveCount: 0,
      thumbnailPath: folder + 'thumbnail.png',
      dataPath: folder + 'project.json',
      createdAt: now,
      updatedAt: now,
    })
  } else {
    await updateDoc(doc(db, 'templates', itemId), { ownerName: ownerName, name: name, slotCount: slotCount, updatedAt: now })
  }
  return itemId
}

// Save a sticker from the sticker maker
export async function saveSticker({ name, kind, image }) {
  const uid = myUid()
  const itemId = newId('stickers')
  const imagePath = 'stickers/' + uid + '/' + itemId + '/image'

  await uploadBytes(ref(storage, imagePath), image, { contentType: image.type || 'image/png' })

  const now = Date.now()
  await setDoc(doc(db, 'stickers', itemId), {
    ownerId: uid,
    ownerName: await myName(),
    name: name,
    kind: kind,
    visibility: 'private',
    status: 'active',
    saveCount: 0,
    imagePath: imagePath,
    createdAt: now,
    updatedAt: now,
  })
  return itemId
}

// Save a finished photostrip (a JPEG blob) to My Studio
export async function saveStrip({ title, image }) {
  const uid = myUid()
  const stripId = newId('strips')
  const imagePath = 'strips/' + uid + '/' + stripId + '.jpg'

  await uploadBytes(ref(storage, imagePath), image, { contentType: 'image/jpeg' })
  await setDoc(doc(db, 'strips', stripId), {
    ownerId: uid,
    title: title,
    imagePath: imagePath,
    createdAt: Date.now(),
  })
  return stripId
}

// ---------- Loading ----------

// Everything of one type that belongs to me, newest first.
// type: 'templates', 'stickers' or 'strips'
export async function listMyItems(type) {
  const snapshot = await getDocs(query(collection(db, type), where('ownerId', '==', myUid())))
  const items = []
  snapshot.forEach((itemDoc) => {
    items.push({ id: itemDoc.id, type: type, ...itemDoc.data() })
  })
  // Sorted here instead of in the query, so Firestore does not need an extra index
  items.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
  return items
}

// A link to show a file in an <img>, e.g. getFileUrl(template.thumbnailPath).
// Firebase only gives the link if the storage rules allow me to see the file.
export async function getFileUrl(path) {
  return await getDownloadURL(ref(storage, path))
}

// The editor's project data of a template (to open it in the template editor)
export async function loadTemplateProject(template) {
  const response = await fetch(await getFileUrl(template.dataPath))
  return await response.json()
}

// ---------- Changing and deleting ----------

// Make a template or sticker public (shown in the marketplace) or private.
// The rules only allow 'public' for accounts with a confirmed email.
export async function setVisibility(item, visibility) {
  await updateDoc(doc(db, item.type, item.id), {
    ownerName: await myName(),
    name: item.name,
    visibility: visibility,
    updatedAt: Date.now(),
  })
}

// Delete an item: its document, then its files
export async function deleteItem(item) {
  await deleteDoc(doc(db, item.type, item.id))

  const paths = [item.thumbnailPath, item.dataPath, item.imagePath].filter(Boolean)
  for (const path of paths) {
    try {
      await deleteObject(ref(storage, path))
    } catch (error) {
      console.error(error) // the document is already gone, so a left-over file is only wasted space
    }
  }
}
