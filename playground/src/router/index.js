import { createRouter, createWebHistory } from 'vue-router'
import AdminRooms from '../views/AdminRooms.vue'
import StudioBroadcast from '../views/StudioBroadcast.vue'
import MonitorLive from '../views/MonitorLive.vue'

export const routes = [
  {
    path: '/',
    redirect: '/admin',
  },
  {
    path: '/admin',
    name: 'admin-rooms',
    component: AdminRooms,
    meta: { title: '管理台' },
  },
  {
    path: '/studio/:roomId',
    name: 'studio-broadcast',
    component: StudioBroadcast,
    meta: { title: '播控台' },
  },
  {
    path: '/monitor/:roomId',
    name: 'monitor-live',
    component: MonitorLive,
    meta: { title: '监控' },
  },
  {
    path: '/anchor/:roomId',
    redirect: (to) => ({ path: `/studio/${to.params.roomId}` }),
  },
  {
    path: '/legacy',
    redirect: '/admin',
  },
  {
    path: '/archive/playground',
    redirect: '/admin',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} · 数字人直播 Demo` : '数字人直播 Demo'
})

export default router
