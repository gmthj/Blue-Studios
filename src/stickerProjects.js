// ============================================================
// The layers of each sticker you save, so you can open it again and keep editing
// src/stickerProjects.js
// ============================================================
// WHY: My Studio keeps a saved sticker as one finished picture (studio.js saveSticker), which
// cannot be pulled apart again. The Sticker Maker also keeps the layers here, in this
// browser (IndexedDB), by the sticker's id. "My stickers" in the Sticker Maker then reopens a
// sticker with all its layers. On another device (or for older stickers) only the picture is
// there, and it opens as one layer.
//
// One project: { id, name, mode: 'sticker' | 'gif', gifSpeed, frames: [{ id, layers }], savedAt }

const DB_NAME = 'BlueStudiosStickerProjectsDB'
const STORE_NAME = 'projects'

function openDb() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = () => resolve(null)
  })
}

function run(mode, action) {
  return openDb().then((db) => {
    if (!db) return null
    return new Promise((resolve) => {
      const request = action(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
  }).catch(() => null)
}

export function saveStickerProject(project) {
  return run('readwrite', (store) => store.put({ ...project, savedAt: Date.now() }))
}

export function loadStickerProject(id) {
  return run('readonly', (store) => store.get(id))
}

// The ids of the stickers whose layers are kept on this device
export async function stickerProjectIds() {
  const keys = await run('readonly', (store) => store.getAllKeys())
  return new Set(keys || [])
}

// A temporary blob: link only works while the page is open, so pictures are turned into
// data: URLs before the layers are kept.
async function toDataUrl(url) {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function keepableFrames(frames) {
  const copy = JSON.parse(JSON.stringify(frames))
  const cache = new Map()
  for (const frame of copy) {
    for (const layer of frame.layers) {
      if (layer.type === 'image' && layer.url && layer.url.startsWith('blob:')) {
        if (!cache.has(layer.url)) cache.set(layer.url, await toDataUrl(layer.url))
        layer.url = cache.get(layer.url)
      }
    }
  }
  return copy
}
