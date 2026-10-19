import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { openSource } from './data/source';
import { clearStore } from './data/idb';
import { CHANNEL, NS } from './ns';
import { loadDevice } from './state/device';
import { initUpdater, type RegistrationLike } from './state/update';
import { NewerDataError } from './storage/snapshot';
import { openAppStore } from './storage/store';
import { App } from './App';
import { NewerData } from './screens/NewerData';
import { setLocale, t } from './i18n';
import { applyAppearance, loadSettings } from './state/settings';

const sw = 'serviceWorker' in navigator && import.meta.env.PROD ? navigator.serviceWorker : null;
const updater = sw ? initUpdater(sw, () => location.reload()) : null;
const devQ = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
if (devQ?.has('update')) {
  // Design review only: show the "Update ready" row without a service worker.
  const w = { state: 'installed', postMessage() {}, addEventListener() {} };
  initUpdater({ controller: {}, addEventListener() {} }, () => {}).watch({ waiting: w, installing: null, active: w, addEventListener() {}, update: async () => undefined });
}

/**
 * At app start, before the first card: if a new build is waiting, take it now (one reload). Never later
 * by itself; during use the update waits for a tap (state/update.ts).
 */
async function updateAtStart(): Promise<boolean> {
  if (!sw || !updater) return false;
  const reg = await Promise.race([sw.getRegistration(), new Promise<undefined>((r) => setTimeout(() => r(undefined), 400))]).catch(() => undefined);
  if (!reg || !updater.applyAtStart(reg as unknown as RegistrationLike)) return false;
  // controllerchange reloads the page; if the waiting worker does not take over, start the app anyway.
  return new Promise((resolve) => setTimeout(() => resolve(false), 3000));
}

// Open straight into the first card, rendered from the device (IndexedDB); nothing waits on a network.
(async () => {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('reset')) {
    await clearStore();
    history.replaceState(null, '', location.pathname);
  }
  if (await updateAtStart()) return;
  if (devQ?.has('newer')) throw new NewerDataError(3, 2); // design review only: the version-guard screen
  const app = await openAppStore(NS);
  const [settings, device] = await Promise.all([loadSettings(app.kv), loadDevice(app.kv)]);
  const devLang = import.meta.env.DEV ? new URLSearchParams(location.search).get('lang') : null;
  setLocale(devLang === 'de' || devLang === 'en' ? devLang : settings.locale);
  applyAppearance(settings);
  const { adapter, source, tabs } = await openSource(app, settings);
  const snapshot = await adapter.load();
  render(<App adapter={adapter} app={app} snapshot={snapshot} settings={settings} device={device} source={source} tabs={tabs} />, document.getElementById('app')!);
})().catch((err) => {
  if (err instanceof NewerDataError) {
    // Data from a newer build: show why, offer Export, write nothing.
    const devLang = devQ?.get('lang');
    setLocale(devLang === 'de' || devLang === 'en' ? devLang : navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en');
    render(<NewerData stored={err.stored} known={err.known} />, document.getElementById('app')!);
    return;
  }
  console.error(err);
  document.getElementById('app')!.textContent = t('boot.failed');
});

if (sw && updater) {
  window.addEventListener('load', () => {
    sw.register('./sw.js').then(async (reg) => {
      updater.watch(reg as unknown as RegistrationLike);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updater.check(); });
      // Next channel only (the Stable worker ignores it): refill the offline shell if something deleted it.
      if (CHANNEL !== 'stable' && navigator.onLine) (reg.active ?? (await sw.ready).active)?.postMessage('heal');
    }).catch(() => {
      /* offline support is optional; the app still works online */
    });
  });
}
