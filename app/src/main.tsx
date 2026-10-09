import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { openSource } from './data/source';
import { openStore } from './data/idb';
import { App } from './App';
import { applyAppearance, loadSettings } from './state/settings';

// Open straight into the first card, rendered from the device (IndexedDB); nothing waits on a network.
(async () => {
  const store = await openStore();
  const [adapter, settings] = await Promise.all([openSource(store), loadSettings(store)]);
  applyAppearance(settings);
  const snapshot = await adapter.load();
  render(<App adapter={adapter} store={store} snapshot={snapshot} settings={settings} />, document.getElementById('app')!);
})().catch((err) => {
  console.error(err);
  document.getElementById('app')!.textContent = 'Strecke konnte nicht starten. Bitte neu laden.';
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the app still works online */
    });
  });
}
