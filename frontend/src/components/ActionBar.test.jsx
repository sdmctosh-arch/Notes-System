import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ActionBar from './ActionBar';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { moveItem: vi.fn() },
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

describe('ActionBar', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it.each([
    ['Keep in vault', 'keep'],
    ['Archive', 'archive'],
    ['Dismiss', 'dismiss'],
  ])('%s calls moveItem with action "%s" and navigates home', async (label, action) => {
    api.moveItem.mockResolvedValueOnce({});
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActionBar queueId="abc123" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: label }));

    expect(api.moveItem).toHaveBeenCalledWith('abc123', action);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });

  it('shows an error and does not navigate when the move fails', async () => {
    api.moveItem.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ActionBar queueId="abc123" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
