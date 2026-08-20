import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Login from '../components/Login';

function timeAgo(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.round(diffMs / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export default function Vault() {
  const [folders, setFolders] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    api.getVault().then(setFolders).catch(setError);
  };

  useEffect(load, []);

  if (error?.status === 401) {
    return <Login onSuccess={load} />;
  }
  if (error) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
        Couldn't load the vault: {error.message}
      </div>
    );
  }

  const folderNames = folders ? Object.keys(folders).sort() : [];

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="px-5 pt-7 pb-3.5 flex items-start justify-between gap-3">
        <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Vault
        </h1>
        <Link to="/" className="text-[13px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          &larr; Inbox
        </Link>
      </div>

      {folders && folderNames.length === 0 && (
        <div className="flex-grow flex items-center justify-center text-center p-10 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
          Nothing kept in the vault yet.
        </div>
      )}

      <div className="flex flex-col gap-6 px-5 pb-6">
        {folderNames.map((folder) => (
          <div key={folder}>
            <div className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
              {folder} &middot; {folders[folder].length}
            </div>
            <div className="flex flex-col gap-2">
              {folders[folder].map((note) => (
                <Link
                  key={note.filename}
                  to={`/vault/${encodeURIComponent(folder)}/${encodeURIComponent(note.filename)}`}
                  className="rounded-2xl border p-3.5 hover:opacity-90 transition-opacity"
                  style={{
                    background: 'var(--color-card-bg)',
                    borderColor: 'var(--color-border)',
                    boxShadow: 'var(--color-card-shadow)',
                  }}
                >
                  <div className="font-serif font-semibold text-[15px]" style={{ color: 'var(--color-text-primary)' }}>
                    {note.title}
                  </div>
                  {note.captured && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {timeAgo(note.captured)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
