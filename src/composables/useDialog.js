import { ref } from 'vue'

// IN-APP POPUPS instead of the browser's alert(), confirm() and prompt().
// The browser's own boxes look different on every browser, cannot be styled, and on phones
// some browsers block them. These show AppDialog.vue (mounted once in App.vue) instead.
//
// Each one returns a Promise, so "await" it inside an async function:
//
//   if (!(await askConfirm({ title: 'Delete "Sunny days"?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
//   const note = await askText({ title: 'Hide this item?', label: 'Note for the log (optional)' })   // null if cancelled
//   await showNotice({ title: 'Copy this link', copyText: 'https://...' })
//
// Options for all of them:
//   title          the big line at the top (required)
//   message        a sentence or two under it (optional)
//   confirmLabel   the main button's words (default 'OK')
//   cancelLabel    the other button's words (default 'Cancel')
//   danger         true: the main button is red (deleting, banning, closing...)
//   icon           an AppIcon name for the corner (default: a bin if danger, otherwise a sparkle)

// The popup on screen now, or null. AppDialog.vue shows whatever is in here.
//   { kind: 'confirm' | 'text' | 'notice', title, message, ..., resolve }
export const dialog = ref(null)

function open(kind, options, cancelValue) {
  // Only one popup at a time: if another one is still open, it counts as cancelled
  if (dialog.value) {
    dialog.value.resolve(dialog.value.cancelValue)
  }
  return new Promise((resolve) => {
    dialog.value = {
      kind,
      title: options.title,
      message: options.message || '',
      confirmLabel: options.confirmLabel || 'OK',
      cancelLabel: options.cancelLabel || 'Cancel',
      danger: Boolean(options.danger),
      icon: options.icon || (options.danger ? 'trash' : kind === 'notice' ? 'check' : 'sparkle'),
      label: options.label || '',
      placeholder: options.placeholder || '',
      maxLength: options.maxLength || 300,
      text: options.text || '',
      copyText: options.copyText || '',
      cancelValue,
      resolve,
    }
  })
}

// "Are you sure?" Resolves true (the main button) or false (Cancel, Esc, or a click outside).
export function askConfirm(options) {
  return open('confirm', options, false)
}

// Ask for a few words. Resolves the text typed (maybe ''), or null if cancelled.
export function askText(options) {
  return open('text', options, null)
}

// Just tell them something (optionally with text to copy, e.g. a link). Resolves when closed.
export function showNotice(options) {
  return open('notice', { confirmLabel: 'Done', ...options }, undefined)
}

// Called by AppDialog.vue when a button is pressed (or the popup is closed): give the answer and close it
export function answer(value) {
  const current = dialog.value
  if (!current) return
  dialog.value = null
  current.resolve(value)
}

// Close it the "cancel" way (Esc, a click outside, or the Cancel button)
export function cancelDialog() {
  if (dialog.value) answer(dialog.value.cancelValue)
}
