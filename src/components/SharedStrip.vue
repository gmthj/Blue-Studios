<script setup>
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { shareLink } from '../shares.js'

// A finished strip and how to pass it on: the picture or video, a QR code of its link, the link, and Download.
// Used by the Share page in a room (ShareView.vue) and by the page the link opens (PublicShareView.vue).
// Usage: <SharedStrip :share="share" />   share = a document from shares.js (getShare / createShare)
// Anything put inside the tag (e.g. "Save to My Studio") shows under the buttons.

const props = defineProps({
  share: { type: Object, required: true },
})

const link = ref('')
const qr = ref('') // the QR code as a picture (a data: address)
const copied = ref(false)

watch(
  () => props.share.id,
  async (id) => {
    link.value = shareLink(id)
    qr.value = await QRCode.toDataURL(link.value, { width: 360, margin: 1, color: { dark: '#1a1a2e', light: '#ffffff' } })
  },
  { immediate: true }
)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <div class="row g-3 align-items-start">
    <!-- The strip itself: a picture (PNG, GIF) or a video (MP4) -->
    <div class="col-12 col-md-6">
      <div class="panel text-center">
        <video v-if="share.format === 'mp4'" :src="share.fileUrl" class="result" controls loop playsinline autoplay muted></video>
        <img v-else :src="share.fileUrl" :alt="share.title" class="result" />
        <p class="small text-muted mt-2 mb-0">{{ share.format.toUpperCase() }} · {{ (share.size / 1024 / 1024).toFixed(1) }} MB</p>
      </div>
    </div>

    <!-- The QR code, the link and the buttons -->
    <div class="col-12 col-md-6">
      <div class="panel text-center">
        <p class="small text-muted mb-2">Scan to open on your phone</p>
        <img v-if="qr" :src="qr" alt="QR code of the link to this strip" class="qr" />
        <p class="small text-break mt-2 mb-3"><a :href="link">{{ link }}</a></p>

        <a :href="share.fileUrl" download class="btn btn-primary w-100 mb-2">Download {{ share.format.toUpperCase() }}</a>
        <button class="btn btn-outline-secondary w-100" @click="copyLink">{{ copied ? 'Link copied!' : 'Copy link' }}</button>

        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* The strip: not taller than the screen */
.result {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 8px;
  background: #f3f4f8;
}

.qr {
  width: 100%;
  max-width: 220px;
}
</style>
