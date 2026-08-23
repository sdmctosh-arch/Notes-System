import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import Prose from '../components/Prose';
import PageShell from '../components/PageShell';

// The stored file has a YAML frontmatter block (title, category,
// captured, ...) written by write_vault_note - useful as metadata, not
// as something to render literally as Markdown text.
function stripFrontmatter(content) {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---\n', 4);
  return end === -1 ? content : content.slice(end + 5);
}

export default function VaultNote() {
  const { folder, filename } = useParams();
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loggedOut, setLoggedOut] = useState(false);

  const load = () => {
    setContent(null);
    setError(null);
    api.getVaultNote(folder, filename).then((data) => setContent(data.content)).catch(setError);
  };

  useEffect(load, [folder, filename]);

  const showLogin = loggedOut || error?.status === 401;

  if (error && !showLogin) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
        Couldn't load this note: {error.message}
      </div>
    );
  }
  if (!showLogin && content === null) return null;

  const body = showLogin ? null : (
    <>
      <div className="px-5 pt-6 pb-4">
        <Link to="/vault" className="text-[13px] inline-flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          &larr; Vault
        </Link>
      </div>
      <div className="grow overflow-y-auto px-5 pb-6">
        <Prose>{stripFrontmatter(content)}</Prose>
      </div>
    </>
  );

  return (
    <PageShell
      loggedOut={showLogin}
      onLoggedOut={() => setLoggedOut(true)}
      onLoginSuccess={() => {
        setLoggedOut(false);
        load();
      }}
    >
      {body}
    </PageShell>
  );
}
