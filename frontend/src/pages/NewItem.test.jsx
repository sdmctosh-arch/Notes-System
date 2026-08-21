import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import NewItem from './NewItem';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { createItem: vi.fn() },
}));

function renderNewItem() {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<NewItem />} />
        <Route path="/items/:id" element={<div>Item detail page</div>} />
        <Route path="/" element={<div>Inbox page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewItem', () => {
  it('disables Save until there is body text', async () => {
    renderNewItem();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('What do you want to remember?'), 'Buy a new hose');
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('creates the item with the picked category and navigates to it', async () => {
    api.createItem.mockResolvedValueOnce({ queue_id: 'manual-20260821-000000-abcdef' });
    const user = userEvent.setup();

    renderNewItem();
    await user.click(screen.getByRole('button', { name: 'Recipe' }));
    await user.type(screen.getByPlaceholderText('Title (optional)'), 'Grandma\'s chili');
    await user.type(screen.getByPlaceholderText('What do you want to remember?'), '2 lbs beef, 1 can beans...');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.createItem).toHaveBeenCalledWith({
        category: 'recipe',
        title: "Grandma's chili",
        body: '2 lbs beef, 1 can beans...',
      }),
    );
    expect(await screen.findByText('Item detail page')).toBeInTheDocument();
  });

  it('sends a null title when left blank', async () => {
    api.createItem.mockResolvedValueOnce({ queue_id: 'manual-20260821-000000-abcdef' });
    const user = userEvent.setup();

    renderNewItem();
    await user.type(screen.getByPlaceholderText('What do you want to remember?'), 'A quick thought');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.createItem).toHaveBeenCalledWith({ category: 'idea', title: null, body: 'A quick thought' }),
    );
  });

  it('shows an error and stays on the page when creation fails', async () => {
    api.createItem.mockRejectedValueOnce(new Error('body: field required'));
    const user = userEvent.setup();

    renderNewItem();
    await user.type(screen.getByPlaceholderText('What do you want to remember?'), 'Something');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('body: field required')).toBeInTheDocument();
  });
});
