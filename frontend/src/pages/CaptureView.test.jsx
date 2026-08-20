import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import CaptureView from './CaptureView';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { getCapture: vi.fn() },
}));

function renderCapture() {
  return render(
    <MemoryRouter initialEntries={['/capture/2026-08-11-13-30-10-pm']}>
      <Routes>
        <Route path="/capture/:captureId" element={<CaptureView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CaptureView', () => {
  it('strips frontmatter and renders the raw text, not as Markdown', async () => {
    api.getCapture.mockResolvedValueOnce({
      capture_id: '2026-08-11-13-30-10-pm',
      content: '---\nid: 2026-08-11-13-30-10-pm\n---\n\n# Not a heading, just what I said\n',
    });

    renderCapture();

    const body = await screen.findByText(/# Not a heading, just what I said/);
    expect(body.tagName).not.toBe('H1');
    expect(screen.queryByText(/^id:/)).not.toBeInTheDocument();
  });

  it('fetches using the capture_id from the URL', async () => {
    api.getCapture.mockResolvedValueOnce({ capture_id: '2026-08-11-13-30-10-pm', content: 'Body.' });
    renderCapture();
    await screen.findByText('Body.');
    expect(api.getCapture).toHaveBeenCalledWith('2026-08-11-13-30-10-pm');
  });

  it('shows the login form on a 401', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    api.getCapture.mockRejectedValueOnce(err);

    renderCapture();

    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
  });
});
