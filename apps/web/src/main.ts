import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { PARENT_ACCESS_PENDING_MESSAGE } from '@abapro/shared';
import { setUnauthorizedHandler } from './api/client';
import { authConfigRequest } from './api/resources';
import { applyPreferences, i18n, routeTitle, setLanguage, startingLanguage } from './i18n';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import { useBrandingStore } from './stores/branding';
import './styles/global.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(i18n);

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
  // Before sign-in: the language last used here, the browser's, or the platform default.
  const platformDefault = await authConfigRequest().then((config) => config.defaultLanguage).catch(() => undefined);
  await setLanguage(startingLanguage(platformDefault));
  // The first route guard may already have restored the session.
  await Promise.all([auth.ready ? Promise.resolve() : auth.restore(), branding.initialize()]);
  if (auth.user?.preferences) await applyPreferences(auth.user.preferences);
  // Signed in: the user's resolved language, timezone and formats, applied again whenever they change.
  watch(
    () => auth.user?.preferences,
    (preferences) => {
      if (preferences) void applyPreferences(preferences);
    },
    { deep: true },
  );
  // The tab title follows the language too.
  watch(i18n.global.locale, () => {
    const title = routeTitle(router.currentRoute.value);
    document.title = title ? `${title} · ABAPro` : 'ABAPro';
  });
  await router.isReady();
  app.mount('#app');
}

void start();
