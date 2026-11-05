// ============================================================
// Your uploads: the photos and SVGs you upload in the Frame Editor or the Sticker Maker
// src/uploadsStore.js
// ============================================================
// WHY one file: both editors show the same "Your uploads" list, so a photo uploaded in one
// is ready in the other. They are kept in this browser only (IndexedDB), never sent anywhere,
// and they stay after a refresh. If IndexedDB is not available (some private windows), the
// last 15 are kept in localStorage instead.
//
// One upload: { id, name, type: 'image' | 'svg', isSvg, svgContent?, dataUrl, size, createdAt }
// (the same shape the Template Editor has always saved, so older uploads still load)

const DB_NAME = 'BlueStudiosUploadsDB'
const DB_VERSION = 1
const STORE_NAME = 'uploads'
const FALLBACK_KEY = 'blue_studios_uploads'

export const UPLOAD_TYPES = 'image/png, image/jpeg, image/webp, image/svg+xml'

function openUploadsDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = (event) => {
      console.warn('IndexedDB open error:', event)
      resolve(null)
    }
  })
}

function readFallback() {
  try {
    const cached = localStorage.getItem(FALLBACK_KEY)
    return cached ? JSON.parse(cached) : []
  } catch {
    return []
  }
}

function writeFallback(list) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(list.slice(0, 15)))
  } catch {
    // full or blocked: the upload still works for this visit
  }
}

// Newest first
export async function loadUploads() {
  try {
    const db = await openUploadsDB()
    if (!db) return readFallback()
    const list = await new Promise((resolve) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => resolve([])
    })
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  } catch (error) {
    console.warn('Error loading uploads:', error)
    return []
  }
}

export async function saveUpload(item) {
  try {
    const db = await openUploadsDB()
    if (!db) {
      writeFallback([item, ...readFallback()])
      return
    }
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(item)
  } catch (error) {
    console.warn('Error saving upload:', error)
  }
}

export async function removeUpload(id) {
  try {
    const db = await openUploadsDB()
    if (!db) {
      writeFallback(readFallback().filter((item) => item.id !== id))
      return
    }
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id)
  } catch (error) {
    console.warn('Error deleting upload:', error)
  }
}

// A picked or dropped file -> an upload (not saved yet). Throws a friendly message for
// anything that is not a PNG, JPEG, WebP or SVG.
export function fileToUpload(file) {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
  if (!isSvg && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('"' + file.name + '" is not a PNG, JPEG, WebP or SVG.'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('"' + file.name + '" could not be read.'))
    reader.onload = (event) => {
      const base = {
        id: 'upl-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        name: file.name.replace(/\.[^/.]+$/, ''),
        size: file.size,
        createdAt: Date.now(),
      }
      if (isSvg) {
        const svgContent = event.target.result
        resolve({ ...base, type: 'svg', isSvg: true, svgContent, dataUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svgContent) })
      } else {
        resolve({ ...base, type: 'image', isSvg: false, dataUrl: event.target.result })
      }
    }
    if (isSvg) reader.readAsText(file)
    else reader.readAsDataURL(file)
  })
}
