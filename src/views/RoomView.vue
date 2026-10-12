<template>
  <div v-if="notFound" class="alert alert-warning">
    Room {{ code }} does not exist. <router-link to="/">Go back</router-link>
  </div>

  <div v-else class="row g-4">
    <!-- Full-screen countdown and flash (position: fixed, so they cover the whole screen) -->
    <div v-if="countdown > 0" class="countdown-overlay">{{ countdown }}</div>
    <div v-if="flash" class="flash-overlay"></div>

    <!-- TOP: how to join (always first, on every screen size) -->
    <div class="col-12">
      <div class="card">
        <div class="card-body d-flex flex-column flex-md-row align-items-center gap-3 text-center text-md-start">
          <img :src="qrCodeUrl" alt="QR code to join this room" width="140" height="140" />
          <div>
            <p class="fs-4 mb-2">
              Join at <strong>{{ siteAddress }}</strong> with code
              <strong class="room-code">{{ code }}</strong>
            </p>
            <p class="small text-muted mb-2">Or scan the QR code with your phone camera.</p>
            <button class="btn btn-outline-primary btn-sm" @click="copyJoinLink">
              {{ copied ? 'Link copied!' : 'Copy join link' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- LEFT: camera -->
    <div class="col-12 col-lg-7">
      <div class="card">
        <div class="card-body">
          <div class="camera-box">
            <!-- :class adds "mirrored" only for the front camera, so the back camera is not flipped -->
            <video ref="video" autoplay playsinline muted class="w-100 rounded" :class="{ mirrored: mirrored }"></video>

            <!-- Only shown if the device has more than one camera (e.g. phones with front + back) -->
            <button
              v-if="cameras.length > 1"
              class="btn btn-light btn-sm switch-camera-btn"
              :disabled="countdown > 0"
              @click="switchCamera"
            >
              Switch camera ({{ cameraIndex + 1 }}/{{ cameras.length }})
            </button>
          </div>

          <div v-if="cameraError" class="alert alert-danger mt-3 mb-0">{{ cameraError }}</div>

          <div class="mt-3">
            <button v-if="isHost" class="btn btn-primary btn-lg w-100" :disabled="countdown > 0" @click="startShot">
              Start countdown
            </button>
            <p v-else-if="room" class="text-center text-muted mb-0">
              Waiting for {{ room.hostName }} (host) to start the countdown...
            </p>
          </div>
        </div>
      </div>

      <!-- Live video of everyone else in the room (through Agora) -->
      <div class="card mt-3">
        <div class="card-body">
          <h2 class="h6">Live previews</h2>
          <p v-if="liveError" class="text-danger small mb-0">{{ liveError }}</p>
          <p v-else-if="remoteUids.length === 0" class="text-muted small mb-0">Waiting for others to turn on their camera...</p>

          <div class="row g-2">
            <div v-for="uid in remoteUids" :key="uid" class="col-6 col-md-4">
              <!-- Agora puts the video inside this empty div (see the 'user-published' event) -->
              <div :id="'remote-' + uid" class="remote-video rounded"></div>
              <p class="small text-center mb-0">
                {{ getMemberName(uid) }}
                <span class="badge text-bg-light border">{{ getMemberDevice(uid) }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: who is in the room -->
    <div class="col-12 col-lg-5">
      <div class="card">
        <div class="card-body">
          <h2 class="h6">In this room ({{ members.length }})</h2>
          <ul class="list-group list-group-flush">
            <li v-for="member in members" :key="member.id" class="list-group-item px-0">
              {{ member.name }}
              <span v-if="room && member.id === room.hostId" class="badge bg-primary ms-1">host</span>
              <span v-if="member.id === playerId" class="badge bg-secondary ms-1">you</span>
            </li>
          </ul>
          <button class="btn btn-outline-danger btn-sm mt-3" @click="leaveRoom">Leave room</button>
        </div>
      </div>
    </div>

    <!-- BOTTOM: shared gallery, grouped by shot -->
    <div class="col-12">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="h5 mb-0">Room gallery</h2>
        <router-link v-if="photos.length > 0" :to="'/room/' + code + '/strip'" class="btn btn-success">
          Make photostrip &rarr;
        </router-link>
      </div>
      <p v-if="shots.length === 0" class="text-muted">No photos yet. The host starts the countdown and everyone's camera snaps at the same time.</p>

      <div v-for="shot in shots" :key="shot.shotNumber" class="mb-4">
        <h3 class="h6 text-muted">Shot {{ shot.shotNumber }}</h3>
        <div class="row g-2">
          <div v-for="photo in shot.photos" :key="photo.id" class="col-6 col-md-4 col-lg-3">
            <img :src="photo.image" :alt="'Photo by ' + photo.name" class="w-100 rounded" />
            <p class="small text-center mb-0">{{ photo.name }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, orderBy,
} from 'firebase/firestore'
import AgoraRTC from 'agora-rtc-sdk-ng'
import axios from 'axios'
import { db } from '../firebase.js'
import { getPlayerId, getPlayerName, getDeviceType } from '../player.js'

// Only show Agora warnings and errors in the console (it prints a lot of info otherwise)
AgoraRTC.setLogLevel(2)

// Agora objects are kept here instead of in data(), because Vue does not need to
// watch them, and wrapping them in Vue's reactivity can break them.
let agoraClient = null     // our connection to the Agora video call
let localVideoTrack = null // our camera, as sent to the others

export default {
  data() {
    return {
      code: this.$route.params.code,
      playerId: getPlayerId(),
      playerName: getPlayerName(),
      deviceType: getDeviceType(), // 'Phone', 'Tablet' or 'Computer'
      copied: false,               // shows "Link copied!" for a moment after copying

      room: null,    // the room document (hostId, hostName, shotNumber)
      members: [],    // everyone in the room
      photos: [],     // every photo taken in the room
      notFound: false,

      stream: null,   // the camera stream
      cameraError: '',
      cameras: [],    // all cameras on this device
      cameraIndex: 0, // which camera in the list is being used
      mirrored: true, // flip the picture like a mirror (front camera only)

      remoteUids: [], // player ids of the other guests whose live video we are showing
      liveError: '',

      countdown: 0,          // 3, 2, 1 shown on screen. 0 means no countdown running
      countdownTimer: null,
      flash: false,
      lastShotNumber: null,  // the last shot this device has already handled

      // onSnapshot returns a function that stops listening. We keep them to call when leaving.
      stopRoomListener: null,
      stopMembersListener: null,
      stopPhotosListener: null,
    }
  },

  computed: {
    isHost() {
      return this.room !== null && this.room.hostId === this.playerId
    },

    // The website address without "https://", e.g. "blue-studios.vercel.app"
    siteAddress() {
      return window.location.host
    },

    // The link that opens the home page with this room's code filled in
    joinLink() {
      return window.location.origin + '/?code=' + this.code
    },

    // goqr.me API: returns a QR code image for any text we give it
    qrCodeUrl() {
      return 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(this.joinLink)
    },

    // Group photos by shot number, so photos taken in the same countdown appear together.
    // Result looks like: [ { shotNumber: 2, photos: [...] }, { shotNumber: 1, photos: [...] } ]
    shots() {
      const groups = []
      for (const photo of this.photos) {
        let group = groups.find((g) => g.shotNumber === photo.shotNumber)
        if (!group) {
          group = { shotNumber: photo.shotNumber, photos: [] }
          groups.push(group)
        }
        group.photos.push(photo)
      }
      return groups.reverse() // newest shot first
    },
  },

  async mounted() {
    // People who open a room link without a name are sent to the home page to type one
    if (this.playerName === '') {
      this.$router.push('/?code=' + this.code)
      return
    }

    const roomRef = doc(db, 'rooms', this.code)
    const roomSnap = await getDoc(roomRef)
    if (!roomSnap.exists()) {
      this.notFound = true
      return
    }

    // 1. Add myself to the room's members list (document id = my player id)
    await setDoc(doc(db, 'rooms', this.code, 'members', this.playerId), {
      name: this.playerName,
      deviceType: this.deviceType,
      joinedAt: Date.now(),
    })

    // 2. Listen to the room document. This runs once now, and again every time it changes.
    this.stopRoomListener = onSnapshot(roomRef, (snapshot) => {
      this.room = snapshot.data()

      if (this.lastShotNumber === null) {
        // First time: just remember the current shot number, do not start a countdown
        this.lastShotNumber = this.room.shotNumber
      } else if (this.room.shotNumber > this.lastShotNumber) {
        // The host pressed "Start countdown", so every device starts its own 3-2-1 now
        this.lastShotNumber = this.room.shotNumber
        this.startCountdown()
      }
    })

    // 3. Listen to the members list
    const membersQuery = query(collection(db, 'rooms', this.code, 'members'), orderBy('joinedAt'))
    this.stopMembersListener = onSnapshot(membersQuery, (snapshot) => {
      const list = []
      snapshot.forEach((memberDoc) => {
        list.push({ id: memberDoc.id, ...memberDoc.data() })
      })
      this.members = list
    })

    // 4. Listen to the photos, so new photos from anyone appear straight away
    const photosQuery = query(collection(db, 'rooms', this.code, 'photos'), orderBy('createdAt'))
    this.stopPhotosListener = onSnapshot(photosQuery, (snapshot) => {
      const list = []
      snapshot.forEach((photoDoc) => {
        list.push({ id: photoDoc.id, ...photoDoc.data() })
      })
      this.photos = list
    })

    // 5. Turn on the camera, then join the live video call so others can see us
    await this.startCamera()
    await this.joinLiveVideo()

    // 6. On phones and tablets, restart the camera when the device is rotated,
    //    so the picture matches the new orientation (portrait / landscape)
    if (this.deviceType !== 'Computer' && screen.orientation) {
      screen.orientation.addEventListener('change', this.onRotate)
    }
  },

  // Runs when we leave this page: stop listeners, timer, live video and camera
  beforeUnmount() {
    if (this.stopRoomListener) this.stopRoomListener()
    if (this.stopMembersListener) this.stopMembersListener()
    if (this.stopPhotosListener) this.stopPhotosListener()
    if (screen.orientation) screen.orientation.removeEventListener('change', this.onRotate)
    clearInterval(this.countdownTimer)
    this.leaveLiveVideo()
    this.stopCamera()
  },

  methods: {
    // Agora tells us other guests by their player id, so we look up their details in the members list
    getMemberName(uid) {
      const member = this.members.find((m) => m.id === uid)
      if (member) {
        return member.name
      }
      return 'Guest'
    },

    getMemberDevice(uid) {
      const member = this.members.find((m) => m.id === uid)
      if (member && member.deviceType) {
        return member.deviceType
      }
      return 'Unknown device'
    },

    async copyJoinLink() {
      try {
        await navigator.clipboard.writeText(this.joinLink)
        this.copied = true
        setTimeout(() => {
          this.copied = false
        }, 2000)
      } catch (error) {
        // Some browsers block the clipboard, so show the link for the user to copy themselves
        console.error(error)
        alert('Copy this link: ' + this.joinLink)
      }
    },

    onRotate() {
      // Wait half a second for the rotation to finish, then restart the camera
      setTimeout(() => {
        this.restartCamera()
      }, 500)
    },

    async joinLiveVideo() {
      // Every room is its own Agora "channel". We use our player id as our Agora user id.
      const channel = 'blue-studios-' + this.code

      // Ask our own server function (api/token.js) for a token that lets us join this channel.
      // The response looks like: { appId: '...', token: '...' }
      let appId = ''
      let token = ''
      try {
        const response = await axios.get('/api/token', {
          params: { channel: channel, uid: this.playerId },
        })
        appId = response.data.appId
        token = response.data.token
      } catch (error) {
        console.error(error)
        this.liveError = 'Could not connect to live previews.'
        return
      }

      agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

      // Someone else turned on their camera: subscribe to it and show it
      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType)
        if (mediaType === 'video') {
          if (!this.remoteUids.includes(user.uid)) {
            this.remoteUids.push(user.uid)
          }
          // Wait for Vue to create the <div id="remote-..."> for this user, then play the video in it
          await this.$nextTick()
          // fit: 'contain' shows the whole picture, so portrait and landscape guests both look right
          user.videoTrack.play('remote-' + user.uid, { fit: 'contain' })
        }
      })

      // Someone turned off their camera or left: remove their preview
      agoraClient.on('user-unpublished', (user) => {
        this.remoteUids = this.remoteUids.filter((uid) => uid !== user.uid)
      })
      agoraClient.on('user-left', (user) => {
        this.remoteUids = this.remoteUids.filter((uid) => uid !== user.uid)
      })

      try {
        await agoraClient.join(appId, channel, token, this.playerId)
        await this.publishCamera()
      } catch (error) {
        console.error(error)
        this.liveError = 'Could not connect to live previews.'
      }
    },

    // Send our camera to everyone else in the channel
    async publishCamera() {
      if (!agoraClient || !this.stream) return

      // If we were already sending a camera (e.g. before switching), stop sending it first
      if (localVideoTrack) {
        await agoraClient.unpublish(localVideoTrack)
        localVideoTrack.close()
      }

      // Use the camera stream we already opened, instead of letting Agora open the camera again
      localVideoTrack = AgoraRTC.createCustomVideoTrack({
        mediaStreamTrack: this.stream.getVideoTracks()[0],
      })
      await agoraClient.publish(localVideoTrack)
    },

    leaveLiveVideo() {
      if (localVideoTrack) {
        localVideoTrack.close()
        localVideoTrack = null
      }
      if (agoraClient) {
        agoraClient.leave()
        agoraClient = null
      }
    },

    async startCamera() {
      // Browsers only allow the camera on https:// pages (or localhost)
      if (!navigator.mediaDevices) {
        this.cameraError = 'Camera not available. The page must be opened with https://'
        return
      }
      // First time: ask for the front camera. After switching: ask for that exact camera.
      let videoOptions = { facingMode: 'user' }
      if (this.cameras.length > 0) {
        videoOptions = { deviceId: { exact: this.cameras[this.cameraIndex].deviceId } }
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: videoOptions,
          audio: false,
        })
        this.$refs.video.srcObject = this.stream
      } catch (error) {
        console.error(error)
        this.cameraError = 'Could not open the camera. Please allow camera permission and refresh.'
        return
      }

      // Information about the camera we got, e.g. its deviceId and facingMode
      const settings = this.stream.getVideoTracks()[0].getSettings()

      // Back cameras report facingMode 'environment'. Everything else (front cameras, laptop webcams) is mirrored.
      this.mirrored = settings.facingMode !== 'environment'

      // Get the list of cameras once. (Camera names are only available after permission is given.)
      if (this.cameras.length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        this.cameras = devices.filter((device) => device.kind === 'videoinput')

        // Remember which camera in the list we are using now
        const currentIndex = this.cameras.findIndex((camera) => camera.deviceId === settings.deviceId)
        if (currentIndex !== -1) {
          this.cameraIndex = currentIndex
        }
      }
    },

    // Go to the next camera in the list, back to the first one after the last
    async switchCamera() {
      this.cameraIndex = (this.cameraIndex + 1) % this.cameras.length
      await this.restartCamera()
    },

    // Stop the camera and open it again (used after switching camera or rotating the phone)
    async restartCamera() {
      this.stopCamera()
      await this.startCamera()
      await this.publishCamera() // so the others see the new camera too
    },

    stopCamera() {
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop())
      }
    },

    // Only the host sees this button. Increasing shotNumber tells every device to start.
    async startShot() {
      await updateDoc(doc(db, 'rooms', this.code), {
        shotNumber: this.room.shotNumber + 1,
      })
    },

    startCountdown() {
      this.countdown = 3
      this.countdownTimer = setInterval(() => {
        this.countdown = this.countdown - 1
        if (this.countdown === 0) {
          clearInterval(this.countdownTimer)
          this.takePhoto()
        }
      }, 1000)
    },

    async takePhoto() {
      if (!this.stream) return // no camera, nothing to take

      // Show a quick white flash
      this.flash = true
      setTimeout(() => {
        this.flash = false
      }, 200)

      // Draw the current video frame onto a canvas, at most 640px wide to keep the file small
      const video = this.$refs.video
      const width = 640
      const height = Math.round((video.videoHeight / video.videoWidth) * width)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      // Flip horizontally so the photo matches the mirrored preview (like a selfie)
      if (this.mirrored) {
        ctx.translate(width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, width, height)

      // Turn the canvas into a JPEG image stored as text (a "data URL", about 50KB)
      const image = canvas.toDataURL('image/jpeg', 0.7)

      await addDoc(collection(db, 'rooms', this.code, 'photos'), {
        playerId: this.playerId,
        name: this.playerName,
        shotNumber: this.lastShotNumber,
        image: image,
        createdAt: Date.now(),
      })
    },

    async leaveRoom() {
      await deleteDoc(doc(db, 'rooms', this.code, 'members', this.playerId))
      this.$router.push('/')
    },
  },
}
</script>

<style scoped>
.camera-box {
  position: relative;
  background: #000;
  border-radius: 0.375rem;
}

/* A portrait phone camera is tall, so limit the height and show the whole picture */
video {
  display: block;
  max-height: 70vh;
  object-fit: contain;
}

.room-code {
  letter-spacing: 0.1em;
}

/* Mirror the preview so it feels like looking into a mirror */
video.mirrored {
  transform: scaleX(-1);
}

.remote-video {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  overflow: hidden;
}

.switch-camera-btn {
  position: absolute;
  top: 10px;
  right: 10px;
}

/* position: fixed + inset: 0 covers the whole screen, z-index puts it above everything else */
.countdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40vmin; /* 40% of the shorter side of the screen */
  font-weight: bold;
  color: white;
  text-shadow: 0 0 30px rgba(0, 0, 0, 0.7);
  pointer-events: none; /* clicks go through to the page underneath */
}

.flash-overlay {
  position: fixed;
  inset: 0;
  z-index: 2001;
  background: white;
}
</style>
