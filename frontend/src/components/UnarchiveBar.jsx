import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function UnarchiveBar({ queueId }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function unarchive() {
    setPending(true);
    setError(null);
    try {
      await api.unarchiveItem(queueId);
      navigate('/');
    } catch (e) {
      setError(e.message);
      setPending(false);
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
          disabled={pending}
          onClick={unarchive}
          className="grow text-center py-2.5 rounded-xl border text-[13px] font-semibold disabled:opacity-50"
          style={{ borderColor: 'var(--color-btn-border)', color: 'var(--color-btn-text)' }}
        >
          {pending ? 'Restoring…' : 'Unarchive'}
        </button>
      </div>
    </div>
  );
}
