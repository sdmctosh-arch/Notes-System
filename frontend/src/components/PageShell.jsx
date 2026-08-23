import Login from './Login';
import DesktopPageShell from './DesktopPageShell';
import { useIsDesktop } from '../useIsDesktop';

// Every top-level page (VaultNote, CaptureView, ProcessorLog, Vault, Archive,
// Search, Settings) hand-wired the same loggedOut/isDesktop/wrap-or-shell
// branch around its own content. This is that branch, factored out once: a
// page still owns its own `loggedOut` state and its own reload-on-login
// logic (a page-specific concern, e.g. re-fetching after `load()`), but the
// decision of what chrome to render around `children` lives here.
export default function PageShell({ loggedOut, onLoggedOut, onLoginSuccess, children }) {
  const isDesktop = useIsDesktop();

  if (loggedOut) {
    return <Login onSuccess={onLoginSuccess} />;
  }

  if (isDesktop) {
    return <DesktopPageShell onLoggedOut={onLoggedOut}>{children}</DesktopPageShell>;
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {children}
    </div>
  );
}
