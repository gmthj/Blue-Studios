<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { profileOf, dicebearUrl } from '../profiles.js'
import AppIcon from './AppIcon.vue'

// The "Edit profile" popup, opened from the navbar: change my name and my picture.
//   <ProfileDialog v-model:open="profileOpen" />
// It is a <dialog> element: the browser dims the page behind it, keeps the keyboard inside it,
// and closes it with the Esc key.
//
// Pictures: upload my own photo, or remove it to go back to my DiceBear face.
// (Everyone's DiceBear face comes from their user id, so it cannot be picked.)

const open = defineModel('open', { type: Boolean, default: false })

const { user, updateMyProfile } = useAuth()

const dialogEl = ref(null)
const fileInput = ref(null)
const name = ref('')
const photoFile = ref(null) // a new picture picked from the device, not uploaded yet
const photoPreview = ref('') // a link to show that new picture before it is saved
const removePhoto = ref(false) // pressed "Remove photo"
const saving = ref(false)
const errorMessage = ref('')

const MAX_FILE_MB = 10 // before shrinking (it is made 256 x 256 when saved)

const me = computed(() => profileOf(user.value.uid))

// The picture I would have without an uploaded one: my DiceBear face
const fallbackPicture = computed(() => dicebearUrl(user.value.uid))

// The picture in the big circle: what it will look like after Save
const shownPicture = computed(() => {
  if (photoPreview.value) return photoPreview.value
  if (removePhoto.value) return fallbackPicture.value
  return me.value.avatar
})

// Is an uploaded photo showing (so "Remove photo" makes sense)?
const hasOwnPhoto = computed(() => Boolean(photoPreview.value) || (Boolean(me.value.photoURL) && !removePhoto.value))

function clearPickedPhoto() {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  photoFile.value = null
  photoPreview.value = ''
}

// Opened: start from my current name and picture. Closed (e.g. Cancel): close the <dialog>.
watch(open, (isOpen) => {
  if (isOpen) {
    name.value = me.value.name || user.value.displayName
    clearPickedPhoto()
    removePhoto.value = false
    errorMessage.value = ''
    dialogEl.value.showModal()
  } else {
    clearPickedPhoto()
    if (dialogEl.value.open) dialogEl.value.close()
  }
})

onUnmounted(clearPickedPhoto)

// A picture was picked from the device
function onFilePicked(event) {
  const file = event.target.files[0]
  event.target.value = '' // so picking the same file again still works
  if (!file) return
  if (!file.type.startsWith('image/')) {
    errorMessage.value = 'Please pick a picture (JPG, PNG, WebP or GIF).'
    return
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    errorMessage.value = 'That picture is too big. Please pick one under ' + MAX_FILE_MB + ' MB.'
    return
  }
  errorMessage.value = ''
  clearPickedPhoto()
  photoFile.value = file
  photoPreview.value = URL.createObjectURL(file)
  removePhoto.value = false
}

function onRemovePhoto() {
  clearPickedPhoto()
  removePhoto.value = true
}

// The <dialog> closed by itself (Esc key): tell the navbar
function onClose() {
  open.value = false
}

// A click on the dim area outside the box closes it too (the click lands on the <dialog> itself)
function onBackdropClick(event) {
  if (event.target === dialogEl.value) {
    open.value = false
  }
}

async function save() {
  const newName = name.value.trim()
  if (newName === '') {
    errorMessage.value = 'Please enter a name.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const changes = {}
    if (newName !== (me.value.name || user.value.displayName)) changes.displayName = newName
    if (photoFile.value) changes.photoFile = photoFile.value
    else if (removePhoto.value && me.value.photoURL) changes.removePhoto = true
    if (Object.keys(changes).length > 0) {
      await updateMyProfile(changes)
    }
    open.value = false
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not save. Check your internet connection and try again.'
  }
  saving.value = false
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="profile-dialog"
    aria-labelledby="profile-title"
    @close="onClose"
    @click="onBackdropClick"
  >
    <form class="app-page dialog-body" @submit.prevent="save">
      <div class="d-flex align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h2 id="profile-title" class="dialog-title">Edit profile</h2>
          <p class="dialog-sub">{{ user && user.email }}</p>
        </div>
        <button type="button" class="close-btn" aria-label="Close" @click="open = false">
          <AppIcon name="close" :size="18" />
        </button>
      </div>

      <!-- The picture, big. Click it (or the button) to pick a new one. -->
      <div class="picture-row">
        <button type="button" class="current" aria-label="Upload a new picture" @click="fileInput.click()">
          <img :src="shownPicture" alt="" class="current-avatar" width="96" height="96" />
          <span class="current-badge" aria-hidden="true"><AppIcon name="camera" :size="14" /></span>
        </button>
        <div class="d-flex flex-column align-items-start gap-1">
          <button type="button" class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" @click="fileInput.click()">
            <AppIcon name="upload" :size="14" /> Upload photo
          </button>
          <button v-if="hasOwnPhoto" type="button" class="btn btn-sm btn-link text-danger px-0" @click="onRemovePhoto">
            Remove photo
          </button>
        </div>
        <!-- The real file picker, hidden: the buttons above open it -->
        <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="d-none" @change="onFilePicked" />
      </div>

      <!-- Name -->
      <label for="profile-name" class="field-label">Name</label>
      <!-- autofocus: the <dialog> puts the cursor here when it opens (instead of on the close button) -->
      <input id="profile-name" v-model="name" type="text" class="form-control name-input" maxlength="30" autocomplete="name" autofocus />

      <p v-if="errorMessage" class="small text-danger mb-2" role="alert">{{ errorMessage }}</p>

      <div class="d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-outline-secondary" @click="open = false">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
/* The box in the middle of the screen. Pops in: a little smaller and see-through to full size. */
.profile-dialog {
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 64px rgba(20, 23, 43, 0.24);
  opacity: 1;
  transform: scale(1);
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.23, 1, 0.32, 1), overlay 200ms allow-discrete,
    display 200ms allow-discrete;
}

.profile-dialog:not([open]) {
  opacity: 0;
  transform: scale(0.96);
}

@starting-style {
  .profile-dialog[open] {
    opacity: 0;
    transform: scale(0.96);
  }
}

/* The dim page behind it */
.profile-dialog::backdrop {
  background: rgba(20, 23, 43, 0.4);
  backdrop-filter: blur(2px);
}

.dialog-body {
  padding: 24px;
}

.dialog-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
}

.dialog-sub {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: 0;
  border-radius: 10px;
  color: var(--muted);
  background: transparent;
}

.close-btn:hover {
  color: var(--ink);
  background: var(--soft);
}

/* The big picture on the left, the buttons on the right */
.picture-row {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 22px;
}

.current {
  position: relative;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.current:active {
  transform: scale(0.97);
}

.current-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--soft);
  box-shadow: 0 0 0 4px #ffffff, 0 0 0 6px var(--brand-tint);
}

/* A small camera in a blue circle on the picture's corner: "you can change this" */
.current-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 3px solid #ffffff;
  border-radius: 50%;
  color: #ffffff;
  background: var(--brand);
}

.current:focus-visible,
.close-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.85rem;
  font-weight: 700;
}

/* font-size 16px: smaller makes iPhones zoom in when the box is tapped */
.name-input {
  margin-bottom: 20px; /* space above Cancel / Save */
  font-size: 16px;
}

.hint {
  color: var(--muted);
  font-size: 0.8rem;
}


@media (prefers-reduced-motion: reduce) {
  .profile-dialog {
    transition: none;
  }

  .current:active {
    transform: none;
  }
}
</style>
