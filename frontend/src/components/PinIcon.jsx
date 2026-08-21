export default function PinIcon({ filled, size = 16 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 12v5" />
      <path d="M6.5 4.5h7l-1 5 2 2.5H5.5l2-2.5Z" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}
