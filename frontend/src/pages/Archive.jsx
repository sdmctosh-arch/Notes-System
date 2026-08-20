import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import FilterChips from '../components/FilterChips';
import InboxRow from '../components/InboxRow';
import Login from '../components/Login';
import { saveScrollPosition, getScrollPosition } from '../scrollMemory';

const STATUS_LABEL = { archived: 'Archived', filed: 'Kept', dismissed: 'Dismissed' };

export default function Archive() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setError(null);
    api
      .listArchive()
      .then((data) => {
        const sorted = [...data].sort((a, b) => new Date(b.captured) - new Date(a.captured));
        setItems(sorted);
      })
      .catch(setError);
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    function onScroll() {
      saveScrollPosition('archive', window.scrollY);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (items) {
      window.scrollTo(0, getScrollPosition('archive'));
    }
  }, [items]);

  if (error?.status === 401) {
    return <Login onSuccess={load} />;
  }
  if (error) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
        Couldn't load the archive: {error.message}
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visible =
    items &&
    items
      .filter((i) => category === 'all' || i.category === category)
      .filter((i) => {
        if (!q) return true;
        const haystack = [i.title, i.body, i.enrichment?.summary].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="px-5 pt-7 pb-3.5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Archive
          </h1>
          <div className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {items ? `${visible.length} item${visible.length === 1 ? '' : 's'}` : 'Loading…'}
          </div>
        </div>
        <Link
          to="/"
          className="text-[13px] shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
        >
          &larr; Inbox
        </Link>
      </div>

      <div className="px-5 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search archived items"
          className="w-full rounded-xl border px-3.5 py-2.5 text-[14px] outline-none"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />
      </div>

      <FilterChips active={category} onChange={setCategory} />

      {items && visible.length === 0 && (
        <div className="flex-grow flex items-center justify-center text-center p-10 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {items.length === 0 ? 'Nothing archived yet.' : 'No items match this search.'}
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-4 pb-6">
        {visible?.map((item) => (
          <div key={item.queue_id} className="relative">
            <InboxRow item={item} />
            <div
              className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              {STATUS_LABEL[item.status] || item.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
