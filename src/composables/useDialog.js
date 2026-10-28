// src/composables/useDialog.js
//
// WHY THIS FILE EXISTS
// The browser's alert(), confirm() and prompt() cannot be styled and some phones block them,
// so the design guide forbids them (section 8). Every page calls these three functions instead.
// Each one returns a Promise, so the function that calls it must be async.

// The popup is built the first time it is needed and then reused, so pages that never show
// a popup pay nothing for this file.
let dialogEl = null
let titleEl, messageEl, labelWrapEl, labelTextEl, inputEl, cancelBtn, confirmBtn

// Holds the function that finishes the popup that is open right now.
// It is set when the popup opens and cleared when it closes, so the Promise always settles once.
let finish = null

// Build the popup once: a native <dialog> (Esc and the dark backdrop come for free)
// with a white card inside it.
function buildDialog() {
  dialogEl = document.createElement('dialog')
  dialogEl.className = 'app-dialog'
  dialogEl.innerHTML = `
    <div class="app-dialog-card">
      <h2 class="app-dialog-title"></h2>
      <p class="app-dialog-message"></p>
      <label class="app-dialog-label">
        <span class="app-dialog-label-text"></span>
        <input type="text" class="form-control app-dialog-input" />
      </label>
      <div class="app-dialog-actions">
        <button type="button" class="btn btn-outline-secondary app-dialog-cancel">Cancel</button>
        <button type="button" class="btn btn-primary app-dialog-confirm">OK</button>
      </div>
    </div>
  `
  document.body.appendChild(dialogEl)

  // Look the pieces up once, so each popup only has to fill in the words.
  titleEl = dialogEl.querySelector('.app-dialog-title')
  messageEl = dialogEl.querySelector('.app-dialog-message')
  labelWrapEl = dialogEl.querySelector('.app-dialog-label')
  labelTextEl = dialogEl.querySelector('.app-dialog-label-text')
  inputEl = dialogEl.querySelector('.app-dialog-input')
  cancelBtn = dialogEl.querySelector('.app-dialog-cancel')
  confirmBtn = dialogEl.querySelector('.app-dialog-confirm')

  // Clicking the dark area outside the card cancels, like every other popup on the web.
  dialogEl.addEventListener('click', (event) => {
    if (event.target === dialogEl) close(false)
  })

  // Esc fires "cancel" on a <dialog>. We close it ourselves so the Promise settles too.
  dialogEl.addEventListener('cancel', (event) => {
    event.preventDefault()
    close(false)
  })

  cancelBtn.addEventListener('click', () => close(false))
  confirmBtn.addEventListener('click', () => close(true))

  // Enter inside the text box confirms, which is what people expect in a small form.
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      close(true)
    }
  })

  // The popup is added to <body>, which is OUTSIDE <div class="app-page">, so the shared
  // CSS variables are not available here. That is why the colours are written out.
  const style = document.createElement('style')
  style.textContent = `
    .app-dialog {
      border: none;
      padding: 0;
      background: transparent;
      width: calc(100% - 2rem);
      max-width: 26rem;
      color: #14172B;
    }
    .app-dialog::backdrop { background: rgba(20, 23, 43, 0.45); }
    .app-dialog-card {
      background: #fff;
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 12px 32px rgba(20, 23, 43, 0.18);
    }
    .app-dialog-title { font-size: 1.15rem; font-weight: 700; margin: 0 0 8px; text-wrap: balance; }
    .app-dialog-message { color: #6B7080; font-size: 0.9rem; margin: 0 0 16px; text-wrap: pretty; }
    .app-dialog-label { display: block; margin-bottom: 16px; }
    .app-dialog-label-text { display: block; font-size: 0.85rem; font-weight: 700; margin-bottom: 6px; }
    .app-dialog-input { font-size: 16px; } /* 16px stops iPhones zooming in on the box */
    .app-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .app-dialog-actions .btn { border-radius: 10px; }
    /* Bootstrap sets display on .btn, which beats the browser's own [hidden] rule, so force it. */
    .app-dialog [hidden] { display: none !important; }
  `
  document.head.appendChild(style)
}

// Close the popup and hand the answer back to whoever is waiting.
function close(answer) {
  if (!finish) return // already closed, so nothing to do
  const done = finish
  finish = null // clear first, so a double click cannot answer twice
  dialogEl.close()
  done(answer)
}

// Fill in the words, show the popup, and return a Promise that resolves when it closes.
function open(options) {
  if (!dialogEl) buildDialog()

  // A second popup can never open on top of the first one.
  if (dialogEl.open) dialogEl.close()

  titleEl.textContent = options.title || ''
  titleEl.hidden = !options.title
  messageEl.textContent = options.message || ''
  messageEl.hidden = !options.message

  // The text box only appears when a label is given (askText).
  labelWrapEl.hidden = !options.label
  labelTextEl.textContent = options.label || ''
  inputEl.value = options.value || ''
  inputEl.placeholder = options.placeholder || ''

  // A destructive action gets a red button, so it never looks like a normal "OK".
  confirmBtn.textContent = options.confirmLabel || 'OK'
  confirmBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary'
  cancelBtn.hidden = options.hideCancel === true

  return new Promise((resolve) => {
    finish = (answer) => {
      // askText resolves with the typed text; everything else resolves with true or false.
      if (options.label) resolve(answer === true ? inputEl.value.trim() : null)
      else resolve(answer === true)
    }

    dialogEl.showModal() // showModal() is what makes it modal and adds the backdrop

    // Focus the right thing: the text box to type in, Cancel for a dangerous action,
    // otherwise the confirm button.
    if (options.label) {
      inputEl.focus()
      inputEl.select()
    } else if (options.danger) {
      cancelBtn.focus() // a stray Enter or Space then does nothing harmful
    } else {
      confirmBtn.focus()
    }
  })
}

// "Are you sure?" -> true if they pressed the confirm button, false otherwise.
export function askConfirm(options) {
  return open({ ...options, label: '' }) // label: '' hides the text box
}

// Ask for a short piece of text -> the text, or null if they cancelled.
export function askText(options) {
  return open(options)
}

// Tell the user something with one button -> resolves when they close it.
export async function showNotice(options) {
  const pressed = await open({ ...options, hideCancel: true, confirmLabel: options.confirmLabel || 'OK' })
  // If a link was passed, copy it once they press the button.
  if (pressed && options.copyText) {
    try {
      await navigator.clipboard.writeText(options.copyText)
    } catch (error) {
      // The browser can refuse clipboard access. The text is already on screen, so nothing breaks.
    }
  }
}