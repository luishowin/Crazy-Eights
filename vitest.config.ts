import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: the engine tests run as plain TS in Node
// and need none of the app's Vite plugins (React / PWA).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
