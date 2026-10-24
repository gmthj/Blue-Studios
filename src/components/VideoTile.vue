<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useVideoCall } from '../composables/useVideoCall.js'
import StreamVideo from './StreamVideo.vue'

// One person in the video call: their live video (or their initial on a colour), name, host badge and mute icon.

const props = defineProps({
  member: { type: Object, required: true }, // { id, name, deviceType } from the members list
  isSelf: { type: Boolean, default: false },
  isHost: { type: Boolean, default: false },
})

const { localStream, mirrored, micOn, getRemoteUser, attachRemoteVideo } = useVideoCall()

const remoteEl = ref(null) // Agora puts the other person's video inside this <div>

// This person's call info: { uid, hasVideo, hasAudio }, or undefined if they have not connected yet
const remote = computed(() => {
  return getRemoteUser(props.member.id)
})

const hasVideo = computed(() => {
  if (props.isSelf) {
    return localStream.value !== null
  }
  return remote.value !== undefined && remote.value.hasVideo
})

const hasAudio = computed(() => {
  if (props.isSelf) {
    return micOn.value
  }
  return remote.value !== undefined && remote.value.hasAudio
})

// For other people: when their video becomes available, ask Agora to play it in our <div>
async function showRemoteVideo() {
  if (props.isSelf || !hasVideo.value) return
  await nextTick() // wait until the <div> is on the page
  attachRemoteVideo(props.member.id, remoteEl.value)
}

onMounted(showRemoteVideo)
watch(hasVideo, showRemoteVideo)

// No video yet: show the first letter of their name on a colour, like the tiles in the Figma designs.
// The colour comes from their id, so each person keeps the same colour on every device.
const AVATAR_COLOURS = ['#4A6CF0', '#2FB38A', '#E8A928', '#8B5CF6', '#F2711C', '#20B2AA']

const initial = computed(() => {
  return (props.member.name || '?').trim().charAt(0).toUpperCase()
})

const avatarColour = computed(() => {
  let total = 0
  for (const char of props.member.id) {
    total += char.charCodeAt(0)
  }
  return AVATAR_COLOURS[total % AVATAR_COLOURS.length]
})
</script>

<template>
  <!--
    Every tile is the same size: the video box has a fixed shape (4:3) and everything else sits ON the video
    (Bootstrap position-absolute), so the tile takes no extra space below the video.
  -->
  <div class="tile">
    <!-- Me: my own camera stream. Others: Agora fills remoteEl with their video. -->
    <StreamVideo v-if="isSelf" :stream="localStream" :mirrored="mirrored" />
    <div v-else v-show="hasVideo" ref="remoteEl" class="remote-el"></div>

    <div v-if="!hasVideo" class="no-video" :style="{ '--avatar': avatarColour }">
      <span class="avatar" :title="member.name + ': no video'">{{ initial }}</span>
    </div>

    <!-- Top left: host badge. Top right: a red mic icon, only while they are muted (like Zoom / Meet). -->
    <span v-if="isHost" class="host-badge position-absolute top-0 start-0">Host</span>
    <!-- <span class="badge text-bg-light tile-badge position-absolute top-0 end-0 m-1">{{ member.deviceType || 'Unknown' }}</span> -->
    <span v-if="!hasAudio" class="muted-icon position-absolute top-0 end-0" title="Muted">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 2l20 20" />
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
        <path d="M5 10v2a7 7 0 0 0 12 5" />
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
        <path d="M12 19v3" />
      </svg>
    </span>

    <!-- Bottom left: the name on a dark pill, so it can be read on any video.
         text-truncate: one line only, long names end with "..." (hover to see the full name) -->
    <div class="name-pill position-absolute bottom-0 start-0 text-truncate" :title="member.name">
      {{ member.name }}<span v-if="isSelf" class="you"> (you)</span>
    </div>
  </div>
</template>

<style scoped>
/* min-width: 0 stops a long name from stretching the tile wider than its column */
.tile {
  min-width: 0;
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  container-type: inline-size; /* lets the badges below change size with the tile (@container) */
  /* Fades in when someone joins */
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1), transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

@starting-style {
  .tile {
    opacity: 0;
    transform: scale(0.96);
  }
}

.remote-el {
  width: 100%;
  height: 100%;
}

/* A soft gradient of their colour, darker at the bottom so the name pill stays readable */
.no-video {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, color-mix(in srgb, var(--avatar) 85%, #ffffff), var(--avatar));
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36%;
  aspect-ratio: 1;
  border-radius: 50%;
  color: #ffffff;
  font-size: clamp(0.8rem, 13cqi, 2.5rem); /* cqi = 1% of the tile's width, so the letter grows with the tile */
  font-weight: 700;
  background: rgba(255, 255, 255, 0.25);
}

.host-badge {
  margin: 5px;
  padding: 1px 7px;
  border-radius: 999px;
  color: #ffffff;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: #2F5BEA;
}

.muted-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: 5px;
  border-radius: 50%;
  color: #ffffff;
  background: #EF4444;
}

.muted-icon svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* max-width: never wider than the tile (minus the margins), so long names are cut off with "..." */
.name-pill {
  max-width: calc(100% - 10px);
  margin: 5px;
  padding: 1px 8px;
  border-radius: 999px;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 500;
  background: rgba(15, 18, 35, 0.7);
  backdrop-filter: blur(6px);
}

.you {
  color: rgba(255, 255, 255, 0.6);
}

/* Small tiles (lots of people, or a narrow window): smaller badges, so they do not cover the whole tile */
@container (max-width: 120px) {
  .host-badge {
    margin: 4px;
    padding: 0 5px;
    font-size: 0.55rem;
  }

  .muted-icon {
    width: 16px;
    height: 16px;
    margin: 4px;
  }

  .muted-icon svg {
    width: 9px;
    height: 9px;
  }

  .name-pill {
    max-width: calc(100% - 8px);
    margin: 4px;
    padding: 0 6px;
    font-size: 0.6rem;
  }

  .you {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tile {
    transition-property: opacity;
  }
}
</style>
