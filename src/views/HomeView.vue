<template>
  <div class="row justify-content-center">
    <div class="col-12 col-md-8 col-lg-6">
      <h1 class="h3 text-center mb-4">Take a photostrip together, from anywhere</h1>

      <div class="card mb-3">
        <div class="card-body">
          <label for="nameInput" class="form-label">Your name</label>
          <input id="nameInput" v-model="name" type="text" class="form-control" placeholder="e.g. Gabriel" maxlength="20" />
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <h2 class="h5">Start a new room</h2>
          <p class="text-muted small">You will be the host and get a 4-digit code to share.</p>
          <button class="btn btn-primary w-100" :disabled="loading" @click="createRoom">Create room</button>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <h2 class="h5">Join a friend's room</h2>
          <input v-model="joinCode" type="text" inputmode="numeric" class="form-control mb-2" placeholder="4-digit code" maxlength="4" />
          <button class="btn btn-outline-primary w-100" :disabled="loading" @click="joinRoom">Join room</button>
        </div>
      </div>

      <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
    </div>
  </div>
</template>

<script>
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { getPlayerId, getPlayerName, savePlayerName } from '../player.js'

export default {
  data() {
    return {
      name: getPlayerName(),
      // If the user scanned the QR code, the link is /?code=1234, so we pre-fill the code
      joinCode: this.$route.query.code || '',
      errorMessage: '',
      loading: false,
    }
  },

  methods: {
    // Returns true if a name was typed, otherwise shows an error
    checkName() {
      if (this.name.trim() === '') {
        this.errorMessage = 'Please enter your name first.'
        return false
      }
      savePlayerName(this.name.trim())
      return true
    },

    async createRoom() {
      this.errorMessage = ''
      if (!this.checkName()) return
      this.loading = true

      try {
        // Keep picking a random 4-digit code until we find one that is not already used
        let code = ''
        let roomSnap = null
        do {
          code = String(Math.floor(1000 + Math.random() * 9000)) // 1000 to 9999
          roomSnap = await getDoc(doc(db, 'rooms', code))
        } while (roomSnap.exists())

        // Create the room document. The room code is used as the document id.
        await setDoc(doc(db, 'rooms', code), {
          hostId: getPlayerId(),
          hostName: this.name.trim(),
          shotNumber: 0, // goes up by 1 every time the host starts a countdown
          createdAt: Date.now(),
        })

        this.$router.push('/room/' + code)
      } catch (error) {
        console.error(error)
        this.errorMessage = 'Could not create room. Check your internet connection.'
      }
      this.loading = false
    },

    async joinRoom() {
      this.errorMessage = ''
      if (!this.checkName()) return

      const code = this.joinCode.trim()
      if (code.length !== 4) {
        this.errorMessage = 'Room codes are 4 digits.'
        return
      }

      this.loading = true
      try {
        const roomSnap = await getDoc(doc(db, 'rooms', code))
        if (roomSnap.exists()) {
          this.$router.push('/room/' + code)
        } else {
          this.errorMessage = 'Room ' + code + ' does not exist.'
        }
      } catch (error) {
        console.error(error)
        this.errorMessage = 'Could not join room. Check your internet connection.'
      }
      this.loading = false
    },
  },
}
</script>
