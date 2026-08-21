import { useState } from 'react';
import { api } from '../api';

export default function ReenrichButton({ queueId }) {
  const [state, setState] = useState('idle'); // idle | requesting | requested | error
  const [error, setError] = useState(null);

  async function request() {
    setState('requesting');
    setError(null);
    try {
      await api.requestReenrich(queueId);
      setState('requested');
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  }

  if (state === 'requested') {
    return (
      <div className="text-[13px] mt-4" style={{ color: 'var(--color-text-muted)' }}>
        Re-enrich requested - the processor picks it up on its next run, usually within a few minutes.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        onClick={request}
        disabled={state === 'requesting'}
        className="text-[13.5px] inline-flex items-center gap-1.5 disabled:opacity-50"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10a6 6 0 0 1 10.2-4.2M16 10a6 6 0 0 1-10.2 4.2" />
          <path d="M14.2 3.5v2.3h-2.3M5.8 16.5v-2.3h2.3" />
        </svg>
        <span>{state === 'requesting' ? 'Requesting…' : 'Re-enrich'}</span>
      </button>
      {state === 'error' && (
        <div className="text-[13px] mt-1.5" style={{ color: 'var(--color-dismiss-text)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
