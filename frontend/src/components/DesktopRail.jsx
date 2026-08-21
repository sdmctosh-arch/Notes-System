import { Link } from 'react-router-dom';
import { api } from '../api';
import { setTheme } from '../theme';
import { useDarkMode } from '../theme-hook';
import { PlusGlyph, InboxGlyph, SearchGlyph, ListsGlyph, VaultGlyph, ArchiveGlyph, MoonGlyph, LogoutGlyph } from './navIcons';

function RailButton({ to, onClick, label, active, children }) {
  const style = {
    background: active ? 'var(--color-sel)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
  };
  const className = 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0';
  if (onClick) {
    return (
      <button type="button" aria-label={label} onClick={onClick} className={className} style={style}>
        {children}
      </button>
    );
  }
  return (
    <Link to={to} aria-label={label} className={className} style={style}>
      {children}
    </Link>
  );
}

// The desktop counterpart to Drawer.jsx (mobile) - a persistent icon rail
// alongside the Inbox two-pane layout, per design 1b. Only rendered at the
// lg breakpoint (see useIsDesktop), so it never competes with the drawer.
export default function DesktopRail({ onLoggedOut }) {
  const dark = useDarkMode();

  return (
    <div
      className="w-[74px] shrink-0 flex flex-col items-center py-5 gap-2.5"
      style={{ borderRight: '1px solid var(--color-border)', background: 'var(--color-card-bg)' }}
    >
      <Link
        to="/new"
        aria-label="New note"
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
      >
        <PlusGlyph />
      </Link>
      <RailButton to="/" label="Inbox" active>
        <InboxGlyph />
      </RailButton>
      <RailButton to="/search" label="Search">
        <SearchGlyph />
      </RailButton>
      <RailButton to="/lists" label="Lists">
        <ListsGlyph />
      </RailButton>
      <RailButton to="/vault" label="Vault">
        <VaultGlyph />
      </RailButton>
      <RailButton to="/archive" label="Archive">
        <ArchiveGlyph />
      </RailButton>
      <div className="grow" />
      <RailButton label="Toggle dark mode" onClick={() => setTheme(dark ? 'light' : 'dark')}>
        <MoonGlyph />
      </RailButton>
      <RailButton label="Log out" onClick={() => api.logout().catch(() => {}).finally(onLoggedOut)}>
        <LogoutGlyph />
      </RailButton>
    </div>
  );
}
