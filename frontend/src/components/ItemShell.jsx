import { Link } from 'react-router-dom';

// The embedded (desktop two-pane right pane, Inbox.jsx) vs. standalone
// (mobile route, or the desktop left-pane fallback) chrome around
// ItemDetailCore - page wrapper class and back-link only. Knows nothing
// about fetching or mutating an item, so it doesn't need remounting when
// the selected item changes the way ItemDetailCore does.
export function ItemShell({ embedded, children }) {
  const pageClass = embedded ? 'h-full flex flex-col' : 'max-w-md mx-auto min-h-dvh flex flex-col';
  return (
    <div className={pageClass} style={{ background: 'var(--color-bg)' }}>
      {children}
    </div>
  );
}

// Embedded: no back link (there's no route to go back to - picking a
// different row just swaps `id`). Standalone: a real link, since `to`
// depends on the loaded item's status (Archive vs. Inbox).
export function BackLink({ embedded, to, children }) {
  if (embedded) return <div />;
  return (
    <Link to={to} className="text-[13px] inline-flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
      &larr; {children}
    </Link>
  );
}
