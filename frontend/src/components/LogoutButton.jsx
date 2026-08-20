import { api } from '../api';

export default function LogoutButton({ onLoggedOut }) {
  return (
    <button
      aria-label="Log out"
      onClick={() => api.logout().finally(onLoggedOut)}
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8" />
        <path d="M13 13.5 17 10l-4-3.5" />
        <line x1="17" y1="10" x2="7.5" y2="10" />
      </svg>
    </button>
  );
}
