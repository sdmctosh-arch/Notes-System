import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Archive from './Archive';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { listArchive: vi.fn() },
}));

function item(overrides) {
  return {
    queue_id: 'a',
    category: 'lookup',
    title: 'An archived item',
    body: 'Body text.',
    captured: '2026-08-11T13:30:10-04:00',
    status: 'archived',
    enrichment: null,
    ...overrides,
  };
}

describe('Archive', () => {
  it('renders archived items with their status label', async () => {
    api.listArchive.mockResolvedValueOnce([
      item({ queue_id: 'a', title: 'Was archived', status: 'archived' }),
      item({ queue_id: 'b', title: 'Was kept', status: 'filed' }),
      item({ queue_id: 'c', title: 'Was dismissed', status: 'dismissed' }),
    ]);

    render(
      <MemoryRouter>
        <Archive />
      </MemoryRouter>,
    );

    await screen.findByText('Was archived');
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Kept')).toBeInTheDocument();
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
  });

  it('filters by the search field across title, body, and summary', async () => {
    api.listArchive.mockResolvedValueOnce([
      item({ queue_id: 'a', title: 'Laundry question', body: 'about Pier 66' }),
      item({ queue_id: 'b', title: 'Something else entirely', body: 'unrelated' }),
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Archive />
      </MemoryRouter>,
    );

    await screen.findByText('Laundry question');
    await user.type(screen.getByPlaceholderText('Search archived items'), 'pier 66');

    expect(screen.getByText('Laundry question')).toBeInTheDocument();
    expect(screen.queryByText('Something else entirely')).not.toBeInTheDocument();
  });

  it('shows the login form on a 401', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    api.listArchive.mockRejectedValueOnce(err);

    render(
      <MemoryRouter>
        <Archive />
      </MemoryRouter>,
    );

    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
  });
});
