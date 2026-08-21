import { Link } from 'react-router-dom';
import { api } from '../api';
import { setTheme } from '../theme';
import { useDarkMode } from '../theme-hook';
import { InboxGlyph, ListsGlyph, VaultGlyph, ArchiveGlyph, MoonGlyph, LogoutGlyph } from './navIcons';

function NavRow({ to, label, icon, active, count }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm"
      style={{
        background: active ? 'var(--color-sel)' : 'transparent',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontWeight: active ? 600 : 500,
      }}
    >
      {icon}
      <span>{label}</span>
      {count != null && (
        <span className="ml-auto font-mono text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {count}
        </span>
      )}
    </Link>
  );
}

export default function Drawer({ open, onClose, pendingCount, onLoggedOut }) {
  const dark = useDarkMode();

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity"
        style={{
          background: 'oklch(0.22 0.015 60 / 0.32)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <div
        className="fixed top-0 left-0 bottom-0 w-[270px] z-50 flex flex-col p-4 pt-6 transition-transform duration-300"
        style={{
          background: 'var(--color-card-bg)',
          borderRight: '1px solid var(--color-border)',
          boxShadow: '6px 0 24px oklch(0.4 0.02 60 / 0.1)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <div className="flex items-center justify-between px-1.5 pb-4">
          <div className="font-serif font-semibold text-[17px]" style={{ color: 'var(--color-text-primary)' }}>
            Notes
          </div>
          <button
            aria-label="Close menu"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          <NavRow
            to="/"
            label="Inbox"
            active
            count={pendingCount}
            icon={<InboxGlyph />}
          />
          <NavRow to="/lists" label="Lists" icon={<ListsGlyph />} />
          <NavRow to="/vault" label="Vault" icon={<VaultGlyph />} />
          <NavRow to="/archive" label="Archive" icon={<ArchiveGlyph />} />
        </div>

        <div className="h-px my-4" style={{ background: 'var(--color-border)' }} />

        <button
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left"
          style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}
        >
          <MoonGlyph />
          <span>Dark mode</span>
          <span
            className="ml-auto w-[38px] h-[22px] rounded-full flex items-center px-[3px]"
            style={{ background: 'var(--color-sel)', border: '1px solid var(--color-border)', justifyContent: dark ? 'flex-end' : 'flex-start' }}
          >
            <span className="w-4 h-4 rounded-full" style={{ background: dark ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
          </span>
        </button>

        <button
          onClick={() => api.logout().catch(() => {}).finally(onLoggedOut)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left"
          style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}
        >
          <LogoutGlyph />
          <span>Log out</span>
        </button>

        <div className="flex-grow" />
      </div>
    </>
  );
}
