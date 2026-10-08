import { render } from 'preact';
import './styles/fonts.css';
import './styles/station.css';
import './styles/style-1.css';
import './styles/style-2.css';
import './styles/style-3.css';
import { openSource } from './data/source';
import { applyStyle, dev, initialStyle, review, syncThemeColor } from './dev';
import { Practice } from './station/Practice';

if (dev.theme === 'light' || dev.theme === 'dark') document.documentElement.dataset.theme = dev.theme;
applyStyle(initialStyle());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);

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

if ('serviceWorker' in navigator && import.meta.env.PROD && !review) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the app still works online */
    });
  });
}
