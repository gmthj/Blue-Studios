import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import RoomView from './views/RoomView.vue'

const routes = [
  { path: '/', component: HomeView },
  // :code is a route parameter, e.g. /room/4821 gives this.$route.params.code = '4821'
  { path: '/room/:code', component: RoomView },
]

const router = createRouter({
  history: createWebHistory(),
  routes: routes,
})

export default router
