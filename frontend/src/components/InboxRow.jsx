import { Link } from 'react-router-dom';
import CategoryBadge from './CategoryBadge';
import { categoryLabel } from '../categories';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function InboxRow({ item }) {
  const preview = item.enrichment?.summary || item.body || '';
  return (
    <Link
      to={`/items/${encodeURIComponent(item.queue_id)}`}
      className="flex items-start gap-3 rounded-2xl border p-3.5 hover:opacity-90 transition-opacity"
      style={{
        background: 'var(--color-card-bg)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--color-card-shadow)',
      }}
    >
      <CategoryBadge category={item.category} />
      <div className="min-w-0 grow">
        <div className="font-serif font-semibold text-base leading-tight" style={{ color: 'var(--color-text-primary)' }}>
          {item.title || item.capture_id}
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
    </Link>
  );
}
