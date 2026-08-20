import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Login from './Login';

describe('Login', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables submit until a password is entered', () => {
    render(<Login onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
  });

  it('calls onSuccess after a correct password', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<Login onSuccess={onSuccess} />);
    await user.type(screen.getByPlaceholderText('Password'), 'right-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ password: 'right-password' }) }),
    );
  });

  it('shows an error and does not call onSuccess on a wrong password', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<Login onSuccess={onSuccess} />);
    await user.type(screen.getByPlaceholderText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
