import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/endpoints';
import { watchPosition, metresBetween, type Fix } from '../lib/geo';
import { showError, toast } from '../lib/ui';
import { useAuth } from './auth';

/**
 * A driver's availability and live position. While online, the phone's GPS is followed and the position is sent
 * to the server (at most every 5 seconds, or sooner after moving 25 m). Customers see it on their map; the server
 * uses it to offer nearby trips. Going offline, or signing out, stops all of it.
 */
export const useDriver = defineStore('driver', () => {
  const online = ref(false);
  const pos = ref<Fix | null>(null);
  const gpsDenied = ref(false);
  const switching = ref(false);
  let stopWatch: (() => void) | null = null;
  let lastSent = { t: 0, lat: 0, lng: 0 };

  async function send(f: Fix) {
    const now = Date.now();
    const moved = lastSent.t ? metresBetween(f, lastSent) : Infinity;
    if (now - lastSent.t < 5000 && moved < 25) return;
    lastSent = { t: now, lat: f.lat, lng: f.lng };
    try {
      await api.sendLocation(f.lat, f.lng, f.heading ?? undefined);
    } catch {
      /* the next fix retries */
    }
  }

  async function startTracking() {
    stopWatch?.();
    gpsDenied.value = false;
    stopWatch = await watchPosition(
      (f) => {
        pos.value = f;
        send(f);
      },
      () => (gpsDenied.value = true),
    );
  }
  function stopTracking() {
    stopWatch?.();
    stopWatch = null;
    lastSent = { t: 0, lat: 0, lng: 0 };
  }

  /** Called when the app opens or the account refreshes: carry on if the server says we are online. */
  function sync() {
    const u = useAuth().user;
    online.value = !!u?.online && u.role === 'RIDER';
    if (online.value && !stopWatch) startTracking();
    if (!online.value) stopTracking();
  }

  async function setOnline(next: boolean) {
    switching.value = true;
    try {
      if (next) await startTracking();
      await api.rider.setOnline(next);
      online.value = next;
      if (!next) stopTracking();
      await useAuth().refresh().catch(() => undefined);
      toast(next ? 'You are online. Requests will appear here.' : 'You are offline.');
    } catch (e) {
      if (next) stopTracking();
      online.value = !next;
      await showError(e);
    } finally {
      switching.value = false;
    }
  }

  function reset() {
    stopTracking();
    online.value = false;
    pos.value = null;
  }

  return { online, pos, gpsDenied, switching, sync, setOnline, reset };
});
