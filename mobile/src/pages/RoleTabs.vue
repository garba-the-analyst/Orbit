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
  peopleOutline,
  bicycleOutline,
} from 'ionicons/icons';
import { computed } from 'vue';
import { useAuth } from '../stores/auth';
import { useBadges } from '../stores/badges';

const auth = useAuth();
const badges = useBadges();

interface Tab {
  tab: string;
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

const tabs = computed<Tab[]>(() => {
  switch (auth.role) {
    case 'MERCHANT':
      return [
        { tab: 'orders', href: '/m/orders', label: 'Orders', icon: receiptOutline, badge: badges.merchantNew },
        { tab: 'products', href: '/m/products', label: 'Products', icon: pricetagsOutline },
        { tab: 'earnings', href: '/m/earnings', label: 'Earnings', icon: cashOutline },
        { tab: 'shop', href: '/m/shop', label: 'My shop', icon: storefrontOutline },
      ];
    case 'RIDER':
      return [
        { tab: 'jobs', href: '/r/jobs', label: 'Jobs', icon: mapOutline, badge: badges.riderJobs },
        { tab: 'active', href: '/r/active', label: 'Active', icon: bicycleOutline, badge: badges.riderActive },
        { tab: 'earnings', href: '/r/earnings', label: 'Earnings', icon: cashOutline },
        { tab: 'account', href: '/r/account', label: 'Account', icon: personOutline },
      ];
    case 'ADMIN':
      return [
        { tab: 'queue', href: '/a/queue', label: 'Verify', icon: listOutline, badge: badges.adminQueue },
        { tab: 'kpis', href: '/a/kpis', label: 'KPIs', icon: speedometerOutline },
        { tab: 'orders', href: '/a/orders', label: 'Orders', icon: peopleOutline },
        { tab: 'account', href: '/a/account', label: 'Account', icon: personOutline },
      ];
    default:
      return [
        { tab: 'shops', href: '/c/shops', label: 'Shops', icon: bagHandleOutline },
        { tab: 'orders', href: '/c/orders', label: 'Orders', icon: receiptOutline, badge: badges.customerActive },
        { tab: 'account', href: '/c/account', label: 'Account', icon: personOutline },
      ];
  }
});
</script>

<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button v-for="t in tabs" :key="t.tab" :tab="t.tab" :href="t.href">
          <ion-icon :icon="t.icon" aria-hidden="true" />
          <ion-label>{{ t.label }}</ion-label>
          <span v-if="t.badge" class="tab-badge" :aria-label="`${t.badge} waiting`">{{ t.badge }}</span>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>
