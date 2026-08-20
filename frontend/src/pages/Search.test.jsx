import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Search from './Search';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { search: vi.fn() },
}));

describe('Search', () => {
  it('does not call the API until a query is typed', () => {
    render(
      <MemoryRouter>
        <Search />
      </MemoryRouter>,
    );
    expect(api.search).not.toHaveBeenCalled();
  });

  it('searches (debounced) and renders both item and vault_note results', async () => {
    api.search.mockResolvedValueOnce([
      {
        kind: 'item',
        title: 'Pier 66 laundry',
        snippet: 'Lookup if Pier 66 has laundry.',
        queue_id: 'a',
        location: 'inbox',
        category: 'lookup',
      },
      {
        kind: 'vault_note',
        title: 'Arroz con Gandules',
        snippet: 'Uses 2 cups of rice.',
        folder: 'Recipes',
        filename: 'arroz.md',
      },
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Search />
      </MemoryRouter>,
    );
    await user.type(screen.getByPlaceholderText('Search inbox, archive, and vault'), 'Pier 66');

    await waitFor(() => expect(api.search).toHaveBeenCalledWith('Pier 66'));
    expect(await screen.findByText('Pier 66 laundry')).toBeInTheDocument();
    expect(screen.getByText('Arroz con Gandules')).toBeInTheDocument();

    const itemLink = screen.getByText('Pier 66 laundry').closest('a');
    expect(itemLink).toHaveAttribute('href', '/items/a');
    const vaultLink = screen.getByText('Arroz con Gandules').closest('a');
    expect(vaultLink).toHaveAttribute('href', '/vault/Recipes/arroz.md');
  });

  it('shows a no-matches message for an empty result set', async () => {
    api.search.mockResolvedValueOnce([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Search />
      </MemoryRouter>,
    );
    await user.type(screen.getByPlaceholderText('Search inbox, archive, and vault'), 'nothing matches this');

    expect(await screen.findByText(/No matches for/)).toBeInTheDocument();
  });
});
