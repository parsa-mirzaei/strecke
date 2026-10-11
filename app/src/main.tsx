import { render } from 'preact';
import './styles/fonts.css';
import './styles/app.css';
import { boot } from './state/boot';
import { loadSheetState, Root } from './state/Root';
import { applySettings, watchSystemTheme } from './state/settings';

boot().then(async (b) => {
  applySettings(b.settings);
  watchSystemTheme();
  const initial = await loadSheetState(b);
  const root = document.getElementById('app')!;
  root.textContent = '';
  render(<Root boot={b} initial={initial} />, root);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the app still works online */
    });
  });
}
