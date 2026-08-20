import { useState } from 'react';
import { api } from '../api';

export default function ChecklistRow({ item, onDone }) {
  const [pending, setPending] = useState(false);

  async function handleCheck() {
    setPending(true);
    try {
      await api.moveItem(item.queue_id, 'dismiss');
      onDone(item.queue_id);
    } catch {
      setPending(false);
    }
  }

  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-3.5"
      style={{
        background: 'var(--color-card-bg)',
        borderColor: 'var(--color-border)',
        boxShadow: 'var(--color-card-shadow)',
        opacity: pending ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked="false"
        aria-label={`Mark "${item.title || item.capture_id}" done`}
        disabled={pending}
        onClick={handleCheck}
        className="w-5 h-5 rounded-full border shrink-0 mt-0.5 flex items-center justify-center"
        style={{ borderColor: 'var(--color-btn-border)' }}
      />
      <div className="min-w-0 grow">
        <div className="font-serif font-semibold text-base leading-tight" style={{ color: 'var(--color-text-primary)' }}>
          {item.title || item.capture_id}
        </div>
        {item.body && (
          <div
            className="text-[13px] mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {item.body}
          </div>
        )}
      </div>
    </div>
  );
}
