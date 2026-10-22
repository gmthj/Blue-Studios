import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import LoginView from './views/LoginView.vue'
import RoomLayout from './views/RoomLayout.vue'
import RoomView from './views/RoomView.vue'
import StripView from './views/StripView.vue'
import DecorateView from './views/DecorateView.vue'
import VideoView from './views/VideoView.vue'
import ExportView from './views/ExportView.vue'
import StudioView from './views/StudioView.vue'
import MarketplaceView from './views/MarketplaceView.vue'
import MarketplaceItemView from './views/MarketplaceItemView.vue'
import TestUploadView from './views/TestUploadView.vue'
import AdminView from './views/AdminView.vue'
import { useAuth } from './composables/useAuth.js'

const routes = [
  { path: '/', component: HomeView },
  { path: '/login', component: LoginView }, // /login?mode=signup shows the sign up tab
  // meta.requiresAccount: guests are sent to the log in page first (see beforeEach below)
  { path: '/studio', component: StudioView, meta: { requiresAccount: true } },
  // Anyone can browse the marketplace, guests too. /marketplace?type=stickers&category=cute&sort=popular
  { path: '/marketplace', component: MarketplaceView },
  // One item, e.g. /marketplace/templates/aZ3kQ9 (type can only be templates or stickers)
  { path: '/marketplace/:type(templates|stickers)/:id', component: MarketplaceItemView },
  // TEMPORARY: make test templates/stickers until the editors are merged (remove before submission)
  { path: '/test-upload', component: TestUploadView, meta: { requiresAccount: true } },
  // Moderators only (accounts with the admin mark, see scripts/set-admin.mjs). /admin?tab=reports|hidden|accounts|rooms|log
  { path: '/admin', component: AdminView, meta: { requiresAdmin: true } },
  {
    // :code is a route parameter, e.g. /room/4821 gives route.params.code = '4821'
    // RoomLayout joins the room + video call once, and shows one of its "children" inside it.
    path: '/room/:code',
    component: RoomLayout,
    children: [
      { path: '', component: RoomView },             // /room/4821          (camera)
      { path: 'strip', component: StripView },       // /room/4821/strip    (choose photos for the strip)
      { path: 'video', component: VideoView },       // /room/4821/video    (edit the clips into one video)
      { path: 'decorate', component: DecorateView }, // /room/4821/decorate (filters and stickers)
      { path: 'export', component: ExportView },     // /room/4821/export   (make an MP4 of a strip with video)
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
  const { isAccount, isAdmin } = useAuth()
  if ((to.meta.requiresAccount || to.meta.requiresAdmin) && !isAccount.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !isAdmin.value) {
    return { path: '/' }
  }
})

export default router
