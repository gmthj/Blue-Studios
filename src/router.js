import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import RoomLayout from './views/RoomLayout.vue'
import RoomView from './views/RoomView.vue'
import StripView from './views/StripView.vue'
import DecorateView from './views/DecorateView.vue'

const routes = [
  { path: '/', component: HomeView },
  {
    // :code is a route parameter, e.g. /room/4821 gives route.params.code = '4821'
    // RoomLayout joins the room + video call once, and shows one of its "children" inside it.
    path: '/room/:code',
    component: RoomLayout,
    children: [
      { path: '', component: RoomView },             // /room/4821          (camera)
      { path: 'strip', component: StripView },       // /room/4821/strip    (choose photos for the strip)
      { path: 'decorate', component: DecorateView }, // /room/4821/decorate (filters and stickers)
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: routes,
})

export default router
