import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import ItemDetail from './ItemDetail';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    getItem: vi.fn(),
    updateItem: vi.fn(),
    setPinned: vi.fn(),
    requestReenrich: vi.fn(),
    unarchiveItem: vi.fn(),
  },
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
    pinned: false,
    manual: false,
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
    expect(screen.queryByRole('button', { name: 'Re-enrich' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('shows Share for an active item too', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it.each(['archived', 'dismissed'])('shows Unarchive for a %s item, not the active-item action bar', async (status) => {
    api.getItem.mockResolvedValueOnce(baseItem({ status, enrichment: null }));
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep in vault' })).not.toBeInTheDocument();
  });

  it('does not show Unarchive for an active (pending) item', async () => {
    api.getItem.mockResolvedValueOnce(baseItem({ status: 'enriched' }));
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument();
  });

  it('shows the Re-enrich button for an enrichable category, not for a task category', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.getByRole('button', { name: 'Re-enrich' })).toBeInTheDocument();
  });

  it('hides Re-enrich for a task category (todo)', async () => {
    api.getItem.mockResolvedValueOnce(baseItem({ category: 'todo', enrichment: null }));
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByRole('button', { name: 'Re-enrich' })).not.toBeInTheDocument();
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

  it('pins an item and shows the filled pin once it reloads', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );
    api.setPinned.mockResolvedValueOnce(
      baseItem({ pinned: true, enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );
    const user = userEvent.setup();

    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByLabelText('Pinned')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pin' }));

    expect(api.setPinned).toHaveBeenCalledWith('abc123', true);
    await waitFor(() => expect(screen.getByLabelText('Pinned')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Unpin' })).toBeInTheDocument();
  });

  it('does not show the pin toggle on an archived item, but still shows the pin mark if pinned', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        status: 'filed',
        pinned: true,
        enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] },
      }),
    );

    renderDetail();

    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByRole('button', { name: /^(pin|unpin)$/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pinned')).toBeInTheDocument();
  });

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

  it('hides "View original capture" for a manually-added note', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ manual: true, enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );
    renderDetail();
    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByText('View original capture')).not.toBeInTheDocument();
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

  it('shows a backdrop hero placeholder for a media item, and hides the category badge', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        category: 'media',
        title: 'Dune: Part Two',
        enrichment: {
          kind: 'media_info',
          summary: 'A sci-fi film.',
          detail: '',
          citations: [],
          structured: { year: 2024, media_type: 'movie' },
        },
      }),
    );

    renderDetail();

    await screen.findByText('Dune: Part Two');
    expect(screen.getByText('BACKDROP · 16:9')).toBeInTheDocument();
    expect(screen.getByText('TITLE LOGO')).toBeInTheDocument();
    expect(screen.getByText('movie · 2024')).toBeInTheDocument();
  });

  it('shows a dish figure placeholder inline for a recipe item, and hides the category badge', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        category: 'recipe',
        title: 'Arroz con Gandules',
        enrichment: {
          kind: 'recipe',
          summary: '',
          detail: '',
          citations: [],
          structured: { recipeIngredient: ['2 cups rice'], recipeInstructions: ['Saute sofrito'] },
        },
      }),
    );

    renderDetail();

    await screen.findByText('Arroz con Gandules');
    expect(screen.getByText('DISH · 4:3')).toBeInTheDocument();
    expect(screen.queryByText('BACKDROP · 16:9')).not.toBeInTheDocument();
  });

  it('shows a real backdrop image instead of the hero placeholder when TMDB found one', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        category: 'media',
        title: 'Dune: Part Two',
        enrichment: {
          kind: 'media_info',
          summary: 'A sci-fi film.',
          detail: '',
          citations: [],
          structured: {
            year: 2024,
            media_type: 'movie',
            image: 'https://image.tmdb.org/t/p/w500/poster.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
          },
        },
      }),
    );

    renderDetail();

    await screen.findByText('Dune: Part Two');
    expect(screen.queryByText('BACKDROP · 16:9')).not.toBeInTheDocument();
    expect(screen.queryByText('TITLE LOGO')).not.toBeInTheDocument();
    expect(screen.getByText('movie · 2024')).toBeInTheDocument();
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
  });

  it('falls back to the hero placeholder when the backdrop image fails to load', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({
        category: 'media',
        title: 'Dune: Part Two',
        enrichment: {
          kind: 'media_info',
          summary: 'A sci-fi film.',
          detail: '',
          citations: [],
          structured: { year: 2024, media_type: 'movie', backdrop: 'https://image.tmdb.org/t/p/w1280/broken.jpg' },
        },
      }),
    );

    renderDetail();

    const img = await screen.findByAltText('');
    fireEvent.error(img);
    expect(screen.getByText('BACKDROP · 16:9')).toBeInTheDocument();
    expect(screen.getByText('TITLE LOGO')).toBeInTheDocument();
  });

  it('shows a real dish image instead of the figure placeholder when enrichment found one', async () => {
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
            recipeIngredient: ['2 cups rice'],
            recipeInstructions: ['Saute sofrito'],
            image: 'https://example.com/gandules.jpg',
          },
        },
      }),
    );

    renderDetail();

    await screen.findByText('Arroz con Gandules');
    expect(screen.queryByText('DISH · 4:3')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Arroz con Gandules' })).toHaveAttribute('src', 'https://example.com/gandules.jpg');
  });

  it('shows the ordinary category badge for a category with no art (e.g. lookup)', async () => {
    api.getItem.mockResolvedValueOnce(
      baseItem({ enrichment: { kind: 'answer', summary: 'x', detail: '', citations: [] } }),
    );

    renderDetail();

    await screen.findByText('Pier 66 laundry');
    expect(screen.queryByText('BACKDROP · 16:9')).not.toBeInTheDocument();
    expect(screen.queryByText('DISH · 4:3')).not.toBeInTheDocument();
    expect(screen.getByText('Lookup')).toBeInTheDocument();
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
