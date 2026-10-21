<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useVideoCall } from '../composables/useVideoCall.js'
import StreamVideo from './StreamVideo.vue'

// One person in the video call: their live video, name, device type and mute icon.

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
</script>

<template>
  <!--
    Every tile is the same size: the video box has a fixed shape (4:3) and everything else sits ON the video
    (Bootstrap position-absolute), so the tile takes no extra space below the video.
  -->
  <div class="tile rounded">
    <!-- Me: my own camera stream. Others: Agora fills remoteEl with their video. -->
    <StreamVideo v-if="isSelf" :stream="localStream" :mirrored="mirrored" />
    <div v-else v-show="hasVideo" ref="remoteEl" class="remote-el"></div>

    <div v-if="!hasVideo" class="no-video">No video</div>

    <!-- Top left: host badge. Top right: mic icon. -->
    <span v-if="isHost" class="badge bg-primary tile-badge position-absolute top-0 start-0 m-1">Host</span>
    <!-- <span class="badge text-bg-light tile-badge position-absolute top-0 end-0 m-1">{{ member.deviceType || 'Unknown' }}</span> -->
    <span class="mic-icon position-absolute top-0 end-0 m-1" :title="hasAudio ? 'Microphone on' : 'Muted'">
      {{ hasAudio ? '🎤' : '🔇' }}
    </span>

    <!-- Bottom: the name on a dark strip, so it can be read on any video.
         text-truncate: one line only, long names end with "..." (hover to see the full name) -->
    <div class="name-bar position-absolute bottom-0 start-0 end-0 text-truncate" :title="member.name">
      {{ member.name }}{{ isSelf ? ' (you)' : '' }}
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
  overflow: hidden;
}

.remote-el {
  width: 100%;
  height: 100%;
}

.no-video {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaaaaa;
  font-size: 0.8rem;
}

.tile-badge {
  font-size: 0.6rem;
}

.mic-icon {
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 4px;
  padding: 0 4px;
}

.name-bar {
  font-size: 0.7rem;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 4px;
}
</style>
