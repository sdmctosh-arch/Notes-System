// Ported from the mockup's inline SVGs - same viewBox, same stroke rules.
const ICONS = {
  lookup: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <line x1="12.3" y1="12.3" x2="17" y2="17" />
    </>
  ),
  todo: <polyline points="4,10.5 8,15 16,5" />,
  project: (
    <>
      <line x1="3" y1="6" x2="17" y2="6" />
      <circle cx="12" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <line x1="3" y1="14" x2="17" y2="14" />
      <circle cx="8" cy="14" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  recipe: (
    <>
      <rect x="4" y="9" width="12" height="7" rx="1.5" />
      <line x1="1.5" y1="10.5" x2="4" y2="10.5" />
      <line x1="16" y1="10.5" x2="18.5" y2="10.5" />
      <line x1="10" y1="9" x2="10" y2="6" />
    </>
  ),
  idea: (
    <>
      <circle cx="10" cy="8" r="4.3" />
      <line x1="8.2" y1="15" x2="11.8" y2="15" />
      <line x1="8.6" y1="17" x2="11.4" y2="17" />
      <line x1="10" y1="12.3" x2="10" y2="14" />
    </>
  ),
  media: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M8.3 6.8 L14 10 L8.3 13.2 Z" fill="currentColor" stroke="none" />
    </>
  ),
  reference: <path d="M6 3.5 H14 V17 L10 13.3 L6 17 Z" />,
  grocery: (
    <>
      <path d="M5 7 H15 L14 17 H6 Z" />
      <path d="M7.5 7 V5.5 Q7.5 3 10 3 Q12.5 3 12.5 5.5 V7" />
    </>
  ),
  unclassified: <circle cx="10" cy="10" r="6" strokeDasharray="2.4 2.4" />,
};

export default function CategoryIcon({ category, size = 16 }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[category] ?? ICONS.unclassified}
    </svg>
  );
}
