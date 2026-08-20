import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import ChecklistRow from '../components/ChecklistRow';
import InboxRow from '../components/InboxRow';
import Login from '../components/Login';

const TABS = [
  { key: 'grocery', label: 'Grocery' },
  { key: 'todo', label: 'Todo' },
  { key: 'media', label: 'Media' },
];

export default function Lists() {
  const [tab, setTab] = useState('grocery');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setItems(null);
    setError(null);
    api
      .listItems({ category: tab })
      .then((data) => {
        const sorted = [...data].sort((a, b) => new Date(b.captured) - new Date(a.captured));
        setItems(sorted);
      })
      .catch(setError);
  }, [tab]);

  useEffect(load, [load]);

  if (error?.status === 401) {
    return <Login onSuccess={load} />;
  }
  if (error) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
        Couldn't load the list: {error.message}
      </div>
    );
  }

  function handleChecked(queueId) {
    setItems((prev) => prev?.filter((i) => i.queue_id !== queueId));
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="px-5 pt-7 pb-3.5 flex items-start justify-between gap-3">
        <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Lists
        </h1>
        <Link to="/" className="text-[13px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          &larr; Inbox
        </Link>
      </div>

      <div className="flex gap-2 px-5 pb-4">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition-colors"
              style={
                isActive
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)', borderColor: 'var(--color-accent)' }
                  : { background: 'transparent', color: 'var(--color-chip-inactive-text)', borderColor: 'var(--color-chip-inactive-border)' }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {items && items.length === 0 && (
        <div className="flex-grow flex items-center justify-center text-center p-10 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {tab === 'media' ? 'Nothing on your watch list.' : `Nothing on your ${tab} list.`}
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-4 pb-6">
        {items?.map((item) =>
          tab === 'media' ? (
            <InboxRow key={item.queue_id} item={item} />
          ) : (
            <ChecklistRow key={item.queue_id} item={item} onDone={handleChecked} />
          ),
        )}
      </div>
    </div>
  );
}
