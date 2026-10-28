import type { LeadDto, SchemeDto } from '@goldloan/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from '../src/pages/Admin';
import { CREATED_LEAD, json } from './helpers/api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SCHEMES: SchemeDto[] = [
  {
    id: 'PLAN_BULLET_01',
    name: 'Bullet Repayment',
    annualInterestRate: 12,
    tenureMonths: 12,
    maxLtv: 0.7,
    repaymentType: 'BULLET',
    description: 'Interest + principal at maturity',
  },
  {
    id: 'PLAN_EMI_01',
    name: 'Monthly EMI',
    annualInterestRate: 10.5,
    tenureMonths: 12,
    maxLtv: 0.75,
    repaymentType: 'EMI',
    description: 'Equal monthly instalments',
  },
];

const NEWER: LeadDto = { ...CREATED_LEAD, applicationId: 'GL-1002', fullName: 'Asha Rao', mobileNumber: '9123XXXX89', createdAt: '2026-10-28T06:30:00.000Z' };
const OLDER: LeadDto = {
  ...CREATED_LEAD,
  applicationId: 'GL-1001',
  fullName: 'Ravi Kumar',
  createdAt: '2026-10-02T20:00:00.000Z',
  planId: 'PLAN_BULLET_01',
  planName: 'Bullet Repayment',
  eligibleLoan: 202125,
  status: 'APPROVED',
};

type LeadsHandler = (url: URL) => Response | Promise<Response>;

function mockAdminApi(leads: LeadsHandler = () => json(200, { data: [NEWER, OLDER], meta: { total: 2 } })) {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname === '/api/v1/loan-schemes') return json(200, { data: SCHEMES });
    if (url.pathname === '/api/v1/leads') return leads(url);
    return json(404, { error: { code: 'ROUTE_NOT_FOUND', message: 'Not found', fields: [] } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const leadCalls = (fetchMock: ReturnType<typeof mockAdminApi>) =>
  fetchMock.mock.calls.map(([u]) => new URL(u, 'http://localhost')).filter((u) => u.pathname === '/api/v1/leads');

function renderAdmin(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('Admin leads page', () => {
  it('renders a table in API order with formatted columns', async () => {
    mockAdminApi();
    renderAdmin();
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Application ID',
      'Name',
      'Mobile',
      'Net weight',
      'Karat',
      'Plan',
      'Loan',
      'Status',
      'Submitted',
    ]);

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['GL-1002', 'GL-1001']);
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'GL-1001',
      'Ravi Kumar',
      '9876XXXX10',
      '45 g',
      '22K',
      'Bullet Repayment',
      '₹2,02,125',
      'Approved',
      '3 Oct 2026, 1:30 am',
    ]);
    expect(screen.getByText('2 applications')).toBeInTheDocument();
  });

  it('also renders each lead as a card (shown below 768 px)', async () => {
    mockAdminApi();
    renderAdmin();
    const cards = await screen.findByRole('list', { name: 'Applications' });
    const items = within(cards).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('GL-1002')).toBeInTheDocument();
    expect(within(items[0]!).getByText('₹2,16,562')).toBeInTheDocument();
    expect(within(items[0]!).getByText('9123XXXX89')).toBeInTheDocument();
  });

  it('never shows an unmasked mobile, even if the API sent one', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAdminApi(() => json(200, { data: [{ ...NEWER, mobileNumber: '9876543210' }], meta: { total: 1 } }));
    renderAdmin();
    await screen.findByRole('table');
    expect(document.body.textContent).not.toContain('9876543210');
    expect(screen.getAllByText('9876XXXX10').length).toBeGreaterThan(0);
    expect(consoleError).toHaveBeenCalled();
  });

  it('filters by plan through ?planId, with options from /loan-schemes', async () => {
    const fetchMock = mockAdminApi((url) => {
      const planId = url.searchParams.get('planId');
      const data = [NEWER, OLDER].filter((l) => !planId || l.planId === planId);
      return json(200, { data, meta: { total: data.length } });
    });
    renderAdmin();
    await screen.findByRole('table');

    const select = screen.getByLabelText('Plan') as HTMLSelectElement;
    await screen.findByRole('option', { name: 'Monthly EMI' });
    expect([...select.options].map((o) => o.textContent)).toEqual(['All plans', 'Bullet Repayment', 'Monthly EMI']);
    expect(select.value).toBe('');

    fireEvent.change(select, { target: { value: 'PLAN_EMI_01' } });
    expect(await screen.findByText('1 application')).toBeInTheDocument();
    expect(leadCalls(fetchMock).at(-1)!.searchParams.get('planId')).toBe('PLAN_EMI_01');

    fireEvent.change(select, { target: { value: '' } });
    expect(await screen.findByText('2 applications')).toBeInTheDocument();
    expect(leadCalls(fetchMock).at(-1)!.searchParams.has('planId')).toBe(false);
  });

  it('reads the initial filter from the page URL', async () => {
    const fetchMock = mockAdminApi();
    renderAdmin('/admin?planId=PLAN_BULLET_01');
    await screen.findByRole('table');
    expect(leadCalls(fetchMock)[0]!.searchParams.get('planId')).toBe('PLAN_BULLET_01');
  });

  it('shows a loading state, then the empty state', async () => {
    let release: (r: Response) => void = () => {};
    mockAdminApi(() => new Promise<Response>((resolve) => (release = resolve)));
    renderAdmin();
    expect(screen.getByRole('status')).toHaveTextContent('Loading applications…');
    await act(async () => release(json(200, { data: [], meta: { total: 0 } })));
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows an error with a retry, and Refresh fetches again', async () => {
    let fail = true;
    const fetchMock = mockAdminApi(() =>
      fail
        ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', fields: [] } })
        : json(200, { data: [NEWER], meta: { total: 1 } }),
    );
    renderAdmin();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('1 application')).toBeInTheDocument();

    const before = leadCalls(fetchMock).length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('1 application');
    expect(leadCalls(fetchMock).length).toBe(before + 1);
  });
});
