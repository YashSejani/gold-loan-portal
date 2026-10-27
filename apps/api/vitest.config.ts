import { defineConfig } from 'vitest/config';
import { loadTestDatabaseUrl } from './test/helpers/testEnv.ts';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/helpers/globalSetup.ts'],
    // src/db.ts reads DATABASE_URL, so point it at the test database.
    env: { DATABASE_URL: loadTestDatabaseUrl(), NODE_ENV: 'test' },
    // API test files share one database: run them one at a time.
    fileParallelism: false,
  },
});
