<script setup>
// ref: a value Vue watches. computed: a value worked out from other values (kept up to date by itself).
// watch: run code when a value changes. onMounted / onBeforeUnmount: run code when the player appears / disappears.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
// getClipUrl(clip) gives a local "blob:" address of the clip's video (downloaded once, then remembered)
import { getClipUrl } from '../clips.js'

// Plays the edited video: the clips of the timeline one after another, each from its start to its end.
// Usage: <ClipSequencePlayer :entries="entries" />   entries = [ { clip, start, end } ] (see resolveTimeline in clips.js)
// Stops by itself when the timeline changes.
// bare: only the picture, no buttons. It fills the box it is in, and shows the first frame until it plays.
// autoplay: starts by itself. loop: repeats forever. A strip slot uses all three (see PhotoStrip.vue).
// Without autoplay, the parent starts and stops it with play() and stop(), e.g. a tile with a play button
// (see EditedVideoThumb.vue). It tells the parent when it starts or stops with the "playing" event.

// What the parent gives us: the clips to play, and whether to use "bare" mode
const props = defineProps({
  entries: { type: Array, default: () => [] },
  bare: { type: Boolean, default: false },
  autoplay: { type: Boolean, default: false },
  loop: { type: Boolean, default: false },
})

const emit = defineEmits(['playing'])

const video = ref(null)     // the <video> element (filled in by ref="video" in the template)
const playing = ref(false)  // true while the sequence is playing
const index = ref(0)        // which clip is playing now (0 is the first)
const loading = ref(false)  // true while the next clip is being loaded
const error = ref('')       // a message to show if something went wrong

// These are plain variables, not refs: the page never needs to redraw when they change
let runNumber = 0 // goes up every time playing starts or stops, so an older run knows to quit
let frameRequest = 0 // the id of the "check every frame" timer, so it can be cancelled

// Jump the video to a time (in seconds) and wait until it has got there.
// Some browsers never say "I'm done jumping", so give up waiting after a second.
function seekTo(time) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000) // the give-up timer
    video.value.onseeked = () => { // the browser says it has jumped
      clearTimeout(timer)
      resolve()
    }
    video.value.currentTime = time // this is what makes it jump
  })
}

// Show clip number i, ready to play from its start time. Gives back false if playing was stopped meanwhile.
// "run" is the runNumber when this started: if runNumber has changed since, someone pressed Stop.
async function loadEntry(i, run) {
  const entry = props.entries[i]
  const url = await getClipUrl(entry.clip) // download the clip (instant if it was downloaded before)
  if (run !== runNumber) return false // stopped while downloading

  const el = video.value
  if (el.src !== url) { // only load the file if this <video> is not already showing it
    el.src = url
    // Wait until the first frame is ready. If the file is broken, the Promise fails.
    await new Promise((resolve, reject) => {
      el.onloadeddata = resolve
      el.onerror = () => reject(new Error('Could not load a clip'))
    })
  }
  // A video from MediaRecorder does not know its own length until it is played to the end.
  // Jumping far past the end makes the browser work it out, so jumping to the start time works.
  if (!Number.isFinite(el.duration)) {
    await seekTo(1e6)
  }
  await seekTo(entry.start) // jump to where this clip's trim starts
  return run === runNumber
}

// Play all the clips, one after another
async function play() {
  if (props.entries.length === 0) return // nothing to play
  const run = ++runNumber // a new run: any older run will notice the number changed and quit
  error.value = ''
  playing.value = true

  try {
    do { // "do ... while" runs once, and runs again if the condition at the bottom is true (for looping)
      for (let i = 0; i < props.entries.length; i++) { // clip 1, then clip 2, ...
        index.value = i
        loading.value = true
        const ok = await loadEntry(i, run) // get this clip ready at its start time
        loading.value = false
        if (!ok) return // stopped while loading

        const entry = props.entries[i]
        await video.value.play() // start playing
        // Wait until this clip reaches its end time (or the file ends), checking every frame
        await new Promise((resolve) => {
          function check() {
            // Done if: stopped, or the video passed the trim's end (0.03 s early so we don't overshoot), or the file ended
            if (run !== runNumber || video.value.currentTime >= entry.end - 0.03 || video.value.ended) {
              resolve() // move on to the next clip
            } else {
              frameRequest = requestAnimationFrame(check) // not yet: check again on the next screen frame
            }
          }
          check()
        })
        if (run !== runNumber) return // stopped
        video.value.pause() // this clip is finished
      }
    } while (props.loop && run === runNumber) // a looping player starts again from the first clip
  } catch (err) {
    console.error(err)
    error.value = 'Could not play the video.'
  }
  if (run === runNumber) stop() // reached the end normally: reset the buttons and the first clip
}

// Show the first frame of the first clip (a bare player that is not playing does not stay black)
async function showFirstFrame() {
  if (props.entries.length === 0 || !video.value) return
  try {
    await loadEntry(0, runNumber)
  } catch (err) {
    console.error(err)
  }
}

// Stop playing and reset
function stop() {
  runNumber++ // makes any running play() quit at its next check
  cancelAnimationFrame(frameRequest)
  playing.value = false
  loading.value = false
  index.value = 0
  if (video.value) video.value.pause()
  if (props.bare && !props.autoplay) showFirstFrame() // back to the first frame
}

// Only restart when the timeline really changed (the room document changes all the time, e.g. when
// someone moves a sticker, and the video should not jump back to the start every time)
// timelineKey is a short text describing the timeline, e.g. '[["a1",0,3],["b2",0.5,2]]'. It only changes
// when a clip is added, removed, reordered or trimmed.
const timelineKey = computed(() => JSON.stringify(props.entries.map((e) => [e.clip.id, e.start, e.end])))
watch(timelineKey, () => {
  stop()
  if (props.autoplay) play() // an autoplay player starts again by itself
})
// An autoplay player (in a strip slot) starts as soon as it appears. A bare one without autoplay shows its first frame.
onMounted(() => {
  if (props.autoplay) {
    play()
  } else if (props.bare) {
    showFirstFrame()
  }
})
// Tell the parent when playing starts and stops
watch(playing, (isPlaying) => emit('playing', isPlaying))
// Let the parent start and stop it (through ref="...")
defineExpose({ play, stop })
// Stop everything when the player is removed from the page
onBeforeUnmount(() => {
  runNumber++ // any running play() quits
  cancelAnimationFrame(frameRequest)
  if (video.value) video.value.pause()
})
</script>

<template>
  <!-- bare mode: just the video, filling its box. Flipped (mirrored) if the clip being played came from a selfie camera. -->
  <video v-if="bare" ref="video" class="bare" muted playsinline :class="{ mirrored: entries[index] && entries[index].clip.mirrored }"></video>
  <!-- normal mode: a screen with buttons under it -->
  <div v-else>
    <div class="screen">
      <video ref="video" muted playsinline :class="{ mirrored: playing && entries[index] && entries[index].clip.mirrored }"></video>
      <!-- Text on top of the screen: a hint when stopped, "Loading..." while the next clip loads -->
      <div v-if="!playing" class="screen-text">{{ entries.length === 0 ? 'Add clips to the timeline' : '▶ Press Play' }}</div>
      <div v-else-if="loading" class="screen-text">Loading...</div>
    </div>
    <div class="d-flex align-items-center gap-2 mt-2">
      <!-- One button: Play all when stopped, Stop while playing. Disabled when the timeline is empty. -->
      <button class="btn btn-dark btn-sm" :disabled="entries.length === 0" @click="playing ? stop() : play()">
        {{ playing ? 'Stop' : '▶ Play all' }}
      </button>
      <span v-if="playing" class="small text-muted">Clip {{ index + 1 }} of {{ entries.length }}</span>
      <span v-if="error" class="small text-danger">{{ error }}</span>
    </div>
  </div>
</template>

<style scoped>
/* The black 4:3 screen the video is shown in. position: relative so the text can sit on top of it. */
.screen {
  position: relative;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
}

/* The whole picture is shown (black bars if the shape is different) */
video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Mirror the picture like the photos are (the selfie camera is a mirror) */
video.mirrored {
  transform: scaleX(-1);
}

/* bare: fill the slot it is in, cropped like a photo (object-fit: cover) */
video.bare {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* The hint text: covers the screen with a dark layer, text in the middle, and lets taps through */
.screen-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  font-size: 0.9rem;
  pointer-events: none;
}
</style>
