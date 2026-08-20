import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Vault from './Vault';
import { api } from '../api';

vi.mock('../api', () => ({
  api: { getVault: vi.fn() },
}));

describe('Vault', () => {
  it('renders notes grouped by folder', async () => {
    api.getVault.mockResolvedValueOnce({
      Recipes: [{ filename: 'arroz.md', title: 'Arroz con Gandules', captured: '2026-08-11T13:30:10-04:00' }],
      Projects: [{ filename: 'homelab.md', title: 'Homelab notes', captured: null }],
    });

    render(
      <MemoryRouter>
        <Vault />
      </MemoryRouter>,
    );

    await screen.findByText('Arroz con Gandules');
    expect(screen.getByText('Homelab notes')).toBeInTheDocument();
    expect(screen.getByText(/Recipes/)).toBeInTheDocument();
    expect(screen.getByText(/Projects/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing has been kept yet', async () => {
    api.getVault.mockResolvedValueOnce({});

    render(
      <MemoryRouter>
        <Vault />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nothing kept in the vault yet.')).toBeInTheDocument();
  });

  it('shows the login form on a 401', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    api.getVault.mockRejectedValueOnce(err);

    render(
      <MemoryRouter>
        <Vault />
      </MemoryRouter>,
    );

    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
  });
});
