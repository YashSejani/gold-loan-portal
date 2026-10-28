import type { LeadDto, LeadRequestInput, QuoteDto, QuoteRequest, SchemeDto } from '@goldloan/shared';
import { apiFetch } from './client';

export async function postQuote(body: QuoteRequest, signal?: AbortSignal): Promise<QuoteDto> {
  const response = await apiFetch<{ data: QuoteDto }>('/quotes', { method: 'POST', body, signal });
  return response.data;
}

export async function postLead(body: LeadRequestInput): Promise<LeadDto> {
  const response = await apiFetch<{ data: LeadDto }>('/leads', { method: 'POST', body });
  return response.data;
}

export async function getLoanSchemes(signal?: AbortSignal): Promise<SchemeDto[]> {
  const response = await apiFetch<{ data: SchemeDto[] }>('/loan-schemes', { signal });
  return response.data;
}

export async function getLeads(planId: string | null, signal?: AbortSignal) {
  const query = planId ? `?planId=${encodeURIComponent(planId)}` : '';
  return apiFetch<{ data: LeadDto[]; meta: { total: number } }>(`/leads${query}`, { signal });
}
