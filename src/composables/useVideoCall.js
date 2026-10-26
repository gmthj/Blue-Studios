import { ref } from 'vue'
import AgoraRTC from 'agora-rtc-sdk-ng'
import axios from 'axios'
import { auth } from '../firebase.js'
import { startFaceFilter, changeFaceFilterCamera, stopFaceFilter } from './useFaceFilter.js'

// SHARED video call (through Agora) for every page inside a room.
// Like useRoom.js, the refs are created once outside the function, so all pages share ONE call.
// RoomLayout.vue starts the call when we enter a room and ends it when we leave,
// so moving between the camera page and the strip page does not drop the call.
//
// Usage in a page or component:
//   const { localStream, micOn, toggleMic, switchCamera } = useVideoCall()

// Only show Agora warnings and errors in the console (it prints a lot of info otherwise)
AgoraRTC.setLogLevel(2)

// ---------- Shared state (refs, so pages update automatically) ----------
const callError = ref('')
const localStream = ref(null)   // my camera with the face filter (a MediaStream), shown in <video> elements
const cameras = ref([])         // all cameras on this device
const cameraIndex = ref(0)      // which camera in the list is being used
const mirrored = ref(true)      // flip my picture like a mirror (front camera only)
const cameraError = ref('')
const switchingCamera = ref(false)
const micOn = ref(false)        // everyone always starts muted
const micBusy = ref(false)      // true while the mic is being turned on/off
const remoteUsers = ref([])     // the others: [{ uid: 'Xk3v9...', hasVideo: true, hasAudio: false }]

// ---------- Agora objects (normal variables: pages never show them directly,
//            and wrapping them in Vue's reactivity can break them) ----------
let agoraClient = null      // our connection to the Agora call
let localVideoTrack = null  // my camera, as sent to the others
let micTrack = null         // my microphone, only exists while unmuted
let agoraUsers = {}         // uid -> Agora user object, needed to play their video
let wantCall = false        // false once endCall() runs, so a call that is still connecting stops
let cameraStream = null     // the real camera, before the face filter (see useFaceFilter.js)

// ---------- Camera ----------

async function openCamera() {
  // Browsers only allow the camera on https:// pages (or localhost)
  if (!navigator.mediaDevices) {
    cameraError.value = 'Camera not available. The page must be opened with https://'
    return
  }

  // First time: ask for the front camera. After switching: ask for that exact camera.
  let videoOptions = { facingMode: 'user' }
  if (cameras.value.length > 0) {
    videoOptions = { deviceId: { exact: cameras.value[cameraIndex.value].deviceId } }
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: videoOptions, audio: false })
    cameraError.value = ''
  } catch (error) {
    console.error(error)
    cameraError.value = 'Could not open the camera. Please allow camera permission and refresh.'
    return
  }

  // Everyone sees the camera through the face filter. The first time, start the filter.
  // After switching camera, the filter keeps its stream and just draws the new camera.
  if (localStream.value) {
    await changeFaceFilterCamera(cameraStream)
  } else {
    localStream.value = await startFaceFilter(cameraStream)
  }

  // Information about the camera we got, e.g. its deviceId and facingMode
  const settings = cameraStream.getVideoTracks()[0].getSettings()

  // Back cameras report facingMode 'environment'. Everything else (front cameras, laptop webcams) is mirrored.
  mirrored.value = settings.facingMode !== 'environment'

  // Get the list of cameras once. (Camera names are only available after permission is given.)
  if (cameras.value.length === 0) {
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameras.value = devices.filter((device) => device.kind === 'videoinput')

    // Remember which camera in the list we are using now
    const currentIndex = cameras.value.findIndex((camera) => camera.deviceId === settings.deviceId)
    if (currentIndex !== -1) {
      cameraIndex.value = currentIndex
    }
  }
}

// Turn off the real camera only (the face filter keeps showing the last picture)
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop())
    cameraStream = null
  }
}

// Turn off the camera and the face filter, so there is no video at all
function closeCamera() {
  stopCamera()
  stopFaceFilter()
  localStream.value = null
}

// Go to the next camera in the list, back to the first one after the last
async function switchCamera() {
  // Ignore extra taps while a switch is still happening (two switches at once can break the camera)
  if (switchingCamera.value) return
  switchingCamera.value = true

  // Most phones cannot open two cameras at the same time, so turn the old one off first
  stopCamera()
  cameraIndex.value = (cameraIndex.value + 1) % cameras.value.length
  await openCamera()

  // The video we send to the others is the face filter's stream, which did not change,
  // so the others keep seeing us with the new camera (nothing to swap in Agora).
  // If the new camera did not open, turn the video off instead of showing a frozen picture.
  if (!cameraStream) {
    closeCamera()
  }

  switchingCamera.value = false
}

// ---------- Others in the call ----------

function getRemoteUser(uid) {
  return remoteUsers.value.find((user) => user.uid === uid)
}

// Change hasVideo / hasAudio for one remote user (adds them to the list if they are new)
function updateRemoteUser(uid, changes) {
  let user = getRemoteUser(uid)
  if (!user) {
    remoteUsers.value.push({ uid: uid, hasVideo: false, hasAudio: false })
    user = getRemoteUser(uid)
  }
  Object.assign(user, changes)
}

// Show a remote user's video inside an HTML element (called by VideoTile.vue)
function attachRemoteVideo(uid, element) {
  const user = agoraUsers[uid]
  if (user && user.videoTrack && element) {
    user.videoTrack.stop() // stop playing in any old element (e.g. on the previous page)
    // fit: 'contain' shows the whole picture, so portrait and landscape guests both look right
    user.videoTrack.play(element, { fit: 'contain' })
  }
}

// ---------- Joining and leaving ----------

async function startCall(code, uid) {
  if (agoraClient) return // already in the call
  wantCall = true
  callError.value = ''
  micOn.value = false // everyone always starts muted

  await openCamera()
  if (!wantCall) return endCall() // left the room while the camera was opening

  // Every room is its own Agora "channel". We use our Firebase uid as our Agora user id.
  const channel = 'blue-studios-' + code

  // Ask our own server function (api/token.js) for a token that lets us join this channel.
  // We send our Firebase ID token (proof of who we are), so the server can check we are in this room.
  // The response looks like: { appId: '...', token: '...' }
  let appId = ''
  let token = ''
  try {
    const idToken = await auth.currentUser.getIdToken()
    const response = await axios.get('/api/token', {
      params: { code: code },
      headers: { Authorization: 'Bearer ' + idToken },
    })
    appId = response.data.appId
    token = response.data.token
  } catch (error) {
    console.error(error)
    callError.value = 'Live video unavailable right now.'
    return
  }
  if (!wantCall) return endCall() // left the room while getting the token

  agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

  // Someone turned on their camera or microphone: subscribe to it
  agoraClient.on('user-published', async (user, mediaType) => {
    await agoraClient.subscribe(user, mediaType)
    agoraUsers[user.uid] = user
    if (mediaType === 'video') {
      updateRemoteUser(user.uid, { hasVideo: true }) // VideoTile.vue sees this and shows the video
    }
    if (mediaType === 'audio') {
      user.audioTrack.play() // audio does not need an element, it just plays
      updateRemoteUser(user.uid, { hasAudio: true })
    }
  })

  // Someone turned off their camera or muted their microphone
  agoraClient.on('user-unpublished', (user, mediaType) => {
    if (mediaType === 'video') {
      updateRemoteUser(user.uid, { hasVideo: false })
    }
    if (mediaType === 'audio') {
      updateRemoteUser(user.uid, { hasAudio: false })
    }
  })

  // Someone left the call
  agoraClient.on('user-left', (user) => {
    remoteUsers.value = remoteUsers.value.filter((u) => u.uid !== user.uid)
    delete agoraUsers[user.uid]
  })

  try {
    await agoraClient.join(appId, channel, token, uid)
    if (!wantCall) return endCall() // left the room while joining

    // Send our camera to the others. We use the camera we already opened,
    // instead of letting Agora open the camera again. The microphone is NOT sent (muted).
    if (localStream.value) {
      localVideoTrack = AgoraRTC.createCustomVideoTrack({
        mediaStreamTrack: localStream.value.getVideoTracks()[0],
      })
      await agoraClient.publish(localVideoTrack)
    }
  } catch (error) {
    console.error(error)
    callError.value = 'Live video unavailable right now.'
  }
}

async function endCall() {
  wantCall = false
  if (micTrack) {
    micTrack.close()
    micTrack = null
  }
  if (localVideoTrack) {
    localVideoTrack.close()
    localVideoTrack = null
  }
  if (agoraClient) {
    const client = agoraClient
    agoraClient = null
    await client.leave()
  }
  closeCamera()
  agoraUsers = {}
  remoteUsers.value = []
  micOn.value = false
}

// ---------- Microphone ----------

// Unmute: open the microphone and send it. Mute: stop sending it and close it
// (closing it turns the microphone fully off, so the browser's "mic in use" icon goes away).
async function toggleMic() {
  if (!agoraClient || micBusy.value) return
  micBusy.value = true

  try {
    if (micOn.value) {
      await agoraClient.unpublish(micTrack)
      micTrack.close()
      micTrack = null
      micOn.value = false
    } else {
      micTrack = await AgoraRTC.createMicrophoneAudioTrack() // asks for mic permission the first time
      await agoraClient.publish(micTrack)
      micOn.value = true
    }
  } catch (error) {
    console.error(error)
    callError.value = 'Could not use the microphone. Please allow microphone permission.'
  }

  micBusy.value = false
}

export function useVideoCall() {
  return {
    callError,
    localStream,
    cameras,
    cameraIndex,
    mirrored,
    cameraError,
    switchingCamera,
    micOn,
    micBusy,
    remoteUsers,
    getRemoteUser,
    attachRemoteVideo,
    startCall,
    endCall,
    switchCamera,
    toggleMic,
  }
}
