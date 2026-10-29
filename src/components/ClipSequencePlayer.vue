<script setup>
// ref: a value Vue watches. computed: a value worked out from other values (kept up to date by itself).
// watch: run code when a value changes. nextTick: wait until Vue has updated the page.
// onMounted / onBeforeUnmount: run code when the player appears / disappears.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
// getClipUrl(clip) gives a local "blob:" address of the clip's video (downloaded once, then remembered)
import { getClipUrl } from '../clips.js'

// Plays the edited video: the clips of the timeline one after another, each from its start to its end.
// Usage: <ClipSequencePlayer :entries="entries" />   entries = [ { clip, start, end } ] (see resolveTimeline in clips.js)
// Stops by itself when the timeline changes.
// bare: only the picture, no buttons. It fills the box it is in, and shows the first frame until it plays.
// autoplay: starts by itself. loop: repeats forever. A strip slot uses all three (see PhotoStrip.vue).
// Without autoplay, the parent starts and stops it with play() and stop(), e.g. a tile with a play button
// (see EditedVideoThumb.vue). It tells the parent when it starts or stops with the "playing" event.
//
// No flash between clips: every clip has its OWN <video>, stacked on top of each other. While one clip plays,
// the next one is already loaded and waiting at its start frame. At the cut, the next video is simply shown
// (the old way was one <video> that had to load the next file, which left it empty for a moment).

// What the parent gives us: the clips to play, and how to play them
const props = defineProps({
  entries: { type: Array, default: () => [] },
  bare: { type: Boolean, default: false },
  autoplay: { type: Boolean, default: false },
  loop: { type: Boolean, default: false },
})

const emit = defineEmits(['playing'])

const videos = []             // the <video> elements, one per clip (a plain list: the template fills it in, see setVideo)
const shownIndex = ref(0)     // which video is on show
const playing = ref(false)    // true while the sequence is playing
const index = ref(0)          // which clip is playing now (0 is the first)
const loading = ref(false)    // true while the first clip is being loaded
const error = ref('')         // a message to show if something went wrong

// Which video to show: normally shownIndex, but never one that does not exist (the timeline can get shorter)
const visibleIndex = computed(() => (shownIndex.value < props.entries.length ? shownIndex.value : 0))

// These are plain variables, not refs: the page never needs to redraw when they change
let runNumber = 0 // goes up every time playing starts or stops, so an older run knows to quit
let frameRequest = 0 // the id of the "check every frame" timer, so it can be cancelled

// The template calls this for every <video> to put it in the list (Vue calls it with null when one is removed)
function setVideo(el, i) {
  if (el) videos[i] = el
}

// Jump a video to a time (in seconds) and wait until it has got there.
// Some browsers never say "I'm done jumping", so give up waiting after a second.
function seekTo(el, time) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000) // the give-up timer
    el.onseeked = () => { // the browser says it has jumped
      clearTimeout(timer)
      resolve()
    }
    el.currentTime = time // this is what makes it jump
  })
}

// Get clip number i ready: load its file into its own <video> (if that has not been done), and jump to its start.
// Gives back false if playing was stopped meanwhile. "run" is the runNumber when this started: if runNumber has
// changed since, someone pressed Stop (or the timeline changed).
async function prepare(i, run) {
  const entry = props.entries[i]
  if (!entry) return false
  const url = await getClipUrl(entry.clip) // download the clip (instant if it was downloaded before)
  const el = videos[i]
  if (run !== runNumber || !el) return false

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
    await seekTo(el, 1e6)
  }
  await seekTo(el, entry.start) // jump to where this clip's trim starts
  return run === runNumber
}

// Show the first frame of the first clip (a player that is not playing does not stay black)
async function showFirstFrame() {
  if (props.entries.length === 0) return
  const run = runNumber
  try {
    if (await prepare(0, run)) shownIndex.value = 0 // switch to it only once it is ready
  } catch (err) {
    console.error(err)
  }
}

// Play all the clips, one after another
async function play() {
  const n = props.entries.length
  if (n === 0) return // nothing to play
  const run = ++runNumber // a new run: any older run will notice the number changed and quit
  error.value = ''
  playing.value = true

  try {
    // ready[i] is a Promise that is done when clip i is loaded and waiting at its start
    const ready = []
    loading.value = true
    ready[0] = prepare(0, run)
    if (!(await ready[0])) return // stopped while loading
    loading.value = false

    do { // "do ... while" runs once, and runs again if the condition at the bottom is true (for looping)
      for (let i = 0; i < n; i++) { // clip 1, then clip 2, ...
        if (!(await ready[i])) return // (already done, in nearly every case)
        index.value = i
        shownIndex.value = i // show this clip: it is waiting at its start, so there is no empty moment

        // Get the clip after this one ready NOW, while this one plays. After the last clip that is the first one
        // again, but only when looping. (With one clip, it is this same clip, and it is jumped back after it ends.)
        const next = (i + 1) % n
        if (n > 1 && (i < n - 1 || props.loop)) {
          ready[next] = prepare(next, run)
          ready[next].catch(() => {}) // (an error is reported when it is awaited, so it is not reported twice)
        }

        const entry = props.entries[i]
        const el = videos[i]
        await el.play() // start playing
        // Wait until this clip reaches its end time (or the file ends), checking every frame
        await new Promise((resolve) => {
          function check() {
            // Done if: stopped, or the video passed the trim's end (0.03 s early so we don't overshoot), or the file ended
            if (run !== runNumber || el.currentTime >= entry.end - 0.03 || el.ended) {
              resolve() // move on to the next clip
            } else {
              frameRequest = requestAnimationFrame(check) // not yet: check again on the next screen frame
            }
          }
          check()
        })
        if (run !== runNumber) return // stopped
        el.pause() // this clip is finished

        // A single clip that repeats has to jump back to its own start
        if (n === 1 && props.loop) {
          ready[0] = prepare(0, run)
          ready[0].catch(() => {})
        }
      }
    } while (props.loop && run === runNumber) // a looping player starts again from the first clip
  } catch (err) {
    console.error(err)
    error.value = 'Could not play the video.'
  }
  if (run === runNumber) stop() // reached the end normally: reset the buttons and the first clip
}

// Stop everything that is running, without showing the first frame again
function halt() {
  runNumber++ // makes any running play() or prepare() quit at its next check
  cancelAnimationFrame(frameRequest)
  playing.value = false
  loading.value = false
  index.value = 0
  for (const el of videos) {
    if (el) el.pause()
  }
}

// Stop playing and go back to the first frame
function stop() {
  halt()
  showFirstFrame()
}

// Only restart when the timeline really changed (the room document changes all the time, e.g. when
// someone moves a sticker, and the video should not jump back to the start every time)
// timelineKey is a short text describing the timeline, e.g. '[["a1",0,3],["b2",0.5,2]]'. It only changes
// when a clip is added, removed, reordered or trimmed.
const timelineKey = computed(() => JSON.stringify(props.entries.map((e) => [e.clip.id, e.start, e.end])))
watch(timelineKey, async () => {
  halt()
  shownIndex.value = 0
  await nextTick() // wait until Vue has made a <video> for every clip of the new timeline
  videos.length = props.entries.length
  if (props.autoplay) {
    play() // an autoplay player starts again by itself
  } else {
    showFirstFrame()
  }
})
// An autoplay player (in a strip slot) starts as soon as it appears. Another one shows its first frame.
onMounted(() => {
  if (props.autoplay) {
    play()
  } else {
    showFirstFrame()
  }
})
// Tell the parent when playing starts and stops
watch(playing, (isPlaying) => emit('playing', isPlaying))
// Let the parent start and stop it (through ref="...")
defineExpose({ play, stop })
// Stop everything when the player is removed from the page
onBeforeUnmount(halt)
</script>

<template>
  <!-- bare mode: just the videos, filling their box -->
  <div v-if="bare" class="bare-wrap">
    <!-- One <video> per clip, all in the same place. Only the one that is "shown" can be seen.
         Flipped (mirrored) if that clip came from a selfie camera. -->
    <video
      v-for="(entry, i) in entries"
      :key="entry.clip.id"
      :ref="(el) => setVideo(el, i)"
      class="layer"
      :class="{ shown: i === visibleIndex, mirrored: entry.clip.mirrored }"
      muted
      playsinline
      preload="auto"
    ></video>
  </div>

  <!-- normal mode: a screen with buttons under it -->
  <div v-else>
    <div class="screen">
      <video
        v-for="(entry, i) in entries"
        :key="entry.clip.id"
        :ref="(el) => setVideo(el, i)"
        class="layer"
        :class="{ shown: i === visibleIndex, mirrored: entry.clip.mirrored }"
        muted
        playsinline
        preload="auto"
      ></video>
      <!-- Text on top of the screen: a hint when stopped, "Loading..." while the first clip loads -->
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
/* The black 4:3 screen the videos are shown in. position: relative so the videos and the text can sit on top of it. */
.screen {
  position: relative;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
}

/* bare: the box fills whatever it is put in (a strip slot or a tile) */
.bare-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

/* Every clip's video is in the same place. They are all there all the time, but only the shown one has any opacity. */
.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
}

.layer.shown {
  opacity: 1;
}

/* The screen shows the whole picture (black bars if the shape is different) */
.screen .layer {
  object-fit: contain;
}

/* bare: fill the slot it is in, cropped like a photo (object-fit: cover) */
.bare-wrap .layer {
  object-fit: cover;
}

/* Mirror the picture like the photos are (the selfie camera is a mirror) */
.layer.mirrored {
  transform: scaleX(-1);
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
