export default function StarIcon({ filled, size = 16 }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <path d="M10 2.5 12.35 7.4 17.7 8.2 13.85 11.9 14.75 17.3 10 14.6 5.25 17.3 6.15 11.9 2.3 8.2 7.65 7.4 Z" />
    </svg>
  );
}
