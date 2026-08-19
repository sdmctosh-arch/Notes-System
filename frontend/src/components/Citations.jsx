export default function Citations({ citations }) {
  if (!citations || citations.length === 0) return null;
  return (
    <>
      <div className="font-serif font-semibold text-sm mb-2.5" style={{ color: 'var(--color-text-primary)' }}>
        Sources
      </div>
      <div className="flex flex-col gap-2">
        {citations.map((c, i) => (
          <a
            key={i}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13.5px] no-underline flex items-center gap-1.5 hover:underline"
          >
            <svg
              viewBox="0 0 20 20"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M8 12 L12 8 M9 6 L11 4 A3 3 0 0 1 15 8 L13 10 M11 14 L9 16 A3 3 0 0 1 5 12 L7 10" />
            </svg>
            <span>{c.title}</span>
          </a>
        ))}
      </div>
    </>
  );
}
