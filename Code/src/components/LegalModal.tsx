import { useEffect } from "react";

interface Props {
  title: string;
  markdown: string;
  onClose: () => void;
}

/**
 * Tiny renderer for the limited Markdown subset our legal documents use:
 *   # / ## / ### headings, > blockquotes, **bold**, bullet lists, paragraphs.
 * Links of the form [text](url) are rendered as plain text — these documents
 * are read inside Signet; users can find live links by opening the .md files
 * in the repo.
 */
function renderMarkdown(src: string): React.ReactNode {
  const lines = src.split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let listItems: string[] = [];
  let blockquote: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(
        <p key={out.length}>{renderInline(para.join(" ").trim())}</p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      out.push(
        <ul key={out.length}>
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };
  const flushQuote = () => {
    if (blockquote.length) {
      out.push(
        <blockquote key={out.length}>
          {renderInline(blockquote.join(" "))}
        </blockquote>
      );
      blockquote = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("# ")) {
      flushAll();
      out.push(<h1 key={out.length}>{line.slice(2)}</h1>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushAll();
      out.push(<h2 key={out.length}>{line.slice(3)}</h2>);
      continue;
    }
    if (line.startsWith("### ")) {
      flushAll();
      out.push(<h3 key={out.length}>{line.slice(4)}</h3>);
      continue;
    }
    if (line.startsWith("> ")) {
      flushPara();
      flushList();
      blockquote.push(line.slice(2));
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      flushQuote();
      listItems.push(line.slice(2));
      continue;
    }
    if (line.trim() === "---") {
      flushAll();
      out.push(<hr key={out.length} />);
      continue;
    }
    if (line.trim() === "") {
      flushAll();
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  flushAll();
  return out;
}

/** Inline: **bold**, *italic*, and `code`. Links rendered as plain text. */
function renderInline(text: string): React.ReactNode {
  // Strip [text](url) → text
  const noLinks = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Tokenize on bold/italic/code markers, leaving the markers in.
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noLinks)) !== null) {
    if (m.index > i) parts.push(noLinks.slice(i, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    i = m.index + token.length;
  }
  if (i < noLinks.length) parts.push(noLinks.slice(i));
  return parts;
}

export function LegalModal({ title, markdown, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal legal-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="preview-modal-header">
          <div className="preview-modal-title">
            <div className="preview-modal-name">{title}</div>
          </div>
          <div className="preview-modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="legal-modal-body">{renderMarkdown(markdown)}</div>
      </div>
    </div>
  );
}
