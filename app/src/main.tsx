import { render } from 'preact';
import '@fontsource/fira-sans/latin-400.css';
import '@fontsource/fira-sans/latin-500.css';
import './styles/fonts.css';
import './styles/app.css';
import { App } from './App';
import { MockAdapter } from './data/adapter';
import { applyTheme, getTheme, watchSystemTheme } from './ui/theme';

applyTheme(getTheme());
watchSystemTheme();

// Prototype: local synthetic data only. A Core adapter replaces this after the security gate.
const adapter = new MockAdapter();

adapter.load().then((snapshot) => {
  const root = document.getElementById('app')!;
  root.textContent = '';
  render(<App adapter={adapter} snapshot={snapshot} />, root);
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional; the app still works online */
    });
  });
}
