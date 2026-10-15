<script setup>
import { ref, watch, onMounted } from 'vue'

// A <video> that shows a camera stream (MediaStream), e.g. my own camera.
// Usage: <StreamVideo :stream="localStream" :mirrored="mirrored" />

const props = defineProps({
  stream: { default: null }, // a MediaStream, or null for no video
  mirrored: { type: Boolean, default: false },
})

const videoElem = ref(null)

// Put the stream into the <video>. Some phones (especially iPhones) do not start
// playing a new stream by themselves, which leaves it black, so we also call play().
async function showStream() {
  if (!videoElem.value) return
  videoElem.value.srcObject = props.stream
  if (props.stream) {
    try {
      await videoElem.value.play()
    } catch (error) {
      console.error(error)
    }
  }
}

onMounted(showStream)
watch(() => props.stream, showStream) // e.g. after switching camera

// Let the parent page use the <video> element (the camera page draws it onto a canvas to take a photo)
defineExpose({ videoElem })
</script>

<template>
  <video ref="videoElem" autoplay playsinline muted :class="{ mirrored: mirrored }"></video>
</template>

<style scoped>
/* Fill the box and show the whole picture (black bars if the shape is different) */
video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

/* Mirror the picture so it feels like looking into a mirror */
video.mirrored {
  transform: scaleX(-1);
}
</style>
