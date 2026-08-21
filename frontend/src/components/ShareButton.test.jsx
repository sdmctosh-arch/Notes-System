import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ShareButton from './ShareButton';

const item = {
  title: 'Pier 66 laundry',
  body: 'Lookup if Pier 66 has laundry.',
  enrichment: { summary: 'Yes, Pier 66 has a guest laundry facility.' },
  url: 'https://example.org/pier66',
};

function stubShare(impl) {
  Object.defineProperty(window.navigator, 'share', { value: impl, configurable: true });
}

function stubClipboard(writeText) {
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  delete window.navigator.share;
  delete window.navigator.clipboard;
});

describe('ShareButton', () => {
  it('calls navigator.share with title/text/url when available', async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValueOnce(undefined);
    stubShare(share);

    render(<ShareButton item={item} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(share).toHaveBeenCalledWith({
      title: 'Pier 66 laundry',
      text: 'Yes, Pier 66 has a guest laundry facility.',
      url: 'https://example.org/pier66',
    });
  });

  it('does nothing further when the user cancels the share sheet', async () => {
    const user = userEvent.setup();
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    stubShare(vi.fn().mockRejectedValueOnce(abortError));
    const writeText = vi.fn();
    stubClipboard(writeText);

    render(<ShareButton item={item} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument());
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when navigator.share is unavailable', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValueOnce(undefined);
    stubClipboard(writeText);

    render(<ShareButton item={item} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'Pier 66 laundry\n\nYes, Pier 66 has a guest laundry facility.\n\nhttps://example.org/pier66',
      ),
    );
    expect(await screen.findByRole('button', { name: 'Copied to clipboard' })).toBeInTheDocument();
  });

  it('falls back to the clipboard when navigator.share rejects with a real error', async () => {
    const user = userEvent.setup();
    stubShare(vi.fn().mockRejectedValueOnce(new Error('share target crashed')));
    const writeText = vi.fn().mockResolvedValueOnce(undefined);
    stubClipboard(writeText);

    render(<ShareButton item={item} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });
});
