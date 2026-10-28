import type { LeadDto, QuoteDto, QuoteRequest } from '@goldloan/shared';
import { vi } from 'vitest';

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The CLAUDE.md §6 quote, echoing whatever input was sent (numbers are the server's, not ours). */
export function quoteFor(input: QuoteRequest): QuoteDto {
  return {
    input,
    rate24kPerGram: 7000,
    pureGoldGrams: 41.25,
    goldValueRupees: 288750,
    goldValuePaise: 28875000,
    plans: [
      {
        planId: 'PLAN_BULLET_01',
        planName: 'Bullet Repayment',
        appliedLtv: 0.7,
        eligibleLoan: 202125,
        annualInterestRate: 12,
        tenureMonths: 12,
        repaymentType: 'BULLET',
      },
      {
        planId: 'PLAN_EMI_01',
        planName: 'Monthly EMI',
        appliedLtv: 0.75,
        eligibleLoan: 216562,
        annualInterestRate: 10.5,
        tenureMonths: 12,
        repaymentType: 'EMI',
      },
    ],
  };
}

export const CREATED_LEAD: LeadDto = {
  applicationId: 'GL-1001',
  status: 'SUBMITTED',
  createdAt: '2026-10-28T06:30:00.000Z',
  fullName: 'Ravi Kumar',
  mobileNumber: '9876XXXX10',
  netWeightGrams: 45,
  grossWeightGrams: 50,
  karat: 22,
  planId: 'PLAN_EMI_01',
  planName: 'Monthly EMI',
  pureGoldGrams: 41.25,
  goldValueRupees: 288750,
  appliedLtv: 0.75,
  eligibleLoan: 216562,
};

type Handler = (body: unknown) => Response | Promise<Response>;

/** Stubs global fetch and routes POST /quotes and POST /leads to handlers. */
export function mockApi({ lead }: { lead?: Handler } = {}) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (url.endsWith('/quotes')) return json(200, { data: quoteFor(body) });
    if (url.endsWith('/leads') && lead) return lead(body);
    return json(404, { error: { code: 'ROUTE_NOT_FOUND', message: 'Not found', fields: [] } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function callsTo(fetchMock: ReturnType<typeof mockApi>, path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));
}
