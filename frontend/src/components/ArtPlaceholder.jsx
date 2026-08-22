// Fallback for when there's no real per-category art to show yet - no image
// URL from enrichment (a media item with no TMDB match, a recipe with none
// found via search) or a hotlinked one that failed to load. A labelled
// striped placeholder occupying the real layout slot, per PROJECT.md 10.4.
// See ArtImage, which renders this or a real <img> depending on what's
// available.
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
