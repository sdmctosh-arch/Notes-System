import DesktopRail from './DesktopRail';

// Desktop counterpart to the mobile `max-w-md mx-auto` page wrapper used by
// Search/Vault/Archive/Lists/NewItem - the persistent icon rail plus a
// scrollable content pane, so these views get the same desktop chrome as
// the Inbox (DesktopRail) instead of sitting in the narrow mobile column
// with no rail at all on a wide screen.
export default function DesktopPageShell({ onLoggedOut, children }) {
  return (
    <div className="h-dvh flex overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <DesktopRail onLoggedOut={onLoggedOut} />
      <div className="grow h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto flex flex-col">{children}</div>
      </div>
    </div>
  );
}
