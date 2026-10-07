import { render } from 'preact';
import './styles/fonts.css';
import './styles/station.css';
import { openSource } from './data/source';
import { Practice } from './station/Practice';

// Open straight into the first card, rendered from the device (IndexedDB); nothing waits on a network.
openSource()
  .then(async (adapter) => {
    const snapshot = await adapter.load();
    render(<Practice adapter={adapter} snapshot={snapshot} />, document.getElementById('app')!);
  })
  .catch((err) => {
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
