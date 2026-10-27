import { prisma } from '../../src/db';

export { prisma };

/** Empties the Lead table and resets ids back to 1001 (GL-1001). */
export async function truncateLeads() {
  await prisma.$executeRawUnsafe('TRUNCATE "Lead" RESTART IDENTITY CASCADE');
}
