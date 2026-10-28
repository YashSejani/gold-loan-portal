import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // Some UI tests wait on the real 300 ms quote debounce; on a busy machine running all files in parallel
    // the default 5 s per-test limit was too tight. No assertion changes, only the time allowed.
    testTimeout: 15_000,
  },
});
