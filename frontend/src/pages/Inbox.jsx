import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import FilterChips from '../components/FilterChips';
import InboxRow from '../components/InboxRow';
import EmptyState from '../components/EmptyState';
import Drawer from '../components/Drawer';
import DesktopRail from '../components/DesktopRail';
import Login from '../components/Login';
import ItemDetail from './ItemDetail';
import { saveScrollPosition, getScrollPosition } from '../scrollMemory';
import { isNewItem } from '../itemLabels';
import { useIsDesktop } from '../useIsDesktop';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function PinnedGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 12v5" />
      <path d="M6.5 4.5h7l-1 5 2 2.5H5.5l2-2.5Z" />
    </svg>
  );
}

// Rendered once for the mobile single-column list and again (in a narrower
// pane, with onSelect instead of navigation) for the desktop list pane -
// same grouping and row markup either way.
function ItemList({ visible, onSelect, selectedId }) {
  const pinned = visible?.filter((i) => i.pinned) || [];
  const rest = visible?.filter((i) => !i.pinned) || [];

  return (
    <>
      {pinned.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-1 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            <PinnedGlyph />
            <span>Pinned</span>
          </div>
          {pinned.map((item) => (
            <InboxRow key={item.queue_id} item={item} onSelect={onSelect} selected={item.queue_id === selectedId} />
          ))}
          {rest.length > 0 && (
            <div className="px-1 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              To review
            </div>
          )}
        </>
      )}
      {rest.map((item) => (
        <InboxRow key={item.queue_id} item={item} onSelect={onSelect} selected={item.queue_id === selectedId} />
      ))}
    </>
  );
}

export default function Inbox() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');
  const [loggedOut, setLoggedOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const isDesktop = useIsDesktop();

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

  if (isDesktop) {
    return (
      <div className="min-h-dvh flex" style={{ background: 'var(--color-bg)' }}>
        <DesktopRail onLoggedOut={() => setLoggedOut(true)} />

        <div className="w-[420px] shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--color-border)' }}>
          <div className="px-5 pt-6 pb-1">
            <h1 className="font-serif font-semibold text-2xl tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
              Inbox
            </h1>
            <div className="text-[12.5px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {items ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Loading…'}
            </div>
          </div>

          <FilterChips active={category} onChange={setCategory} />

          {items && visible.length === 0 && <EmptyState />}

          <div className="flex flex-col gap-2.5 px-4 pb-6 overflow-y-auto">
            <ItemList visible={visible} onSelect={(item) => setSelectedId(item.queue_id)} selectedId={selectedId} />
          </div>
        </div>

        <div className="grow min-w-0">
          {selectedId ? (
            <ItemDetail
              id={selectedId}
              embedded
              onActioned={() => {
                setSelectedId(null);
                load();
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-center p-10 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
              Select a note to preview it here.
            </div>
          )}
        </div>
      </div>
    );
  }

  const newCount = items?.filter(isNewItem).length ?? 0;

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col relative" style={{ background: 'var(--color-bg)' }}>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pendingCount={items?.length}
        onLoggedOut={() => setLoggedOut(true)}
      />

      <div className="px-5 pt-6 pb-1 flex items-center justify-between gap-3">
        <button
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="4" y1="6" x2="16" y2="6" />
            <line x1="4" y1="10" x2="16" y2="10" />
            <line x1="4" y1="14" x2="16" y2="14" />
          </svg>
        </button>
        <Link
          to="/search"
          aria-label="Search"
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8.5" cy="8.5" r="5" />
            <line x1="12.3" y1="12.3" x2="17" y2="17" />
          </svg>
        </Link>
      </div>

      <div className="px-5 pt-3 pb-1">
        <h1 className="font-serif font-semibold text-[29px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          {greeting()}
        </h1>
        <div className="text-[13.5px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {items
            ? `You have ${newCount} new note${newCount === 1 ? '' : 's'} and ${items.length} total note${items.length === 1 ? '' : 's'}.`
            : 'Loading…'}
        </div>
      </div>

      <FilterChips active={category} onChange={setCategory} />

      {items && visible.length === 0 && <EmptyState />}

      <div className="flex flex-col gap-2.5 px-4 pb-28">
        <ItemList visible={visible} />
      </div>

      <Link
        to="/new"
        aria-label="New note"
        className="fixed bottom-6 right-[calc(50%-13rem+1.25rem)] w-[58px] h-[58px] rounded-full flex items-center justify-center z-30"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)', boxShadow: '0 6px 18px oklch(0.5 0.13 40 / 0.32)' }}
      >
        <svg viewBox="0 0 20 20" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="10" y1="4" x2="10" y2="16" />
          <line x1="4" y1="10" x2="16" y2="10" />
        </svg>
      </Link>
    </div>
  );
}
