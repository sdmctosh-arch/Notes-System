import { Link } from 'react-router-dom';
import CategoryBadge from './CategoryBadge';
import ItemLabel from './ItemLabel';
import PinIcon from './PinIcon';
import ArtImage from './ArtImage';
import { categoryLabel } from '../categories';
import { isNewItem, isStaleItem } from '../itemLabels';

// Categories with their own art get a placeholder image slot instead of
// the plain icon badge, sized to match their detail-page treatment: media
// as a 2:3 poster, recipe as a 1:1 dish thumb. See ItemDetail.jsx for the
// matching hero (media) / figure (recipe) detail-page slots.
const ROW_ART = {
  media: { width: 56, height: 84, radius: 8, label: 'POSTER\n2:3' },
  recipe: { width: 64, height: 64, radius: 10, label: 'DISH\n1:1' },
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Plain <Link> everywhere (mobile Inbox, Archive, the desktop rest-of-list
// scroll) except the desktop two-pane list, which passes onSelect to pick
// the item into the right-hand pane instead of navigating away from it.
export default function InboxRow({ item, onSelect, selected }) {
  const preview = item.enrichment?.summary || item.body || '';
  const label = isNewItem(item) ? 'new' : isStaleItem(item) ? 'stale' : null;
  const art = ROW_ART[item.category];
  const artUrl = item.enrichment?.structured?.image || null;
  const Tag = onSelect ? 'button' : Link;
  const tagProps = onSelect
    ? { type: 'button', onClick: () => onSelect(item) }
    : { to: `/items/${encodeURIComponent(item.queue_id)}` };

  return (
    <Tag
      {...tagProps}
      className="flex items-start gap-3 rounded-2xl border p-3.5 hover:opacity-90 transition-opacity w-full text-left"
      style={{
        background: selected ? 'var(--color-sel)' : 'var(--color-card-bg)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--color-card-shadow)',
      }}
    >
      {art ? (
        <ArtImage src={artUrl} alt={item.title || ''} width={art.width} height={art.height} radius={art.radius} label={art.label} />
      ) : (
        <CategoryBadge category={item.category} />
      )}
      <div className="min-w-0 grow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            {item.pinned && (
              <span className="shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} aria-label="Pinned">
                <PinIcon filled size={13} />
              </span>
            )}
            <div className="font-serif font-semibold text-base leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              {item.title || item.capture_id}
            </div>
          </div>
          {label && <ItemLabel kind={label} />}
        </div>
        <div
          className="text-[13px] mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {preview}
        </div>
        <div className="text-[11px] mt-1.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {categoryLabel(item.category)} &middot; {timeAgo(item.captured)}
        </div>
      </div>
    </Tag>
  );
}
