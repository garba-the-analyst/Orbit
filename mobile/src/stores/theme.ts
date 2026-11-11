import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'orbit.theme';
const COLORS = { light: '#F4F5F9', dark: '#0C0E24' } as const;

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Light, dark or follow-the-phone. The choice is saved on this device; the actual colours come from the
 * `[data-theme]` attribute on <html> (see theme/tokens.css), which index.html also sets before first paint.
 */
export const useTheme = defineStore('theme', () => {
  const pref = ref<ThemePref>(readPref());
  const systemDark = ref(false);
  const effective = computed<'light' | 'dark'>(() => (pref.value === 'system' ? (systemDark.value ? 'dark' : 'light') : pref.value));
  const isDark = computed(() => effective.value === 'dark');

  async function apply() {
    const mode = effective.value;
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.background = COLORS[mode];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[mode]);
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: mode === 'dark' ? Style.Dark : Style.Light });
        if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: COLORS[mode] });
      }
    } catch {
      /* the status bar is a nicety */
    }
  }

  function init() {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    systemDark.value = !!mq?.matches;
    mq?.addEventListener?.('change', (e) => {
      systemDark.value = e.matches;
      apply();
    });
    apply();
  }

  function set(next: ThemePref) {
    pref.value = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: lasts until reload */
    }
    apply();
  }

  return { pref, effective, isDark, init, set };
});
