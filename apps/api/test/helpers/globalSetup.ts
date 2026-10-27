import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedPlans } from '../../prisma/plans';
import { loadTestDatabaseUrl } from './testEnv';

// Runs once before all API test files: migrate the test DB, then seed plans.
export default async function globalSetup() {
  const url = loadTestDatabaseUrl();

  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (err) {
    const output = (err as { stdout?: Buffer; stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`prisma migrate deploy failed on the test DB (is Postgres up? npm run db:up)\n${output}`);
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe('TRUNCATE "Lead" RESTART IDENTITY CASCADE');
    await seedPlans(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
