import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import type { Role } from '../api/types';
import { useAuth, whenAuthReady } from '../stores/auth';

const PREFIX_ROLE: Record<string, Role> = { c: 'CUSTOMER', m: 'MERCHANT', r: 'RIDER', a: 'ADMIN' };

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/auth' },
  { path: '/auth', component: () => import('../pages/auth/AuthPage.vue'), meta: { public: true } },
  { path: '/change-password', component: () => import('../pages/auth/ChangePasswordPage.vue') },
  { path: '/pending', component: () => import('../pages/auth/PendingPage.vue') },

  // ---- Customer (merchants may use these too) ---------------------------------------------------
  {
    path: '/c/',
    component: () => import('../pages/RoleTabs.vue'),
    children: [
      { path: '', redirect: '/c/home' },
      { path: 'home', component: () => import('../pages/customer/HomePage.vue') },
      { path: 'shops', component: () => import('../pages/customer/ShopsPage.vue') },
      { path: 'activity', component: () => import('../pages/customer/ActivityPage.vue') },
      { path: 'account', component: () => import('../pages/shared/AccountPage.vue') },
    ],
  },
  { path: '/c/orders', redirect: '/c/activity' },
  { path: '/c/book/:kind', component: () => import('../pages/customer/BookPage.vue') },
  { path: '/c/trip/:id', component: () => import('../pages/customer/TripPage.vue') },
  { path: '/c/shop/:id', component: () => import('../pages/customer/ShopPage.vue') },
  { path: '/c/product/:id', component: () => import('../pages/customer/ProductPage.vue') },
  { path: '/c/favourites', component: () => import('../pages/customer/FavouritesPage.vue') },
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
      { path: 'riders', component: () => import('../pages/merchant/RidersPage.vue') },
      { path: 'shop', component: () => import('../pages/merchant/ShopSettingsPage.vue') },
      { path: 'earnings', component: () => import('../pages/shared/EarningsPage.vue') },
    ],
  },

  // ---- Driver (bikes, keke, cars, vans, trucks, lorries) ----------------------------------------
  {
    path: '/r/',
    component: () => import('../pages/RoleTabs.vue'),
    children: [
      { path: '', redirect: '/r/drive' },
      { path: 'drive', component: () => import('../pages/rider/DrivePage.vue') },
      { path: 'jobs', component: () => import('../pages/rider/JobsPage.vue') },
      { path: 'active', component: () => import('../pages/rider/ActiveJobsPage.vue') },
      { path: 'garage', component: () => import('../pages/rider/GaragePage.vue') },
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
      { path: 'trips', component: () => import('../pages/admin/AdminTripsPage.vue') },
      { path: 'safety', component: () => import('../pages/admin/SafetyPage.vue') },
      { path: 'kpis', component: () => import('../pages/admin/KpisPage.vue') },
      { path: 'more', component: () => import('../pages/admin/MorePage.vue') },
      { path: 'account', component: () => import('../pages/shared/AccountPage.vue') },
    ],
  },
  { path: '/a/orders', component: () => import('../pages/admin/AdminOrdersPage.vue') },
  { path: '/a/promos', component: () => import('../pages/admin/PromosPage.vue') },
  { path: '/a/admins', component: () => import('../pages/admin/AdminsPage.vue') },

  // ---- Shared ------------------------------------------------------------------------------------
  { path: '/n', component: () => import('../pages/shared/NotificationsPage.vue') },
  { path: '/track/:token', component: () => import('../pages/shared/PublicTrackPage.vue'), meta: { public: true } },

  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });

/**
 * Route guard:
 *  - signed-out people can only see the sign-in screen;
 *  - merchants and riders awaiting verification are held on the "pending" screen (and may sign out);
 *  - each role can only open its own area (/c, /m, /r, /a).
 */
router.beforeEach(async (to) => {
  await whenAuthReady();
  const auth = useAuth();
  const isPublic = to.meta.public === true;

  if (!auth.isSignedIn) return isPublic ? true : '/auth';

  if (to.meta.public === true && to.path.startsWith('/track/')) return true;
  if (to.path === '/auth' || to.path === '/') return auth.isPending ? '/pending' : auth.home;

  if (auth.user?.mustChangePassword && to.path !== '/change-password') return '/change-password';
  if (auth.isPending) return to.path === '/pending' ? true : '/pending';
  if (to.path === '/pending') return auth.home;

  const prefix = to.path.split('/')[1];
  const required = PREFIX_ROLE[prefix];
  // Merchants are customers too: they may use every /c screen as well as their own /m area.
  if (required && required !== auth.role && !(prefix === 'c' && auth.role === 'MERCHANT')) return auth.home;

  return true;
});

export default router;
