import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import Login from '../components/Login';
import DesktopPageShell from '../components/DesktopPageShell';
import { useIsDesktop } from '../useIsDesktop';

export default function NewItem() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('idea');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const isDesktop = useIsDesktop();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const created = await api.createItem({ category, title: title.trim() || null, body: body.trim() });
      navigate(`/items/${encodeURIComponent(created.queue_id)}`);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (loggedOut || error?.status === 401) {
    return <Login onSuccess={() => { setLoggedOut(false); setError(null); }} />;
  }

  const fieldStyle = {
    background: 'var(--color-card-bg)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-primary)',
  };

  const content = (
    <>
      <div className="px-5 pt-7 pb-3.5 flex items-start justify-between gap-3">
        <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          New note
        </h1>
        {!isDesktop && (
          <Link to="/" className="text-[13px] shrink-0 mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            &larr; Inbox
          </Link>
        )}
      </div>

      <div className="px-5 pb-4 flex flex-col gap-3">
        <CategoryPicker value={category} onChange={setCategory} />
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] font-serif font-semibold outline-none"
          style={fieldStyle}
        />
      </div>

      <div className="grow overflow-y-auto px-5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What do you want to remember?"
          rows={10}
          className="w-full rounded-xl border p-3.5 text-[14.5px] leading-relaxed outline-none resize-none"
          style={fieldStyle}
        />
      </div>

      <div className="border-t mt-4" style={{ borderColor: 'var(--color-border)' }}>
        {error && (
          <div className="px-5 pt-3 text-[13px]" style={{ color: 'var(--color-dismiss-text)' }}>
            {error}
          </div>
        )}
        <div className="flex gap-2 p-5">
          <button
            disabled={saving || !body.trim()}
            onClick={save}
            className="grow text-center py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <Link
            to="/"
            className="grow text-center py-2.5 rounded-xl border text-[13px] font-semibold"
            style={{ borderColor: 'var(--color-btn-border)', color: 'var(--color-btn-text)' }}
          >
            Cancel
          </Link>
        </div>
      </div>
    </>
  );

  if (isDesktop) {
    return <DesktopPageShell onLoggedOut={() => setLoggedOut(true)}>{content}</DesktopPageShell>;
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {content}
    </div>
  );
}
