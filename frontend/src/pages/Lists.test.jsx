import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Lists from './Lists';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { listItems: vi.fn(), moveItem: vi.fn() },
}));

function item(overrides) {
  return {
    queue_id: 'a',
    category: 'grocery',
    title: 'Milk',
    body: null,
    captured: '2026-08-11T13:30:10-04:00',
    status: 'pending',
    enrichment: null,
    ...overrides,
  };
}

describe('Lists', () => {
  it('defaults to the grocery tab and fetches it', async () => {
    api.listItems.mockResolvedValueOnce([item({ title: 'Milk' })]);

    render(
      <MemoryRouter>
        <Lists />
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.listItems).toHaveBeenCalledWith({ category: 'grocery' }));
    expect(await screen.findByText('Milk')).toBeInTheDocument();
  });

  it('checking an item off calls dismiss and removes it from the list', async () => {
    api.listItems.mockResolvedValueOnce([item({ queue_id: 'a', title: 'Milk' })]);
    api.moveItem.mockResolvedValueOnce({});
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Lists />
      </MemoryRouter>,
    );

    await screen.findByText('Milk');
    await user.click(screen.getByRole('checkbox', { name: /mark "milk" done/i }));

    expect(api.moveItem).toHaveBeenCalledWith('a', 'dismiss');
    await waitFor(() => expect(screen.queryByText('Milk')).not.toBeInTheDocument());
  });

  it('switches tabs and fetches the new category', async () => {
    api.listItems.mockResolvedValueOnce([item({ title: 'Milk' })]);
    api.listItems.mockResolvedValueOnce([
      item({ queue_id: 'b', category: 'todo', title: 'Call the vet' }),
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Lists />
      </MemoryRouter>,
    );

    await screen.findByText('Milk');
    await user.click(screen.getByRole('button', { name: 'Todo' }));

    await waitFor(() => expect(api.listItems).toHaveBeenCalledWith({ category: 'todo' }));
    expect(await screen.findByText('Call the vet')).toBeInTheDocument();
  });

  it('shows the login form on a 401', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    api.listItems.mockRejectedValueOnce(err);

    render(
      <MemoryRouter>
        <Lists />
      </MemoryRouter>,
    );

    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
  });
});
