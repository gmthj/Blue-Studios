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
//   await saveTemplate({ name, slotCount, categories, thumbnail: pngBlob, projectData })          -> new id
//   await saveTemplate({ id, name, slotCount, categories, thumbnail: pngBlob, projectData })      -> update
//   await saveSticker({ name, kind: 'static' | 'animated' | 'dynamic', categories, image: blob }) -> new id
//   const project = await loadTemplateProject(template)                                           -> projectData
// categories: 1 to 3 ids from CATEGORIES below, e.g. ['birthday', 'cute']
// Only accounts can save (guests get an error): check useAuth().isAccount first.

// The 3 kinds of item, and their Firestore collection
export const ITEM_TYPES = ['templates', 'stickers', 'strips']

// Marketplace categories for templates and stickers. The ids must match isCategories() in firestore.rules.
export const CATEGORIES = [
  { id: 'birthday', label: 'Birthday' },
  { id: 'friends', label: 'Friends' },
  { id: 'love', label: 'Love' },
  { id: 'graduation', label: 'Graduation' },
  { id: 'holiday', label: 'Holiday' },
  { id: 'cute', label: 'Cute' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'other', label: 'Other' },
]
export const MAX_CATEGORIES = 3

export function categoryLabel(id) {
  const category = CATEGORIES.find((c) => c.id === id)
  return category ? category.label : id
}

// Stop early with a clear message (the rules would reject it anyway, with a less helpful error)
function checkCategories(categories) {
  const ids = CATEGORIES.map((c) => c.id)
  const valid = Array.isArray(categories)
    && categories.length >= 1
    && categories.length <= MAX_CATEGORIES
    && new Set(categories).size === categories.length
    && categories.every((id) => ids.includes(id))
  if (!valid) {
    throw new Error('Pick 1 to ' + MAX_CATEGORIES + ' categories from CATEGORIES in studio.js')
  }
}

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

// How long browsers may keep a copy of an uploaded file (the Cache-Control header Storage sends with it).
// NEVER_CHANGES: stickers and strips are never replaced, so browsers keep them for a year.
// MAY_CHANGE: a template's thumbnail and project are replaced (same file name) when it is edited,
//   so browsers keep a copy but check with Storage each time. Unchanged: a tiny "not modified" answer
//   instead of the whole file. Changed: the new file.
const NEVER_CHANGES = 'public, max-age=31536000, immutable'
const MAY_CHANGE = 'no-cache'

// ---------- Card pictures ----------
// The marketplace and My Studio grids show each item as a small card, so they get a small copy of its
// picture (the "card", about 400px wide, WebP: tens of KB instead of a 1400px PNG of a few MB).
// Its link is saved in the item's document too (cardUrl), so a grid can show it straight away instead
// of asking Storage for a link for every card first.
// The item page still shows the full picture (thumbnailPath / imagePath).
// Items saved before cards existed have no cardUrl: StorageImage falls back to the full picture,
// and scripts/make-cards.mjs makes their cards.
const CARD_WIDTH = 400       // cards are about 250px wide on screen; a bit more stays sharp on phones
const CARD_MAX_HEIGHT = 1200 // tall 4-cut strips: never taller than this

// A small copy of an image: WebP (keeps see-through parts), or PNG in browsers that cannot make WebP
async function makeCard(image) {
  const bitmap = await createImageBitmap(image)
  const scale = Math.min(1, CARD_WIDTH / bitmap.width, CARD_MAX_HEIGHT / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  if (webp && webp.type === 'image/webp') return { blob: webp, fileName: 'card.webp' }
  // Asked for WebP but got something else (older Safari): PNG instead
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  return { blob: png, fileName: 'card.png' }
}

// Make and upload the card for an item, e.g. uploadCard('templates/{uid}/{id}/', thumbnailBlob, MAY_CHANGE).
// Returns { cardPath, cardUrl } to put in the item's document, or {} if it could not be made
// (the grids then show the full picture, so the item still saves).
async function uploadCard(folder, image, cacheControl) {
  try {
    const card = await makeCard(image)
    const cardRef = ref(storage, folder + card.fileName)
    await uploadBytes(cardRef, card.blob, { contentType: card.blob.type, cacheControl: cacheControl })
    fileUrls.delete(folder + card.fileName) // replaced: forget the old link (see getFileUrl)
    return { cardPath: folder + card.fileName, cardUrl: await getDownloadURL(cardRef) }
  } catch (error) {
    console.error('Could not make the card picture', error)
    return {}
  }
}

// Save a template from the editor. Leave out id to make a new one.
export async function saveTemplate({ id, name, slotCount, categories, thumbnail, projectData }) {
  const uid = myUid()
  checkCategories(categories)
  const isNew = !id
  const itemId = id || newId('templates')
  const folder = 'templates/' + uid + '/' + itemId + '/'
  const projectFile = new Blob([JSON.stringify(projectData)], { type: 'application/json' })

  // Upload the files first, then the document that points to them
  await uploadBytes(ref(storage, folder + 'thumbnail.png'), thumbnail, { contentType: 'image/png', cacheControl: MAY_CHANGE })
  await uploadBytes(ref(storage, folder + 'project.json'), projectFile, { contentType: 'application/json', cacheControl: MAY_CHANGE })
  // Replaced files can get a new link: forget the old ones (see getFileUrl)
  fileUrls.delete(folder + 'thumbnail.png')
  fileUrls.delete(folder + 'project.json')
  const card = await uploadCard(folder, thumbnail, MAY_CHANGE)

  const now = Date.now()
  const ownerName = await myName()
  if (isNew) {
    await setDoc(doc(db, 'templates', itemId), {
      ownerId: uid,
      ownerName: ownerName,
      name: name,
      slotCount: slotCount,
      categories: categories,
      visibility: 'private', // new things are always private; the owner can publish them in My Studio
      status: 'active',
      saveCount: 0,
      thumbnailPath: folder + 'thumbnail.png',
      dataPath: folder + 'project.json',
      ...card,
      createdAt: now,
      updatedAt: now,
    })
  } else {
    await updateDoc(doc(db, 'templates', itemId), {
      ownerName: ownerName,
      name: name,
      slotCount: slotCount,
      categories: categories,
      ...card,
      updatedAt: now,
    })
  }
  return itemId
}

// Save a sticker from the sticker maker
export async function saveSticker({ name, kind, categories, image }) {
  const uid = myUid()
  checkCategories(categories)
  const itemId = newId('stickers')
  const folder = 'stickers/' + uid + '/' + itemId + '/'
  const imagePath = folder + 'image'

  await uploadBytes(ref(storage, imagePath), image, { contentType: image.type || 'image/png', cacheControl: NEVER_CHANGES })

  // Moving stickers keep their own image as the card: a small copy made on a canvas would stop moving
  let card
  if (kind === 'static' && image.type !== 'image/gif') {
    card = await uploadCard(folder, image, NEVER_CHANGES)
  } else {
    card = { cardPath: imagePath, cardUrl: await getDownloadURL(ref(storage, imagePath)) }
  }

  const now = Date.now()
  await setDoc(doc(db, 'stickers', itemId), {
    ownerId: uid,
    ownerName: await myName(),
    name: name,
    kind: kind,
    categories: categories,
    visibility: 'private',
    status: 'active',
    saveCount: 0,
    imagePath: imagePath,
    ...card,
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

  await uploadBytes(ref(storage, imagePath), image, { contentType: 'image/jpeg', cacheControl: NEVER_CHANGES })
  await setDoc(doc(db, 'strips', stripId), {
    ownerId: uid,
    title: title,
    imagePath: imagePath,
    createdAt: Date.now(),
  })
  return stripId
}

// Save a finished strip from the Share page to My Studio: a PNG, a GIF or an MP4 (a Blob).
// Saved like saveStrip above, but the file's ending is its format, and the document says which format it is
// (so My Studio knows to play an MP4 instead of showing a picture).
export async function saveStripFile({ title, file, format }) {
  const uid = myUid()
  const stripId = newId('strips')
  const imagePath = 'strips/' + uid + '/' + stripId + '.' + format
  const contentTypes = { png: 'image/png', gif: 'image/gif', mp4: 'video/mp4' }

  await uploadBytes(ref(storage, imagePath), file, { contentType: contentTypes[format], cacheControl: NEVER_CHANGES })
  await setDoc(doc(db, 'strips', stripId), {
    ownerId: uid,
    title: title,
    imagePath: imagePath,
    format: format,
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
// Each link is asked for once and then remembered until the page is reloaded, so going back to the
// marketplace (or opening an item) does not ask Firebase again. A failed answer is not remembered.
const fileUrls = new Map() // path -> Promise of the link

export function getFileUrl(path) {
  if (!fileUrls.has(path)) {
    const link = getDownloadURL(ref(storage, path))
    link.catch(() => fileUrls.delete(path)) // e.g. not allowed yet, or offline: ask again next time
    fileUrls.set(path, link)
  }
  return fileUrls.get(path)
}

// The editor's project data of a template (to open it in the template editor)
export async function loadTemplateProject(template) {
  const response = await fetch(await getFileUrl(template.dataPath))
  return await response.json()
}

// "Use template": the home page, ready to make a new room that starts with this template as its frame
// (HomeView.vue passes it on to the room, and RoomLayout.vue sets it)
export function templateRoomLink(templateId) {
  return { path: '/', query: { template: templateId } }
}

// The room fields that make a template the room's photostrip frame (used by the Pick page, and by
// "Use template", which sets it when the room is made). Save them with saveFields(roomRef(), fields).
// template: a templates/{id} document, or a frame saved in this browser by the Template Editor
// ({ id, name, projectData, thumbnailUrl }).
//   const { fields, slotCount } = await templateFrameFields(template)
export async function templateFrameFields(template) {
  let project = template.projectData
  if (!project && template.dataPath) {
    project = await loadTemplateProject(template)
  }
  let thumbnailUrl = template.thumbnailUrl || null
  if (!thumbnailUrl && template.thumbnailPath) {
    thumbnailUrl = await getFileUrl(template.thumbnailPath).catch(() => null)
  }

  // Older or unusual project files: fall back to a plain 4-cut strip
  const slots = project?.slots || project?.slotRects || [
    { x: 6, y: 3, w: 88, h: 20 },
    { x: 6, y: 25, w: 88, h: 20 },
    { x: 6, y: 47, w: 88, h: 20 },
    { x: 6, y: 69, w: 88, h: 20 },
  ]
  const border = project?.borderColor || project?.border || '#1A1A2E'
  const background = project?.background || project?.selectedBgColor
    || (project?.frameBg?.type === 'gradient' ? project.frameBg.value : project?.frameBg?.baseColor) || '#FFFFFF'

  return {
    slotCount: slots.length,
    fields: {
      stripStyleId: template.id,
      stripLayoutId: project?.stripLayoutId || project?.activeLayout || 'custom',
      stripCustomTemplate: {
        id: template.id,
        name: template.name || project?.templateName || 'Custom Template',
        aspect: project?.aspect || (3 / 10),
        slots: slots,
        shape: (project?.slotShape || project?.shape || 'square').toLowerCase(),
        background: background,
        border: border,
        caption: project?.captionText || project?.caption || template.name || '',
        captionColor: project?.captionColor || border,
        thumbnailUrl: thumbnailUrl,
      },
    },
  }
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

// Rename a template or sticker, or change its categories (from My Studio)
export async function updateDetails(item, { name, categories }) {
  checkCategories(categories)
  await updateDoc(doc(db, item.type, item.id), {
    ownerName: await myName(),
    name: name,
    categories: categories,
    updatedAt: Date.now(),
  })
}

// Delete an item: its document, then its files
export async function deleteItem(item) {
  await deleteDoc(doc(db, item.type, item.id))

  const paths = [...new Set([item.thumbnailPath, item.dataPath, item.imagePath, item.cardPath].filter(Boolean))]
  for (const path of paths) {
    fileUrls.delete(path)
    try {
      await deleteObject(ref(storage, path))
    } catch (error) {
      console.error(error) // the document is already gone, so a left-over file is only wasted space
    }
  }
}
