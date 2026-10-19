<script setup>
import StorageImage from './StorageImage.vue'

// One template or sticker in a marketplace grid (also used for "Saved" in My Studio).
// Clicking it opens its page: /marketplace/templates/{id} or /marketplace/stickers/{id}

defineProps({
  item: { type: Object, required: true },
})
</script>

<template>
  <router-link :to="'/marketplace/' + item.type + '/' + item.id" class="card h-100 text-decoration-none text-body item-card">
    <div class="preview" :class="item.type === 'templates' ? 'template-preview' : 'sticker-preview'">
      <StorageImage :path="item.type === 'templates' ? item.thumbnailPath : item.imagePath" :alt="item.name" />
    </div>
    <div class="card-body p-2">
      <p class="small fw-semibold text-truncate mb-0">{{ item.name }}</p>
      <p class="small text-muted text-truncate mb-0">by {{ item.ownerName }}</p>
      <p class="small text-muted mb-0">
        <template v-if="item.type === 'templates'">{{ item.slotCount }} slots &middot; </template>
        {{ item.saveCount }} {{ item.saveCount === 1 ? 'save' : 'saves' }}
      </p>
    </div>
  </router-link>
</template>

<style scoped>
.item-card:hover {
  border-color: var(--bs-primary);
}

.preview {
  background: #f1f3f5;
  overflow: hidden;
}

.template-preview {
  height: 220px;
}

.sticker-preview {
  height: 140px;
  padding: 8px;
}
</style>
