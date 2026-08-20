import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import FilterChips from '../components/FilterChips';
import InboxRow from '../components/InboxRow';
import EmptyState from '../components/EmptyState';
import ThemeToggle from '../components/ThemeToggle';
import LogoutButton from '../components/LogoutButton';
import Login from '../components/Login';
import { saveScrollPosition, getScrollPosition } from '../scrollMemory';

export default function Inbox() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');
  const [loggedOut, setLoggedOut] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .listItems()
      .then((data) => {
        // The backend lists queue/pending sorted by filename, which is
        // capture id order, not display order - Inbox is newest-first
        // per PROJECT.md 10.4, so sort here rather than in the API.
        const sorted = [...data].sort((a, b) => new Date(b.captured) - new Date(a.captured));
        setItems(sorted);
      })
      .catch(setError);
  }, []);

  useEffect(load, [load]);

  // Remember scroll position continuously (not just on navigate-away, so
  // it's also right if the tab is closed mid-scroll) and restore it once
  // items have actually rendered - restoring before that just scrolls to
  // 0 because the page isn't tall enough yet.
  useEffect(() => {
    function onScroll() {
      saveScrollPosition('inbox', window.scrollY);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (items) {
      window.scrollTo(0, getScrollPosition('inbox'));
    }
  }, [items]);

  if (loggedOut || error?.status === 401) {
    return (
      <Login
        onSuccess={() => {
          setLoggedOut(false);
          load();
        }}
      />
    );
  }
  if (error) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
        Couldn't load the queue: {error.message}
      </div>
    );
  }

  const visible = items && (category === 'all' ? items : items.filter((i) => i.category === category));

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="px-5 pt-7 pb-3.5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Inbox
          </h1>
          <div className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {items ? `${visible.length} item${visible.length === 1 ? '' : 's'} to review` : 'Loading…'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/archive"
            aria-label="Archive"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="14" height="3.5" rx="1" />
              <path d="M4 8v6.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8" />
              <line x1="8.2" y1="11" x2="11.8" y2="11" />
            </svg>
          </Link>
          <ThemeToggle />
          <LogoutButton onLoggedOut={() => setLoggedOut(true)} />
        </div>
      </div>

      <FilterChips active={category} onChange={setCategory} />

      {items && visible.length === 0 && <EmptyState />}

      <div className="flex flex-col gap-2.5 px-4 pb-6">
        {visible?.map((item) => (
          <InboxRow key={item.queue_id} item={item} />
        ))}
      </div>
    </div>
  );
}
