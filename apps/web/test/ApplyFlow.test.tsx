import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplyPage } from '../src/pages/Apply';
import { CREATED_LEAD, callsTo, json, mockApi } from './helpers/api';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const button = (name: string | RegExp) => screen.getByRole('button', { name });

/** Label of the step marked aria-current="step" in the progress nav, e.g. "Details". */
function currentStep() {
  const nav = screen.getByRole('navigation', { name: 'Application progress' });
  return nav.querySelector('[aria-current="step"]')?.textContent?.replace(/^Step \d+: \d+\. /, '');
}

function fillDetails() {
  type('Full name', 'Ravi Kumar');
  type('Mobile number', '9876543210');
  type('Gross weight', '50');
  type('Net weight', '45');
  fireEvent.click(screen.getByRole('radio', { name: '22K' }));
}

/** Step 1 → step 2 → wait for the quote → pick EMI → step 3. */
async function goToConfirm() {
  fillDetails();
  fireEvent.click(button('Next'));
  fireEvent.click(await screen.findByRole('radio', { name: /Monthly EMI/ }));
  fireEvent.click(button('Next'));
  await screen.findByRole('button', { name: 'Submit application' });
}

describe('Step 2 (live quote)', () => {
  it('debounces rapid typing into a single quote request', async () => {
    vi.useFakeTimers();
    const fetchMock = mockApi();
    render(<ApplyPage />);
    fillDetails();
    fireEvent.click(button('Next'));

    for (const net of ['4', '40', '44', '44.5']) {
      type('Net weight', net);
      await act(() => vi.advanceTimersByTimeAsync(100));
    }
    expect(callsTo(fetchMock, '/quotes')).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(300));
    const quoteCalls = callsTo(fetchMock, '/quotes');
    expect(quoteCalls).toHaveLength(1);
    expect(JSON.parse(String(quoteCalls[0]![1].body))).toEqual({
      netWeightGrams: 44.5,
      grossWeightGrams: 50,
      karat: 22,
    });
  });

  it('shows the server numbers and one card per plan; Next waits for a plan choice', async () => {
    mockApi();
    render(<ApplyPage />);
    fillDetails();
    fireEvent.click(button('Next'));

    const emi = await screen.findByRole('radio', { name: /Monthly EMI/ });
    expect(screen.getByText('41.25 g')).toBeInTheDocument();
    expect(screen.getByText('₹2,88,750')).toBeInTheDocument();
    expect(screen.getByText('₹7,000/g (24K)')).toBeInTheDocument();
    expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
    expect(screen.getByText('₹2,02,125')).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /Repayment|EMI/ })).toHaveLength(2);

    expect(button('Next')).toBeDisabled();
    fireEvent.click(emi);
    expect(emi).toBeChecked();
    expect(button('Next')).toBeEnabled();
  });
});

describe('Step 3 (confirm and submit)', () => {
  it('reviews inputs and server numbers, then shows the application id', async () => {
    let releaseLead: (r: Response) => void = () => {};
    const fetchMock = mockApi({ lead: () => new Promise<Response>((resolve) => (releaseLead = resolve)) });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<ApplyPage />);
    await goToConfirm();
    const review = screen.getByRole('region', { name: 'Review your application' });
    for (const text of ['Ravi Kumar', '9876543210', '50 g', '45 g', '22K', 'Monthly EMI', '₹2,16,562', '₹2,88,750']) {
      expect(within(review).getAllByText(text).length).toBeGreaterThan(0);
    }

    fireEvent.click(button('Submit application'));
    expect(button(/Submitting/)).toBeDisabled();
    fireEvent.click(button(/Submitting/));
    expect(callsTo(fetchMock, '/leads')).toHaveLength(1);
    expect(JSON.parse(String(callsTo(fetchMock, '/leads')[0]![1].body))).toEqual({
      fullName: 'Ravi Kumar',
      mobileNumber: '9876543210',
      grossWeightGrams: 50,
      netWeightGrams: 45,
      karat: 22,
      planId: 'PLAN_EMI_01',
      channel: 'FORM',
    });

    await act(async () => releaseLead(json(201, { data: CREATED_LEAD })));
    expect(await screen.findByText('GL-1001')).toBeInTheDocument();
    fireEvent.click(button(/Copy/));
    expect(writeText).toHaveBeenCalledWith('GL-1001');
    expect(await screen.findByText('Copied')).toBeInTheDocument();

    fireEvent.click(button('Start new application'));
    expect(field('Full name').value).toBe('');
  });

  it('409 → friendly "already applied" text with the date and id, never the raw code', async () => {
    mockApi({
      lead: () =>
        json(409, {
          error: {
            code: 'DUPLICATE_APPLICATION',
            message: 'An application from this mobile number was already submitted in the last 7 days.',
            fields: [{ field: 'mobileNumber', message: 'Already applied in the last 7 days' }],
            details: { existingApplicationId: 'GL-1042', existingSubmittedAt: '2026-10-03T06:00:00.000Z' },
          },
        }),
    });
    render(<ApplyPage />);
    await goToConfirm();
    fireEvent.click(button('Submit application'));

    expect(await screen.findByText('You already applied on 3 Oct, application GL-1042.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/409|DUPLICATE_APPLICATION/);

    fireEvent.click(button('Start a new application'));
    expect(field('Full name').value).toBe('');
  });

  it('400 → maps fields[] onto the inputs and jumps back to the owning step', async () => {
    mockApi({
      lead: () =>
        json(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Some fields are invalid',
            fields: [{ field: 'mobileNumber', message: 'Enter a valid 10-digit Indian mobile number starting with 6–9' }],
          },
        }),
    });
    render(<ApplyPage />);
    await goToConfirm();
    fireEvent.click(button('Submit application'));

    await waitFor(() => expect(field('Mobile number')).toHaveAttribute('aria-invalid', 'true'));
    expect(currentStep()).toBe('Details');
    expect(screen.getByText('Enter a valid 10-digit Indian mobile number starting with 6–9')).toBeInTheDocument();

    type('Mobile number', '9876543211'); // editing clears the server error
    expect(field('Mobile number')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('404 plan → back to step 2 with "pick another" and the plan unselected', async () => {
    mockApi({
      lead: () =>
        json(404, {
          error: {
            code: 'PLAN_NOT_FOUND',
            message: 'The selected loan plan is not available.',
            fields: [{ field: 'planId', message: 'This loan plan is not available' }],
          },
        }),
    });
    render(<ApplyPage />);
    await goToConfirm();
    fireEvent.click(button('Submit application'));

    expect(await screen.findByText('That plan is no longer available, please pick another.')).toBeInTheDocument();
    expect(currentStep()).toBe('Quote');
    await screen.findByRole('radio', { name: /Monthly EMI/ });
    for (const radio of screen.getAllByRole('radio', { name: /Repayment|EMI/ })) expect(radio).not.toBeChecked();
  });

  it('other failures (503, network) show the message and allow another try', async () => {
    mockApi({
      lead: () =>
        json(503, {
          error: { code: 'GOLD_RATE_UNAVAILABLE', message: 'The gold rate is unavailable right now.', fields: [] },
        }),
    });
    render(<ApplyPage />);
    await goToConfirm();
    fireEvent.click(button('Submit application'));

    expect(await screen.findByText('The gold rate is unavailable right now.')).toBeInTheDocument();
    expect(button('Submit application')).toBeEnabled();
  });

  it('Edit buttons go back to the owning steps', async () => {
    mockApi();
    render(<ApplyPage />);
    await goToConfirm();
    fireEvent.click(button('Edit your details'));
    expect(currentStep()).toBe('Details');
  });
});
