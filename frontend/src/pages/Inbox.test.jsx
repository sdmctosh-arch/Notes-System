import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Inbox from './Inbox';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    listItems: vi.fn(),
    logout: vi.fn().mockResolvedValue(),
    getItem: vi.fn(),
    moveItem: vi.fn(),
  },
}));

// Only the (min-width: 1024px) query (useIsDesktop) is meaningful here -
// everything else (e.g. the dark-mode query in theme.js) stays "no match"
// so this doesn't also flip the app into dark mode.
function mockDesktop(matches) {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: query.includes('1024px') ? matches : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return () => {
    window.matchMedia = original;
  };
}

function item(overrides) {
  return {
    queue_id: 'a',
    category: 'lookup',
    title: 'Pier 66 laundry',
    body: 'Lookup if Pier 66 has laundry.',
    captured: '2026-08-11T13:30:10-04:00',
    enrichment: null,
    pinned: false,
    status: 'enriched',
    chat: [],
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

  it('labels a recently captured item "New" and a week-old one "Stale"', async () => {
    const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
    api.listItems.mockResolvedValueOnce([
      item({ queue_id: 'fresh', title: 'Fresh item', captured: hoursAgo(6) }),
      item({ queue_id: 'old', title: 'Old item', captured: hoursAgo(24 * 10) }),
    ]);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('Fresh item');
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('shows the pin mark next to a pinned item, not next to an unpinned one', async () => {
    api.listItems.mockResolvedValueOnce([
      item({ queue_id: 'pinned-item', title: 'Pinned item', pinned: true }),
      item({ queue_id: 'plain', title: 'Plain item', pinned: false }),
    ]);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('Pinned item');
    expect(screen.getAllByLabelText('Pinned')).toHaveLength(1);
  });

  it('links the New note button to /new', async () => {
    api.listItems.mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );
    await screen.findByText("You're all caught up");
    expect(screen.getByLabelText('New note')).toHaveAttribute('href', '/new');
  });

  it('shows a time-of-day greeting and a new/total note count', async () => {
    api.listItems.mockResolvedValueOnce([
      item({ queue_id: 'fresh', title: 'Fresh item', captured: new Date().toISOString() }),
      item({ queue_id: 'old', title: 'Old item', captured: '2020-01-01T00:00:00-04:00' }),
    ]);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('Fresh item');
    expect(screen.getByRole('heading', { name: /Good morning|Good afternoon|Good evening/ })).toBeInTheDocument();
    expect(screen.getByText('You have 1 new note and 2 total notes.')).toBeInTheDocument();
  });

  it('groups pinned items under "Pinned" above the rest under "To review"', async () => {
    api.listItems.mockResolvedValueOnce([
      item({ queue_id: 'plain', title: 'Plain item', pinned: false }),
      item({ queue_id: 'pinned-item', title: 'Pinned item', pinned: true }),
    ]);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('Plain item');
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('To review')).toBeInTheDocument();

    const titles = screen.getAllByText(/item$/).map((el) => el.textContent);
    expect(titles).toEqual(['Pinned item', 'Plain item']);
  });

  it('shows no section labels when nothing is pinned', async () => {
    api.listItems.mockResolvedValueOnce([item({ queue_id: 'plain', title: 'Plain item', pinned: false })]);

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('Plain item');
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument();
    expect(screen.queryByText('To review')).not.toBeInTheDocument();
  });

  it('opens the drawer from the hamburger button and closes it again', async () => {
    api.listItems.mockResolvedValueOnce([item({ queue_id: 'a', title: 'A lookup' })]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('A lookup');
    const closeButton = screen.getByLabelText('Close menu');
    const panel = closeButton.parentElement.parentElement;
    expect(panel.style.transform).toBe('translateX(-100%)');

    await user.click(screen.getByLabelText('Open menu'));
    expect(panel.style.transform).toBe('translateX(0)');
    expect(screen.getByRole('link', { name: /Inbox/ })).toBeInTheDocument();

    await user.click(closeButton);
    expect(panel.style.transform).toBe('translateX(-100%)');
  });

  it('desktop: shows a two-pane layout with a rail, list, and an empty right pane until a row is picked', async () => {
    const restore = mockDesktop(true);
    api.listItems.mockResolvedValueOnce([item({ queue_id: 'a', title: 'A lookup' })]);
    api.getItem.mockResolvedValueOnce(
      item({ queue_id: 'a', title: 'A lookup', enrichment: { kind: 'answer', summary: 'The answer.', detail: '', citations: [] } }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('A lookup');
    expect(screen.getByText('Select a note to preview it here.')).toBeInTheDocument();
    expect(screen.getByLabelText('Vault')).toBeInTheDocument();

    await user.click(screen.getByText('A lookup'));

    expect(await screen.findByText('The answer.')).toBeInTheDocument();
    expect(screen.queryByText('Select a note to preview it here.')).not.toBeInTheDocument();

    restore();
  });

  it('desktop: clears the selection and reloads the list once an item is actioned', async () => {
    const restore = mockDesktop(true);
    api.listItems
      .mockResolvedValueOnce([item({ queue_id: 'a', title: 'A lookup' })])
      .mockResolvedValueOnce([]);
    api.getItem.mockResolvedValueOnce(
      item({ queue_id: 'a', title: 'A lookup', enrichment: { kind: 'answer', summary: 'The answer.', detail: '', citations: [] } }),
    );
    api.moveItem.mockResolvedValueOnce({});
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>,
    );

    await screen.findByText('A lookup');
    const callsBeforeArchive = api.listItems.mock.calls.length;
    await user.click(screen.getByText('A lookup'));
    await screen.findByText('The answer.');

    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(api.moveItem).toHaveBeenCalledWith('a', 'archive'));
    await waitFor(() => expect(screen.getByText('Select a note to preview it here.')).toBeInTheDocument());
    expect(api.listItems.mock.calls.length).toBe(callsBeforeArchive + 1);

    restore();
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
