import { createRouter, createWebHistory } from 'vue-router'
import AdminRooms from '../views/AdminRooms.vue'
import AnchorBroadcast from '../views/AnchorBroadcast.vue'
import AnchorCanvasLegacy from '../views/AnchorCanvasLegacy.vue'
import AudienceLive from '../views/AudienceLive.vue'
import LegacyPlayground from '../views/LegacyPlayground.vue'

export const routes = [
  {
    path: '/',
    name: 'audience',
    component: AudienceLive,
    meta: { title: '观众端' },
  },
  {
    path: '/admin',
    name: 'admin-rooms',
    component: AdminRooms,
    meta: { title: '管理台' },
  },
  {
    path: '/anchor/:roomId',
    name: 'anchor-broadcast',
    component: AnchorBroadcast,
    meta: { title: '主播控制台' },
  },
  {
    path: '/anchor-canvas/:roomId',
    name: 'anchor-canvas-legacy',
    component: AnchorCanvasLegacy,
    meta: { title: 'Canvas 遗留推流' },
  },
  {
    path: '/legacy',
    name: 'legacy-playground',
    component: LegacyPlayground,
    meta: { title: '历史调试页' },
  },
  {
    path: '/archive/playground',
    redirect: '/legacy',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} · Live Demo` : 'Live Demo'
})

export default router
