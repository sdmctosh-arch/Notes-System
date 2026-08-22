import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import CategoryBadge from '../components/CategoryBadge';
import { categoryLabel } from '../categories';
import Login from '../components/Login';
import DesktopPageShell from '../components/DesktopPageShell';
import { useIsDesktop } from '../useIsDesktop';

const LOCATION_LABEL = { inbox: 'Inbox', archive: 'Archive' };

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((data) => !cancelled && setResults(data))
        .catch((e) => !cancelled && setError(e));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (loggedOut || error?.status === 401) {
    return <Login onSuccess={() => { setLoggedOut(false); setError(null); }} />;
  }

  const content = (
    <>
      <div className="px-5 pt-7 pb-3.5 flex items-start justify-between gap-3">
        <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Search
        </h1>
        {!isDesktop && (
          <Link to="/" className="text-[13px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            &larr; Inbox
          </Link>
        )}
      </div>

      <div className="px-5 pb-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inbox, archive, and vault"
          className="w-full rounded-xl border px-3.5 py-2.5 text-[14px] outline-none"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />
      </div>

      {error && !error.status && (
        <div className="px-5 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
          Search failed: {error.message}
        </div>
      )}

      {query.trim() && results && results.length === 0 && (
        <div className="flex-grow flex items-center justify-center text-center p-10 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
          No matches for "{query.trim()}".
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-4 pb-6 mt-2">
        {results?.map((r, i) => {
          const to =
            r.kind === 'item'
              ? `/items/${encodeURIComponent(r.queue_id)}`
              : `/vault/${encodeURIComponent(r.folder)}/${encodeURIComponent(r.filename)}`;
          return (
            <Link
              key={`${r.kind}-${r.queue_id || `${r.folder}/${r.filename}`}-${i}`}
              to={to}
              className="flex items-start gap-3 rounded-2xl border p-3.5 hover:opacity-90 transition-opacity"
              style={{
                background: 'var(--color-card-bg)',
                borderColor: 'var(--color-border)',
                boxShadow: 'var(--color-card-shadow)',
              }}
            >
              {r.kind === 'item' ? (
                <CategoryBadge category={r.category} />
              ) : (
                <div
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="14" height="14" rx="1.5" />
                    <line x1="6.5" y1="3" x2="6.5" y2="17" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 grow">
                <div className="font-serif font-semibold text-base leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                  {r.title}
                </div>
                <div
                  className="text-[13px] mt-0.5 overflow-hidden text-ellipsis"
                  style={{
                    color: 'var(--color-text-secondary)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {r.snippet}
                </div>
                <div className="text-[11px] mt-1.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                  {r.kind === 'item' ? `${categoryLabel(r.category)} · ${LOCATION_LABEL[r.location]}` : `Vault · ${r.folder}`}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );

  if (isDesktop) {
    return <DesktopPageShell onLoggedOut={() => setLoggedOut(true)}>{content}</DesktopPageShell>;
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {content}
    </div>
  );
}
