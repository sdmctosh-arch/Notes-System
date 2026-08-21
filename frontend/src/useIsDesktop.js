import { useState, useEffect } from 'react';

// Matches Tailwind's `lg` breakpoint - below this the Inbox is the mobile
// single-column list, at or above it the two-pane split view (1b) applies.
const QUERY = '(min-width: 1024px)';

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return desktop;
}
