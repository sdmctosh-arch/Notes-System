import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import InboxRow from './InboxRow';

function item(overrides) {
  return {
    queue_id: 'a',
    category: 'lookup',
    title: 'Pier 66 laundry',
    body: 'Lookup if Pier 66 has laundry.',
    captured: '2026-08-11T13:30:10-04:00',
    enrichment: null,
    pinned: false,
    ...overrides,
  };
}

function renderRow(props) {
  return render(
    <MemoryRouter>
      <InboxRow {...props} />
    </MemoryRouter>,
  );
}

describe('InboxRow', () => {
  it('shows a poster placeholder for a media item instead of the category badge', () => {
    renderRow({ item: item({ category: 'media', title: 'Dune: Part Two' }) });
    expect(screen.getByText(/POSTER/)).toBeInTheDocument();
  });

  it('shows a dish placeholder for a recipe item instead of the category badge', () => {
    renderRow({ item: item({ category: 'recipe', title: "Grandma's chili" }) });
    expect(screen.getByText(/DISH/)).toBeInTheDocument();
  });

  it('does not show an art placeholder for a category with no art (e.g. lookup)', () => {
    renderRow({ item: item({ category: 'lookup' }) });
    expect(screen.queryByText(/POSTER/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DISH/)).not.toBeInTheDocument();
  });

  it('shows a real poster image instead of the placeholder when enrichment found one', () => {
    renderRow({
      item: item({
        category: 'media',
        title: 'Dune: Part Two',
        enrichment: { structured: { image: 'https://image.tmdb.org/t/p/w500/abc.jpg' } },
      }),
    });
    expect(screen.queryByText(/POSTER/)).not.toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'Dune: Part Two' });
    expect(img).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w500/abc.jpg');
  });

  it('falls back to the placeholder when the poster image fails to load', () => {
    renderRow({
      item: item({
        category: 'media',
        title: 'Dune: Part Two',
        enrichment: { structured: { image: 'https://image.tmdb.org/t/p/w500/broken.jpg' } },
      }),
    });
    const img = screen.getByRole('img', { name: 'Dune: Part Two' });
    fireEvent.error(img);
    expect(screen.getByText(/POSTER/)).toBeInTheDocument();
  });

  it('renders as a Link to the item by default, navigating on click', () => {
    renderRow({ item: item() });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/items/a');
  });

  it('renders as a button and calls onSelect instead of navigating when onSelect is passed', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderRow({ item: item(), onSelect });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(item());
  });
});
