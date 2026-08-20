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
    chat: [],
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

  it('shows the original URL as a link even when citations came back empty', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        url: 'https://www.reddit.com/r/example/comments/abc123/some_thread/',
        enrichment: {
          kind: 'answer',
          summary: 'The lookup did not turn anything up.',
          detail: 'The page could not be retrieved.',
          citations: [],
        },
      }),
    );

    renderDetail();

    const link = await screen.findByText('Open original link');
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://www.reddit.com/r/example/comments/abc123/some_thread/',
    );
  });

  it('does not show an original-URL link when the item has no URL', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        url: null,
        enrichment: { kind: 'answer', summary: 'An answer.', detail: '', citations: [] },
      }),
    );

    renderDetail();

    await screen.findByText('An answer.');
    expect(screen.queryByText('Open original link')).not.toBeInTheDocument();
  });

  it('hides Edit and the action bar for an archived item, and links back to Archive', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ status: 'filed', enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );

    renderDetail();

    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByRole('button', { name: /edit item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep in vault' })).not.toBeInTheDocument();
    const backLink = screen.getByText(/Archive/, { selector: 'a' });
    expect(backLink).toHaveAttribute('href', '/archive');
    expect(screen.queryByPlaceholderText('Ask a follow-up…')).not.toBeInTheDocument();
  });

  it('shows the chat panel for an active (non-archived) item', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );

    renderDetail();

    await screen.findByText('Pier 66 laundry');
    expect(screen.getByPlaceholderText('Ask a follow-up…')).toBeInTheDocument();
  });

  const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

  it('shows a "New" label for an item captured within 24 hours, and none once it ages past a week', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        captured: hoursAgo(6),
        enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] },
      }),
    );
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });

  it('shows a "Stale" label for an item captured more than 7 days ago', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        captured: hoursAgo(24 * 10),
        enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] },
      }),
    );
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('does not show a "Stale" label on an archived item, even if captured long ago', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        status: 'filed',
        captured: hoursAgo(24 * 10),
        enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] },
      }),
    );
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });

  it('links to the original capture using capture_id, not queue_id', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );

    renderDetail();

    const link = await screen.findByText('View original capture');
    expect(link).toHaveAttribute('href', '/capture/2026-08-11-13-30-10-pm');
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
