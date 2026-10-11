import { render } from 'preact';
import './styles/fonts.css';
import './styles/app.css';
import { App } from './App';
import { boot } from './state/boot';
import { demoContent } from './state/content';
import { applySettings, watchSystemTheme } from './state/settings';

boot().then((b) => {
  applySettings(b.settings);
  watchSystemTheme();
  const root = document.getElementById('app')!;
  root.textContent = '';
  render(<App boot={b} content={demoContent()} />, root);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the app still works online */
    });
  });
}
