// Demo applications for showing the admin page (newest first, plan filter, pagination later).
// Created through leadService.create (the same path as the form), so every number is a real server quote,
// then back-dated. Idempotent: does nothing if the demo mobiles already exist.
// Usage: npm run db:seed-demo   (dev database from .env)
import type { Channel } from '@goldloan/shared';
import { prisma } from '../src/db';
import * as leadService from '../src/services/leadService';

interface DemoLead {
  fullName: string;
  mobileNumber: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: 18 | 22 | 24;
  planId: 'PLAN_EMI_01' | 'PLAN_BULLET_01';
  channel: Channel;
  daysAgo: number;
}

export const DEMO_LEADS: DemoLead[] = [
  { fullName: 'Priya Sharma', mobileNumber: '9811000101', grossWeightGrams: 32.5, netWeightGrams: 30.2, karat: 22, planId: 'PLAN_EMI_01', channel: 'FORM', daysAgo: 29 },
  { fullName: 'Arjun Mehta', mobileNumber: '9811000102', grossWeightGrams: 15, netWeightGrams: 14.25, karat: 18, planId: 'PLAN_BULLET_01', channel: 'FORM', daysAgo: 27 },
  { fullName: 'Lakshmi Iyer', mobileNumber: '9811000103', grossWeightGrams: 80, netWeightGrams: 74.5, karat: 22, planId: 'PLAN_EMI_01', channel: 'AGENT', daysAgo: 25 },
  { fullName: 'Mohammed Irfan', mobileNumber: '9811000104', grossWeightGrams: 10.75, netWeightGrams: 10.1, karat: 24, planId: 'PLAN_EMI_01', channel: 'FORM', daysAgo: 22 },
  { fullName: 'Sunita Devi', mobileNumber: '9811000105', grossWeightGrams: 48, netWeightGrams: 45.6, karat: 22, planId: 'PLAN_BULLET_01', channel: 'AGENT', daysAgo: 20 },
  { fullName: 'Rahul Verma', mobileNumber: '9811000106', grossWeightGrams: 25.4, netWeightGrams: 22.85, karat: 18, planId: 'PLAN_EMI_01', channel: 'FORM', daysAgo: 18 },
  { fullName: 'Kavya Reddy', mobileNumber: '9811000107', grossWeightGrams: 60, netWeightGrams: 58.2, karat: 24, planId: 'PLAN_BULLET_01', channel: 'FORM', daysAgo: 16 },
  { fullName: 'Harpreet Singh', mobileNumber: '9811000108', grossWeightGrams: 120, netWeightGrams: 112.75, karat: 22, planId: 'PLAN_EMI_01', channel: 'AGENT', daysAgo: 13 },
  { fullName: 'Anjali Nair', mobileNumber: '9811000109', grossWeightGrams: 8.5, netWeightGrams: 8, karat: 22, planId: 'PLAN_EMI_01', channel: 'FORM', daysAgo: 11 },
  { fullName: 'Vikram Patel', mobileNumber: '9811000110', grossWeightGrams: 40, netWeightGrams: 36.4, karat: 18, planId: 'PLAN_BULLET_01', channel: 'FORM', daysAgo: 9 },
  { fullName: 'Fatima Khan', mobileNumber: '9811000111', grossWeightGrams: 22, netWeightGrams: 21.35, karat: 22, planId: 'PLAN_EMI_01', channel: 'AGENT', daysAgo: 7.5 },
  { fullName: 'Suresh Kumar', mobileNumber: '9811000112', grossWeightGrams: 55.25, netWeightGrams: 50.5, karat: 22, planId: 'PLAN_BULLET_01', channel: 'FORM', daysAgo: 5 },
  { fullName: 'Deepa Joshi', mobileNumber: '9811000113', grossWeightGrams: 18, netWeightGrams: 17.2, karat: 24, planId: 'PLAN_EMI_01', channel: 'FORM', daysAgo: 3 },
  { fullName: 'Rohan Das', mobileNumber: '9811000114', grossWeightGrams: 70, netWeightGrams: 63.8, karat: 18, planId: 'PLAN_EMI_01', channel: 'AGENT', daysAgo: 2 },
  { fullName: 'Meera Pillai', mobileNumber: '9811000115', grossWeightGrams: 35, netWeightGrams: 33.15, karat: 22, planId: 'PLAN_BULLET_01', channel: 'FORM', daysAgo: 1 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

try {
  const existing = await prisma.lead.count({ where: { mobileNumber: { in: DEMO_LEADS.map((l) => l.mobileNumber) } } });
  if (existing > 0) {
    console.log(`[seed-demo] demo applications already present (${existing}); nothing to do`);
  } else {
    // Oldest first, so application ids increase with the submission date.
    for (const { daysAgo, channel, ...input } of [...DEMO_LEADS].sort((a, b) => b.daysAgo - a.daysAgo)) {
      const lead = await leadService.create(input, { channel });
      await prisma.lead.update({ where: { applicationId: lead.applicationId }, data: { createdAt: new Date(Date.now() - daysAgo * DAY_MS) } });
    }
    console.log(`[seed-demo] created ${DEMO_LEADS.length} demo applications`);
  }
  const [total, last] = await Promise.all([prisma.lead.count(), prisma.lead.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })]);
  console.log(`[seed-demo] ${total} applications in total; the next one will be GL-${(last?.id ?? 1000) + 1}`);
} finally {
  await prisma.$disconnect();
}
