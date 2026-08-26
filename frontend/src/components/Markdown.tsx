import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown renderer for AI responses and journal entries.
 * Code blocks are always LTR even inside the RTL UI.
 */
export default function Markdown({ content, className = '' }: { content: string; className?: string }) {
  const components = useMemo(
    () => ({
      pre: ({ children }: { children?: React.ReactNode }) => (
        <pre dir="ltr" className="my-3 overflow-x-auto rounded-xl bg-[rgb(var(--code-bg))] p-3 text-sm">
          {children}
        </pre>
      ),
      code: ({ children, className: c }: { children?: React.ReactNode; className?: string }) =>
        c ? (
          <code dir="ltr" className={c}>
            {children}
          </code>
        ) : (
          <code dir="ltr" className="rounded bg-[rgb(var(--code-bg))] px-1.5 py-0.5 text-[0.85em]">
            {children}
          </code>
        ),
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="border border-line bg-brand-soft px-3 py-1.5 text-start font-bold">{children}</th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="border border-line px-3 py-1.5">{children}</td>
      ),
    }),
    [],
  );

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
