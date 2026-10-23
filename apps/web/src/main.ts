import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { setUnauthorizedHandler } from './api/client';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import './styles/global.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

const auth = useAuthStore();
setUnauthorizedHandler((message) => {
  const expired = message.toLowerCase().includes('expired');
  auth.clearSession();
  const current = router.currentRoute.value;
  if (current.matched.some((record) => record.meta.public)) {
    return;
  }
  void router.push({
    name: 'login',
    query: expired ? { error: 'session_expired' } : { redirect: current.fullPath || '/' },
  });
});

async function start(): Promise<void> {
  await auth.restore();
  await router.isReady();
  app.mount('#app');
}

void start();
