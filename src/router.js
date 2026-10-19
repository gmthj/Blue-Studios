import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import LoginView from './views/LoginView.vue'
import RoomLayout from './views/RoomLayout.vue'
import RoomView from './views/RoomView.vue'
import StripView from './views/StripView.vue'
import StudioView from './views/StudioView.vue'
import { useAuth } from './composables/useAuth.js'

const routes = [
  { path: '/', component: HomeView },
  { path: '/login', component: LoginView }, // /login?mode=signup shows the sign up tab
  // meta.requiresAccount: guests are sent to the log in page first (see beforeEach below)
  { path: '/studio', component: StudioView, meta: { requiresAccount: true } },
  {
    // :code is a route parameter, e.g. /room/4821 gives route.params.code = '4821'
    // RoomLayout joins the room + video call once, and shows one of its "children" inside it.
    path: '/room/:code',
    component: RoomLayout,
    children: [
      { path: '', component: RoomView },       // /room/4821       (camera)
      { path: 'strip', component: StripView }, // /room/4821/strip (photostrip)
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: routes,
})

// Pages for accounts only: send guests to log in, then come back here.
// (This only decides which page to show. The real protection is the security rules,
//  which block guests from reading or saving account data even if they skip this check.)
router.beforeEach((to) => {
  const { isAccount } = useAuth()
  if (to.meta.requiresAccount && !isAccount.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

export default router
