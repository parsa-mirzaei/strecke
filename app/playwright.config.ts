import { defineConfig } from '@playwright/test';

/**
 * Layout checks on the stress fixture (round 3). Uses the locally installed Chrome (no browser download)
 * and a dev server on its own port. Run: npx playwright test
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: { channel: 'chrome', baseURL: 'http://localhost:5288/' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --port 5288 --strictPort',
    url: 'http://localhost:5288/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
