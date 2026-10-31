<script setup>
import { ref, watch } from 'vue'
import { getFileUrl } from '../studio.js'

// Shows an image saved in Firebase Storage, e.g. <StorageImage :path="template.thumbnailPath" alt="..." />
// Firebase only gives us a link to the file if the storage rules allow it,
// so a private file of someone else just shows the grey box.
// Already have the link (an item's cardUrl, see "Card pictures" in studio.js)? Pass it as src, and it is
// shown straight away without asking Storage: <StorageImage :src="item.cardUrl" :path="item.thumbnailPath" />
// (path is then only used if there is no src, e.g. items saved before cards existed).
//
// Images load lazily: the browser only downloads them when they are about to scroll into view.
// Add priority for images that are on screen straight away (the first cards, the item page picture),
// so they download first: <StorageImage :path="..." priority />

const props = defineProps({
  path: { type: String, required: true },
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  priority: { type: Boolean, default: false },
  video: { type: Boolean, default: false }, // the file is an MP4 (a saved strip with video): shown playing, without sound
})

const url = ref('')
const failed = ref(false)

async function load() {
  url.value = props.src
  failed.value = false
  if (props.src) return
  try {
    url.value = await getFileUrl(props.path)
  } catch (error) {
    console.error(error)
    failed.value = true
  }
}

// Load now, and again if the path or link changes
watch(() => [props.path, props.src], load, { immediate: true })
</script>

<template>
  <video v-if="url && video" :src="url" class="storage-image" autoplay loop muted playsinline></video>
  <img
    v-else-if="url"
    :src="url"
    :alt="alt"
    class="storage-image"
    :loading="priority ? 'eager' : 'lazy'"
    :fetchpriority="priority ? 'high' : 'auto'"
    decoding="async"
  />
  <div v-else class="storage-image placeholder-box">
    <span class="small text-muted">{{ failed ? 'No preview' : '' }}</span>
  </div>
</template>

<style scoped>
.storage-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder-box {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f3f5;
}
</style>
