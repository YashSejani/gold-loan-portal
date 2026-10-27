import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../../../../', import.meta.url));

/** Loads the repo-root .env (if any) and returns the test database URL. */
export function loadTestDatabaseUrl(): string {
  const envFile = `${rootDir}.env`;
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error('DATABASE_URL_TEST is not set (copy .env.example to .env)');
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_TEST must differ from DATABASE_URL: tests truncate tables');
  }
  return testUrl;
}
