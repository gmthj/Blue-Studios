import { ref } from 'vue'

// SHARED "fullscreen" state for the room pages, so phones get as much of the screen as possible.
//
// Fullscreen does two things:
//   1. asks the browser to go fullscreen (hides the browser's address bar), where the browser allows it
//   2. hides the Blue Studios header (App.vue) and gives the camera page the space (RoomView.vue)
// iPhones do not let websites go fullscreen, so there only step 2 happens. That still frees ~80px.
//
// Usage:
//   const { fullscreen, toggleFullscreen, exitFullscreen } = useFullscreen()

const fullscreen = ref(false) // true = the header is hidden (and the browser is fullscreen if it allowed it)

// The browser left fullscreen by itself (Esc key, Android back gesture): show the header again too
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) fullscreen.value = false
})
document.addEventListener('webkitfullscreenchange', () => {
  if (!document.webkitFullscreenElement) fullscreen.value = false
})

async function enterFullscreen() {
  fullscreen.value = true
  const page = document.documentElement
  try {
    // webkit: older Safari on iPads. navigationUI 'hide': Android hides its buttons too.
    if (page.requestFullscreen) await page.requestFullscreen({ navigationUI: 'hide' })
    else if (page.webkitRequestFullscreen) page.webkitRequestFullscreen()
  } catch (error) {
    // Not allowed (e.g. inside an iframe): just the header is hidden
    console.warn(error)
  }
}

async function exitFullscreen() {
  fullscreen.value = false
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen()
  } catch (error) {
    console.warn(error)
  }
}

function toggleFullscreen() {
  return fullscreen.value ? exitFullscreen() : enterFullscreen()
}

export function useFullscreen() {
  return { fullscreen, toggleFullscreen, exitFullscreen }
}
