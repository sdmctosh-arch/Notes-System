export default function EmptyState() {
  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center p-10">
      <div
        className="w-16 h-16 rounded-[18px] flex items-center justify-center mb-5"
        style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)' }}
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="5,13 10,18 19,7" />
        </svg>
      </div>
      <div className="font-serif font-semibold text-lg" style={{ color: 'var(--color-text-primary)' }}>
        You're all caught up
      </div>
      <div className="text-[13.5px] mt-2 leading-relaxed max-w-[260px]" style={{ color: 'var(--color-text-muted)' }}>
        New captures will show up here once they're classified and enriched.
      </div>
    </div>
  );
}
