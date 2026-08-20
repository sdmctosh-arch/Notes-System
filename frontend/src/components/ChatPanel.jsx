import { useState } from 'react';
import { api } from '../api';

function Bubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)' }
            : { background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }
        }
      >
        {message.text}
      </div>
    </div>
  );
}

export default function ChatPanel({ item, onUpdate }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSend(e) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    try {
      const updated = await api.sendChatMessage(item.queue_id, message);
      onUpdate(updated);
      setDraft('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t pt-5 mt-2" style={{ borderColor: 'var(--color-border)' }}>
      <div className="font-serif font-semibold text-[15px] mb-3" style={{ color: 'var(--color-text-primary)' }}>
        Follow up
      </div>

      {item.chat.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-3">
          {item.chat.map((m, i) => (
            <Bubble key={i} message={m} />
          ))}
        </div>
      )}

      {sending && (
        <div className="text-[13px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Thinking…
        </div>
      )}

      {error && (
        <div className="text-[13px] mb-3" style={{ color: 'var(--color-dismiss-text)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a follow-up…"
          disabled={sending}
          className="grow rounded-xl border px-3.5 py-2.5 text-[14px] outline-none disabled:opacity-50"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50 shrink-0"
          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
