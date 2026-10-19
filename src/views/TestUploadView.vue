<script setup>
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { saveTemplate, saveSticker, setVisibility, CATEGORIES, MAX_CATEGORIES } from '../studio.js'

// TEMPORARY test page (/test-upload): makes templates and stickers so the marketplace and
// My Studio can be tested before the template editor and sticker maker are merged.
// It uses the same saveTemplate / saveSticker as the real editors, so the security rules
// check everything exactly as they will later. Remove this page (and its route) before submission.

const { user } = useAuth()

const type = ref('templates')
const name = ref('')
const categories = ref(['cute'])
const slotCount = ref(4)
const kind = ref('static')
const makePublic = ref(true)
const file = ref(null)

const busy = ref(false)
const log = ref([]) // what has been made, newest first

const COLOURS = ['#f8b4c4', '#a5d8ff', '#b2f2bb', '#ffd8a8', '#d0bfff', '#ffec99']

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function canvasToPng(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// A sample photostrip frame: coloured background, empty photo slots, the name at the bottom
function drawTemplate(title, slots) {
  const canvas = document.createElement('canvas')
  canvas.width = 300
  canvas.height = 60 + slots * 170 + 60
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = randomItem(COLOURS)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < slots; i++) {
    ctx.fillRect(30, 40 + i * 170, 240, 150)
  }
  ctx.fillStyle = '#333333'
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title, canvas.width / 2, canvas.height - 30)
  return canvasToPng(canvas)
}

// A sample sticker: a coloured circle with the name on it, transparent around it
function drawSticker(title) {
  const canvas = document.createElement('canvas')
  canvas.width = 300
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = randomItem(COLOURS)
  ctx.beginPath()
  ctx.arc(150, 150, 140, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#333333'
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title.slice(0, 14), 150, 150)
  return canvasToPng(canvas)
}

// A picked image file, made smaller and turned into a PNG (the rules allow up to 2 MB)
function fileToPng(picked, maxSize) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(image.src)
      canvasToPng(canvas).then(resolve)
    }
    image.onerror = () => reject(new Error('That file is not an image'))
    image.src = URL.createObjectURL(picked)
  })
}

// Make one item and (if asked, and the email is confirmed) make it public
async function makeItem({ itemType, title, itemCategories, slots, stickerKind, publish, picked }) {
  let id
  if (itemType === 'templates') {
    const thumbnail = picked ? await fileToPng(picked, 1200) : await drawTemplate(title, slots)
    id = await saveTemplate({
      name: title,
      slotCount: slots,
      categories: itemCategories,
      thumbnail: thumbnail,
      projectData: { testItem: true, slotCount: slots, elements: [] },
    })
  } else {
    const image = picked ? await fileToPng(picked, 600) : await drawSticker(title)
    id = await saveSticker({ name: title, kind: stickerKind, categories: itemCategories, image: image })
  }

  let visibility = 'private'
  if (publish && user.value.emailVerified) {
    await setVisibility({ id: id, type: itemType, name: title }, 'public')
    visibility = 'public'
  }
  log.value.unshift({ id: id, type: itemType, name: title, visibility: visibility })
}

function toggleCategory(id) {
  if (categories.value.includes(id)) {
    categories.value = categories.value.filter((other) => other !== id)
  } else if (categories.value.length < MAX_CATEGORIES) {
    categories.value = categories.value.concat(id)
  }
}

function pickFile(event) {
  file.value = event.target.files[0] || null
}

async function run(job) {
  busy.value = true
  try {
    await job()
  } catch (error) {
    console.error(error)
    log.value.unshift({ error: error.message })
  }
  busy.value = false
}

function makeOne() {
  run(() => makeItem({
    itemType: type.value,
    title: name.value.trim() || (type.value === 'templates' ? 'Test frame' : 'Test sticker'),
    itemCategories: categories.value,
    slots: Number(slotCount.value),
    stickerKind: kind.value,
    publish: makePublic.value,
    picked: file.value,
  }))
}

// 4 templates + 4 stickers with random names, categories and sizes
function makeSamples() {
  const words = ['Retro', 'Pastel', 'Sunny', 'Midnight', 'Bubble', 'Neon', 'Cosy', 'Party']
  run(async () => {
    for (let i = 0; i < 8; i++) {
      const itemType = i < 4 ? 'templates' : 'stickers'
      const first = randomItem(CATEGORIES).id
      const second = randomItem(CATEGORIES).id
      await makeItem({
        itemType: itemType,
        title: randomItem(words) + (itemType === 'templates' ? ' frame ' : ' sticker ') + (i + 1),
        itemCategories: first === second ? [first] : [first, second],
        slots: randomItem([2, 3, 4]),
        stickerKind: 'static',
        publish: true,
        picked: null,
      })
    }
  })
}
</script>

<template>
  <div class="alert alert-warning small">
    <strong>Temporary test page.</strong> Makes templates and stickers for testing the marketplace until the template editor and
    sticker maker are merged. Everything made here is a normal item: manage or delete it in
    <router-link to="/studio">My Studio</router-link>.
  </div>

  <div v-if="!user.emailVerified" class="alert alert-info small">
    Your email is not confirmed, so items stay private (only confirmed accounts can publish to the marketplace).
  </div>

  <div class="row g-4">
    <div class="col-12 col-lg-6">
      <div class="card">
        <div class="card-body">
          <h1 class="h5 mb-3">Quick fill</h1>
          <p class="small text-muted">Makes 4 templates and 4 stickers with sample pictures, random names and categories, all public.</p>
          <button class="btn btn-primary" :disabled="busy" @click="makeSamples">Make 8 samples</button>
        </div>
      </div>

      <form class="card mt-4" @submit.prevent="makeOne">
        <div class="card-body">
          <h2 class="h5 mb-3">Make one</h2>

          <div class="btn-group mb-3" role="group" aria-label="Type">
            <button type="button" class="btn btn-sm" :class="type === 'templates' ? 'btn-primary' : 'btn-outline-primary'" @click="type = 'templates'">Template</button>
            <button type="button" class="btn btn-sm" :class="type === 'stickers' ? 'btn-primary' : 'btn-outline-primary'" @click="type = 'stickers'">Sticker</button>
          </div>

          <label class="form-label small" for="test-name">Name</label>
          <input id="test-name" v-model="name" type="text" maxlength="40" class="form-control mb-3" :placeholder="type === 'templates' ? 'Test frame' : 'Test sticker'" />

          <div v-if="type === 'templates'" class="mb-3">
            <label class="form-label small" for="test-slots">Photo slots</label>
            <input id="test-slots" v-model="slotCount" type="number" min="1" max="12" class="form-control" />
          </div>
          <div v-else class="mb-3">
            <label class="form-label small" for="test-kind">Kind</label>
            <select id="test-kind" v-model="kind" class="form-select">
              <option value="static">static</option>
              <option value="animated">animated</option>
              <option value="dynamic">dynamic</option>
            </select>
          </div>

          <p class="small mb-1">Categories (up to {{ MAX_CATEGORIES }})</p>
          <div class="d-flex flex-wrap gap-1 mb-3">
            <button
              v-for="c in CATEGORIES"
              :key="c.id"
              type="button"
              class="btn btn-sm rounded-pill py-0"
              :class="categories.includes(c.id) ? 'btn-primary' : 'btn-outline-secondary'"
              :disabled="!categories.includes(c.id) && categories.length >= MAX_CATEGORIES"
              @click="toggleCategory(c.id)"
            >
              {{ c.label }}
            </button>
          </div>

          <label class="form-label small" for="test-file">Picture (optional: leave empty for a sample picture)</label>
          <input id="test-file" type="file" accept="image/*" class="form-control mb-3" @change="pickFile" />

          <div class="form-check mb-3">
            <input id="test-public" v-model="makePublic" class="form-check-input" type="checkbox" />
            <label class="form-check-label small" for="test-public">Make it public (show in the marketplace)</label>
          </div>

          <button type="submit" class="btn btn-primary" :disabled="busy || categories.length === 0">Make it</button>
        </div>
      </form>
    </div>

    <div class="col-12 col-lg-6">
      <h2 class="h5">Made</h2>
      <p v-if="busy" class="small text-muted">Working...</p>
      <p v-if="log.length === 0 && !busy" class="small text-muted">Nothing yet.</p>
      <ul class="list-group">
        <li v-for="(entry, index) in log" :key="index" class="list-group-item small">
          <span v-if="entry.error" class="text-danger">Failed: {{ entry.error }}</span>
          <template v-else>
            {{ entry.type === 'templates' ? 'Template' : 'Sticker' }} "{{ entry.name }}" ({{ entry.visibility }})
            <router-link v-if="entry.visibility === 'public'" :to="'/marketplace/' + entry.type + '/' + entry.id" class="ms-1">view</router-link>
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>
