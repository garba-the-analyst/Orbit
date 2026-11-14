import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';
import { useAuth } from './stores/auth';
import { useAppConfig } from './stores/appConfig';
import { useBoot } from './stores/boot';
import { useTheme } from './stores/theme';
import { useDeviceTimezone } from './lib/format';
import { initErrorLogging } from './lib/error-logger';
import { api } from './api/endpoints';

/* Ionic core CSS (layout and structure only; ORBIT's look lives in /theme) */
import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Fonts (variable, latin subsets load on demand) */
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';

/* ORBIT theme */
import './theme/tokens.css';
import './theme/ionic-overrides.css';
import './theme/base.css';

const pinia = createPinia();
const app = createApp(App).use(IonicVue, { mode: 'md', rippleEffect: false, swipeBackEnabled: true }).use(pinia).use(router);

// Capture Vue rendering errors and send to backend
app.config.errorHandler = (err: unknown, _instance, _info) => {
  void (async () => {
    const auth = useAuth(pinia);
    const e = err as Error;
    try {
      await api.reportError({
        path: window.location.pathname,
        method: 'CLIENT',
        message: e?.message ?? String(err),
        stack: e?.stack,
        userAgent: navigator.userAgent,
        userId: auth.user?.id ?? null,
        role: auth.user?.role ?? null,
      });
    } catch {
      /* ignore */
    }
  })();
};

initErrorLogging();

useDeviceTimezone();
useTheme(pinia).init();

/**
 * The app mounts at once and shows the animated splash screen. Meanwhile the saved session and public settings
 * load; the splash stays for at least 1.5 s so its animation finishes, and leaves as soon as everything is ready.
 */
app.mount('#app');
const boot = useBoot(pinia);
const minimum = new Promise((r) => setTimeout(r, 1500));
Promise.all([useAuth(pinia).init(), useAppConfig(pinia).load(), minimum])
  .then(() => router.isReady())
  .finally(() => {
    boot.ready = true;
  });
