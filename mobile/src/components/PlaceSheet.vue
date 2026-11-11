<script setup lang="ts">
/**
 * "Where to?" sheet. Three ways to choose a place: type to search (OpenStreetMap/Nominatim via the ORBIT API),
 * tap a saved place or "use my location", or drag a map under a centre pin. Always returns a Point
 * { address, lat, lng } that the booking and checkout screens send to the API.
 */
import { IonContent, IonIcon, IonModal } from '@ionic/vue';
import { closeOutline, locateOutline, mapOutline, searchOutline, starOutline, star, trashOutline } from 'ionicons/icons';
import { computed, ref, watch } from 'vue';
import { api } from '../api/endpoints';
import type { LatLng, PlaceResult, Point, SavedPlace } from '../api/types';
import { useAppConfig } from '../stores/appConfig';
import { currentPosition } from '../lib/geo';
import { showError, toast } from '../lib/ui';
import MapView from './MapView.vue';

const props = defineProps<{ open: boolean; title: string; near?: LatLng | null }>();
const emit = defineEmits<{ (e: 'pick', p: Point): void; (e: 'close'): void }>();
const cfg = useAppConfig();

const mode = ref<'search' | 'map'>('search');
const q = ref('');
const results = ref<PlaceResult[]>([]);
const searching = ref(false);
const noOnline = ref(false);
const saved = ref<SavedPlace[]>([]);
const locating = ref(false);
const pin = ref<LatLng>(props.near ?? cfg.mapCenter);
const pinAddress = ref('');
const resolving = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

const savedKeys = computed(() => new Set(saved.value.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`)));

watch(
  () => props.open,
  async (o) => {
    if (!o) return;
    mode.value = 'search';
    q.value = '';
    results.value = [];
    pin.value = props.near ?? cfg.mapCenter;
    try {
      saved.value = await api.places();
    } catch {
      saved.value = [];
    }
  },
);

watch(q, (v) => {
  clearTimeout(timer);
  if (v.trim().length < 3) {
    results.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  timer = setTimeout(async () => {
    const mine = ++seq;
    try {
      const r = await api.searchPlaces(v.trim(), props.near ?? undefined);
      if (mine !== seq) return;
      results.value = r.results;
      noOnline.value = !r.online;
    } catch {
      if (mine === seq) results.value = [];
    } finally {
      if (mine === seq) searching.value = false;
    }
  }, 350);
});

const choose = (p: Point) => emit('pick', p);

async function useMyLocation() {
  locating.value = true;
  const fix = await currentPosition();
  locating.value = false;
  if (!fix) return toast('Could not get your location. Allow location access, or search instead.', 'error');
  let address = '';
  try {
    address = (await api.reverse(fix)).address ?? '';
  } catch {
    /* fall through to coordinates */
  }
  choose({ lat: fix.lat, lng: fix.lng, address: address || 'My current location' });
}

async function onMoved(p: LatLng) {
  pin.value = p;
  const mine = ++seq;
  resolving.value = true;
  try {
    const r = await api.reverse(p);
    if (mine === seq) pinAddress.value = r.address ?? '';
  } catch {
    if (mine === seq) pinAddress.value = '';
  } finally {
    if (mine === seq) resolving.value = false;
  }
}

async function startMapMode() {
  mode.value = 'map';
  const fix = props.near ? null : await currentPosition(4000);
  if (fix) pin.value = fix;
  onMoved(pin.value);
}

const confirmPin = () => choose({ lat: pin.value.lat, lng: pin.value.lng, address: pinAddress.value || `Pinned location (${pin.value.lat.toFixed(4)}, ${pin.value.lng.toFixed(4)})` });

async function toggleSave(r: PlaceResult) {
  try {
    const label = r.label.split(',')[0].slice(0, 30);
    const s = await api.savePlace({ label, address: r.label, lat: r.lat, lng: r.lng });
    saved.value = [...saved.value, s];
    toast('Saved');
  } catch (e) {
    showError(e);
  }
}
async function removeSaved(s: SavedPlace) {
  try {
    await api.deletePlace(s.id);
    saved.value = saved.value.filter((x) => x.id !== s.id);
  } catch (e) {
    showError(e);
  }
}
const head = (label: string) => label.split(',')[0];
const rest = (label: string) => label.split(',').slice(1, 4).join(',').trim();
</script>

<template>
  <ion-modal :is-open="open" :initial-breakpoint="undefined" @didDismiss="emit('close')">
    <ion-content>
      <div class="sheet">
        <header>
          <h2>{{ title }}</h2>
          <button class="x" type="button" aria-label="Close" @click="emit('close')"><ion-icon :icon="closeOutline" /></button>
        </header>

        <template v-if="mode === 'search'">
          <label class="search">
            <ion-icon :icon="searchOutline" />
            <input v-model="q" type="search" placeholder="Search a street, area or landmark" autocomplete="off" enterkeyhint="search" />
          </label>

          <div class="quick">
            <button type="button" :disabled="locating" @click="useMyLocation"><ion-icon :icon="locateOutline" />{{ locating ? 'Locating…' : 'My location' }}</button>
            <button type="button" @click="startMapMode"><ion-icon :icon="mapOutline" />Choose on map</button>
          </div>

          <p v-if="searching" class="hint">Searching…</p>
          <ul v-if="results.length" class="list">
            <li v-for="r in results" :key="`${r.lat},${r.lng}`">
              <button type="button" class="row" @click="choose({ address: r.label, lat: r.lat, lng: r.lng })">
                <strong>{{ head(r.label) }}</strong>
                <span>{{ rest(r.label) }}</span>
              </button>
              <button type="button" class="icon" :aria-label="savedKeys.has(`${r.lat.toFixed(5)},${r.lng.toFixed(5)}`) ? 'Saved' : 'Save place'" @click="toggleSave(r)">
                <ion-icon :icon="savedKeys.has(`${r.lat.toFixed(5)},${r.lng.toFixed(5)}`) ? star : starOutline" />
              </button>
            </li>
          </ul>
          <p v-else-if="q.trim().length >= 3 && !searching" class="hint">
            {{ noOnline ? 'Search is unavailable right now. Use “Choose on map” instead.' : 'No matches. Try a nearby landmark, or choose on the map.' }}
          </p>

          <template v-if="!q && saved.length">
            <h3>Saved places</h3>
            <ul class="list">
              <li v-for="s in saved" :key="s.id">
                <button type="button" class="row" @click="choose({ address: s.address, lat: s.lat, lng: s.lng })">
                  <strong>{{ s.label }}</strong>
                  <span>{{ s.address }}</span>
                </button>
                <button type="button" class="icon" aria-label="Remove saved place" @click="removeSaved(s)"><ion-icon :icon="trashOutline" /></button>
              </li>
            </ul>
          </template>
        </template>

        <template v-else>
          <div class="pickmap">
            <MapView :center="pin" :zoom="16" :fit="false" pick-mode :tile-url="cfg.config.map.tileUrl" :attribution="cfg.config.map.attribution" @moved="onMoved" />
          </div>
          <p class="addr">{{ resolving ? 'Finding the address…' : pinAddress || 'Move the map to place the pin' }}</p>
          <div class="actions">
            <button type="button" class="btn btn-line" @click="mode = 'search'">Back</button>
            <button type="button" class="btn btn-primary" :disabled="resolving" @click="confirmPin">Confirm place</button>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-modal>
</template>

<style scoped>
.sheet {
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 18px 24px;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  margin: 0;
  font: 700 var(--t-lg) var(--font-display);
}
h3 {
  margin: 22px 0 6px;
  font: 700 var(--t-sm) var(--font-display);
  color: var(--slate);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.x,
.icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 22px;
  display: grid;
  place-items: center;
}
.search {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 52px;
  border: 1.5px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  color: var(--slate);
}
.search:focus-within {
  border-color: var(--ink);
}
.search input {
  flex: 1;
  border: 0;
  outline: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 1rem;
  min-width: 0;
}
.quick {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.quick button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  border: 1.5px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  font: 600 var(--t-sm) var(--font-display);
}
.hint {
  color: var(--slate);
  font-size: var(--t-sm);
  margin: 16px 2px;
}
.list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.list li {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
  animation: pop-in 0.25s var(--ease) both;
}
.row {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: 0;
  background: none;
  padding: 12px 0;
  color: var(--ink);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row strong {
  font-family: var(--font-display);
}
.row span {
  font-size: var(--t-sm);
  color: var(--slate);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pickmap {
  margin: 14px -18px 0;
  height: 52vh;
}
.addr {
  margin: 14px 2px;
  font: 600 var(--t-md) var(--font-display);
  min-height: 2.6em;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: auto;
}
.actions .btn {
  flex: 1;
}
@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
</style>
