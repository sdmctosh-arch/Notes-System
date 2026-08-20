import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import VaultNote from './VaultNote';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { getVaultNote: vi.fn() },
}));

function renderNote() {
  return render(
    <MemoryRouter initialEntries={['/vault/Recipes/arroz.md']}>
      <Routes>
        <Route path="/vault/:folder/:filename" element={<VaultNote />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VaultNote', () => {
  it('strips YAML frontmatter and renders the body as Markdown', async () => {
    api.getVaultNote.mockResolvedValueOnce({
      folder: 'Recipes',
      filename: 'arroz.md',
      content: '---\ntitle: "Arroz con Gandules"\ncategory: recipe\n---\n\n## Ingredients\n\n- Rice\n',
    });

    renderNote();

    await screen.findByText('Ingredients');
    expect(screen.getByText('Rice')).toBeInTheDocument();
    expect(screen.queryByText(/title:/)).not.toBeInTheDocument();
    expect(screen.queryByText('---')).not.toBeInTheDocument();
  });

  it('fetches using the folder and filename from the URL', async () => {
    api.getVaultNote.mockResolvedValueOnce({ folder: 'Recipes', filename: 'arroz.md', content: 'Body.' });
    renderNote();
    await screen.findByText('Body.');
    expect(api.getVaultNote).toHaveBeenCalledWith('Recipes', 'arroz.md');
  });

  it('shows the login form on a 401', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    api.getVaultNote.mockRejectedValueOnce(err);

    renderNote();

    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
  });
});
