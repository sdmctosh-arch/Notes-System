import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Inbox from './Inbox';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { listItems: vi.fn() },
}));

function item(overrides) {
  return {
    queue_id: 'a',
    category: 'lookup',
    title: 'Pier 66 laundry',
    body: 'Lookup if Pier 66 has laundry.',
    captured: '2026-08-11T13:30:10-04:00',
    enrichment: null,
    ...overrides,
  };
}

describe('Inbox', () => {
  it('renders items returned by the API, newest first', async () => {
    api.listItems.mockResolvedValueOnce([
      item({ queue_id: 'older', title: 'Older item', captured: '2026-08-10T10:00:00-04:00' }),
      item({ queue_id: 'newer', title: 'Newer item', captured: '2026-08-12T10:00:00-04:00' }),
    ]);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('Newer item');
    const titles = screen.getAllByText(/item$/).map((el) => el.textContent);
    expect(titles).toEqual(['Newer item', 'Older item']);
  });

  it('filters by category chip', async () => {
    api.listItems.mockResolvedValueOnce([
      item({ queue_id: 'a', category: 'lookup', title: 'A lookup' }),
      item({ queue_id: 'b', category: 'recipe', title: 'A recipe' }),
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('A lookup');
    expect(screen.getByText('A recipe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Recipe' }));

    expect(screen.queryByText('A lookup')).not.toBeInTheDocument();
    expect(screen.getByText('A recipe')).toBeInTheDocument();
  });

  it('shows the empty state when there are no items', async () => {
    api.listItems.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });

  it('shows the login form on a 401', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    api.listItems.mockRejectedValueOnce(err);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByPlaceholderText('Password')).toBeInTheDocument());
  });
});
