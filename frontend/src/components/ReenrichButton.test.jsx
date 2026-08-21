import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ReenrichButton from './ReenrichButton';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { requestReenrich: vi.fn() },
}));

describe('ReenrichButton', () => {
  it('requests re-enrichment and shows a confirmation', async () => {
    api.requestReenrich.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();

    render(<ReenrichButton queueId="abc123" />);
    await user.click(screen.getByRole('button', { name: 'Re-enrich' }));

    expect(api.requestReenrich).toHaveBeenCalledWith('abc123');
    expect(await screen.findByText(/Re-enrich requested/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-enrich' })).not.toBeInTheDocument();
  });

  it('shows an error and keeps the button when the request fails', async () => {
    api.requestReenrich.mockRejectedValueOnce(new Error('No item abc123'));
    const user = userEvent.setup();

    render(<ReenrichButton queueId="abc123" />);
    await user.click(screen.getByRole('button', { name: 'Re-enrich' }));

    expect(await screen.findByText('No item abc123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-enrich' })).toBeInTheDocument();
  });
});
