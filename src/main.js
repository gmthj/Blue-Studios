import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import App from './App.vue'
import router from './router.js'
import { startAuth } from './composables/useAuth.js'

// Wait until we know who is signed in (or have signed in as a guest) before showing any page,
// so every page can use getUid() straight away.
startAuth().then(() => {
  createApp(App).use(router).mount('#app')
})
