import { PrismaClient } from '@prisma/client';
import { seedPlans } from './plans';

const prisma = new PrismaClient();

try {
  const count = await seedPlans(prisma);
  console.log(`[seed] upserted ${count} loan schemes`);
} finally {
  await prisma.$disconnect();
}
