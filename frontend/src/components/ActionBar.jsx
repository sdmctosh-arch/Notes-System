import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// onDone is set by the desktop two-pane right pane (Inbox.jsx), which
// stays on "/" throughout - navigate('/') there wouldn't remount Inbox or
// refresh its list, so it passes a callback to do that instead.
export default function ActionBar({ queueId, onDone }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  async function run(action) {
    setPending(action);
    setError(null);
    try {
      await api.moveItem(queueId, action);
      if (onDone) {
        onDone();
      } else {
        navigate('/');
      }
    } catch (e) {
      setError(e.message);
      setPending(null);
    }
  }

  return (
    <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
      {error && (
        <div className="px-5 pt-3 text-[13px]" style={{ color: 'var(--color-dismiss-text)' }}>
          {error}
        </div>
      )}
      <div className="flex gap-2 p-5">
        <button
          disabled={!!pending}
          onClick={() => run('keep')}
          className="grow text-center py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
        >
          {pending === 'keep' ? 'Saving…' : 'Keep in vault'}
        </button>
        <button
          disabled={!!pending}
          onClick={() => run('archive')}
          className="grow text-center py-2.5 rounded-xl border text-[13px] font-semibold disabled:opacity-50"
          style={{ borderColor: 'var(--color-btn-border)', color: 'var(--color-btn-text)' }}
        >
          {pending === 'archive' ? 'Archiving…' : 'Archive'}
        </button>
        <button
          disabled={!!pending}
          onClick={() => run('dismiss')}
          className="grow text-center py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-50"
          style={{ color: 'var(--color-dismiss-text)' }}
        >
          {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}
