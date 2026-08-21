// Stand-in for real per-category art (TMDB posters/backdrops for media,
// a dish photo for recipe) - nothing fetches or stores actual images yet,
// so this is a labelled striped placeholder occupying the real layout slot,
// per PROJECT.md 10.6. Swap in a real <img> here once that lands.
export const STRIPE = 'repeating-linear-gradient(135deg, var(--color-stripe-a) 0 6px, var(--color-stripe-b) 6px 12px)';

export default function ArtPlaceholder({ width, height, aspectRatio, radius = 8, label, fontSize = 8, className = '', style }) {
  return (
    <div
      className={`shrink-0 flex items-center justify-center text-center whitespace-pre-line ${className}`}
      style={{
        width,
        height,
        aspectRatio,
        borderRadius: radius,
        background: STRIPE,
        fontFamily: 'ui-monospace, monospace',
        fontWeight: 500,
        fontSize,
        letterSpacing: '0.08em',
        color: 'var(--color-stripe-text)',
        ...style,
      }}
    >
      {label}
    </div>
  );
}
