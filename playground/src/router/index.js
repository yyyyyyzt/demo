import { createRouter, createWebHistory } from 'vue-router'
import HomeAudiencePlaceholder from '../views/HomeAudiencePlaceholder.vue'
import LegacyPlayground from '../views/LegacyPlayground.vue'

export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeAudiencePlaceholder,
    meta: { title: '观众端' },
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
