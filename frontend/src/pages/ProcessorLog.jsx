import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Login from '../components/Login';
import DesktopPageShell from '../components/DesktopPageShell';
import { useIsDesktop } from '../useIsDesktop';

// The processor appends chronologically, so the newest activity is always
// the last line - reverse for display so it's the first thing visible
// without scrolling, which is what you want while watching a live run.
function newestFirst(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.reverse().join('\n');
}

export default function ProcessorLog() {
  const [dates, setDates] = useState(null);
  const [date, setDate] = useState(null);
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const isDesktop = useIsDesktop();

  const loadDates = useCallback(() => {
    setError(null);
    api
      .listLogDates()
      .then((data) => {
        setDates(data);
        setDate((current) => current ?? data[0] ?? null);
      })
      .catch(setError);
  }, []);

  useEffect(loadDates, [loadDates]);

  const loadContent = useCallback(() => {
    if (!date) return;
    setContent(null);
    setError(null);
    api.getLog(date).then((data) => setContent(data.content)).catch(setError);
  }, [date]);

  useEffect(loadContent, [loadContent]);

  if (loggedOut || error?.status === 401) {
    return (
      <Login
        onSuccess={() => {
          setLoggedOut(false);
          loadDates();
        }}
      />
    );
  }

  const body = (
    <>
      <div className="px-5 pt-7 pb-3.5 flex items-start justify-between gap-3">
        <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Processor log
        </h1>
        {!isDesktop && (
          <Link to="/settings" className="text-[13px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            &larr; Settings
          </Link>
        )}
      </div>

      {dates && dates.length === 0 && (
        <div className="px-5 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
          No processor logs yet.
        </div>
      )}

      {dates && dates.length > 0 && (
        <div className="px-5 pb-4 flex items-center gap-2.5">
          <select
            value={date ?? ''}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border px-3 py-2 text-[13px] outline-none"
            style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadContent}
            className="rounded-xl border px-3 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Refresh
          </button>
        </div>
      )}

      {error && (
        <div className="px-5 pb-4 text-[13.5px]" style={{ color: 'var(--color-dismiss-text)' }}>
          Couldn't load the log: {error.message}
        </div>
      )}

      {content !== null && (
        <div className="grow overflow-y-auto mx-5 mb-6 rounded-2xl border p-4" style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}>
          <pre className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
            {newestFirst(content)}
          </pre>
        </div>
      )}
    </>
  );

  if (isDesktop) {
    return <DesktopPageShell onLoggedOut={() => setLoggedOut(true)}>{body}</DesktopPageShell>;
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {body}
    </div>
  );
}
