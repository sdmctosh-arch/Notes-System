import { useEffect, useState } from 'react';
import { api } from '../api';
import FilterChips from '../components/FilterChips';
import InboxRow from '../components/InboxRow';
import EmptyState from '../components/EmptyState';
import ThemeToggle from '../components/ThemeToggle';

export default function Inbox() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    let cancelled = false;
    api
      .listItems()
      .then((data) => {
        if (cancelled) return;
        // The backend lists queue/pending sorted by filename, which is
        // capture id order, not display order - Inbox is newest-first
        // per PROJECT.md 10.4, so sort here rather than in the API.
        const sorted = [...data].sort((a, b) => new Date(b.captured) - new Date(a.captured));
        setItems(sorted);
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, []);

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
        <ThemeToggle />
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
