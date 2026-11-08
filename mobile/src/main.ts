import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';
import { useAuth } from './stores/auth';
import { useAppConfig } from './stores/appConfig';

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

/** Restore the saved session and load public settings before the first screen, so there is no flash of the wrong page. */
async function start() {
  await Promise.all([useAuth(pinia).init(), useAppConfig(pinia).load()]);
  await router.isReady();
  app.mount('#app');
}

start();
