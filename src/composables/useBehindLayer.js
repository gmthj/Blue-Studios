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
// If a camera has several people in it, they stay together as one group (see GROUP SETTINGS).
//
// ALIGNMENT MODES (the host picks one, see alignMode):
//   'auto'   everyone is sized to my face and lined up beside me (all of the above)
//   'free'   everyone keeps their size and place from their own camera: they move themselves around.
//            Standing at the side of their camera puts them at the side; closer to it makes them bigger.
//   'manual' the host drags people into place on their camera and pinches / scrolls to resize them.
//            Everyone starts where 'auto' would put them. Each person is pinned by their face
//            (or their middle), so they stay put if they move a little in their own camera.
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
//   const { lineup, friendsOn, setFriendsOn, friendsCount, addToLineup, removeFromLineup, moveInLineup } = useBehindLayer()

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
const DEFAULT_FACE = { x: 0.5, eyeY: 0.38, width: 0.15, span: 0.15, count: 1 }

// ---------- GROUP SETTINGS (more than one person in a camera) ----------
// A camera can have a few people in it. They are kept together as one group: sized by their
// average face, placed by the middle of all their faces, and given a wider spot in the line-up.
const GROUP_FACE_MIN = 0.6 // faces smaller than this part of the biggest face are ignored (people far behind)

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
const lineup = ref([])                // member ids, left to right on my screen, me included. Everyone in the room
                                      // is in it, except the people the host took out (removedIds).
const friendsOn = ref(false)          // the host turned Virtual Friends on (the lineup is only drawn while on)
const removedIds = ref([])            // the people the host took out (they are not added back when they rejoin)
// The line-up that is drawn: the lineup while on, nobody while off
const activeLineup = computed(() => (friendsOn.value ? lineup.value : []))
const alignMode = ref('auto')         // 'auto', 'free' or 'manual' (see ALIGNMENT MODES at the top)

// How many people (not counting me) are in the line-up
const friendsCount = computed(() => activeLineup.value.filter((id) => id !== getUid()).length)

let mirrored = false // my preview is mirrored, so "left" on screen is the right of the canvas
let getRemoteTrack = () => null // given a uid, their video from the call (set by useVideoCall.js)
const remoteVideos = new Map()  // uid -> { video, track }: a hidden <video> for each person in the line-up

// One cut-out per video: video element -> { maskCanvas, ready, hasPerson, face, rect, ... } (the tools are shared, see startTools)
const cutouts = new Map()
let scratch = null    // a spare canvas, where one person is cut out before being drawn
let lastDrawTime = 0  // when the last frame was drawn (for gliding)

// ---------- MANUAL MODE ----------
// Where the host put each person: uid -> { x, y, height, order }
//   x, y:   where their face (eye line) goes, as parts of the picture's width / height
//   height: how tall their whole video is drawn, as a part of the picture's height
//   order:  who is in front (higher = drawn later = in front). The last one moved comes to the front.
const manualSpots = new Map()
let nextOrder = 1
const MANUAL_MIN_HEIGHT = 0.15 // the smallest a person's video can be made (part of the picture's height)
const MANUAL_MAX_HEIGHT = 3    // ...and the biggest
const NO_FACE_EYE_Y = 0.4      // if someone's face is not found, they are pinned at this height of their video
// The people drawn in the last frame, in drawing order: [{ id, video, cutout, rect, drawWidth }],
// and the picture's size then. Used to find who is under the host's finger.
let drawnOthers = []
let pictureWidth = 1
let pictureHeight = 1

// ---------- Drawing ----------

// Draws the whole picture (see the top of this file). Returns false if there is nothing to do
// (or it is still loading), and then the camera should be drawn normally.
function drawBehindLayer(ctx, myVideo, width, height) {
  const myId = getUid()
  drawnOthers = [] // nobody drawn yet this frame (stays empty if the layer is not drawn)

  // The line-up, skipping people whose video is off (or not connected yet)
  const entries = []
  for (const id of activeLineup.value) {
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
  if (alignMode.value === 'free') {
    // Free: nobody is moved or resized, so no anchor, reference or line-up spots (see placeAsInCamera)
    spots = foundOthers.map((other) => ({ id: other.id, video: other.video, depth: 0, scale: 1, offset: 0 }))
  } else if (iAmFound) {
    // Placed outwards from me, spot by spot, in line-up order, and sized to my face.
    // A group (several people in one camera) takes up more room, so the next spot moves out by that much.
    anchorX = me.face ? me.face.x : me.centreX
    reference = me.face
    const myIndex = found.findIndex((entry) => entry.id === myId)
    spots = []
    for (const screenSide of [-1, 1]) {
      let reach = groupExtra(me, reference, 1) / 2 // how far from my middle the people so far reach on this side
      for (let i = myIndex + screenSide, depth = 1; i >= 0 && i < found.length; i = i + screenSide, depth++) {
        const video = found[i].video
        const scale = Math.pow(DEPTH_SCALE, depth)
        const extra = groupExtra(cutouts.get(video), reference, scale)
        const distance = reach + (depth === 1 ? FIRST_SPOT_GAP : SLOT_SPACING) + extra / 2
        reach = distance + extra / 2
        spots.push({ id: found[i].id, video: video, depth: depth, scale: scale, offset: (mirrored ? -screenSide : screenSide) * distance })
      }
    }
  } else {
    // I am not in my own picture: the others stand in the middle of the picture, side by side,
    // sized to my last face (or a normal face size if mine was never found)
    anchorX = 0.5
    reference = me.face || DEFAULT_FACE
    let reach = 0
    const middles = foundOthers.map((other, index) => {
      const extra = groupExtra(cutouts.get(other.video), reference, 1)
      const middle = reach + (index > 0 ? SLOT_SPACING : 0) + extra / 2
      reach = middle + extra / 2
      return middle
    })
    spots = foundOthers.map((other, index) => {
      const screenOffset = middles[index] - reach / 2 // the whole row is centred
      return { id: other.id, video: other.video, depth: 0, scale: 1, offset: mirrored ? -screenOffset : screenOffset }
    })
  }
  if (alignMode.value !== 'free') squeezeToFit(spots, anchorX)
  spots.sort((a, b) => b.depth - a.depth) // the furthest from me are drawn first, so the nearer ones cover them

  const manual = alignMode.value === 'manual'
  const targets = new Map()
  for (const spot of spots) {
    const cutout = cutouts.get(spot.video)
    let target = alignMode.value === 'free'
      ? placeAsInCamera(spot, cutout, width, height)
      : placePerson(spot, cutout, reference, anchorX, width, height)
    if (manual) {
      // Someone new to manual mode is pinned where auto put them; after that, where the host put them
      if (!manualSpots.has(spot.id)) manualSpots.set(spot.id, toManualSpot(target, spot.video, cutout, width, height))
      target = placeManually(manualSpots.get(spot.id), spot.video, cutout, width, height)
    }
    targets.set(spot, target)
  }
  // Manual: the person the host moved last is in front
  if (manual) spots.sort((a, b) => manualSpots.get(a.id).order - manualSpots.get(b.id).order)

  drawnOthers = []
  pictureWidth = width
  pictureHeight = height
  for (const spot of spots) {
    const cutout = cutouts.get(spot.video)
    const target = targets.get(spot)

    // Glide from where they were drawn last time towards where they should be now.
    // Not while arranging by hand: the person follows the finger straight away.
    if (!cutout.rect || manual) {
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
    drawnOthers.push({ id: spot.id, video: spot.video, cutout: cutout, rect: rect, drawWidth: drawWidth })
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

// How much wider than one person a video's group is drawn, as a part of the picture width (0 = one person).
// Their faces are drawn as wide as reference.width * scale, so the group is resized by the same amount.
function groupExtra(cutout, reference, scale) {
  if (!cutout || !cutout.face || !reference) return 0
  return ((cutout.face.span - cutout.face.width) * reference.width * scale) / cutout.face.width
}

// FREE mode: where to draw one person so they look as they do in their own camera: { x, y, height }.
// Their whole video is as tall as my picture (so standing closer to their camera makes them bigger),
// and their middle is at the same part of my picture's width as of their video's
// (so standing at the side of their camera puts them at the side of mine).
// Their video is not stretched: if it is a different shape from mine, only the left-right place is matched.
function placeAsInCamera(spot, cutout, width, height) {
  const drawHeight = height
  const drawWidth = drawHeight * (spot.video.videoWidth / spot.video.videoHeight)
  const theirCentreX = cutout.face ? cutout.face.x : cutout.centreX
  const x = theirCentreX * width - theirCentreX * drawWidth
  return { x: x, y: 0, height: drawHeight }
}

// MANUAL mode: the point each person is pinned by, as parts of their video's width / height:
// their face (eye line), or their middle if their face is not found
function pinPoint(cutout) {
  if (cutout.face) return { x: cutout.face.x, y: cutout.face.eyeY }
  return { x: cutout.centreX, y: NO_FACE_EYE_Y }
}

// MANUAL mode: turn a place on the picture ({ x, y, height } in canvas pixels) into a manual spot
function toManualSpot(target, video, cutout, width, height) {
  const drawWidth = target.height * (video.videoWidth / video.videoHeight)
  const pin = pinPoint(cutout)
  nextOrder = nextOrder + 1
  return {
    x: (target.x + pin.x * drawWidth) / width,
    y: (target.y + pin.y * target.height) / height,
    height: target.height / height,
    order: nextOrder,
  }
}

// MANUAL mode: where to draw one person from their manual spot: { x, y, height } in canvas pixels
function placeManually(manualSpot, video, cutout, width, height) {
  const drawHeight = manualSpot.height * height
  const drawWidth = drawHeight * (video.videoWidth / video.videoHeight)
  const pin = pinPoint(cutout)
  return {
    x: manualSpot.x * width - pin.x * drawWidth,
    y: manualSpot.y * height - pin.y * drawHeight,
    height: drawHeight,
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
    remote = { video: video, track: null, lastPlayTry: 0 }
    remoteVideos.set(uid, remote)
  }

  // A new video from them (e.g. they switched camera or turned it off and on): play the new one
  if (remote.track !== track) {
    remote.track = track
    remote.video.srcObject = new MediaStream([track])
    remote.lastPlayTry = performance.now()
    remote.video.play().catch((error) => console.error(error))
  }
  // Phones sometimes pause a hidden video: try to play it again (at most once a second)
  if (remote.video.paused && performance.now() - remote.lastPlayTry > 1000) {
    remote.lastPlayTry = performance.now()
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
    if (!activeLineup.value.includes(uid)) removeRemoteVideo(uid)
  }
}

// ---------- Cutting people out ----------

// ---------- The cut-out tools (shared by every video) ----------
// ONE segmenter and ONE face finder look at every video in turn (IMAGE mode: each frame is looked at
// on its own, so frames from different videos can be mixed). Every MediaPipe tool on the GPU uses its
// own graphics (WebGL) context, and phones allow only a few at once (Chrome on Android: 8). With one
// tool per video, phones ran out: Chrome quietly dropped the oldest ones, and nobody was ever found.
let segmenter = null        // the person cut-out tool, once loaded
let segmenterLoading = false
let segmenterOnCpu = false  // switched to the CPU because the GPU gave empty masks (see BAD_MASKS_BEFORE_CPU)
let detector = null         // the face finder, once loaded
let detectorLoading = false
let toolsVersion = 0        // goes up when the tools are closed, so a download still in progress is thrown away
let badMasks = 0            // masks in a row that failed or came back completely empty

// Some phones' GPUs give masks that are all 0 (or fail) without an error. After this many in a row,
// the segmenter is loaded again on the CPU (slower, but works everywhere).
const BAD_MASKS_BEFORE_CPU = 30

// Start loading the tools (only once; again after an error or after they were closed)
function startTools() {
  if (!segmenter && !segmenterLoading) loadSegmenter()
  if (!detector && !detectorLoading) loadDetector()
}

async function loadSegmenter() {
  const version = toolsVersion
  segmenterLoading = true
  behindLayerLoading.value = true
  try {
    const { vision, files } = await loadMediaPipe()
    const options = {
      baseOptions: { modelAssetPath: SEGMENTER_MODEL_URL },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true, // how sure it is, per pixel (gives soft edges)
      outputCategoryMask: false,
    }
    const task = segmenterOnCpu
      ? await vision.ImageSegmenter.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } })
      : await createTask(vision.ImageSegmenter, files, options)
    if (version !== toolsVersion) {
      task.close() // the tools were closed while this was downloading
      return
    }
    segmenter = task
  } catch (error) {
    console.error(error)
    if (version !== toolsVersion) return
    behindLayerError.value = 'Could not load the people layer. Please check your internet and try again.'
    friendsOn.value = false
  } finally {
    if (version === toolsVersion) {
      segmenterLoading = false
      behindLayerLoading.value = false
    }
  }
}

// The face finder is used to make everyone the same size.
// If it cannot load, people are just drawn at full height instead.
// It always runs on the CPU: some phones' GPUs (e.g. on Android) quietly find no faces at all,
// which drew everyone at full height. It is small and only runs a few times a second, so the CPU is fast enough.
async function loadDetector() {
  const version = toolsVersion
  detectorLoading = true
  try {
    const { vision, files } = await loadMediaPipe()
    const task = await vision.FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL_URL, delegate: 'CPU' },
      runningMode: 'IMAGE',
    })
    if (version !== toolsVersion) {
      task.close()
      return
    }
    detector = task
  } catch (error) {
    console.error(error)
  } finally {
    if (version === toolsVersion) detectorLoading = false
  }
}

// Close both tools (leaving the shoot page), freeing their graphics contexts
function closeTools() {
  toolsVersion = toolsVersion + 1
  if (segmenter) segmenter.close()
  if (detector) detector.close()
  segmenter = null
  detector = null
  segmenterLoading = false
  detectorLoading = false
  behindLayerLoading.value = false
  badMasks = 0
}

// A mask failed or was completely empty: after too many in a row on the GPU, use the CPU instead
function countBadMask() {
  badMasks = badMasks + 1
  if (badMasks < BAD_MASKS_BEFORE_CPU || segmenterOnCpu || !segmenter) return
  console.warn('Virtual Friends: the GPU cut-out is not working on this device, using the CPU instead')
  segmenterOnCpu = true
  badMasks = 0
  segmenter.close()
  segmenter = null
  loadSegmenter()
}

// The cut-out for this video. The person is found again every time the video has a new frame,
// and their face a few times a second (once the shared tools have loaded; ready = false until the first mask).
function getCutout(video) {
  let cutout = cutouts.get(video)
  if (!cutout) {
    cutout = {
      maskCanvas: null,
      maskData: null,
      lastMask: null, // the last mask's numbers, mixed into the next one (see MASK_MIXING)
      ready: false,
      hasPerson: false, // a person is found in the video (see FOUND_AREA)
      centreX: 0.5,   // the middle of the person, from 0 (left edge) to 1 (right edge)
      lastVideoTime: -1,
      face: null,     // { x, eyeY, width, span, count } of their face(s), as parts of the video's width / height (null = not found yet)
      lastFaceCheck: 0,
      rect: null,     // where they were drawn last frame: { x, y, height } (for gliding)
    }
    cutouts.set(video, cutout)
  }
  startTools()
  if (segmenter) {
    findPerson(video, cutout)
  }
  if (detector) {
    findFace(video, cutout)
  }
  return cutout
}

// Look for the biggest face in the video (the person nearest the camera), a few times a second
function findFace(video, cutout) {
  const now = performance.now()
  if (video.readyState < 2 || now - cutout.lastFaceCheck < FACE_CHECK_MS) return
  cutout.lastFaceCheck = now

  let detections
  try {
    detections = detector.detect(video).detections
  } catch (error) {
    console.error(error)
    return
  }
  if (detections.length === 0) return // keep the last face found

  // Everyone near the camera: faces at least GROUP_FACE_MIN as big as the biggest one
  let biggestWidth = 0
  for (const detection of detections) {
    biggestWidth = Math.max(biggestWidth, detection.boundingBox.width)
  }
  const group = detections.filter((detection) => detection.boundingBox.width >= biggestWidth * GROUP_FACE_MIN)

  // The boxes are in video pixels: turn them into parts of the video's size.
  // The eye line is the height of the eyes: the first two of the face finder's points
  // (right eye, left eye; the others are the nose, mouth and ears), already as parts of the video's size.
  // If the eyes are missing, guess them at 40% down the face box.
  let left = Infinity
  let right = -Infinity
  let totalWidth = 0
  let totalEyeY = 0
  for (const detection of group) {
    const box = detection.boundingBox
    const eyes = detection.keypoints.slice(0, 2)
    totalEyeY = totalEyeY + (eyes.length === 2
      ? (eyes[0].y + eyes[1].y) / 2
      : (box.originY + box.height * 0.4) / video.videoHeight)
    totalWidth = totalWidth + box.width
    left = Math.min(left, box.originX)
    right = Math.max(right, box.originX + box.width)
  }
  const face = {
    x: (left + right) / 2 / video.videoWidth,          // the middle of the group's faces
    eyeY: totalEyeY / group.length,                    // their average eye line
    width: totalWidth / group.length / video.videoWidth, // their average face width (for sizing)
    span: (right - left) / video.videoWidth,           // from the left edge of the leftmost face to the right edge of the rightmost
    count: group.length,
  }

  const old = cutout.face
  if (old) {
    // The number of faces changed: only believe it if the next check says the same
    // (the face finder sometimes misses a face for a moment, which would make the group jump)
    if (face.count !== old.count && cutout.newCount !== face.count) {
      cutout.newCount = face.count
      return
    }
    cutout.newCount = 0

    // Ignore tiny changes (the face finder's wobble). The gliding in drawBehindLayer smooths the rest.
    const moved = Math.abs(face.x - old.x) > FACE_MOVE_IGNORE || Math.abs(face.eyeY - old.eyeY) > FACE_MOVE_IGNORE
    const resized = Math.abs(face.width - old.width) / old.width > FACE_SIZE_IGNORE
      || Math.abs(face.span - old.span) > FACE_MOVE_IGNORE
    if (!moved && !resized && face.count === old.count) return
  }
  cutout.face = face
}

// Find the person in the video's newest frame and turn it into a mask picture
function findPerson(video, cutout) {
  if (video.readyState < 2 || video.currentTime === cutout.lastVideoTime) return
  cutout.lastVideoTime = video.currentTime

  try {
    segmenter.segment(video, (result) => {
      // The last mask is "person" (if there are two, the first one is "background")
      const masks = result.confidenceMasks
      if (!masks || masks.length === 0) return countBadMask()
      const mask = masks[masks.length - 1]
      const sure = mask.getAsFloat32Array()
      // A real camera picture never gives exactly 0 everywhere: an all-0 mask means the GPU is not working
      if (sure.some((value) => value > 0)) {
        badMasks = 0
      } else {
        countBadMask()
      }
      updateMask(cutout, mask.width, mask.height, sure)
    })
  } catch (error) {
    console.error(error)
    countBadMask()
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
  // The box around the person (in mask pixels), for the host's selection box in manual mode
  let left = maskWidth
  let right = -1
  let top = maskHeight
  let bottom = -1
  for (let i = 0; i < mixed.length; i++) {
    const solid = Math.min(Math.max((mixed[i] - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW), 0), 1)
    pixels[i * 4 + 3] = solid * 255
    total = total + solid
    const column = i % maskWidth
    totalX = totalX + solid * column
    if (solid > 0.5) {
      const row = (i - column) / maskWidth
      if (column < left) left = column
      if (column > right) right = column
      if (row < top) top = row
      if (row > bottom) bottom = row
    }
  }
  cutout.maskCanvas.getContext('2d').putImageData(cutout.maskData, 0, 0)

  // The box as parts of the video's width / height (null if nobody is found)
  cutout.box = right >= 0
    ? { left: left / maskWidth, right: (right + 1) / maskWidth, top: top / maskHeight, bottom: (bottom + 1) / maskHeight }
    : null

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

// Forget the cut-outs of videos that are no longer used (e.g. a person was removed)
function forgetUnusedCutouts(videosInUse) {
  for (const video of [...cutouts.keys()]) {
    if (!videosInUse.includes(video)) cutouts.delete(video)
  }
}

// ---------- The line-up (host only) ----------

// Turn Virtual Friends on or off. The line-up (and who was taken out) is kept while off.
function setFriendsOn(on) {
  behindLayerError.value = ''
  friendsOn.value = on
}

// Add someone (back). They go to the far left or the far right of the line-up, taking turns:
// left if there are no more people on my left than on my right, otherwise right.
function addToLineup(id) {
  behindLayerError.value = ''
  removedIds.value = removedIds.value.filter((other) => other !== id)
  placeInLineup(id)
}

function placeInLineup(id) {
  const myId = getUid()
  if (lineup.value.includes(id)) return
  if (lineup.value.length === 0) {
    lineup.value = [id, myId]
    return
  }
  const myIndex = lineup.value.indexOf(myId)
  const onMyLeft = myIndex
  const onMyRight = lineup.value.length - 1 - myIndex
  lineup.value = onMyLeft <= onMyRight ? [id, ...lineup.value] : [...lineup.value, id]
}

// Take someone out. They stay out (even if they leave and come back) until the host adds them again.
function removeFromLineup(id) {
  if (!removedIds.value.includes(id)) removedIds.value = [...removedIds.value, id]
  lineup.value = lineup.value.filter((other) => other !== id)
}

// Swap the person at this place with their neighbour on the left (-1) or right (+1)
function moveInLineup(index, direction) {
  const order = [...lineup.value]
  const other = index + direction
  if (other < 0 || other >= order.length) return
  ;[order[index], order[other]] = [order[other], order[index]]
  lineup.value = order
}

// Change how people are placed: 'auto', 'free' or 'manual' (see ALIGNMENT MODES at the top)
function setAlignMode(mode) {
  alignMode.value = mode
}

// ---------- Arranging by hand (manual mode) ----------
// All places here are parts of the picture's width / height (0 to 1), not mirrored:
// the page turns the finger's place on the (maybe mirrored) preview into these first.

// Who is under this point (the person in front first), or null. Only their solid part counts,
// not the see-through area around them.
function personAt(x, y) {
  const px = x * pictureWidth
  const py = y * pictureHeight
  for (let i = drawnOthers.length - 1; i >= 0; i--) {
    const { id, cutout, rect, drawWidth } = drawnOthers[i]
    const u = (px - rect.x) / drawWidth
    const v = (py - rect.y) / rect.height
    if (u < 0 || u >= 1 || v < 0 || v >= 1 || !cutout.maskData) continue
    const maskX = Math.floor(u * cutout.maskCanvas.width)
    const maskY = Math.floor(v * cutout.maskCanvas.height)
    const solid = cutout.maskData.data[(maskY * cutout.maskCanvas.width + maskX) * 4 + 3]
    if (solid > 128) return id
  }
  return null
}

// The box around a person as drawn now: { left, right, top, bottom }, or null if they are not drawn
function personBox(id) {
  const drawn = drawnOthers.find((other) => other.id === id)
  if (!drawn || !drawn.cutout.box) return null
  const { rect, drawWidth, cutout } = drawn
  return {
    left: (rect.x + cutout.box.left * drawWidth) / pictureWidth,
    right: (rect.x + cutout.box.right * drawWidth) / pictureWidth,
    top: (rect.y + cutout.box.top * rect.height) / pictureHeight,
    bottom: (rect.y + cutout.box.bottom * rect.height) / pictureHeight,
  }
}

// Move someone by dx, dy, and bring them to the front. Their pin point stays inside the picture.
function movePerson(id, dx, dy) {
  const spot = manualSpots.get(id)
  if (!spot) return
  spot.x = Math.min(Math.max(spot.x + dx, 0), 1)
  spot.y = Math.min(Math.max(spot.y + dy, 0), 1)
  nextOrder = nextOrder + 1
  spot.order = nextOrder
}

// Make someone bigger (factor > 1) or smaller (< 1), keeping the point aroundX, aroundY where it is
function resizePerson(id, factor, aroundX, aroundY) {
  const spot = manualSpots.get(id)
  if (!spot) return
  const newHeight = Math.min(Math.max(spot.height * factor, MANUAL_MIN_HEIGHT), MANUAL_MAX_HEIGHT)
  const real = newHeight / spot.height // after the limits
  spot.height = newHeight
  spot.x = Math.min(Math.max(aroundX + (spot.x - aroundX) * real, 0), 1)
  spot.y = Math.min(Math.max(aroundY + (spot.y - aroundY) * real, 0), 1)
}

// Put everyone back where auto mode would put them (they are pinned there again next frame)
function resetManualSpots() {
  manualSpots.clear()
}

// Keep the line-up the same as the room (memberIds = everyone here now, me included):
// people who left are taken out, and everyone new is added, unless the host took them out before.
function syncLineupWithRoom(memberIds) {
  const myId = getUid()
  const stillHere = lineup.value.filter((id) => id === myId || memberIds.includes(id))
  if (stillHere.length !== lineup.value.length) lineup.value = stillHere
  if (!lineup.value.includes(myId)) lineup.value = [...lineup.value, myId]
  for (const id of memberIds) {
    if (id !== myId && !removedIds.value.includes(id)) placeInLineup(id)
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

// Stop all the work (hidden videos, the segmenter and face finder) but keep the line-up,
// so it comes back when the layer is drawn again
function releaseBehindLayer() {
  for (const uid of [...remoteVideos.keys()]) {
    removeRemoteVideo(uid)
  }
  forgetUnusedCutouts([])
  closeTools()
}

// Leaving the room: empty line-up, and close everything
function resetBehindLayer() {
  lineup.value = []
  friendsOn.value = false
  removedIds.value = []
  manualSpots.clear()
  drawnOthers = []
  releaseBehindLayer()
}

export function useBehindLayer() {
  return {
    lineup,
    activeLineup,
    friendsOn,
    setFriendsOn,
    friendsCount,
    alignMode,
    setAlignMode,
    personAt,
    personBox,
    movePerson,
    resizePerson,
    resetManualSpots,
    behindLayerLoading,
    behindLayerError,
    addToLineup,
    removeFromLineup,
    moveInLineup,
    syncLineupWithRoom,
  }
}

export { drawBehindLayer, releaseBehindLayer, setBehindLayerMirrored, setRemoteTrackSource, resetBehindLayer }
