<script setup>
import { ref } from 'vue'
import { CATEGORIES, MAX_CATEGORIES, updateDetails } from '../studio.js'

// Rename a template or sticker and pick its categories (used in My Studio).
// Emits 'saved' with the new { name, categories }, or 'cancel'.

const props = defineProps({
  item: { type: Object, required: true },
})
const emit = defineEmits(['saved', 'cancel'])

const name = ref(props.item.name)
const categories = ref((props.item.categories || []).slice())
const saving = ref(false)
const errorMessage = ref('')

function toggleCategory(id) {
  if (categories.value.includes(id)) {
    categories.value = categories.value.filter((other) => other !== id)
  } else if (categories.value.length < MAX_CATEGORIES) {
    categories.value = categories.value.concat(id)
  }
}

async function save() {
  const newName = name.value.trim()
  if (newName.length < 1 || newName.length > 40) {
    errorMessage.value = 'The name must be 1 to 40 characters.'
    return
  }
  if (categories.value.length < 1) {
    errorMessage.value = 'Pick at least 1 category.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    await updateDetails(props.item, { name: newName, categories: categories.value })
    emit('saved', { name: newName, categories: categories.value })
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not save. Please try again.'
  }
  saving.value = false
}
</script>

<template>
  <form class="mt-2" @submit.prevent="save">
    <label class="form-label small mb-1" :for="'name-' + item.id">Name</label>
    <input :id="'name-' + item.id" v-model="name" type="text" maxlength="40" class="form-control form-control-sm mb-2" />

    <p class="small mb-1">Categories (up to {{ MAX_CATEGORIES }})</p>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <button
        v-for="c in CATEGORIES"
        :key="c.id"
        type="button"
        class="btn btn-sm rounded-pill py-0"
        :class="categories.includes(c.id) ? 'btn-primary' : 'btn-outline-secondary'"
        :disabled="!categories.includes(c.id) && categories.length >= MAX_CATEGORIES"
        :aria-pressed="categories.includes(c.id)"
        @click="toggleCategory(c.id)"
      >
        {{ c.label }}
      </button>
    </div>

    <p v-if="errorMessage" class="small text-danger mb-2">{{ errorMessage }}</p>
    <div class="d-flex gap-2">
      <button type="submit" class="btn btn-sm btn-primary" :disabled="saving">Save</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
