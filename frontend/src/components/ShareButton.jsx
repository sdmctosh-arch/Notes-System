import { useState } from 'react';
import { shareTextFor, shareTextAsPlainText } from '../shareText';

export default function ShareButton({ item }) {
  const [copied, setCopied] = useState(false);

  async function copyFallback() {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(shareTextAsPlainText(item));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied or unavailable - nothing more to do.
    }
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareTextFor(item));
        return;
      } catch (e) {
        // AbortError means the user closed the share sheet themselves -
        // that's not a failure, don't fall back to clipboard for it.
        if (e?.name === 'AbortError') return;
      }
    }
    await copyFallback();
  }

  return (
    <button
      aria-label={copied ? 'Copied to clipboard' : 'Share'}
      onClick={share}
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
    >
      {copied ? (
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10.5 8 14.5 16 5.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3v9" />
          <path d="M6.5 6.5 10 3l3.5 3.5" />
          <path d="M4 10v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5" />
        </svg>
      )}
    </button>
  );
}
