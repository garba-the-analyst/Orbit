<script setup lang="ts">
/** The shop's own riders. Invite anyone with an ORBIT rider account; they accept, then you can send orders out with them. */
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { ref } from 'vue';
import { api } from '../../api/endpoints';
import type { ShopRiderLink } from '../../api/types';
import Avatar from '../../components/Avatar.vue';
import EmptyState from '../../components/EmptyState.vue';
import Skeleton from '../../components/Skeleton.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { VEHICLE_LABEL } from '../../lib/format';
import { useLive } from '../../api/socket';
import { confirmAction, errorMessage, showError, toast } from '../../lib/ui';
import { autoTour } from '../../lib/tour';

const links = ref<ShopRiderLink[]>([]);
const loading = ref(true);
const error = ref('');
const identifier = ref('');
const inviting = ref(false);
const formError = ref('');

async function load() {
  error.value = '';
  try {
    links.value = await api.merchant.riders();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(() => {
  load();
  autoTour('merchant', 1500);
});
useLive(['jobs.changed', 'account.updated'], load);
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

async function invite() {
  const v = identifier.value.trim();
  if (v.length < 5) {
    formError.value = 'Enter the rider’s email or phone number.';
    return;
  }
  inviting.value = true;
  formError.value = '';
  try {
    const r = await api.merchant.inviteRider(v);
    identifier.value = '';
    toast(`Invitation sent to ${r.name}.`);
    await load();
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    inviting.value = false;
  }
}

async function remove(l: ShopRiderLink) {
  const ok = await confirmAction({ title: `Remove ${l.name}?`, message: l.status === 'INVITED' ? 'This cancels the invitation.' : 'They will no longer get your shop’s orders.', confirm: 'Remove', cancel: 'Keep', destructive: true });
  if (!ok) return;
  try {
    await api.merchant.removeRider(l.id);
    await load();
  } catch (e) {
    await showError(e);
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen root">
        <h1 class="title">My riders</h1>
        <p class="lede">Add riders, drivers or dispatch bikes you trust. When an order is ready, send it out with one of them.</p>

        <form class="invite" data-tour="invite-rider" novalidate @submit.prevent="invite">
          <label class="field"><span class="label">Email or phone of an ORBIT rider</span>
            <input v-model="identifier" class="input" :class="{ invalid: formError }" autocapitalize="off" placeholder="rider@email.com or 0803…" /><span v-if="formError" class="error">{{ formError }}</span></label>
          <button class="btn btn-primary block" type="submit" :disabled="inviting">{{ inviting ? 'Sending…' : 'Send invitation' }}</button>
        </form>

        <Skeleton v-if="loading" kind="rows" />
        <div v-else-if="error" class="notice bad" role="alert" style="margin-top: 20px">{{ error }}<button class="btn btn-quiet small-btn" style="margin-top: 12px" @click="load">Try again</button></div>
        <EmptyState v-else-if="!links.length" title="No personal riders yet" text="Customers can always choose an ORBIT rider. Add your own to keep deliveries in your hands." />
        <ul v-else class="list" style="margin-top: 20px">
          <li v-for="l in links" :key="l.id" class="r">
            <Avatar :name="l.name" :src="l.avatarUrl" :size="44" />
            <span class="grow">
              <strong>{{ l.name }}</strong>
              <span class="small muted block"><VehicleIcon v-if="l.vehicle" :type="l.vehicle" :size="16" /> {{ l.vehicle ? VEHICLE_LABEL[l.vehicle] : 'No vehicle yet' }}<template v-if="l.phone"> · {{ l.phone }}</template></span>
            </span>
            <span class="status" :class="l.status === 'INVITED' ? 'warn' : l.online ? 'good' : ''">{{ l.status === 'INVITED' ? 'Invited' : l.online ? 'Online' : 'Offline' }}</span>
            <button class="btn btn-quiet small-btn" type="button" :aria-label="`Remove ${l.name}`" @click="remove(l)">Remove</button>
          </li>
        </ul>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.invite {
  margin-top: 20px;
  display: grid;
  gap: 12px;
}
.block {
  display: block;
}
.r {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
</style>
