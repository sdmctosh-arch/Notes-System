// Shared icon glyphs for the drawer (mobile) and rail (desktop) nav - kept
// in one place so the two navs stay visually identical.

export function InboxGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 6.5 10.5 8 13h4l1.5-2.5H17" />
      <path d="M3 10.5 5.5 4.5h9L17 10.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function ListsGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6.5 6 7.5 8 5.5" />
      <line x1="10.5" y1="6.5" x2="16.5" y2="6.5" />
      <path d="M5 13 6 14 8 12" />
      <line x1="10.5" y1="13" x2="16.5" y2="13" />
    </svg>
  );
}

export function VaultGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3.5" width="14" height="13" rx="1.5" />
      <line x1="7" y1="3.5" x2="7" y2="16.5" />
    </svg>
  );
}

export function ArchiveGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="3.5" rx="1" />
      <path d="M4 8v6.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8" />
      <line x1="8.2" y1="11" x2="11.8" y2="11" />
    </svg>
  );
}

export function SearchGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="5" />
      <line x1="12.3" y1="12.3" x2="17" y2="17" />
    </svg>
  );
}

export function PlusGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  );
}

export function MoonGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 11.5 A7 7 0 1 1 8.5 3 A5.5 5.5 0 0 0 17 11.5 Z" />
    </svg>
  );
}

export function LogoutGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8" />
      <path d="M13 13.5 17 10l-4-3.5" />
      <line x1="17" y1="10" x2="7.5" y2="10" />
    </svg>
  );
}
