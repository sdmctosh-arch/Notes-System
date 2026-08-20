import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import Login from '../components/Login';

// Same frontmatter block shape as vault notes, but the body here is the
// user's raw dictated/typed text - never pass it through react-markdown,
// since a stray "#" or "-" in what someone actually said isn't intended
// as Markdown syntax the way a model's generated output is.
function stripFrontmatter(content) {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---\n', 4);
  return end === -1 ? content : content.slice(end + 5);
}

export default function CaptureView() {
  const { captureId } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setContent(null);
    setError(null);
    api.getCapture(captureId).then((data) => setContent(data.content)).catch(setError);
  };

  useEffect(load, [captureId]);

  if (error?.status === 401) {
    return <Login onSuccess={load} />;
  }
  if (error) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--color-dismiss-text)' }}>
        Couldn't load the original capture: {error.message}
      </div>
    );
  }
  if (content === null) return null;

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div className="px-5 pt-6 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-[13px] inline-flex items-center gap-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          &larr; Back
        </button>
        <div className="text-[11px] uppercase tracking-wide font-semibold mt-3" style={{ color: 'var(--color-text-muted)' }}>
          Original capture
        </div>
      </div>
      <div className="grow overflow-y-auto px-5 pb-6">
        <div
          className="text-[14.5px] leading-relaxed whitespace-pre-wrap"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {stripFrontmatter(content)}
        </div>
      </div>
    </div>
  );
}
