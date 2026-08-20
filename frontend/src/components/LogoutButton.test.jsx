import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import LogoutButton from './LogoutButton';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { logout: vi.fn() },
}));

describe('LogoutButton', () => {
  it('calls api.logout and then onLoggedOut', async () => {
    api.logout.mockResolvedValueOnce({ ok: true });
    const onLoggedOut = vi.fn();
    const user = userEvent.setup();

    render(<LogoutButton onLoggedOut={onLoggedOut} />);
    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(api.logout).toHaveBeenCalled();
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
  });

  it('still calls onLoggedOut if the logout request fails', async () => {
    api.logout.mockRejectedValueOnce(new Error('network error'));
    const onLoggedOut = vi.fn();
    const user = userEvent.setup();

    render(<LogoutButton onLoggedOut={onLoggedOut} />);
    await user.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
  });
});
