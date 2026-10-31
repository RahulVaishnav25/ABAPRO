import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { PARENT_ACCESS_PENDING_MESSAGE } from '@abapro/shared';
import { setUnauthorizedHandler } from './api/client';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import { useBrandingStore } from './stores/branding';
import './styles/global.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

const auth = useAuthStore();
setUnauthorizedHandler((message) => {
  const expired = message.toLowerCase().includes('expired');
  // A parent whose last linked child was removed is signed out with this message.
  const parentPending = message === PARENT_ACCESS_PENDING_MESSAGE;
  auth.clearSession();
  const current = router.currentRoute.value;
  if (current.matched.some((record) => record.meta.public) && !parentPending) {
    return;
  }
  void router.push({
    name: 'login',
    query: parentPending ? { error: 'parent_pending' } : expired ? { error: 'session_expired' } : { redirect: current.fullPath || '/' },
  });
});

async function start(): Promise<void> {
  const branding = useBrandingStore();
  await Promise.all([auth.restore(), branding.initialize()]);
  await router.isReady();
  app.mount('#app');
}

void start();
