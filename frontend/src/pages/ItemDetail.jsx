import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import CategoryBadge from '../components/CategoryBadge';
import CategoryPicker from '../components/CategoryPicker';
import Citations from '../components/Citations';
import YouTubeEmbed from '../components/YouTubeEmbed';
import ActionBar from '../components/ActionBar';
import ChatPanel from '../components/ChatPanel';
import ItemLabel from '../components/ItemLabel';
import ReenrichButton from '../components/ReenrichButton';
import ShareButton from '../components/ShareButton';
import PinIcon from '../components/PinIcon';
import UnarchiveBar from '../components/UnarchiveBar';
import ArtImage from '../components/ArtImage';
import { STRIPE } from '../components/ArtPlaceholder';
import Prose from '../components/Prose';
import { categoryColors, categoryLabel, isEnrichableCategory } from '../categories';
import { isNewItem, isStaleItem } from '../itemLabels';
import { useDarkMode } from '../theme-hook';
import Login from '../components/Login';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// A citation only shows up when the summary/lookup tool actually
// surfaced something - if the tool couldn't fetch the page at all (e.g.
// a Reddit URL that blocks bots), citations comes back empty and the
// URL the user originally captured would otherwise disappear entirely.
// Show it unconditionally instead, so there's always a way to open it.
function OriginalLink({ url }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[13.5px] no-underline flex items-center gap-1.5 hover:underline mt-1"
      style={{ color: 'var(--color-text-muted)' }}
    >
      <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M8 12 L12 8 M9 6 L11 4 A3 3 0 0 1 15 8 L13 10 M11 14 L9 16 A3 3 0 0 1 5 12 L7 10" />
      </svg>
      <span>Open original link</span>
    </a>
  );
}

// Full-bleed backdrop above the header - a real TMDB backdrop image when
// Get-TmdbArt (Invoke-NoteProcessor-v2.ps1) found one, else ArtPlaceholder's
// striped fallback. Only media gets a hero; recipe's art sits inline in the
// body instead (RecipeFigure below), matching the design's split between
// "backdrop behind the title" and "photo beside the ingredients". The
// dashed "TITLE LOGO" box is a placeholder-only stand-in for art this
// system has no way to produce (a title-logo treatment), so it only shows
// up alongside the striped placeholder, never over a real photo.
function MediaHero({ item }) {
  const m = item.enrichment?.structured || {};
  const caption = [item.enrichment?.kind === 'media_info' ? m.media_type : null, m.year].filter(Boolean).join(' · ');
  const [imgFailed, setImgFailed] = useState(false);
  const hasBackdrop = Boolean(m.backdrop) && !imgFailed;

  return (
    <div className="relative w-full h-[200px] flex items-center justify-center overflow-hidden" style={hasBackdrop ? undefined : { background: STRIPE }}>
      {hasBackdrop ? (
        <img
          src={m.backdrop}
          alt=""
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <span
          className="uppercase"
          style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--color-stripe-text)' }}
        >
          BACKDROP · 16:9
        </span>
      )}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{ background: 'linear-gradient(to top, oklch(0.2 0.02 60 / 0.78), oklch(0.2 0.02 60 / 0))' }}
      />
      <div className="absolute left-4 right-4 bottom-3 flex flex-col gap-1.5">
        {!hasBackdrop && (
          <div
            className="h-9 w-48 flex items-center justify-center px-3 rounded"
            style={{ border: '1px dashed oklch(0.99 0.005 80 / 0.55)', color: 'oklch(0.99 0.005 80 / 0.85)', fontSize: 9 }}
          >
            TITLE LOGO
          </div>
        )}
        {caption && (
          <div className="uppercase" style={{ color: 'oklch(0.99 0.005 80 / 0.85)', fontSize: 10, letterSpacing: '0.1em' }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeFigure({ item }) {
  const image = item.enrichment?.structured?.image || null;
  return (
    <div className="mb-5">
      <ArtImage src={image} alt={item.title || ''} aspectRatio="4 / 3" radius={12} label="DISH · 4:3" className="w-full max-w-[340px]" style={{ border: '1px solid var(--color-border)' }} />
    </div>
  );
}

function Body({ item }) {
  const e = item.enrichment;

  if (!e) {
    return (
      <div className="text-[14.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {item.status === 'enrich_failed' && (
          <div className="text-[13px] mb-3" style={{ color: 'var(--color-dismiss-text)' }}>
            Enrichment didn't complete for this item.
          </div>
        )}
        {item.body}
        <OriginalLink url={item.url} />
      </div>
    );
  }

  if (e.kind === 'recipe') {
    const r = e.structured || {};
    return (
      <>
        <RecipeFigure item={item} />
        {r.recipeIngredient && (
          <>
            <div className="font-serif font-semibold text-[15px] mb-2.5" style={{ color: 'var(--color-text-primary)' }}>
              Ingredients
            </div>
            <div className="flex flex-col gap-1.5 mb-6">
              {r.recipeIngredient.map((ing, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <div
                    className="w-1 h-1 rounded-full shrink-0 mt-1.5"
                    style={{ background: categoryColors('recipe', false).iconColor }}
                  />
                  <div>{ing}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {r.recipeInstructions && (
          <>
            <div className="font-serif font-semibold text-[15px] mb-2.5" style={{ color: 'var(--color-text-primary)' }}>
              Steps
            </div>
            <div className="flex flex-col gap-3 mb-5">
              {r.recipeInstructions.map((step, i) => (
                <div key={i} className="flex gap-2.5">
                  <div
                    className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: categoryColors('recipe', false).badgeBg, color: categoryColors('recipe', false).iconColor }}
                  >
                    {i + 1}
                  </div>
                  <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <Prose>{e.detail}</Prose>
        <Citations citations={e.citations} />
        <OriginalLink url={item.url} />
      </>
    );
  }

  if (e.kind === 'media_info') {
    const m = e.structured || {};
    return (
      <>
        <div className="flex gap-4 text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {m.year && <div>{m.year}</div>}
          {m.media_type && <div className="capitalize">{m.media_type}</div>}
        </div>
        <div className="text-[14.5px] mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {e.summary}
        </div>
        <Prose>{e.detail}</Prose>
        <Citations citations={e.citations} />
        <OriginalLink url={item.url} />
      </>
    );
  }

  // answer / page_summary / guide
  return (
    <>
      {item.category === 'lookup' && item.body && (
        <div className="flex gap-2 items-baseline mb-4">
          <div className="font-serif italic text-[15px]" style={{ color: 'var(--color-text-muted)' }}>
            Q.
          </div>
          <div className="text-[15px]" style={{ color: 'var(--color-text-primary)' }}>
            {item.body}
          </div>
        </div>
      )}
      {e.summary && (
        <div
          className="rounded-2xl border p-4 mb-5 text-[14.5px] leading-relaxed"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {e.summary}
        </div>
      )}
      {e.embed?.type === 'youtube' && <YouTubeEmbed videoId={e.embed.video_id} />}
      <Prose>{e.detail}</Prose>
      <Citations citations={e.citations} />
      <OriginalLink url={item.url} />
    </>
  );
}

function EditForm({ item, onSaved, onCancel }) {
  const [category, setCategory] = useState(item.category);
  const [title, setTitle] = useState(item.title || '');
  const [body, setBody] = useState(item.body || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateItem(item.queue_id, { category, title, body });
      onSaved(updated);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const fieldStyle = {
    background: 'var(--color-card-bg)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-primary)',
  };

  return (
    <div className="flex flex-col">
      <div className="px-5 pt-4 pb-4 border-b flex flex-col gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <CategoryPicker value={category} onChange={setCategory} />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] font-serif font-semibold outline-none"
          style={fieldStyle}
        />
      </div>

      <div className="grow overflow-y-auto p-5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="w-full rounded-xl border p-3.5 text-[14.5px] leading-relaxed outline-none resize-none"
          style={fieldStyle}
        />
      </div>

      <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        {error && (
          <div className="px-5 pt-3 text-[13px]" style={{ color: 'var(--color-dismiss-text)' }}>
            {error}
          </div>
        )}
        <div className="flex gap-2 p-5">
          <button
            disabled={saving}
            onClick={save}
            className="grow text-center py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            disabled={saving}
            onClick={onCancel}
            className="grow text-center py-2.5 rounded-xl border text-[13px] font-semibold disabled:opacity-50"
            style={{ borderColor: 'var(--color-btn-border)', color: 'var(--color-btn-text)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// embedded=true is the desktop two-pane right pane (Inbox.jsx): no outer
// page chrome (max-w-md wrapper, back link), id comes from props instead
// of the route since there's no route change when picking a row.
export default function ItemDetail({ id: propId, embedded = false, onActioned }) {
  const { id: routeId } = useParams();
  const id = propId ?? routeId;
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [togglingPinned, setTogglingPinned] = useState(false);
  const dark = useDarkMode();
  const bodyRef = useRef(null);

  async function togglePinned() {
    setTogglingPinned(true);
    try {
      setItem(await api.setPinned(item.queue_id, !item.pinned));
    } catch {
      // Not worth a dedicated error banner for a one-tap toggle - the pin
      // simply doesn't flip, and the user can just tap it again.
    } finally {
      setTogglingPinned(false);
    }
  }

  const load = () => {
    let cancelled = false;
    setItem(null);
    setError(null);
    api
      .getItem(id)
      .then((data) => !cancelled && setItem(data))
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  };

  useEffect(load, [id]);

  // In the embedded (desktop two-pane) case the body pane's DOM node is
  // reused across items, so scrollTop persists from whatever the previous
  // item was scrolled to - reset it so a newly picked item always opens
  // at the top instead of wherever the last one left off.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [id]);

  if (error?.status === 401) {
    return <Login onSuccess={load} />;
  }
  if (error) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
        Couldn't load this item: {error.message}
      </div>
    );
  }
  if (!item) return null;

  const colors = categoryColors(item.category, dark);
  // PROJECT.md 10.4: the Archive view is read-only - once an item has
  // moved to archived/filed/dismissed, hide the actions that only make
  // sense for something still being triaged.
  const isArchived = ['archived', 'filed', 'dismissed'].includes(item.status);
  // Filed stays permanent from here - the vault note (and any Tandoor/Seerr
  // push) already happened outside this system and Unarchive can't safely
  // reverse either, so it only offers to undo the other two outcomes.
  const canUnarchive = item.status === 'archived' || item.status === 'dismissed';
  // The category badge and the hero/figure art both signal "media" or
  // "recipe" - showing both is redundant, so the badge steps aside for
  // whichever category has its own art (matches the list row - InboxRow.jsx).
  const hasArt = item.category === 'media' || item.category === 'recipe';

  const pageClass = embedded ? 'h-full flex flex-col' : 'max-w-md mx-auto min-h-dvh flex flex-col';

  if (editing) {
    return (
      <div className={pageClass} style={{ background: 'var(--color-bg)' }}>
        <div className="px-5 pt-6 pb-2">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            Editing
          </div>
        </div>
        <EditForm
          item={item}
          onSaved={(updated) => {
            setItem(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className={pageClass} style={{ background: 'var(--color-bg)' }}>
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        {embedded ? (
          <div />
        ) : (
          <Link
            to={isArchived ? '/archive' : '/'}
            className="text-[13px] inline-flex items-center gap-1"
            style={{ color: 'var(--color-text-muted)' }}
          >
            &larr; {isArchived ? 'Archive' : 'Inbox'}
          </Link>
        )}
        <div className="flex items-center gap-2">
          <ShareButton item={item} />
          {!isArchived && (
            <>
              <button
                aria-label={item.pinned ? 'Unpin' : 'Pin'}
                onClick={togglePinned}
                disabled={togglingPinned}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
                style={{
                  background: 'var(--color-card-bg)',
                  border: '1px solid var(--color-border)',
                  color: item.pinned ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >
                <PinIcon filled={item.pinned} size={15} />
              </button>
              <button
                aria-label="Edit item"
                onClick={() => setEditing(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.5 3.5 16.5 6.5 7 16H4v-3Z" />
                  <line x1="12" y1="5" x2="15" y2="8" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      {item.category === 'media' && <MediaHero item={item} />}
      <div className="px-5 pb-4 flex items-start gap-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {!hasArt && <CategoryBadge category={item.category} size={38} iconSize={18} radius={11} />}
        <div className="min-w-0 grow">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: colors.label }}>
              {categoryLabel(item.category)}
            </div>
            {!isArchived && (isNewItem(item) ? <ItemLabel kind="new" /> : isStaleItem(item) ? <ItemLabel kind="stale" /> : null)}
          </div>
          <div className="flex items-start gap-1.5 mt-0.5">
            {item.pinned && (
              <span className="shrink-0 mt-1.5" style={{ color: 'var(--color-accent)' }} aria-label="Pinned">
                <PinIcon filled size={14} />
              </span>
            )}
            <div className="font-serif font-semibold text-xl leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              {item.title || item.capture_id}
            </div>
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Captured {timeAgo(item.captured)}
          </div>
          {!item.manual && (
            <Link
              to={`/capture/${encodeURIComponent(item.capture_id)}`}
              className="text-xs mt-1 inline-block hover:underline"
              style={{ color: 'var(--color-text-muted)' }}
            >
              View original capture
            </Link>
          )}
        </div>
      </div>

      <div ref={bodyRef} className="grow overflow-y-auto p-5">
        <Body item={item} />
        {!isArchived && isEnrichableCategory(item.category) && <ReenrichButton queueId={item.queue_id} />}
        {!isArchived && <ChatPanel item={item} onUpdate={setItem} />}
      </div>

      {!isArchived && <ActionBar queueId={item.queue_id} onDone={embedded ? onActioned : undefined} />}
      {canUnarchive && <UnarchiveBar queueId={item.queue_id} />}
    </div>
  );
}
