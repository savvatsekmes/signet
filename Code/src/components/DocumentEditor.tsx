import { useEffect, useRef, useState } from "react";
import { Combobox } from "./Combobox";

interface Props {
  initialTitle?: string;
  initialContent?: string;
  /**
   * "rich" — contentEditable HTML editor with toolbar (for structured documents).
   * "plain" — plain-text mode for editing .txt / .md / code files. Toolbar hidden,
   * content saved as plain text (no HTML markup).
   */
  mode?: "rich" | "plain";
  /** Override the title input behaviour — when false, title is read-only (e.g. filename). */
  titleEditable?: boolean;
  /** When set, shows a section picker. Sections are free text. */
  initialSection?: string;
  knownSections?: string[];
  onSave: (
    title: string,
    content: string,
    section?: string
  ) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
  saving?: boolean;
}

interface ToolbarBtn {
  label: string;
  cmd: () => void;
  title: string;
  isActive?: () => boolean;
}

export function DocumentEditor({
  initialTitle = "",
  initialContent = "",
  mode = "rich",
  titleEditable = true,
  initialSection,
  knownSections,
  onSave,
  onCancel,
  onDelete,
  saving,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [section, setSection] = useState(initialSection ?? "");
  const editorRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Seed the editor on mount. In rich mode the seed is HTML, in plain mode it's text.
  useEffect(() => {
    if (!editorRef.current) return;
    if (mode === "rich") {
      if (initialContent) editorRef.current.innerHTML = initialContent;
    } else {
      editorRef.current.textContent = initialContent;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save with Ctrl+S / Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void doSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    force((n) => n + 1);
  };

  const onLink = () => {
    const sel = window.getSelection();
    const url = window.prompt(
      "Link URL (leave blank to remove)",
      "https://"
    );
    if (url === null) return;
    if (!url || !sel || sel.isCollapsed) {
      document.execCommand("unlink");
    } else {
      document.execCommand("createLink", false, url);
    }
    editorRef.current?.focus();
  };

  const isActive = (cmd: string): boolean => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };

  const blockIs = (block: string): boolean => {
    try {
      return (
        document.queryCommandValue("formatBlock").toLowerCase() ===
        block.toLowerCase()
      );
    } catch {
      return false;
    }
  };

  const buttons: (ToolbarBtn | "divider")[] = [
    { label: "B", cmd: () => exec("bold"), title: "Bold (Ctrl+B)", isActive: () => isActive("bold") },
    { label: "I", cmd: () => exec("italic"), title: "Italic (Ctrl+I)", isActive: () => isActive("italic") },
    { label: "U", cmd: () => exec("underline"), title: "Underline (Ctrl+U)", isActive: () => isActive("underline") },
    "divider",
    { label: "H1", cmd: () => exec("formatBlock", "h1"), title: "Heading 1", isActive: () => blockIs("h1") },
    { label: "H2", cmd: () => exec("formatBlock", "h2"), title: "Heading 2", isActive: () => blockIs("h2") },
    { label: "P", cmd: () => exec("formatBlock", "p"), title: "Paragraph", isActive: () => blockIs("p") },
    "divider",
    { label: "•", cmd: () => exec("insertUnorderedList"), title: "Bullet list", isActive: () => isActive("insertUnorderedList") },
    { label: "1.", cmd: () => exec("insertOrderedList"), title: "Numbered list", isActive: () => isActive("insertOrderedList") },
    "divider",
    { label: "🔗", cmd: onLink, title: "Insert / remove link" },
    { label: "↶", cmd: () => exec("undo"), title: "Undo (Ctrl+Z)" },
    { label: "↷", cmd: () => exec("redo"), title: "Redo (Ctrl+Y)" },
  ];

  const doSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const content =
      mode === "rich"
        ? editorRef.current?.innerHTML ?? ""
        : editorRef.current?.textContent ?? "";
    try {
      await onSave(title.trim(), content, section.trim());
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to save");
    }
  };

  const onDeleteClick = async () => {
    if (!onDelete) return;
    if (!window.confirm(`Delete "${title || "this document"}"? Cannot be undone.`)) {
      return;
    }
    try {
      await onDelete();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to delete");
    }
  };

  return (
    <>
      <div className="vb-header doc-editor-header">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          ← Back
        </button>
        <input
          className="doc-title-input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder={mode === "plain" ? "filename.txt" : "Untitled document"}
          autoFocus={!initialTitle && titleEditable}
          readOnly={!titleEditable}
        />
        <div className="vb-actions">
          {onDelete && (
            <button
              type="button"
              className="action-btn action-btn-danger"
              onClick={onDeleteClick}
              disabled={saving}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={doSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {initialSection !== undefined && (
        <div className="doc-section-bar">
          <label htmlFor="doc-section">Section</label>
          <div style={{ flex: 1, maxWidth: 320 }}>
            <Combobox
              id="doc-section"
              value={section}
              options={knownSections ?? []}
              onChange={setSection}
              className="doc-section-input"
              placeholder="Main — pick or type"
            />
          </div>
        </div>
      )}

      {mode === "rich" && (
      <div className="doc-toolbar">
        {buttons.map((b, i) =>
          b === "divider" ? (
            <span key={`d${i}`} className="doc-toolbar-divider" />
          ) : (
            <button
              key={`b${i}-${b.label}`}
              type="button"
              className={
                "doc-toolbar-btn" +
                (b.isActive && b.isActive() ? " doc-toolbar-active" : "")
              }
              onClick={b.cmd}
              title={b.title}
              onMouseDown={(e) => e.preventDefault()}
            >
              {b.label}
            </button>
          )
        )}
      </div>
      )}

      {error && (
        <div className="vb-error" style={{ margin: "0 18px" }}>
          {error}
        </div>
      )}

      <div
        className={"doc-editor" + (mode === "plain" ? " doc-editor-plain" : "")}
        contentEditable
        suppressContentEditableWarning
        ref={editorRef}
        onKeyUp={() => force((n) => n + 1)}
        onMouseUp={() => force((n) => n + 1)}
        spellCheck={mode === "rich"}
      />
    </>
  );
}
