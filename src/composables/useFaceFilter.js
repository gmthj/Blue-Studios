// LIVE FACE FILTER for my camera (like Snapchat / TikTok filters).
// The real camera is not shown directly. Instead, every frame is:
//   real camera -> hidden <video> -> drawn onto a canvas (+ face stickers later) -> canvas stream
// The canvas stream is what useVideoCall.js puts in localStream, so my preview, the video
// sent to the others (Agora) and the photos taken all show the filter automatically.
//
// Usage (only useVideoCall.js needs these):
//   const stream = await startFaceFilter(cameraStream)  // start, gives the filtered stream
//   await changeFaceFilterCamera(newCameraStream)       // after switching camera (same filtered stream)
//   stopFaceFilter()                                    // when leaving the room
//
// Usage in a page (choosing a filter):
//   const { faceFilterId, faceFilterLoading, setFaceFilter } = useFaceFilter()
//   setFaceFilter('glasses')   // the filters are listed in src/filters/faceFilters.js
//
// Faces are found with Google's MediaPipe Face Landmarker, which gives 478 points per face.
// It is only downloaded (about 10 MB) the first time someone picks a filter.

import { ref } from 'vue'
import { getFaceFilter } from '../filters/faceFilters.js'

const FRAME_RATE = 30 // frames per second sent out from the canvas
const MAX_FACES = 4   // several friends can share one camera in a photobooth

// MediaPipe's program files (must be the same version as @mediapipe/tasks-vision in package.json)
// and the face model, both downloaded from the internet when first needed
const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

// How much each new face position counts (0 to 1). Lower = smoother but the sticker lags behind more.
const SMOOTHING = 0.6

// ---------- Shared state (refs, so pages update automatically) ----------
const faceFilterId = ref('none')       // the chosen filter
const faceFilterLoading = ref(false)   // true while MediaPipe or the filter's pictures download
const faceFilterError = ref('')

let sourceVideo = null  // hidden <video> playing the real camera
let canvas = null       // every frame is drawn here
let ctx = null
let outputStream = null // the canvas as a camera stream (MediaStream)
let running = false     // false stops the drawing loop

let faceLandmarker = null    // MediaPipe face finder, once downloaded
let landmarkerLoading = null // the download in progress (a Promise), so it only happens once
let lastVideoTime = -1       // faces are only searched when the camera has a new frame
let faces = []               // the faces found in the latest frame (smoothed), each 478 points
let images = {}              // picture url -> loaded <img>, so each sticker loads once

// Play the real camera in the hidden <video>, and wait until it is really playing
async function playCamera(cameraStream) {
  sourceVideo.srcObject = cameraStream
  try {
    await sourceVideo.play()
  } catch (error) {
    console.error(error)
  }
}

async function startFaceFilter(cameraStream) {
  stopFaceFilter() // never run two at once

  // The hidden <video> is added to the page (but invisible): some phones (iPhones)
  // stop updating a video that is not on the page, which would freeze the filter.
  sourceVideo = document.createElement('video')
  sourceVideo.muted = true
  sourceVideo.playsInline = true
  sourceVideo.style.cssText = 'position:fixed; top:0; left:0; width:1px; height:1px; opacity:0; pointer-events:none;'
  document.body.appendChild(sourceVideo)

  canvas = document.createElement('canvas')
  ctx = canvas.getContext('2d')

  await playCamera(cameraStream)
  drawFrame() // draw once first, so the stream starts with the right size and picture

  outputStream = canvas.captureStream(FRAME_RATE)
  running = true
  requestAnimationFrame(drawLoop)
  return outputStream
}

// Switching camera: only the hidden <video> changes. The filtered stream stays the same,
// so the preview and the video sent to the others keep going without being replaced.
async function changeFaceFilterCamera(cameraStream) {
  if (!sourceVideo) return
  await playCamera(cameraStream)
}

function stopFaceFilter() {
  running = false
  if (outputStream) {
    outputStream.getTracks().forEach((track) => track.stop())
    outputStream = null
  }
  if (sourceVideo) {
    sourceVideo.srcObject = null
    sourceVideo.remove()
    sourceVideo = null
  }
  canvas = null
  ctx = null
  faces = []
  lastVideoTime = -1
}

// ---------- Choosing a filter ----------

async function setFaceFilter(id) {
  const filter = getFaceFilter(id)
  faceFilterId.value = filter.id
  faceFilterError.value = ''
  if (filter.parts.length === 0) return // "No filter": nothing to download

  faceFilterLoading.value = true
  try {
    await Promise.all([loadFaceLandmarker(), ...filter.parts.map((part) => loadImage(part.image))])
  } catch (error) {
    console.error(error)
    faceFilterError.value = 'Could not load the filter. Please check your internet and try again.'
    faceFilterId.value = 'none'
  }
  faceFilterLoading.value = false
}

// Download MediaPipe the first time a filter is used (later calls reuse the same download)
function loadFaceLandmarker() {
  if (!landmarkerLoading) {
    landmarkerLoading = createFaceLandmarker().catch((error) => {
      landmarkerLoading = null // let the next try download again
      throw error
    })
  }
  return landmarkerLoading
}

async function createFaceLandmarker() {
  // import() here (not at the top of the file) so MediaPipe is only downloaded when needed
  const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
  const files = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL)

  const options = {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO', // we give it one camera frame after another
    numFaces: MAX_FACES,
  }

  // The GPU (graphics card) is much faster, but some devices do not support it, so fall back to the CPU
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(files, options)
  } catch (error) {
    console.error(error)
    options.baseOptions.delegate = 'CPU'
    faceLandmarker = await FaceLandmarker.createFromOptions(files, options)
  }
}

function loadImage(url) {
  if (images[url]) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      images[url] = img
      resolve()
    }
    img.onerror = reject
    img.src = url
  })
}

// Runs about 60 times a second while the page is open.
// (Browsers pause this when the tab is hidden, so the others see a still picture until I come back.)
function drawLoop() {
  if (!running) return
  drawFrame()
  requestAnimationFrame(drawLoop)
}

function drawFrame() {
  // readyState 2+ means the video has a picture to draw (during a camera switch it may not)
  if (!sourceVideo || sourceVideo.readyState < 2) return

  // Match the canvas to the camera size (it can change after switching camera or rotating a phone)
  const width = sourceVideo.videoWidth
  const height = sourceVideo.videoHeight
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  ctx.drawImage(sourceVideo, 0, 0, width, height)

  const filter = getFaceFilter(faceFilterId.value)
  if (filter.parts.length === 0 || !faceLandmarker || faceFilterLoading.value) return

  findFaces()
  for (const face of faces) {
    for (const part of filter.parts) {
      drawPart(face, part)
    }
  }
}

// ---------- Faces and stickers ----------

// Search for faces, only when the camera has a new frame (this runs ~60 times a second,
// but the camera usually gives ~30 frames a second). Between frames the last faces are reused.
function findFaces() {
  if (sourceVideo.currentTime === lastVideoTime) return
  lastVideoTime = sourceVideo.currentTime

  let result
  try {
    result = faceLandmarker.detectForVideo(sourceVideo, performance.now())
  } catch (error) {
    console.error(error)
    return
  }

  // Each point is { x, y } from 0 to 1 (0,0 = top left of the picture), turned into canvas pixels here
  const newFaces = result.faceLandmarks.map((points) => {
    return points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }))
  })

  // Smoothing: move each point only part of the way to its new position, so stickers do not shake.
  // If the number of faces changed, start fresh (the faces may be in a different order).
  if (newFaces.length === faces.length) {
    faces = newFaces.map((points, f) => {
      return points.map((point, i) => {
        const old = faces[f][i]
        return {
          x: old.x + (point.x - old.x) * SMOOTHING,
          y: old.y + (point.y - old.y) * SMOOTHING,
        }
      })
    })
  } else {
    faces = newFaces
  }
}

// Draw one sticker picture onto one face
function drawPart(face, part) {
  const img = images[part.image]
  if (!img) return

  // The line between the outer eye corners gives the face's size and tilt
  const leftEye = face[33]
  const rightEye = face[263]
  const eyeWidth = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)
  const tilt = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)

  // The middle of the part's landmarks
  let x = 0
  let y = 0
  for (const index of part.at) {
    x = x + face[index].x
    y = y + face[index].y
  }
  x = x / part.at.length
  y = y / part.at.length

  const width = eyeWidth * part.width
  const height = width * (img.height / img.width) // keep the picture's shape

  // Move to the spot, turn with the head, then draw the picture centred there
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.drawImage(img, part.offsetX * eyeWidth - width / 2, part.offsetY * eyeWidth - height / 2, width, height)
  ctx.restore()
}

export function useFaceFilter() {
  return {
    faceFilterId,
    faceFilterLoading,
    faceFilterError,
    setFaceFilter,
  }
}

export { startFaceFilter, changeFaceFilterCamera, stopFaceFilter }
