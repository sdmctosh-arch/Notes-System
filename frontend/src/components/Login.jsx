import { useState } from 'react';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError('Incorrect password.');
        setSubmitting(false);
        return;
      }
      onSuccess();
    } catch {
      setError('Could not reach the server.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
      <h1 className="font-serif font-semibold text-2xl mb-6" style={{ color: 'var(--color-text-primary)' }}>
        Notes
      </h1>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none"
          style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />
        {error && (
          <div className="text-[13px]" style={{ color: 'var(--color-dismiss-text)' }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting || !password}
          className="rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
        >
          {submitting ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
