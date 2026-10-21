<script setup>
import { ref, watch } from 'vue'
import { getFileUrl } from '../studio.js'

// Shows an image saved in Firebase Storage, e.g. <StorageImage :path="template.thumbnailPath" alt="..." />
// Firebase only gives us a link to the file if the storage rules allow it,
// so a private file of someone else just shows the grey box.

const props = defineProps({
  path: { type: String, required: true },
  alt: { type: String, default: '' },
})

const url = ref('')
const failed = ref(false)

async function load() {
  url.value = ''
  failed.value = false
  try {
    url.value = await getFileUrl(props.path)
  } catch (error) {
    console.error(error)
    failed.value = true
  }
}

// Load now, and again if the path changes
watch(() => props.path, load, { immediate: true })
</script>

<template>
  <img v-if="url" :src="url" :alt="alt" class="storage-image" />
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
