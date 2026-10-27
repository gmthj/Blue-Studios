<script setup>
import { computed } from 'vue'
import StorageImage from './StorageImage.vue'
import AppIcon from './AppIcon.vue'
import { profileOf } from '../profiles.js'

// One template or sticker in a marketplace grid (also used for "Saved" in My Studio).
// Clicking it opens its page: /marketplace/templates/{id} or /marketplace/stickers/{id}

const props = defineProps({
  item: { type: Object, required: true },
})

// The maker's name and picture now (so a new name or picture shows on their older items too)
const maker = computed(() => profileOf(props.item.ownerId))
</script>

<template>
  <router-link :to="'/marketplace/' + item.type + '/' + item.id" class="card h-100 text-decoration-none text-body item-card">
    <div class="preview" :class="item.type === 'templates' ? 'template-preview' : 'sticker-preview'">
      <StorageImage :path="item.type === 'templates' ? item.thumbnailPath : item.imagePath" :alt="item.name" />
    </div>
    <div class="card-body item-body">
      <p class="item-name text-truncate" :title="item.name">{{ item.name }}</p>
      <p class="item-meta maker">
        <img :src="maker.avatar" class="maker-avatar" alt="" width="18" height="18" loading="lazy" />
        <span class="text-truncate">{{ maker.name || item.ownerName }}</span>
      </p>
      <p class="item-meta d-flex align-items-center gap-1">
        <template v-if="item.type === 'templates'">{{ item.slotCount }} slots &middot;</template>
        <AppIcon name="bookmark" :size="12" />
        {{ item.saveCount }}
        <span class="visually-hidden">{{ item.saveCount === 1 ? 'save' : 'saves' }}</span>
      </p>
    </div>
  </router-link>
</template>

<style scoped>
.item-card {
  overflow: hidden;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 200ms ease, border-color 200ms ease;
}

/* Lifts a little under the mouse (only with a mouse: on phones a tap would leave it stuck) */
@media (hover: hover) and (pointer: fine) {
  .item-card:hover {
    border-color: #C9D4FA;
    box-shadow: 0 10px 24px rgba(20, 23, 43, 0.08);
    transform: translateY(-2px);
  }
}

.item-card:focus-visible {
  outline: 2px solid #2F5BEA;
  outline-offset: 2px;
}

.preview {
  overflow: hidden;
  background: #F4F6FA;
}

.template-preview {
  height: 220px;
}

.sticker-preview {
  height: 140px;
  padding: 10px;
}

.item-body {
  padding: 10px 12px 12px;
}

.item-name {
  margin: 0 0 2px;
  font-size: 0.9rem;
  font-weight: 700;
}

.maker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 2px !important;
}

.maker-avatar {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background: #E8EEFF;
}

.item-meta {
  margin: 0;
  color: #6B7080;
  font-size: 0.8rem;
}

@media (prefers-reduced-motion: reduce) {
  .item-card:hover {
    transform: none;
  }
}
</style>
