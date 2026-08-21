import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UnarchiveBar from './UnarchiveBar';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { unarchiveItem: vi.fn() },
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

describe('UnarchiveBar', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it('unarchives the item and navigates to the Inbox', async () => {
    api.unarchiveItem.mockResolvedValueOnce({});
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UnarchiveBar queueId="abc123" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Unarchive' }));

    expect(api.unarchiveItem).toHaveBeenCalledWith('abc123');
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });

  it('shows an error and does not navigate when it fails', async () => {
    api.unarchiveItem.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <UnarchiveBar queueId="abc123" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Unarchive' }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
