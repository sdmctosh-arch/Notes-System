import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import ItemDetail from './ItemDetail';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { getItem: vi.fn(), updateItem: vi.fn() },
}));

function baseItem(overrides) {
  return {
    queue_id: 'abc123',
    capture_id: '2026-08-11-13-30-10-pm',
    category: 'lookup',
    title: 'Pier 66 laundry',
    body: 'Lookup if Pier 66 has laundry.',
    captured: '2026-08-11T13:30:10-04:00',
    status: 'enriched',
    enrichment: null,
    ...overrides,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/items/abc123']}>
      <Routes>
        <Route path="/items/:id" element={<ItemDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ItemDetail', () => {
  it('renders an answer (lookup) item with its question, summary, and citations', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        enrichment: {
          kind: 'answer',
          summary: 'Pier 66 has laundry.',
          detail: 'Pier 66 in Fort Lauderdale offers guest laundry.',
          citations: [{ title: 'Pier 66 site', url: 'https://example.org/a' }],
        },
      }),
    );

    renderDetail();

    expect(await screen.findByText('Pier 66 has laundry.')).toBeInTheDocument();
    expect(screen.getByText('Lookup if Pier 66 has laundry.')).toBeInTheDocument(); // the "Q." line
    expect(screen.getByText('Pier 66 site')).toBeInTheDocument();
  });

  it('renders a recipe item with ingredients and steps', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        category: 'recipe',
        title: 'Arroz con Gandules',
        enrichment: {
          kind: 'recipe',
          summary: '',
          detail: '',
          citations: [],
          structured: {
            recipeIngredient: ['2 cups rice', '1 can gandules'],
            recipeInstructions: ['Saute sofrito', 'Add rice and beans'],
          },
        },
      }),
    );

    renderDetail();

    expect(await screen.findByText('2 cups rice')).toBeInTheDocument();
    expect(screen.getByText('Saute sofrito')).toBeInTheDocument();
  });

  it('renders a media_info item with year and type', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        category: 'media',
        enrichment: {
          kind: 'media_info',
          summary: 'A sci-fi film.',
          detail: '',
          citations: [],
          structured: { year: 1982, media_type: 'movie' },
        },
      }),
    );

    renderDetail();

    expect(await screen.findByText('A sci-fi film.')).toBeInTheDocument();
    expect(screen.getByText('1982')).toBeInTheDocument();
    expect(screen.getByText('movie')).toBeInTheDocument();
  });

  it('shows the enrich_failed note when enrichment is missing', async () => {
    api.getItem.mockResolvedValueOnce(baseItem({ status: 'enrich_failed', enrichment: null }));

    renderDetail();

    expect(await screen.findByText("Enrichment didn't complete for this item.")).toBeInTheDocument();
    expect(screen.getByText('Lookup if Pier 66 has laundry.')).toBeInTheDocument();
  });

  it('shows the login form on a 401', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    api.getItem.mockRejectedValueOnce(err);

    renderDetail();

    await waitFor(() => expect(screen.getByPlaceholderText('Password')).toBeInTheDocument());
  });

  it('lets the user edit category/title/body and saves via the API', async () => {
    api.getItem.mockResolvedValueOnce(baseItem({}));
    api.updateItem.mockResolvedValueOnce(
      baseItem({ category: 'todo', title: 'New title', body: 'New body' }),
    );
    const user = userEvent.setup();

    renderDetail();
    await screen.findByText('Pier 66 laundry');

    await user.click(screen.getByRole('button', { name: /edit item/i }));
    const titleInput = await screen.findByPlaceholderText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'New title');
    await user.click(screen.getByRole('button', { name: 'Todo' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.updateItem).toHaveBeenCalledWith('abc123', {
        category: 'todo',
        title: 'New title',
        body: 'Lookup if Pier 66 has laundry.',
      }),
    );
    expect(await screen.findByText('New title')).toBeInTheDocument();
  });
});
