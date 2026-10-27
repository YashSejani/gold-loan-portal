import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';

afterEach(cleanup);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  it('shows the Apply page at / with header nav', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /apply for a gold loan/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeTruthy();
  });

  it('shows the Admin page at /admin', () => {
    renderAt('/admin');
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeTruthy();
  });
});
