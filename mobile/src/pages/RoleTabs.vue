<script setup lang="ts">
/**
 * The bottom tab bar for every role. One component, with a tab list per role, so the four areas of the app
 * share identical navigation behaviour.
 */
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue';
import {
  bagHandleOutline,
  cashOutline,
  listOutline,
  mapOutline,
  personOutline,
  pricetagsOutline,
  receiptOutline,
  speedometerOutline,
  storefrontOutline,
  bicycleOutline,
  homeOutline,
  carSportOutline,
  alertCircleOutline,
  ellipsisHorizontalOutline,
  navigateOutline,
} from 'ionicons/icons';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../stores/auth';
import { useBadges } from '../stores/badges';

const auth = useAuth();
const badges = useBadges();
const route = useRoute();

interface Tab {
  tab: string;
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

const tabs = computed<Tab[]>(() => {
  // Merchants shop and ride as customers too, so /c screens get the customer bar plus a way back to the shop.
  const asCustomer = auth.role === 'CUSTOMER' || (auth.role === 'MERCHANT' && route.path.startsWith('/c'));
  if (asCustomer) {
    const base: Tab[] = [
      { tab: 'home', href: '/c/home', label: 'Home', icon: homeOutline },
      { tab: 'shops', href: '/c/shops', label: 'Shops', icon: bagHandleOutline },
      { tab: 'activity', href: '/c/activity', label: 'Activity', icon: receiptOutline, badge: badges.customerActive },
    ];
    return auth.role === 'MERCHANT'
      ? [...base, { tab: 'myshop', href: '/m/orders', label: 'My shop', icon: storefrontOutline, badge: badges.merchantNew }]
      : [...base, { tab: 'account', href: '/c/account', label: 'Account', icon: personOutline }];
  }
  switch (auth.role) {
    case 'MERCHANT':
      return [
        { tab: 'orders', href: '/m/orders', label: 'Orders', icon: receiptOutline, badge: badges.merchantNew },
        { tab: 'products', href: '/m/products', label: 'Catalogue', icon: pricetagsOutline },
        { tab: 'riders', href: '/m/riders', label: 'Riders', icon: bicycleOutline },
        { tab: 'shop', href: '/m/shop', label: 'My shop', icon: storefrontOutline },
        { tab: 'shopride', href: '/c/home', label: 'Shop & ride', icon: carSportOutline },
      ];
    case 'RIDER':
      return [
        { tab: 'drive', href: '/r/drive', label: 'Drive', icon: navigateOutline },
        { tab: 'jobs', href: '/r/jobs', label: 'Deliveries', icon: mapOutline, badge: badges.riderJobs + badges.riderActive },
        { tab: 'garage', href: '/r/garage', label: 'Garage', icon: carSportOutline },
        { tab: 'earnings', href: '/r/earnings', label: 'Earnings', icon: cashOutline },
        { tab: 'account', href: '/r/account', label: 'Account', icon: personOutline },
      ];
    default:
      return [
        { tab: 'queue', href: '/a/queue', label: 'Verify', icon: listOutline, badge: badges.adminQueue },
        { tab: 'trips', href: '/a/trips', label: 'Trips', icon: carSportOutline },
        { tab: 'safety', href: '/a/safety', label: 'Safety', icon: alertCircleOutline, badge: badges.adminSos },
        { tab: 'kpis', href: '/a/kpis', label: 'KPIs', icon: speedometerOutline },
        { tab: 'more', href: '/a/more', label: 'More', icon: ellipsisHorizontalOutline },
      ];
  }
});
</script>

<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button v-for="t in tabs" :key="t.tab" :tab="t.tab" :href="t.href" :data-tour="t.tab">
          <ion-icon :icon="t.icon" aria-hidden="true" />
          <ion-label>{{ t.label }}</ion-label>
          <span v-if="t.badge" class="tab-badge" :aria-label="`${t.badge} waiting`">{{ t.badge }}</span>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>
