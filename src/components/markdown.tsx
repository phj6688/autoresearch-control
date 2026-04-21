"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-2.5 text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-bold" style={{ color: "var(--color-text-primary)" }}>
      {children}
    </strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-1.5 ml-3 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1.5 ml-3 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code
          className="block overflow-x-auto rounded px-2 py-1.5 text-[11px] leading-relaxed"
          style={{
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text-secondary)",
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded px-1 py-0.5 text-[11px]"
        style={{
          backgroundColor: "var(--color-bg)",
          color: "var(--color-accent)",
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-1.5 overflow-x-auto">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote
      className="mb-1.5 border-l-2 pl-2 italic"
      style={{
        borderColor: "var(--color-accent)",
        color: "var(--color-text-secondary)",
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: "var(--color-accent)" }}
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr className="my-2" style={{ borderColor: "var(--color-border)" }} />
  ),
  table: ({ children }) => (
    <div className="mb-1.5 overflow-x-auto">
      <table className="w-full text-[11px]" style={{ borderColor: "var(--color-border)" }}>
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th
      className="border px-2 py-1 text-left font-semibold"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border px-2 py-1" style={{ borderColor: "var(--color-border)" }}>
      {children}
    </td>
  ),
};

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
