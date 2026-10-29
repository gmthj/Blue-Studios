// THE LAYER BEHIND ME: other people, cut out of their own cameras, standing behind me
// on my camera (only the host can do this). Every frame is drawn in this order:
//   1. my real camera (my real background)
//   2. the other people, cut out, in a line-up with me (the ones furthest from me first)
//   3. me, cut out, on top (so the others stand behind me)
// (useFaceFilter.js then draws the face stickers on top of all of this.)
//
// The LINE-UP is everyone (me included) from left to right as seen on my screen, e.g. [P1, P2, me, P3].
// I stay where I really am in my camera; the others are placed beside me, in line-up order.
// New people go left / right of me in turn (1 person: left. 2: left, right. 3: 2 left, 1 right, ...),
// and the host can then move anyone (themselves too) to any place in the line-up.
//
// People are cut out with Google's MediaPipe Selfie Segmenter: for every pixel of a video it says
// how sure it is that the pixel is a person (0 to 1). That becomes a "mask": person pixels are kept,
// everything else becomes see-through. A small face finder (MediaPipe Face Detector) makes everyone
// roughly the same size: each person is resized so their face is as wide as mine.
//
// The other people's videos come from the video call (Agora). The host's device cuts them out
// itself, and the finished picture is the host's camera that everyone sees.
//
// Usage (only useFaceFilter.js needs these):
//   if (!drawBehindLayer(ctx, myVideo, width, height)) { ...draw the camera normally... }
//   releaseBehindLayer()  // stop all the work (leaving the shoot stage), but keep the line-up
// Usage (only useVideoCall.js needs these):
//   setRemoteTrackSource((uid) => ...)  // how to get a person's video from the call
//   resetBehindLayer()                  // when leaving the room
//
// Usage in a page (host only):
//   const { lineup, peopleCount, addToLineup, removeFromLineup, moveInLineup } = useBehindLayer()

import { ref, computed } from 'vue'
import { loadMediaPipe, createTask } from '../utils/mediapipe.js'
import { getUid } from './useAuth.js'

// The person cut-out model (about 250 KB) and the face finder (about 230 KB), downloaded when first needed
const SEGMENTER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
const FACE_DETECTOR_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'

// ---------- LAYOUT SETTINGS: change these to move the people behind me ----------
// Distances are a part of the picture width (0.3 = 30%), measured from my middle to theirs
const FIRST_SPOT_GAP = 0.3 // the spots right next to me
const SLOT_SPACING = 0.22  // each spot further out is this much further again
const DEPTH_SCALE = 0.88   // each spot further from me is drawn this much smaller (looks further back)
const EDGE_MARGIN = 0.1    // if the line-up does not fit, it is squeezed so everyone's middle stays this far inside the edge

// ---------- SAME SIZE SETTINGS ----------
// Everyone is resized so their face is as wide as mine (times DEPTH_SCALE further out),
// with their eyes on the same line as mine. Faces are looked for a few times a second.
const FACE_CHECK_MS = 250 // how often each person's face is looked for
const MIN_SIZE = 0.4      // never draw someone shorter than this part of the picture's height...
const MAX_SIZE = 2.5      // ...or taller than this (in case a face was found wrongly)
// If I am not in my own picture and my face was never found: size everyone to this face
// (middle of the picture, eyes 38% down, 15% of the picture's width)
const DEFAULT_FACE = { x: 0.5, eyeY: 0.38, width: 0.15 }

// ---------- WHO COUNTS AS "FOUND" ----------
// Someone is found when the person part of their mask covers at least FOUND_AREA of their video,
// and lost again when it drops below LOST_AREA. (Two different numbers, so someone right on
// the edge does not flicker in and out.)
const FOUND_AREA = 0.02 // 2%
const LOST_AREA = 0.01  // 1%

// ---------- STEADINESS SETTINGS (less jitter) ----------
// The face finder's answer wobbles a little even when someone holds still. Changes smaller than
// these are ignored, so people do not keep growing and shrinking by a tiny amount.
const FACE_MOVE_IGNORE = 0.02 // face moved less than 2% of the video's width / height
const FACE_SIZE_IGNORE = 0.05 // face size changed by less than 5%
// Where each person is drawn glides towards where they should be, instead of jumping.
// About GLIDE_MS milliseconds to get most of the way there (higher = smoother but slower).
const GLIDE_MS = 150
// Each new cut-out mask is mixed with the last one, so its edges flicker less (0 = no mixing).
// Too high and a moving person leaves a faint trail.
const MASK_MIXING = 0.4

// ---------- CUT-OUT SETTINGS ----------
// A pixel counts as "person" from EDGE_LOW (see-through) to EDGE_HIGH (solid).
// The values in between give a soft edge instead of a hard, jagged one.
const EDGE_LOW = 0.25
const EDGE_HIGH = 0.75

// ---------- Shared state (refs, so pages update automatically) ----------
const behindLayerLoading = ref(false) // true while the cut-out model downloads
const behindLayerError = ref('')
const lineup = ref([])                // member ids, left to right on my screen, me included. [] = nobody.

// How many people (not counting me) are in the line-up
const peopleCount = computed(() => lineup.value.filter((id) => id !== getUid()).length)

let mirrored = false // my preview is mirrored, so "left" on screen is the right of the canvas
let getRemoteTrack = () => null // given a uid, their video from the call (set by useVideoCall.js)
const remoteVideos = new Map()  // uid -> { video, track }: a hidden <video> for each person in the line-up

// One cut-out per video: video element -> { segmenter, maskCanvas, ready, detector, face, rect, ... }
const cutouts = new Map()
let scratch = null    // a spare canvas, where one person is cut out before being drawn
let lastDrawTime = 0  // when the last frame was drawn (for gliding)

// ---------- Drawing ----------

// Draws the whole picture (see the top of this file). Returns false if there is nothing to do
// (or it is still loading), and then the camera should be drawn normally.
function drawBehindLayer(ctx, myVideo, width, height) {
  const myId = getUid()

  // The line-up, skipping people whose video is off (or not connected yet)
  const entries = []
  for (const id of lineup.value) {
    if (id === myId) {
      entries.push({ id: id, video: myVideo })
    } else {
      const video = getRemoteVideo(id)
      if (video) entries.push({ id: id, video: video })
    }
  }
  forgetUnusedRemoteVideos()
  const others = entries.filter((entry) => entry.id !== myId)
  forgetUnusedCutouts(others.length > 0 ? entries.map((entry) => entry.video) : [])
  if (others.length === 0) return false

  const me = getCutout(myVideo)
  if (!me.ready) return false // my own cut-out is not ready yet: draw the normal camera for now
  for (const other of others) {
    getCutout(other.video) // finds the person in this video's newest frame (only once per frame)
  }

  // Only people actually found in their video get a spot. Anyone else (out of the frame,
  // camera pointing away, still loading) is skipped, so the people beside them close the gap.
  const found = entries.filter((entry) => {
    const cutout = cutouts.get(entry.video)
    return cutout && cutout.ready && cutout.hasPerson
  })
  const foundOthers = found.filter((entry) => entry.id !== myId)
  if (foundOthers.length === 0) return false
  const iAmFound = found.some((entry) => entry.id === myId)

  const now = performance.now()
  const glide = 1 - Math.exp(-(now - lastDrawTime) / GLIDE_MS) // how far to glide this frame (0 to 1)
  lastDrawTime = now

  // 1. My real background
  ctx.drawImage(myVideo, 0, 0, width, height)

  // 2. The others. On screen, left is the canvas's left, unless my preview is mirrored.
  let spots
  let anchorX   // the middle of the line-up's anchor: me, or the middle of the picture if I am not found
  let reference // the face everyone is sized and lined up to: { x, eyeY, width }
  if (iAmFound) {
    // Placed by how many spots they are from me in the line-up, and sized to my face
    anchorX = me.face ? me.face.x : me.centreX
    reference = me.face
    const myIndex = found.findIndex((entry) => entry.id === myId)
    spots = foundOthers.map((other) => {
      const spotsAway = found.indexOf(other) - myIndex // e.g. -2 = two spots to my left on screen
      const depth = Math.abs(spotsAway)
      const screenSide = Math.sign(spotsAway)
      return {
        video: other.video,
        depth: depth,
        scale: Math.pow(DEPTH_SCALE, depth),
        offset: (mirrored ? -screenSide : screenSide) * (FIRST_SPOT_GAP + (depth - 1) * SLOT_SPACING),
      }
    })
  } else {
    // I am not in my own picture: the others stand in the middle of the picture, side by side,
    // sized to my last face (or a normal face size if mine was never found)
    anchorX = 0.5
    reference = me.face || DEFAULT_FACE
    spots = foundOthers.map((other, index) => {
      const screenOffset = (index - (foundOthers.length - 1) / 2) * SLOT_SPACING
      return { video: other.video, depth: 0, scale: 1, offset: mirrored ? -screenOffset : screenOffset }
    })
  }
  squeezeToFit(spots, anchorX)
  spots.sort((a, b) => b.depth - a.depth) // the furthest from me are drawn first, so the nearer ones cover them

  for (const spot of spots) {
    const cutout = cutouts.get(spot.video)
    const target = placePerson(spot, cutout, reference, anchorX, width, height)

    // Glide from where they were drawn last time towards where they should be now
    if (!cutout.rect) {
      cutout.rect = target
    } else {
      cutout.rect = {
        x: cutout.rect.x + (target.x - cutout.rect.x) * glide,
        y: cutout.rect.y + (target.y - cutout.rect.y) * glide,
        height: cutout.rect.height + (target.height - cutout.rect.height) * glide,
      }
    }
    const rect = cutout.rect
    const drawWidth = rect.height * (spot.video.videoWidth / spot.video.videoHeight)
    drawCutout(ctx, spot.video, cutout, rect.x, rect.y, drawWidth, rect.height)
  }

  // 3. Me, cut out, on top
  drawCutout(ctx, myVideo, me, 0, 0, width, height)
  return true
}

// If the line-up is too long to fit on one side of the anchor, bring that side's people closer together,
// so everyone's middle stays inside the picture (they overlap more, standing behind each other)
function squeezeToFit(spots, anchorX) {
  const furthestLeft = Math.min(0, ...spots.map((spot) => spot.offset))
  const furthestRight = Math.max(0, ...spots.map((spot) => spot.offset))
  const roomLeft = Math.max(anchorX - EDGE_MARGIN, 0.15)
  const roomRight = Math.max(1 - anchorX - EDGE_MARGIN, 0.15)
  const squeezeLeft = furthestLeft < -roomLeft ? roomLeft / -furthestLeft : 1
  const squeezeRight = furthestRight > roomRight ? roomRight / furthestRight : 1
  for (const spot of spots) {
    spot.offset = spot.offset * (spot.offset < 0 ? squeezeLeft : squeezeRight)
  }
}

// Where (and how big) to draw one person: { x, y, height } in canvas pixels
function placePerson(spot, cutout, reference, anchorX, width, height) {
  const videoWidth = spot.video.videoWidth
  const videoHeight = spot.video.videoHeight
  let drawHeight = height * spot.scale
  let y = height - drawHeight // standing on the bottom edge
  let theirCentreX = cutout.centreX

  if (reference && cutout.face) {
    // Both faces known: resize them so their face is as wide as the reference face (smaller further out)
    const resize = (reference.width * width * spot.scale) / (cutout.face.width * videoWidth)
    drawHeight = Math.min(Math.max(videoHeight * resize, height * MIN_SIZE), height * MAX_SIZE)
    // Everyone's eyes on the same line as the reference eyes, but never floating above the bottom edge
    y = Math.max(reference.eyeY * height - cutout.face.eyeY * drawHeight, height - drawHeight)
    theirCentreX = cutout.face.x
  }

  // Their middle goes to their spot beside the anchor
  const drawWidth = drawHeight * (videoWidth / videoHeight)
  const x = (anchorX + spot.offset) * width - theirCentreX * drawWidth
  return { x: x, y: y, height: drawHeight }
}

// ---------- Other people's videos ----------

// A hidden <video> playing this person's video from the call (null if their video is off)
function getRemoteVideo(uid) {
  const track = getRemoteTrack(uid)
  let remote = remoteVideos.get(uid)
  if (!track) {
    if (remote) removeRemoteVideo(uid)
    return null
  }

  if (!remote) {
    // On the page but invisible, like the camera's hidden <video> in useFaceFilter.js
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.style.cssText = 'position:fixed; top:0; left:0; width:1px; height:1px; opacity:0; pointer-events:none;'
    document.body.appendChild(video)
    remote = { video: video, track: null }
    remoteVideos.set(uid, remote)
  }

  // A new video from them (e.g. they switched camera or turned it off and on): play the new one
  if (remote.track !== track) {
    remote.track = track
    remote.video.srcObject = new MediaStream([track])
    remote.video.play().catch((error) => console.error(error))
  }
  return remote.video
}

function removeRemoteVideo(uid) {
  const remote = remoteVideos.get(uid)
  remote.video.srcObject = null
  remote.video.remove()
  remoteVideos.delete(uid)
}

// Remove the hidden <video>s of people the host took out of the line-up
function forgetUnusedRemoteVideos() {
  for (const uid of [...remoteVideos.keys()]) {
    if (!lineup.value.includes(uid)) removeRemoteVideo(uid)
  }
}

// ---------- Cutting people out ----------

// The cut-out for this video. The first time, its segmenter and face finder start downloading
// (ready = false until the first mask is made). After that, the person is found again every time
// the video has a new frame, and their face a few times a second.
function getCutout(video) {
  let cutout = cutouts.get(video)
  if (!cutout) {
    cutout = {
      segmenter: null,
      maskCanvas: null,
      maskData: null,
      lastMask: null, // the last mask's numbers, mixed into the next one (see MASK_MIXING)
      ready: false,
      hasPerson: false, // a person is found in the video (see FOUND_AREA)
      centreX: 0.5,   // the middle of the person, from 0 (left edge) to 1 (right edge)
      lastVideoTime: -1,
      detector: null,
      face: null,     // { x, eyeY, width } of their face, as parts of the video's width / height (null = not found yet)
      lastFaceCheck: 0,
      rect: null,     // where they were drawn last frame: { x, y, height } (for gliding)
    }
    cutouts.set(video, cutout)
    startSegmenter(cutout)
    startFaceDetector(cutout)
  }
  if (cutout.segmenter) {
    findPerson(video, cutout)
  }
  if (cutout.detector) {
    findFace(video, cutout)
  }
  return cutout
}

// Each video gets its own segmenter, because it expects one video's frames one after another
async function startSegmenter(cutout) {
  behindLayerLoading.value = true
  try {
    const { vision, files } = await loadMediaPipe()
    const segmenter = await createTask(vision.ImageSegmenter, files, {
      baseOptions: { modelAssetPath: SEGMENTER_MODEL_URL },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true, // how sure it is, per pixel (gives soft edges)
      outputCategoryMask: false,
    })
    // The video may have been removed while this was downloading
    if (cutout.forgotten) {
      segmenter.close()
    } else {
      cutout.segmenter = segmenter
    }
  } catch (error) {
    console.error(error)
    behindLayerError.value = 'Could not load the people layer. Please check your internet and try again.'
    lineup.value = []
  }
  behindLayerLoading.value = false
}

// Each video also gets a face finder, used to make everyone the same size.
// If it cannot load, people are just drawn at full height instead.
async function startFaceDetector(cutout) {
  try {
    const { vision, files } = await loadMediaPipe()
    const detector = await createTask(vision.FaceDetector, files, {
      baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL_URL },
      runningMode: 'VIDEO',
    })
    if (cutout.forgotten) {
      detector.close()
    } else {
      cutout.detector = detector
    }
  } catch (error) {
    console.error(error)
  }
}

// Look for the biggest face in the video (the person nearest the camera), a few times a second
function findFace(video, cutout) {
  const now = performance.now()
  if (video.readyState < 2 || now - cutout.lastFaceCheck < FACE_CHECK_MS) return
  cutout.lastFaceCheck = now

  let detections
  try {
    detections = cutout.detector.detectForVideo(video, now).detections
  } catch (error) {
    console.error(error)
    return
  }
  if (detections.length === 0) return // keep the last face found

  let biggest = detections[0]
  for (const detection of detections) {
    if (detection.boundingBox.width > biggest.boundingBox.width) biggest = detection
  }

  // The box is in video pixels: turn it into parts of the video's size.
  // The eye line is the height of the eyes: the first two of the face finder's points
  // (right eye, left eye; the others are the nose, mouth and ears), already as parts of the video's size.
  // If the eyes are missing, guess them at 40% down the face box.
  const box = biggest.boundingBox
  const eyes = biggest.keypoints.slice(0, 2)
  const eyeY = eyes.length === 2
    ? (eyes[0].y + eyes[1].y) / 2
    : (box.originY + box.height * 0.4) / video.videoHeight
  const face = {
    x: (box.originX + box.width / 2) / video.videoWidth,
    eyeY: eyeY,
    width: box.width / video.videoWidth,
  }

  // Ignore tiny changes (the face finder's wobble). The gliding in drawBehindLayer smooths the rest.
  const old = cutout.face
  if (old) {
    const moved = Math.abs(face.x - old.x) > FACE_MOVE_IGNORE || Math.abs(face.eyeY - old.eyeY) > FACE_MOVE_IGNORE
    const resized = Math.abs(face.width - old.width) / old.width > FACE_SIZE_IGNORE
    if (!moved && !resized) return
  }
  cutout.face = face
}

// Find the person in the video's newest frame and turn it into a mask picture
function findPerson(video, cutout) {
  if (video.readyState < 2 || video.currentTime === cutout.lastVideoTime) return
  cutout.lastVideoTime = video.currentTime

  try {
    cutout.segmenter.segmentForVideo(video, performance.now(), (result) => {
      // The last mask is "person" (if there are two, the first one is "background")
      const masks = result.confidenceMasks
      if (!masks || masks.length === 0) return
      const mask = masks[masks.length - 1]
      updateMask(cutout, mask.width, mask.height, mask.getAsFloat32Array())
    })
  } catch (error) {
    console.error(error)
  }
}

// Turn the "how sure, per pixel" numbers into a small picture whose see-through-ness is the mask,
// and find the person's middle (left to right), used to place them if their face is not found
function updateMask(cutout, maskWidth, maskHeight, sure) {
  if (!cutout.maskCanvas || cutout.maskCanvas.width !== maskWidth || cutout.maskCanvas.height !== maskHeight) {
    cutout.maskCanvas = document.createElement('canvas')
    cutout.maskCanvas.width = maskWidth
    cutout.maskCanvas.height = maskHeight
    cutout.maskData = new ImageData(maskWidth, maskHeight)
    cutout.lastMask = null
  }

  // Mix the new mask into the last one (less flicker). sure is only lent to us by MediaPipe,
  // so the result is kept in our own array, which is reused every frame.
  if (!cutout.lastMask || cutout.lastMask.length !== sure.length) {
    cutout.lastMask = Float32Array.from(sure)
  }
  const mixed = cutout.lastMask
  for (let i = 0; i < sure.length; i++) {
    mixed[i] = mixed[i] * MASK_MIXING + sure[i] * (1 - MASK_MIXING)
  }

  const pixels = cutout.maskData.data // 4 numbers per pixel: red, green, blue, see-through-ness
  let total = 0
  let totalX = 0
  for (let i = 0; i < mixed.length; i++) {
    const solid = Math.min(Math.max((mixed[i] - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW), 0), 1)
    pixels[i * 4 + 3] = solid * 255
    total = total + solid
    totalX = totalX + solid * (i % maskWidth)
  }
  cutout.maskCanvas.getContext('2d').putImageData(cutout.maskData, 0, 0)

  // The person's middle. Kept as it was if nobody is found.
  if (total > 0) {
    cutout.centreX = totalX / total / maskWidth
  }

  // Is there a person in the video at all? (see FOUND_AREA / LOST_AREA)
  const area = total / mixed.length
  if (area >= FOUND_AREA) cutout.hasPerson = true
  if (area < LOST_AREA) cutout.hasPerson = false
  cutout.ready = true
}

// Draw one person (their video, with everything except them see-through) at x, y, width, height
function drawCutout(ctx, video, cutout, x, y, width, height) {
  if (!scratch) scratch = document.createElement('canvas')
  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  if (scratch.width !== videoWidth || scratch.height !== videoHeight) {
    scratch.width = videoWidth
    scratch.height = videoHeight
  }

  const s = scratch.getContext('2d')
  s.globalCompositeOperation = 'copy' // replaces what was there before
  s.drawImage(video, 0, 0, videoWidth, videoHeight)
  // "destination-in": keep the video only where the mask is solid. The small mask is stretched
  // to the video's size, which also smooths its edges.
  s.globalCompositeOperation = 'destination-in'
  s.drawImage(cutout.maskCanvas, 0, 0, videoWidth, videoHeight)
  s.globalCompositeOperation = 'source-over'

  ctx.drawImage(scratch, x, y, width, height)
}

// Close the segmenters and face finders of videos that are no longer used (e.g. a person was removed)
function forgetUnusedCutouts(videosInUse) {
  for (const [video, cutout] of cutouts) {
    if (!videosInUse.includes(video)) {
      cutout.forgotten = true
      if (cutout.segmenter) cutout.segmenter.close()
      if (cutout.detector) cutout.detector.close()
      cutouts.delete(video)
    }
  }
}

// ---------- The line-up (host only) ----------

// Add someone. They go to the far left or the far right of the line-up, taking turns:
// left if there are no more people on my left than on my right, otherwise right.
function addToLineup(id) {
  behindLayerError.value = ''
  const myId = getUid()
  if (lineup.value.length === 0) {
    lineup.value = [id, myId]
    return
  }
  const myIndex = lineup.value.indexOf(myId)
  const onMyLeft = myIndex
  const onMyRight = lineup.value.length - 1 - myIndex
  lineup.value = onMyLeft <= onMyRight ? [id, ...lineup.value] : [...lineup.value, id]
}

// Remove someone. If only I am left, the line-up is empty (the layer turns off).
function removeFromLineup(id) {
  const rest = lineup.value.filter((other) => other !== id)
  lineup.value = rest.length > 1 ? rest : []
}

// Swap the person at this place with their neighbour on the left (-1) or right (+1)
function moveInLineup(index, direction) {
  const order = [...lineup.value]
  const other = index + direction
  if (other < 0 || other >= order.length) return
  ;[order[index], order[other]] = [order[other], order[index]]
  lineup.value = order
}

// Take out anyone who is no longer in the room (memberIds = everyone still here)
function keepOnlyMembers(memberIds) {
  const stillHere = lineup.value.filter((id) => id === getUid() || memberIds.includes(id))
  if (stillHere.length !== lineup.value.length) {
    lineup.value = stillHere.length > 1 ? stillHere : []
  }
}

// ---------- Starting and stopping ----------

// useVideoCall.js tells us when the camera changes between mirrored (front) and not (back)
function setBehindLayerMirrored(isMirrored) {
  mirrored = isMirrored
}

// useVideoCall.js gives us a way to get a person's video (a MediaStreamTrack) from the call
function setRemoteTrackSource(getTrack) {
  getRemoteTrack = getTrack
}

// Stop all the work (hidden videos, segmenters, face finders) but keep the line-up,
// so it comes back when the layer is drawn again
function releaseBehindLayer() {
  for (const uid of [...remoteVideos.keys()]) {
    removeRemoteVideo(uid)
  }
  forgetUnusedCutouts([])
}

// Leaving the room: empty line-up, and close everything
function resetBehindLayer() {
  lineup.value = []
  releaseBehindLayer()
}

export function useBehindLayer() {
  return {
    lineup,
    peopleCount,
    behindLayerLoading,
    behindLayerError,
    addToLineup,
    removeFromLineup,
    moveInLineup,
    keepOnlyMembers,
  }
}

export { drawBehindLayer, releaseBehindLayer, setBehindLayerMirrored, setRemoteTrackSource, resetBehindLayer }
