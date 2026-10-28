import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ApplyPage } from '../src/pages/Apply';
import { CREATED_LEAD, json, mockApi, quoteFor } from './helpers/api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });

function fillDetails() {
  type('Full name', 'Ravi Kumar');
  type('Mobile number', '9876543210');
  type('Gross weight', '50');
  type('Net weight', '45');
  fireEvent.click(screen.getByRole('radio', { name: '22K' }));
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

describe('focus management', () => {
  it('moves focus to the new step heading after Next, and to the confirmation after submit', async () => {
    mockApi({ lead: () => json(201, { data: CREATED_LEAD }) });
    render(<ApplyPage />);
    fillDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Your quote' })).toHaveFocus();

    fireEvent.click(await screen.findByRole('radio', { name: /Monthly EMI/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Review and submit' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByRole('heading', { name: 'Application submitted' })).toHaveFocus();
  });

  it('does not steal focus on first render', () => {
    mockApi();
    render(<ApplyPage />);
    expect(document.body).toHaveFocus();
  });
});

describe('announcements', () => {
  it('announces quote updates in a polite status region', async () => {
    mockApi();
    render(<ApplyPage />);
    fillDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByText('Quote updated. Pure gold 41.25 g, gold value ₹2,88,750.', { selector: '[role=status]' }),
    ).toBeInTheDocument();
  });

  it('field errors live in polite live regions referenced by the input', () => {
    render(<ApplyPage />);
    type('Mobile number', '98765');
    fireEvent.blur(field('Mobile number'));
    const errorId = field('Mobile number').getAttribute('aria-describedby')!.split(' ')[0]!;
    const region = document.getElementById(errorId)!;
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Enter a valid 10-digit Indian mobile number starting with 6–9');
  });

  it('Edit buttons have names that start with the visible text', async () => {
    mockApi();
    render(<ApplyPage />);
    fillDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Monthly EMI/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    for (const name of ['Edit your details', 'Edit jewellery', 'Edit plan']) {
      const button = screen.getByRole('button', { name });
      expect(name.startsWith(button.textContent!.trim())).toBe(true);
    }
  });
});

describe('page chrome', () => {
  it('has a skip link to the main content', () => {
    mockApi();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')?.tagName).toBe('MAIN');
  });

  it('shows an offline banner while offline', () => {
    mockApi();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/You are offline/)).toBeNull();
    setOnline(false);
    expect(screen.getByText(/You are offline\. What you have entered is kept/)).toBeInTheDocument();
    setOnline(true);
    expect(screen.queryByText(/You are offline/)).toBeNull();
  });
});

describe('quote states', () => {
  it('hides an out-of-date quote after a network error, then refreshes when back online', async () => {
    let failQuotes = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (failQuotes) throw new TypeError('Failed to fetch');
        return json(200, { data: quoteFor(JSON.parse(String(init.body))) });
      }),
    );
    render(<ApplyPage />);
    fillDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('radio', { name: /Monthly EMI/ });

    failQuotes = true;
    setOnline(false);
    type('Net weight', '44');
    expect(await screen.findByText('You are offline. Your quote will update when the connection is back.')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Monthly EMI/ })).toBeNull(); // no stale numbers on screen
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    failQuotes = false;
    setOnline(true);
    expect(await screen.findByRole('radio', { name: /Monthly EMI/ })).toBeInTheDocument();
  });
});
