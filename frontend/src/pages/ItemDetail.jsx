import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import { api } from '../api';
import CategoryBadge from '../components/CategoryBadge';
import Citations from '../components/Citations';
import YouTubeEmbed from '../components/YouTubeEmbed';
import ActionBar from '../components/ActionBar';
import { categoryColors, categoryLabel } from '../categories';
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

function Prose({ children }) {
  if (!children) return null;
  return (
    <div className="text-[14.5px] leading-relaxed mb-5 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_strong]:font-semibold [&_h1]:font-serif [&_h2]:font-serif [&_h3]:font-serif [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-base [&_h3]:text-[15px] [&_h1]:mb-2 [&_h2]:mb-2 [&_h3]:mb-2 [&_code]:text-[13px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:mb-3"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <Markdown>{children}</Markdown>
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
      </div>
    );
  }

  if (e.kind === 'recipe') {
    const r = e.structured || {};
    return (
      <>
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
    </>
  );
}

export default function ItemDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const dark = useDarkMode();

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

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="px-5 pt-6 pb-2">
        <Link to="/" className="text-[13px] inline-flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          &larr; Inbox
        </Link>
      </div>
      <div className="px-5 pb-4 flex items-start gap-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <CategoryBadge category={item.category} size={38} iconSize={18} radius={11} />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: colors.label }}>
            {categoryLabel(item.category)}
          </div>
          <div className="font-serif font-semibold text-xl leading-tight mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
            {item.title || item.capture_id}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Captured {timeAgo(item.captured)}
          </div>
        </div>
      </div>

      <div className="grow overflow-y-auto p-5">
        <Body item={item} />
      </div>

      <ActionBar queueId={item.queue_id} />
    </div>
  );
}
