// kind is "new" or "stale" - see src/itemLabels.js for the thresholds.
export default function ItemLabel({ kind }) {
  const isNew = kind === 'new';
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={
        isNew
          ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)' }
          : { border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }
      }
    >
      {isNew ? 'New' : 'Stale'}
    </span>
  );
}
