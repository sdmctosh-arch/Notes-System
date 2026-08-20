import Markdown from 'react-markdown';

export default function Prose({ children }) {
  if (!children) return null;
  return (
    <div className="text-[14.5px] leading-relaxed mb-5 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_strong]:font-semibold [&_h1]:font-serif [&_h2]:font-serif [&_h3]:font-serif [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:text-base [&_h2]:text-base [&_h3]:text-[15px] [&_h1]:mb-2 [&_h2]:mb-2 [&_h3]:mb-2 [&_code]:text-[13px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:mb-3"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <Markdown>{children}</Markdown>
    </div>
  );
}
