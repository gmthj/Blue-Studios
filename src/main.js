import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import App from './App.vue'
import router from './router.js'
import { startAuth } from './composables/useAuth.js'

// Wait until we know who is signed in (or have signed in as a guest) before showing any page,
// so every page can use getUid() straight away.
// Until then, the splash screen in index.html is shown.
startAuth().then(() => {
  createApp(App).use(router).mount('#app')
  hideSplash()
})

// Fade the splash screen out, then remove it from the page
function hideSplash() {
  const splash = document.getElementById('splash')
  if (!splash) return
  splash.classList.add('splash-hide')
  // Removed after the fade (250ms in index.html). A timer, not "transitionend", because with
  // reduced motion there is no fade and so no transitionend.
  setTimeout(() => splash.remove(), 9000)
}
