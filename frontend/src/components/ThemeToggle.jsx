import { setTheme } from '../theme';
import { useDarkMode } from '../theme-hook';

export default function ThemeToggle() {
  const dark = useDarkMode();
  return (
    <button
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
    >
      {dark ? (
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="4" />
          <line x1="10" y1="1.5" x2="10" y2="3.5" />
          <line x1="10" y1="16.5" x2="10" y2="18.5" />
          <line x1="1.5" y1="10" x2="3.5" y2="10" />
          <line x1="16.5" y1="10" x2="18.5" y2="10" />
          <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" />
          <line x1="14.4" y1="14.4" x2="15.8" y2="15.8" />
          <line x1="14.4" y1="5.6" x2="15.8" y2="4.2" />
          <line x1="4.2" y1="15.8" x2="5.6" y2="14.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 11.5 A7 7 0 1 1 8.5 3 A5.5 5.5 0 0 0 17 11.5 Z" />
        </svg>
      )}
    </button>
  );
}
