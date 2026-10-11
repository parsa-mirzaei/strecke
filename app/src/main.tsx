import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { openSource } from './data/source';
import { clearStore } from './data/idb';
import { NS } from './ns';
import { loadDevice } from './state/device';
import { openAppStore } from './storage/store';
import { App } from './App';
import { setLocale, t } from './i18n';
import { applyAppearance, loadSettings } from './state/settings';

// Open straight into the first card, rendered from the device (IndexedDB); nothing waits on a network.
(async () => {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('reset')) {
    await clearStore();
    history.replaceState(null, '', location.pathname);
  }
  const app = await openAppStore(NS);
  const [settings, device] = await Promise.all([loadSettings(app.kv), loadDevice(app.kv)]);
  const devLang = import.meta.env.DEV ? new URLSearchParams(location.search).get('lang') : null;
  setLocale(devLang === 'de' || devLang === 'en' ? devLang : settings.locale);
  applyAppearance(settings);
  const { adapter, source, tabs } = await openSource(app, settings);
  const snapshot = await adapter.load();
  render(<App adapter={adapter} app={app} snapshot={snapshot} settings={settings} device={device} source={source} tabs={tabs} />, document.getElementById('app')!);
})().catch((err) => {
  console.error(err);
  document.getElementById('app')!.textContent = t('boot.failed');
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the app still works online */
    });
  });
}
