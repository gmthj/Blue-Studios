<script setup>
import { ref, watch, nextTick } from 'vue'
import { dialog, answer, cancelDialog } from '../composables/useDialog.js'
import AppIcon from './AppIcon.vue'

// The one in-app popup for questions and messages (instead of the browser's alert / confirm / prompt).
// Mounted ONCE in App.vue. Pages open it with askConfirm(), askText() or showNotice() from useDialog.js.
// It is a <dialog> element: the browser dims the page behind it, keeps the keyboard inside it,
// and closes it with the Esc key.

const dialogEl = ref(null)
const textInput = ref(null)
const cancelButton = ref(null)
const mainButton = ref(null)
const typed = ref('')
const copied = ref(false)

// A new popup: show it, and put the keyboard focus somewhere useful
watch(dialog, async (current) => {
  const el = dialogEl.value
  if (!el) return
  if (!current) {
    if (el.open) el.close()
    return
  }
  typed.value = current.text
  copied.value = false
  if (!el.open) {
    if (el.showModal) el.showModal()
    else el.setAttribute('open', '') // very old browsers (and tests) without showModal
  }
  await nextTick()
  if (current.kind === 'text') {
    textInput.value && textInput.value.focus()
  } else if (current.kind === 'notice' && current.copyText) {
    textInput.value && textInput.value.select() // ready to copy with Ctrl+C / long press
  } else if (current.danger) {
    cancelButton.value && cancelButton.value.focus() // red actions: Enter does NOT do them by accident
  } else {
    mainButton.value && mainButton.value.focus()
  }
})

function onMainButton() {
  const current = dialog.value
  if (!current) return
  if (current.kind === 'confirm') answer(true)
  else if (current.kind === 'text') answer(typed.value.trim())
  else answer(undefined)
}

// Closed by the browser (Esc key): count it as Cancel
function onClose() {
  cancelDialog()
}

// A click on the dim area outside the box closes it too (the click lands on the <dialog> itself)
function onBackdropClick(event) {
  if (event.target === dialogEl.value) cancelDialog()
}

// The notice's "Copy" button (e.g. the room link, when the browser blocked copying it by itself)
async function copyText() {
  try {
    await navigator.clipboard.writeText(dialog.value.copyText)
    copied.value = true
  } catch (error) {
    console.error(error)
    textInput.value && textInput.value.select()
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="app-dialog"
    :aria-labelledby="dialog ? 'app-dialog-title' : undefined"
    @close="onClose"
    @click="onBackdropClick"
    @cancel.prevent="cancelDialog"
  >
    <form v-if="dialog" class="app-page dialog-body" @submit.prevent="onMainButton">
      <div class="dialog-head">
        <span class="dialog-icon" :class="{ danger: dialog.danger }" aria-hidden="true">
          <AppIcon :name="dialog.icon" :size="20" />
        </span>
        <div class="min-w-0">
          <h2 id="app-dialog-title" class="dialog-title">{{ dialog.title }}</h2>
          <p v-if="dialog.message" class="dialog-message">{{ dialog.message }}</p>
        </div>
      </div>

      <!-- askText: a box to type in -->
      <div v-if="dialog.kind === 'text'" class="mt-3">
        <label v-if="dialog.label" for="app-dialog-text" class="field-label">{{ dialog.label }}</label>
        <input
          id="app-dialog-text"
          ref="textInput"
          v-model="typed"
          type="text"
          class="form-control dialog-input"
          :placeholder="dialog.placeholder"
          :maxlength="dialog.maxLength"
        />
      </div>

      <!-- showNotice with copyText: the text, ready to copy -->
      <div v-if="dialog.kind === 'notice' && dialog.copyText" class="copy-row mt-3">
        <input ref="textInput" :value="dialog.copyText" type="text" class="form-control dialog-input" readonly aria-label="Text to copy" />
        <button type="button" class="btn btn-outline-secondary d-inline-flex align-items-center gap-1" @click="copyText">
          <AppIcon :name="copied ? 'check' : 'duplicate'" :size="14" /> {{ copied ? 'Copied' : 'Copy' }}
        </button>
      </div>

      <div class="dialog-actions">
        <button v-if="dialog.kind !== 'notice'" ref="cancelButton" type="button" class="btn btn-outline-secondary" @click="cancelDialog">
          {{ dialog.cancelLabel }}
        </button>
        <button ref="mainButton" type="submit" class="btn" :class="dialog.danger ? 'btn-danger' : 'btn-primary'">
          {{ dialog.confirmLabel }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
/* The box in the middle of the screen. Pops in: a little smaller and see-through to full size. */
.app-dialog {
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 64px rgba(20, 23, 43, 0.24);
  opacity: 1;
  transform: scale(1);
  transition: opacity 180ms ease, transform 180ms cubic-bezier(0.23, 1, 0.32, 1), overlay 180ms allow-discrete,
    display 180ms allow-discrete;
}

.app-dialog:not([open]) {
  opacity: 0;
  transform: scale(0.96);
}

@starting-style {
  .app-dialog[open] {
    opacity: 0;
    transform: scale(0.96);
  }
}

/* The dim page behind it */
.app-dialog::backdrop {
  background: rgba(20, 23, 43, 0.4);
  backdrop-filter: blur(2px);
}

.dialog-body {
  padding: 22px;
}

.dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.min-w-0 {
  min-width: 0;
}

.dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  color: var(--brand);
  background: var(--brand-tint);
}

.dialog-icon.danger {
  color: #C2262B;
  background: #FDE4E5;
}

.dialog-title {
  margin: 0;
  padding-top: 2px;
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.dialog-message {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  text-wrap: pretty;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.85rem;
  font-weight: 700;
}

/* font-size 16px: smaller makes iPhones zoom in when the box is tapped */
.dialog-input {
  font-size: 16px;
}

.copy-row {
  display: flex;
  gap: 8px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

/* Narrow phones: full-width buttons, the main one on top */
@media (max-width: 400px) {
  .dialog-actions {
    flex-direction: column-reverse;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-dialog {
    transition: none;
  }
}
</style>
