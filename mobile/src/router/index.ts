import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import type { Role } from '../api/types';
import { useAuth } from '../stores/auth';

const PREFIX_ROLE: Record<string, Role> = { c: 'CUSTOMER', m: 'MERCHANT', r: 'RIDER', a: 'ADMIN' };

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/auth' },
  { path: '/auth', component: () => import('../pages/auth/AuthPage.vue'), meta: { public: true } },
  { path: '/pending', component: () => import('../pages/auth/PendingPage.vue') },

  // ---- Customer --------------------------------------------------------------------------------
  {
    path: '/c/',
    component: () => import('../pages/RoleTabs.vue'),
    children: [
      { path: '', redirect: '/c/shops' },
      { path: 'shops', component: () => import('../pages/customer/ShopsPage.vue') },
      { path: 'orders', component: () => import('../pages/customer/OrdersPage.vue') },
      { path: 'account', component: () => import('../pages/shared/AccountPage.vue') },
    ],
  },
  { path: '/c/shop/:id', component: () => import('../pages/customer/ShopPage.vue') },
  { path: '/c/basket', component: () => import('../pages/customer/BasketPage.vue') },
  { path: '/c/pay/:id', component: () => import('../pages/customer/PayPage.vue') },
  { path: '/c/order/:id', component: () => import('../pages/customer/OrderPage.vue') },

  // ---- Merchant --------------------------------------------------------------------------------
  {
    path: '/m/',
    component: () => import('../pages/RoleTabs.vue'),
    children: [
      { path: '', redirect: '/m/orders' },
      { path: 'orders', component: () => import('../pages/merchant/MerchantOrdersPage.vue') },
      { path: 'products', component: () => import('../pages/merchant/ProductsPage.vue') },
      { path: 'earnings', component: () => import('../pages/shared/EarningsPage.vue') },
      { path: 'shop', component: () => import('../pages/merchant/ShopSettingsPage.vue') },
    ],
  },

  // ---- Rider -----------------------------------------------------------------------------------
  {
    path: '/r/',
    component: () => import('../pages/RoleTabs.vue'),
    children: [
      { path: '', redirect: '/r/jobs' },
      { path: 'jobs', component: () => import('../pages/rider/JobsPage.vue') },
      { path: 'active', component: () => import('../pages/rider/ActiveJobsPage.vue') },
      { path: 'earnings', component: () => import('../pages/shared/EarningsPage.vue') },
      { path: 'account', component: () => import('../pages/shared/AccountPage.vue') },
    ],
  },

  // ---- Admin -----------------------------------------------------------------------------------
  {
    path: '/a/',
    component: () => import('../pages/RoleTabs.vue'),
    children: [
      { path: '', redirect: '/a/queue' },
      { path: 'queue', component: () => import('../pages/admin/QueuePage.vue') },
      { path: 'kpis', component: () => import('../pages/admin/KpisPage.vue') },
      { path: 'orders', component: () => import('../pages/admin/AdminOrdersPage.vue') },
      { path: 'account', component: () => import('../pages/shared/AccountPage.vue') },
    ],
  },

  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

/**
 * Route guard:
 *  - signed-out people can only see the sign-in screen;
 *  - merchants and riders awaiting verification are held on the "pending" screen (and may sign out);
 *  - each role can only open its own area (/c, /m, /r, /a).
 */
router.beforeEach((to) => {
  const auth = useAuth();
  const isPublic = to.meta.public === true;

  if (!auth.isSignedIn) return isPublic ? true : '/auth';

  if (to.path === '/auth' || to.path === '/') return auth.isPending ? '/pending' : auth.home;

  if (auth.isPending) return to.path === '/pending' ? true : '/pending';
  if (to.path === '/pending') return auth.home;

  const prefix = to.path.split('/')[1];
  const required = PREFIX_ROLE[prefix];
  if (required && required !== auth.role) return auth.home;

  return true;
});

export default router;
