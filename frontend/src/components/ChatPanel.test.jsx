import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ChatPanel from './ChatPanel';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { sendChatMessage: vi.fn() },
}));

function item(overrides) {
  return { queue_id: 'a', chat: [], ...overrides };
}

describe('ChatPanel', () => {
  it('renders existing chat history', () => {
    render(
      <ChatPanel
        item={item({
          chat: [
            { role: 'user', text: 'Weekend hours?', at: '2026-08-19T10:00:00-04:00' },
            { role: 'model', text: 'Open until 8pm.', at: '2026-08-19T10:00:05-04:00' },
          ],
        })}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText('Weekend hours?')).toBeInTheDocument();
    expect(screen.getByText('Open until 8pm.')).toBeInTheDocument();
  });

  it('sends a message and calls onUpdate with the response', async () => {
    const updated = item({
      chat: [
        { role: 'user', text: 'Weekend hours?', at: 't1' },
        { role: 'model', text: 'Open until 8pm.', at: 't2' },
      ],
    });
    api.sendChatMessage.mockResolvedValueOnce(updated);
    const onUpdate = vi.fn();
    const user = userEvent.setup();

    render(<ChatPanel item={item()} onUpdate={onUpdate} />);

    await user.type(screen.getByPlaceholderText('Ask a follow-up…'), 'Weekend hours?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(api.sendChatMessage).toHaveBeenCalledWith('a', 'Weekend hours?'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(updated));
    expect(screen.getByPlaceholderText('Ask a follow-up…').value).toBe('');
  });

  it('does not send an empty or whitespace-only message', async () => {
    const user = userEvent.setup();
    render(<ChatPanel item={item()} onUpdate={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Ask a follow-up…'), '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows an error and keeps the draft text when the request fails', async () => {
    api.sendChatMessage.mockRejectedValueOnce(new Error('Chat failed: GEMINI_API_KEY is not set'));
    const user = userEvent.setup();

    render(<ChatPanel item={item()} onUpdate={vi.fn()} />);

    const input = screen.getByPlaceholderText('Ask a follow-up…');
    await user.type(input, 'Weekend hours?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Chat failed: GEMINI_API_KEY is not set')).toBeInTheDocument();
    expect(input.value).toBe('Weekend hours?');
  });
});
