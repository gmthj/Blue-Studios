import * as htmlToImage from 'html-to-image'

/**
 * CRC-32 Lookup Table for standard PNG Chunk verification
 */
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

function crc32(bytes, offset, length) {
  let c = 0xffffffff
  for (let i = offset; i < offset + length; i++) {
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Embeds full project JSON into a PNG ArrayBuffer using a standard 'tEXt' chunk.
 * Keyword: 'BlueStudiosProject'
 * Payload: Base64-encoded UTF-8 JSON
 * Standard image viewers ignore this chunk and render the PNG normally.
 */
export function embedProjectInPngBytes(pngBytes, projectData) {
  const keyword = 'BlueStudiosProject'
  const jsonStr = JSON.stringify(projectData)

  // Encode JSON string to UTF-8 then base64
  const utf8Bytes = new TextEncoder().encode(jsonStr)
  let binary = ''
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i])
  }
  const b64 = btoa(binary)

  const keywordBytes = new TextEncoder().encode(keyword)
  const b64Bytes = new Uint8Array(b64.length)
  for (let i = 0; i < b64.length; i++) {
    b64Bytes[i] = b64.charCodeAt(i)
  }

  // Chunk Data = keyword + 0x00 + base64 text
  const dataLen = keywordBytes.length + 1 + b64Bytes.length
  const chunkData = new Uint8Array(dataLen)
  chunkData.set(keywordBytes, 0)
  chunkData[keywordBytes.length] = 0 // null separator
  chunkData.set(b64Bytes, keywordBytes.length + 1)

  const typeBytes = new Uint8Array([116, 69, 88, 116]) // 'tEXt'
  const typeAndData = new Uint8Array(4 + dataLen)
  typeAndData.set(typeBytes, 0)
  typeAndData.set(chunkData, 4)

  const crc = crc32(typeAndData, 0, typeAndData.length)

  const chunkTotal = 4 + 4 + dataLen + 4
  const chunk = new Uint8Array(chunkTotal)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, dataLen, false)
  chunk.set(typeBytes, 4)
  chunk.set(chunkData, 8)
  view.setUint32(8 + dataLen, crc, false)

  // Find IEND chunk in pngBytes
  let iendPos = -1
  for (let i = pngBytes.length - 12; i >= 8; i--) {
    if (
      pngBytes[i] === 73 &&
      pngBytes[i + 1] === 69 &&
      pngBytes[i + 2] === 78 &&
      pngBytes[i + 3] === 68
    ) {
      iendPos = i - 4 // Before 4-byte length
      break
    }
  }
  if (iendPos === -1) iendPos = pngBytes.length - 12

  const result = new Uint8Array(pngBytes.length + chunkTotal)
  result.set(pngBytes.subarray(0, iendPos), 0)
  result.set(chunk, iendPos)
  result.set(pngBytes.subarray(iendPos), iendPos + chunkTotal)
  return result
}

/**
 * Extracts embedded project data from a PNG ArrayBuffer or Uint8Array.
 * Returns the parsed workspace JSON object, or null if not an editable Blue Studios PNG.
 */
export function extractProjectFromPngBytes(pngBytes) {
  if (!pngBytes || pngBytes.length < 8) return null
  let offset = 8 // skip 8-byte PNG signature
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength)

  while (offset + 12 <= pngBytes.length) {
    const length = view.getUint32(offset, false)
    const type = String.fromCharCode(
      pngBytes[offset + 4],
      pngBytes[offset + 5],
      pngBytes[offset + 6],
      pngBytes[offset + 7]
    )

    if (type === 'tEXt') {
      const data = pngBytes.subarray(offset + 8, offset + 8 + length)
      let nullIdx = -1
      for (let i = 0; i < data.length; i++) {
        if (data[i] === 0) {
          nullIdx = i
          break
        }
      }

      if (nullIdx !== -1) {
        let key = ''
        for (let i = 0; i < nullIdx; i++) key += String.fromCharCode(data[i])
        if (key === 'BlueStudiosProject' || key === 'PhotostripProject') {
          let b64 = ''
          for (let i = nullIdx + 1; i < data.length; i++) b64 += String.fromCharCode(data[i])
          try {
            const decodedBinary = atob(b64)
            const bytes = new Uint8Array(decodedBinary.length)
            for (let i = 0; i < decodedBinary.length; i++) bytes[i] = decodedBinary.charCodeAt(i)
            const jsonStr = new TextDecoder().decode(bytes)
            return JSON.parse(jsonStr)
          } catch (err) {
            console.warn('Failed to parse embedded project data:', err)
          }
        }
      }
    }

    if (type === 'IEND') break
    offset += 12 + length
  }
  return null
}

/**
 * IndexedDB Persistent Storage for Saved Frames
 */
const FRAMES_DB_NAME = 'BlueStudiosSavedFramesDB'
const FRAMES_DB_VERSION = 1
const FRAMES_STORE_NAME = 'saved_frames'

function openFramesDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }
    const request = indexedDB.open(FRAMES_DB_NAME, FRAMES_DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(FRAMES_STORE_NAME)) {
        db.createObjectStore(FRAMES_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = (e) => resolve(e.target.result)
    request.onerror = (e) => {
      console.warn('IndexedDB Frames open error:', e)
      resolve(null)
      }
  })
}

export async function loadSavedFramesFromDB() {
  try {
    const db = await openFramesDB()
    if (!db) {
      const cached = localStorage.getItem('blue_studios_saved_frames')
      return cached ? JSON.parse(cached) : []
    }
    return new Promise((resolve) => {
      const tx = db.transaction(FRAMES_STORE_NAME, 'readonly')
      const store = tx.objectStore(FRAMES_STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const frames = req.result || []
        // Sort newest first
        frames.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        resolve(frames)
      }
      req.onerror = () => resolve([])
    })
  } catch (err) {
    console.warn('Error loading saved frames:', err)
    return []
  }
}

export async function saveFrameToDB(frameRecord) {
  try {
    const cleanRecord = JSON.parse(JSON.stringify(frameRecord))
    const db = await openFramesDB()
    if (!db) {
      const cached = localStorage.getItem('blue_studios_saved_frames')
      const list = cached ? JSON.parse(cached) : []
      const idx = list.findIndex((f) => f.id === cleanRecord.id)
      if (idx >= 0) list[idx] = cleanRecord
      else list.unshift(cleanRecord)
      localStorage.setItem('blue_studios_saved_frames', JSON.stringify(list.slice(0, 30)))
      return true
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(FRAMES_STORE_NAME, 'readwrite')
        const store = tx.objectStore(FRAMES_STORE_NAME)
        store.put(cleanRecord)
        tx.oncomplete = () => {
          try {
            const cached = localStorage.getItem('blue_studios_saved_frames')
            if (cached) {
              const list = JSON.parse(cached)
              const idx = list.findIndex((f) => f.id === cleanRecord.id)
              if (idx >= 0) list[idx] = cleanRecord
              else list.unshift(cleanRecord)
              localStorage.setItem('blue_studios_saved_frames', JSON.stringify(list.slice(0, 30)))
            }
          } catch (_) {}
          resolve(true)
        }
        tx.onerror = (err) => {
          console.warn('Error saving frame to IndexedDB:', err)
          resolve(false)
        }
      } catch (err) {
        console.warn('Sync error saving frame to IndexedDB:', err)
        resolve(false)
      }
    })
  } catch (err) {
    console.warn('Error saving frame to IndexedDB:', err)
    return false
  }
}

export async function deleteSavedFrameFromDB(id) {
  const targetId = typeof id === 'object' && id !== null ? (id.id || id) : id
  if (!targetId) return false

  try {
    const db = await openFramesDB()
    if (!db) {
      const cached = localStorage.getItem('blue_studios_saved_frames')
      if (cached) {
        const list = JSON.parse(cached).filter((f) => String(f.id) !== String(targetId))
        localStorage.setItem('blue_studios_saved_frames', JSON.stringify(list))
      }
      return true
    }
    return new Promise((resolve) => {
      const tx = db.transaction(FRAMES_STORE_NAME, 'readwrite')
      const store = tx.objectStore(FRAMES_STORE_NAME)
      store.delete(targetId)
      tx.oncomplete = () => {
        try {
          const cached = localStorage.getItem('blue_studios_saved_frames')
          if (cached) {
            const list = JSON.parse(cached).filter((f) => String(f.id) !== String(targetId))
            localStorage.setItem('blue_studios_saved_frames', JSON.stringify(list))
          }
        } catch (_) {}
        resolve(true)
      }
      tx.onerror = (err) => {
        console.warn('Error deleting saved frame from IndexedDB:', err)
        resolve(false)
      }
    })
  } catch (err) {
    console.warn('Error deleting saved frame:', err)
    return false
  }
}

/**
 * Download a Blob directly to user's computer with given filename
 */
export function triggerFileDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 300)
}

/**
 * Capture Photostrip Element as a high-res PNG Blob with embedded workspace project data
 */
export async function captureEditablePng(stripEl, projectData) {
  if (!stripEl) throw new Error('Strip element not found')

  await document.fonts.ready

  // Hide UI overlays & ensure photo cutouts layer is hidden during capture
  const slotsContainer = stripEl.querySelector('.strip-slots-container')
  const hadCutoutsHidden = slotsContainer ? slotsContainer.classList.contains('cutouts-hidden') : false
  const cutoutSlots = stripEl.querySelectorAll('.cutout-slot')
  const slotsHadHidden = Array.from(cutoutSlots).map((s) => s.classList.contains('slot-hidden'))

  if (slotsContainer && !hadCutoutsHidden) {
    slotsContainer.classList.add('cutouts-hidden')
    cutoutSlots.forEach((s) => s.classList.add('slot-hidden'))
  }

  const renderCanvas = () =>
    htmlToImage.toCanvas(stripEl, {
      pixelRatio: 2,
      cacheBust: true,
      filter: (node) => {
        if (node.classList) {
          if (
            node.classList.contains('element-bounding-box') ||
            node.classList.contains('collective-bounding-box') ||
            node.classList.contains('canvas-marquee-box') ||
            node.classList.contains('resize-handle') ||
            node.classList.contains('rotate-handle') ||
            node.classList.contains('cutout-indicator') ||
            node.classList.contains('cutout-window')
          ) {
            return false
          }
        }
        return true
      }
    })

  let rawCanvas
  try {
    rawCanvas = await renderCanvas()
  } catch (err) {
    console.warn('Initial htmlToImage render failed, retrying once...', err)
    await new Promise((r) => setTimeout(r, 150))
    rawCanvas = await renderCanvas()
  } finally {
    if (slotsContainer && !hadCutoutsHidden) {
      slotsContainer.classList.remove('cutouts-hidden')
      cutoutSlots.forEach((s, idx) => {
        if (!slotsHadHidden[idx]) s.classList.remove('slot-hidden')
      })
    }
  }

  // Get raw PNG blob
  const rawBlob = await new Promise((resolve) => rawCanvas.toBlob(resolve, 'image/png'))
  const rawArrayBuffer = await rawBlob.arrayBuffer()
  const rawBytes = new Uint8Array(rawArrayBuffer)

  // Embed project JSON (always without photo cutout layer)
  const cleanProjectData = { ...projectData, showCutouts: false }
  const embeddedBytes = embedProjectInPngBytes(rawBytes, cleanProjectData)
  const embeddedBlob = new Blob([embeddedBytes], { type: 'image/png' })

  // Thumbnail data URL for quick UI previews
  const thumbnailDataUrl = rawCanvas.toDataURL('image/png', 0.8)

  return {
    blob: embeddedBlob,
    rawBlob: rawBlob,
    thumbnail: thumbnailDataUrl,
    width: rawCanvas.width,
    height: rawCanvas.height
  }
}


/**
 * Read a file as a base64 Data URL
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = (e) => reject(e)
    reader.readAsDataURL(file)
  })
}

/**
 * Parse an uploaded/dropped File (PNG, JPG, JPEG, WEBP, SVG, or JSON) to retrieve project data.
 * If the file is a standard image (not an exported Blue Studios project PNG with embedded metadata),
 * it converts it into a custom frame template with the image as the frame background.
 */
export async function parseProjectFromFile(file) {
  if (!file) return null

  // 1. If directly a JSON file
  if (file.name.endsWith('.json') || file.type === 'application/json') {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      return parsed.projectData || parsed
    } catch (err) {
      console.warn('Failed to parse JSON template file:', err)
      return null
    }
  }

  // 2. If a PNG file, check for embedded Blue Studios project metadata first
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  if (isPng) {
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const embeddedProject = extractProjectFromPngBytes(bytes)
      if (embeddedProject && (embeddedProject.canvasElements || embeddedProject.templateName || embeddedProject.slotCount || embeddedProject.frameBg)) {
        return embeddedProject
      }
    } catch (err) {
      console.warn('Could not extract embedded PNG project metadata, falling back to image import:', err)
    }
  }

  // 3. Fallback for all images (PNG without embedded metadata, JPG, JPEG, WEBP, SVG, GIF):
  // Convert into a custom frame template with the uploaded image as the frame background
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif)$/i.test(file.name)
  if (isImage) {
    try {
      const dataUrl = await readFileAsDataUrl(file)
      if (!dataUrl) return null
      const rawName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim()
      const formattedName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : 'Uploaded Frame'

      return {
        id: `frame_${Date.now()}`,
        templateName: formattedName,
        activeLayout: 'strip-4',
        slotCount: 4,
        selectedBgColor: '#FFFFFF',
        frameBg: {
          type: 'image',
          value: dataUrl,
          baseColor: '#FFFFFF',
          texture: null,
          opacity: 1,
          blendMode: 'normal',
          scale: 1
        },
        borderColor: '#000000',
        borderWidth: 0,
        slotShape: 'RECTANGLE',
        captionText: '',
        canvasElements: [],
        showCutouts: false,
        thumbnail: dataUrl,
        _isCustomImageFrame: true
      }
    } catch (err) {
      console.error('Failed reading image file as frame:', err)
      return null
    }
  }

  return null
}

