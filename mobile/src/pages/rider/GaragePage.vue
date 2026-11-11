<script setup lang="ts">
/**
 * A driver's vehicles and documents. Vehicles (bike, keke, car, van, truck, lorry, long-haul) each have photos and
 * are approved by ORBIT; one is "active" at a time and decides which trips you are offered. Documents (ID,
 * licence, vehicle papers) are private: only ORBIT admins can open them.
 */
import { IonContent, IonIcon, IonPage, IonRefresher, IonRefresherContent, onIonViewWillEnter } from '@ionic/vue';
import { addOutline, checkmarkCircle, closeCircle, documentTextOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { computed, reactive, ref } from 'vue';
import { api } from '../../api/endpoints';
import { useLive } from '../../api/socket';
import type { DocumentKind, DocumentView, RiderShopLink, VehicleType, VehicleView } from '../../api/types';
import Skeleton from '../../components/Skeleton.vue';
import VehicleIcon from '../../components/VehicleIcon.vue';
import { HEAVY_VEHICLES, LIGHT_VEHICLES, VEHICLE_LABEL } from '../../lib/format';
import { pickDocument, pickImage, shrinkImage } from '../../lib/pick';
import { autoTour } from '../../lib/tour';
import { confirmAction, errorMessage, showError, success, toast } from '../../lib/ui';
import { useAuth } from '../../stores/auth';

const auth = useAuth();
const vehicles = ref<VehicleView[]>([]);
const docs = ref<DocumentView[]>([]);
const links = ref<RiderShopLink[]>([]);
const loading = ref(true);
const error = ref('');
const adding = ref(false);
const busy = ref(false);
const form = reactive({ type: 'MOTORCYCLE' as VehicleType, plate: '', make: '', model: '', color: '', year: '', capacityKg: '', photos: [] as string[] });

const DOCS: Array<{ kind: DocumentKind; label: string; help: string }> = [
  { kind: 'ID_CARD', label: 'Government ID', help: 'National ID, voter’s card, passport' },
  { kind: 'DRIVER_LICENCE', label: 'Driver’s licence', help: 'Not needed for bicycles' },
  { kind: 'VEHICLE_PAPERS', label: 'Vehicle papers', help: 'Registration, insurance or road-worthiness' },
];

async function load() {
  error.value = '';
  try {
    [vehicles.value, docs.value, links.value] = await Promise.all([api.rider.vehicles(), api.documents(), api.rider.shops().catch(() => [] as RiderShopLink[])]);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onIonViewWillEnter(() => {
  load();
  autoTour('driver', 2500);
});
useLive(['account.updated', 'connect'], load);
async function refresher(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

const docOf = (k: DocumentKind) => docs.value.find((d) => d.kind === k);
const statusTone = (s: string) => (s === 'APPROVED' ? 'good' : s === 'REJECTED' ? 'bad' : 'warn');

async function uploadDoc(kind: DocumentKind) {
  const file = await pickDocument();
  if (!file) return;
  busy.value = true;
  try {
    await api.uploadDocument(kind, await shrinkImage(file, 2000), file.name);
    toast('Uploaded. ORBIT will review it shortly.');
    await load();
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = false;
  }
}

async function addPhotos() {
  const files = await pickImage({ multiple: true });
  if (!files.length) return;
  busy.value = true;
  try {
    for (const f of files.slice(0, 4 - form.photos.length)) form.photos.push((await api.uploadImage('vehicle', await shrinkImage(f, 1400), f.name)).url);
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = false;
  }
}

const needsPlate = computed(() => form.type !== 'BICYCLE');
async function addVehicle() {
  if (needsPlate.value && form.plate.trim().length < 4) return toast('Enter the plate number as it appears on the vehicle.', 'error');
  busy.value = true;
  try {
    await api.rider.addVehicle({
      type: form.type,
      ...(needsPlate.value ? { plate: form.plate.trim() } : {}),
      ...(form.make.trim() ? { make: form.make.trim() } : {}),
      ...(form.model.trim() ? { model: form.model.trim() } : {}),
      ...(form.color.trim() ? { color: form.color.trim() } : {}),
      ...(Number(form.year) ? { year: Number(form.year) } : {}),
      ...(Number(form.capacityKg) ? { capacityKg: Number(form.capacityKg) } : {}),
      photos: form.photos,
    });
    success();
    adding.value = false;
    Object.assign(form, { plate: '', make: '', model: '', color: '', year: '', capacityKg: '', photos: [] });
    await load();
    await auth.refresh().catch(() => undefined);
  } catch (e) {
    await showError(e);
  } finally {
    busy.value = false;
  }
}

async function activate(v: VehicleView) {
  try {
    await api.rider.activateVehicle(v.id);
    toast(`${VEHICLE_LABEL[v.type]} is now your active vehicle.`);
    await load();
    await auth.refresh().catch(() => undefined);
  } catch (e) {
    showError(e);
  }
}
async function remove(v: VehicleView) {
  if (!(await confirmAction({ title: `Remove ${v.label}?`, confirm: 'Remove', destructive: true }))) return;
  try {
    await api.rider.removeVehicle(v.id);
    await load();
  } catch (e) {
    showError(e);
  }
}
async function respond(l: RiderShopLink, accept: boolean) {
  try {
    await (accept ? api.rider.acceptShop(l.id) : api.rider.leaveShop(l.id));
    await load();
  } catch (e) {
    showError(e);
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresher"><ion-refresher-content /></ion-refresher>
      <main class="screen" data-tour="garage">
        <h1 class="title">Garage</h1>
        <p class="lede">Your vehicles and documents. ORBIT checks them before you take trips.</p>
        <Skeleton v-if="loading" kind="rows" :count="3" />
        <p v-else-if="error" class="notice bad">{{ error }}</p>
        <template v-else>
          <section v-if="links.length" class="block">
            <h2 class="heading">Shop invitations</h2>
            <div v-for="l in links" :key="l.id" class="row between link">
              <span><strong>{{ l.shop.name }}</strong><br /><span class="small muted">{{ l.shop.city }} · {{ l.status === 'INVITED' ? 'invited you as their rider' : 'you ride for this shop' }}</span></span>
              <span v-if="l.status === 'INVITED'" class="btns"><button class="btn btn-line small-btn" @click="respond(l, false)">Decline</button><button class="btn btn-primary small-btn" @click="respond(l, true)">Accept</button></span>
              <button v-else class="btn-text" @click="respond(l, false)">Leave</button>
            </div>
          </section>

          <section class="block">
            <div class="row between"><h2 class="heading">Vehicles</h2><button class="btn-text" type="button" @click="adding = !adding"><ion-icon :icon="addOutline" /> {{ adding ? 'Close' : 'Add vehicle' }}</button></div>

            <form v-if="adding" class="addform stack" style="--stack: 12px" @submit.prevent="addVehicle">
              <div class="vgrid">
                <button v-for="v in [...LIGHT_VEHICLES, ...HEAVY_VEHICLES]" :key="v" type="button" class="veh" :class="{ on: form.type === v }" @click="form.type = v"><VehicleIcon :type="v" :size="36" /><span>{{ VEHICLE_LABEL[v] }}</span></button>
              </div>
              <label v-if="needsPlate" class="field"><span class="label">Plate number</span><input v-model="form.plate" class="input" autocapitalize="characters" placeholder="ABC-123XY" /></label>
              <div class="two"><label class="field"><span class="label">Make</span><input v-model="form.make" class="input" placeholder="Toyota" /></label><label class="field"><span class="label">Model</span><input v-model="form.model" class="input" placeholder="Hiace" /></label></div>
              <div class="two"><label class="field"><span class="label">Colour</span><input v-model="form.color" class="input" /></label><label class="field"><span class="label">Year</span><input v-model="form.year" class="input" inputmode="numeric" maxlength="4" /></label></div>
              <label v-if="(HEAVY_VEHICLES as readonly string[]).includes(form.type)" class="field"><span class="label">Load capacity (kg)</span><input v-model="form.capacityKg" class="input" inputmode="numeric" placeholder="e.g. 10000" /></label>
              <div class="field"><span class="label">Photos (up to 4)</span>
                <div class="photos"><img v-for="p in form.photos" :key="p" :src="p" alt="Vehicle photo" /><button v-if="form.photos.length < 4" type="button" class="addph" :disabled="busy" @click="addPhotos"><ion-icon :icon="addOutline" /></button></div>
              </div>
              <button class="btn btn-primary block" type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save vehicle' }}</button>
            </form>

            <p v-if="!vehicles.length && !adding" class="muted">No vehicle yet. Add the one you drive.</p>
            <article v-for="v in vehicles" :key="v.id" class="veh-card" :class="{ active: v.isActive }">
              <VehicleIcon :type="v.type" :size="48" />
              <div class="grow">
                <strong>{{ [v.color, v.make, v.model].filter(Boolean).join(' ') || VEHICLE_LABEL[v.type] }}</strong>
                <div class="small muted">{{ VEHICLE_LABEL[v.type] }}<template v-if="v.plate"> · {{ v.plate }}</template> · up to {{ v.capacityKg.toLocaleString() }} kg</div>
                <div class="row gap"><span class="status" :class="statusTone(v.status)">{{ v.status === 'APPROVED' ? 'Approved' : v.status === 'REJECTED' ? 'Rejected' : 'Awaiting review' }}</span><span v-if="v.isActive" class="status good">Active</span></div>
                <p v-if="v.reviewNote" class="small bad">{{ v.reviewNote }}</p>
              </div>
              <div class="col">
                <button v-if="v.status === 'APPROVED' && !v.isActive" class="btn-text" @click="activate(v)">Use this</button>
                <button class="iconbtn" :aria-label="`Remove ${v.label}`" @click="remove(v)"><ion-icon :icon="trashOutline" /></button>
              </div>
            </article>
          </section>

          <section class="block">
            <h2 class="heading">Documents</h2>
            <p class="small muted">Private. Only ORBIT’s verification team can view them.</p>
            <div v-for="d in DOCS" :key="d.kind" class="doc">
              <ion-icon :icon="documentTextOutline" class="di" />
              <div class="grow">
                <strong>{{ d.label }}</strong>
                <div class="small muted">{{ d.help }}</div>
                <div v-if="docOf(d.kind)" class="status" :class="statusTone(docOf(d.kind)!.status)"><ion-icon :icon="docOf(d.kind)!.status === 'APPROVED' ? checkmarkCircle : docOf(d.kind)!.status === 'REJECTED' ? closeCircle : timeOutline" /> {{ docOf(d.kind)!.status === 'APPROVED' ? 'Approved' : docOf(d.kind)!.status === 'REJECTED' ? 'Rejected' : 'Under review' }}</div>
                <p v-if="docOf(d.kind)?.note" class="small bad">{{ docOf(d.kind)!.note }}</p>
              </div>
              <button class="btn btn-line small-btn" :disabled="busy" @click="uploadDoc(d.kind)">{{ docOf(d.kind) ? 'Replace' : 'Upload' }}</button>
            </div>
          </section>
        </template>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.block {
  margin-top: 26px;
}
.link {
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  gap: 10px;
}
.btns {
  display: flex;
  gap: 8px;
}
.addform {
  margin: 14px 0;
  padding: 14px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.vgrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.veh {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 2px;
  border: 0;
  border-radius: 12px;
  background: var(--paper);
  box-shadow: inset 0 0 0 1.5px var(--line);
  color: var(--ink);
  font: 600 10px var(--font-display);
  text-align: center;
}
.veh.on {
  box-shadow: inset 0 0 0 2.5px var(--ink);
  background: var(--ink-wash);
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.photos {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.photos img,
.addph {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  object-fit: cover;
}
.addph {
  border: 2px dashed var(--line);
  background: none;
  color: var(--slate);
  font-size: 28px;
  display: grid;
  place-items: center;
}
.veh-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  margin-top: 12px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.veh-card.active {
  border-color: var(--good);
}
.gap {
  gap: 6px;
  margin-top: 6px;
}
.col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.iconbtn {
  border: 0;
  background: none;
  color: var(--slate);
  font-size: 20px;
  padding: 8px;
}
.doc {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}
.di {
  font-size: 28px;
  color: var(--slate);
}
.bad {
  color: var(--bad);
}
</style>
