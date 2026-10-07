import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('../core/src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'] },
});
