import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApplyPage } from '../src/pages/Apply';

afterEach(cleanup);

const NET_GT_GROSS = 'Net weight cannot be more than gross weight';
const BAD_MOBILE = 'Enter a valid 10-digit Indian mobile number starting with 6–9';

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

function fillValid() {
  type('Full name', 'Ravi Kumar');
  type('Mobile number', '9876543210');
  type('Gross weight', '50');
  type('Net weight', '45');
  fireEvent.click(screen.getByRole('radio', { name: '22K' }));
}

/** The text of the element(s) an input points at via aria-describedby. */
function describedText(input: HTMLElement) {
  return (input.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

const nextButton = () => screen.getByRole('button', { name: 'Next' });

describe('Apply step 1 (Details)', () => {
  it('marks step 1 as the current step', () => {
    render(<ApplyPage />);
    expect(screen.getByText('Details').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Quote').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('enables Next only when every field is valid', () => {
    render(<ApplyPage />);
    expect(nextButton()).toBeDisabled();
    fillValid();
    expect(nextButton()).toBeEnabled();
  });

  it('keeps Next disabled with an invalid mobile number', () => {
    render(<ApplyPage />);
    fillValid();
    type('Mobile number', '5876543210');
    expect(nextButton()).toBeDisabled();
  });

  it('shows net > gross under the net weight field, not under gross', () => {
    render(<ApplyPage />);
    type('Gross weight', '50');
    type('Net weight', '52');
    fireEvent.blur(field('Net weight'));

    expect(field('Net weight')).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(field('Net weight'))).toContain(NET_GT_GROSS);
    expect(field('Gross weight')).not.toHaveAttribute('aria-invalid', 'true');
    expect(describedText(field('Gross weight'))).not.toContain(NET_GT_GROSS);
  });

  it('shows an error only after the first blur, then updates live while typing', () => {
    render(<ApplyPage />);
    type('Mobile number', '98765');
    expect(screen.queryByText(BAD_MOBILE)).toBeNull();

    fireEvent.blur(field('Mobile number'));
    expect(screen.getByText(BAD_MOBILE)).toBeInTheDocument();
    expect(field('Mobile number')).toHaveAttribute('aria-invalid', 'true');

    type('Mobile number', '9876543210');
    expect(screen.queryByText(BAD_MOBILE)).toBeNull();
    expect(field('Mobile number')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('strips spaces and non-digits from the mobile number as you type', () => {
    render(<ApplyPage />);
    type('Mobile number', '98765 43-210');
    expect(field('Mobile number').value).toBe('9876543210');
  });

  it('mobile input has the right mobile keyboard attributes', () => {
    render(<ApplyPage />);
    const mobile = field('Mobile number');
    expect(mobile).toHaveAttribute('inputmode', 'numeric');
    expect(mobile).toHaveAttribute('autocomplete', 'tel');
    expect(mobile).toHaveAttribute('maxlength', '10');
    expect(field('Gross weight')).toHaveAttribute('inputmode', 'decimal');
    expect(field('Net weight')).toHaveAttribute('inputmode', 'decimal');
  });

  it('keeps weights to digits and a single decimal point', () => {
    render(<ApplyPage />);
    type('Gross weight', '12.3a4.5');
    expect(field('Gross weight').value).toBe('12.345');
  });

  it('rejects more than 3 decimals using the shared schema', () => {
    render(<ApplyPage />);
    type('Gross weight', '1.2345');
    fireEvent.blur(field('Gross weight'));
    expect(describedText(field('Gross weight'))).toContain('Weight can have at most 3 decimal places');
  });

  it('karat is a radio group with 18K, 22K and 24K', () => {
    render(<ApplyPage />);
    const group = screen.getByRole('group', { name: /karat/i });
    expect(group).toBeInTheDocument();
    for (const k of ['18K', '22K', '24K']) expect(screen.getByRole('radio', { name: k })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '24K' }));
    expect(screen.getByRole('radio', { name: '24K' })).toBeChecked();
  });

  it('Next moves to step 2 and keeps the entered details', () => {
    render(<ApplyPage />);
    fillValid();
    fireEvent.click(nextButton());
    expect(screen.getByText('Quote').closest('li')).toHaveAttribute('aria-current', 'step');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(field('Full name').value).toBe('Ravi Kumar');
    expect(screen.getByRole('radio', { name: '22K' })).toBeChecked();
  });
});
