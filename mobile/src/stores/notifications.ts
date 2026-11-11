import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/endpoints';
import type { NotificationView } from '../api/types';
import { useLive } from '../api/socket';

/** Unread count for the bell, the notifications list, and the banner that slides in when something new arrives. */
export const useNotifications = defineStore('notifications', () => {
  const unread = ref(0);
  const items = ref<NotificationView[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const banner = ref<NotificationView | null>(null);
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;

  async function refreshCount() {
    try {
      unread.value = (await api.notifications.unread()).count;
    } catch {
      /* the bell just keeps its last number */
    }
  }

  async function load(reset = true) {
    loading.value = true;
    try {
      const page = await api.notifications.list(30, reset ? 0 : items.value.length);
      items.value = reset ? page.items : [...items.value, ...page.items];
      total.value = page.total;
    } finally {
      loading.value = false;
    }
  }

  async function markRead(ids?: string[]) {
    await api.notifications.read(ids);
    const all = !ids;
    items.value = items.value.map((n) => (all || ids!.includes(n.id) ? { ...n, read: true } : n));
    await refreshCount();
  }

  async function clearAll() {
    await api.notifications.clear();
    items.value = [];
    total.value = 0;
    unread.value = 0;
  }

  function dismissBanner() {
    banner.value = null;
    clearTimeout(bannerTimer);
  }

  /** Called when the server says something new arrived: update the count and show the newest as a banner. */
  async function onIncoming() {
    await refreshCount();
    try {
      const page = await api.notifications.list(1, 0);
      const n = page.items[0];
      if (n && !n.read) {
        banner.value = n;
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => (banner.value = null), 5500);
        if (items.value.length) items.value = [n, ...items.value.filter((x) => x.id !== n.id)];
      }
    } catch {
      /* ignore */
    }
  }

  function reset() {
    unread.value = 0;
    items.value = [];
    banner.value = null;
  }

  /** Call once from the app shell. */
  function listen() {
    useLive(['notification.new'], onIncoming);
  }

  return { unread, items, total, loading, banner, refreshCount, load, markRead, clearAll, dismissBanner, onIncoming, reset, listen };
});
