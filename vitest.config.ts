import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['core/src/**'], reporter: ['text-summary', 'text'] },
  },
});
