import { useEffect, useMemo, useState } from "react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import {
  tauri,
  type DocumentEntry,
  type DocumentMeta,
  type FileEntryMeta,
} from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useFiles } from "../hooks/useFiles";
import { DocumentEditor } from "../components/DocumentEditor";
import { DropZone } from "../components/DropZone";
import { PreviewModal } from "../components/PreviewModal";
import {
  decodeBase64Text,
  encodeTextBase64,
  previewKindFor,
  type PreviewKind,
} from "../lib/preview";
import { categoryFor, type CategoryKey } from "../lib/categories";
import { CATEGORY_ICONS } from "../lib/icons";

type ListItem =
  | {
      kind: "doc";
      id: string;
      title: string;
      snippet: string;
      updated: string;
      tag: string;
    }
  | {
      kind: "file";
      id: string;
      title: string;
      snippet: string;
      updated: string;
      tag: string;
      size: number;
      file: FileEntryMeta;
      editable: boolean;
    };

type Editing =
  | { kind: "new-doc" }
  | { kind: "doc"; entry: DocumentEntry }
  | { kind: "file-text"; file: FileEntryMeta; text: string };

interface RichEntriesPanelProps {
  /** Backend doc kind ("documents" / "personal"). */
  docKind: string;
  /** File category that lives on this surface. */
  fileCategory: CategoryKey;
  /** Page title in the header. */
  title: string;
  /** Subtitle noun ("document" / "personal item"). */
  itemNoun: string;
  /** Label for the structured-entry create button. */
  newButtonLabel: string;
  /** Label shown on the entry tag pill. */
  entryTagLabel: string;
  /** Whether to honour pendingDocumentId from the store (used by Documents only). */
  honourPendingDocumentId?: boolean;
}

function formatDate(iso: string): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return iso;
  return t.toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTagFor(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : "FILE";
  return ext.length > 6 ? "FILE" : ext;
}

export function RichEntriesPanel({
  docKind,
  fileCategory,
  title,
  itemNoun,
  newButtonLabel,
  entryTagLabel,
  honourPendingDocumentId,
}: RichEntriesPanelProps) {
  const {
    files,
    setMeta,
    pendingDocumentId,
    setPendingDocumentId,
  } = useVaultStore();
  const { addFromPath, remove: removeFile } = useFiles();

  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  /** null = "All", "Main" = main tag (also covers legacy blank-tag items). */
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    file: FileEntryMeta;
    kind: PreviewKind;
    data: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refresh = async () => {
    setError(null);
    try {
      const list = await tauri.listDocuments(docKind);
      setDocs(list);
      try {
        const m = await tauri.getVaultMeta();
        setMeta(m);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKind]);

  // Deep-link open from elsewhere in the app (only Documents subscribes).
  useEffect(() => {
    if (!honourPendingDocumentId) return;
    if (!pendingDocumentId) return;
    const id = pendingDocumentId;
    setPendingDocumentId(null);
    tauri
      .getDocument(id)
      .then((full) => setEditing({ kind: "doc", entry: full }))
      .catch((e) => setError(typeof e === "string" ? e : "Failed to open"));
  }, [pendingDocumentId, setPendingDocumentId, honourPendingDocumentId]);

  // Tags derived from existing docs + matching files + any newly-created (empty) tags.
  const surfaceFiles = useMemo(
    () => files.filter((f) => f.category === fileCategory),
    [files, fileCategory]
  );
  const tags = useMemo<string[]>(() => {
    const set = new Set<string>(extraTags);
    for (const d of docs) {
      const s = (d.section ?? "").trim();
      if (s.length > 0 && s.toLowerCase() !== "main") set.add(s);
    }
    for (const f of surfaceFiles) {
      const s = (f.section ?? "").trim();
      if (s.length > 0 && s.toLowerCase() !== "main") set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [docs, surfaceFiles, extraTags]);

  const isInTag = (
    item: { section?: string | null },
    tag: string
  ): boolean => {
    const s = (item.section ?? "").trim();
    if (tag === "Main") return s === "" || s.toLowerCase() === "main";
    return s === tag;
  };

  const items = useMemo<ListItem[]>(() => {
    const filteredDocs =
      activeTag === null
        ? docs
        : docs.filter((d) => isInTag(d, activeTag));
    const docItems: ListItem[] = filteredDocs.map((d) => ({
      kind: "doc",
      id: d.id,
      title: d.title,
      snippet: d.snippet,
      updated: d.updated_at,
      tag: entryTagLabel,
    }));
    const filteredFiles =
      activeTag === null
        ? surfaceFiles
        : surfaceFiles.filter((f) => isInTag(f, activeTag));
    const fileItems: ListItem[] = filteredFiles.map((f) => ({
      kind: "file",
      id: f.id,
      title: f.name,
      snippet: "",
      updated: f.added_at,
      tag: fileTagFor(f.name),
      size: f.size,
      file: f,
      editable: previewKindFor(f.name) === "text",
    }));
    const all = [...docItems, ...fileItems];
    all.sort((a, b) => (a.updated < b.updated ? 1 : -1));
    return all;
  }, [docs, surfaceFiles, activeTag, entryTagLabel]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.snippet.toLowerCase().includes(q)
    );
  }, [items, search]);

  // ── Open handlers ─────────────────────────────────────────────────────
  const onOpen = async (item: ListItem) => {
    setError(null);
    if (item.kind === "doc") {
      try {
        const full = await tauri.getDocument(item.id);
        setEditing({ kind: "doc", entry: full });
      } catch (e) {
        setError(typeof e === "string" ? e : "Failed to open");
      }
      return;
    }
    if (item.editable) {
      try {
        const [, b64] = await tauri.getFileData(item.id);
        const text = decodeBase64Text(b64);
        setEditing({ kind: "file-text", file: item.file, text });
      } catch (e) {
        setError(typeof e === "string" ? e : "Failed to open file");
      }
    } else {
      await onPreviewFile(item.file);
    }
  };

  const onSaveNewDoc = async (
    title: string,
    content: string,
    section?: string
  ) => {
    setSaving(true);
    try {
      await tauri.addDocument(title, content, section ?? null, docKind);
      if (section) {
        setExtraTags((prev) => prev.filter((s) => s !== section));
      }
      await refresh();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const onSaveExistingDoc = async (
    title: string,
    content: string,
    section?: string
  ) => {
    if (editing?.kind !== "doc") return;
    setSaving(true);
    try {
      const updated = await tauri.updateDocument(
        editing.entry.id,
        title,
        content,
        section ?? null,
        docKind
      );
      await refresh();
      setEditing({ kind: "doc", entry: updated });
    } finally {
      setSaving(false);
    }
  };

  const onSaveFileText = async (
    _title: string,
    text: string,
    section?: string
  ) => {
    if (editing?.kind !== "file-text") return;
    setSaving(true);
    try {
      const b64 = encodeTextBase64(text);
      await tauri.updateFileData(editing.file.id, b64);
      const currentSection = (editing.file.section ?? "").trim();
      const newSection = (section ?? "").trim();
      if (newSection !== currentSection) {
        await tauri.setFileSection(editing.file.id, newSection);
      }
      await refresh();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const onDeleteEditing = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.kind === "doc") {
        await tauri.deleteDocument(editing.entry.id);
      } else if (editing.kind === "file-text") {
        await tauri.deleteFile(editing.file.id);
      }
      await refresh();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  // Row actions
  const onDeleteItem = async (item: ListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    if (!window.confirm(`Delete "${item.title}"? Cannot be undone.`)) return;
    try {
      if (item.kind === "doc") {
        await tauri.deleteDocument(item.id);
      } else {
        await removeFile(item.id);
      }
      await refresh();
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to delete");
    }
  };

  const onDownloadItem = async (item: ListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.kind === "file") {
      await onDownloadFile(item.file);
      return;
    }
    setError(null);
    try {
      const safe = item.title.replace(/[^A-Za-z0-9._-]+/g, "_") || "document";
      const target = await saveDialog({
        defaultPath: `${safe}.pdf`,
        filters: [
          { name: "PDF", extensions: ["pdf"] },
          { name: "HTML (formatted)", extensions: ["html"] },
          { name: "Markdown", extensions: ["md"] },
          { name: "Plain text", extensions: ["txt"] },
        ],
        title: `Save "${item.title}"`,
      });
      if (!target || typeof target !== "string") return;
      await tauri.exportDocument(item.id, target);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to save");
    }
  };

  // Files-on-this-surface helpers
  const tagForNewItems = (): string => {
    if (activeTag === null || activeTag === "Main") return "Main";
    return activeTag;
  };

  const onUploadFile = async () => {
    setError(null);
    try {
      const selected = await openDialog({
        multiple: false,
        title: `Choose a file to add to ${title}`,
      });
      if (!selected || typeof selected !== "string") return;
      setBusy(true);
      await addFromPath(selected, fileCategory, tagForNewItems());
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to add file");
    } finally {
      setBusy(false);
    }
  };

  const onDropFile = async (path: string) => {
    setError(null);
    setBusy(true);
    try {
      await addFromPath(path, fileCategory, tagForNewItems());
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to add file");
    } finally {
      setBusy(false);
    }
  };

  const onDownloadFile = async (file: FileEntryMeta) => {
    setError(null);
    try {
      const target = await saveDialog({
        defaultPath: file.name,
        title: `Save ${file.name} to disk`,
      });
      if (!target || typeof target !== "string") return;
      await tauri.saveFileToDisk(file.id, target);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to save file");
    }
  };

  const onPreviewFile = async (file: FileEntryMeta) => {
    setError(null);
    setPreviewLoading(true);
    try {
      const [, data] = await tauri.getFileData(file.id);
      setPreview({ file, kind: previewKindFor(file.name), data });
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Editor mode takes over the whole panel ────────────────────────────
  if (editing) {
    const known = ["Main", ...tags.filter((s) => s.toLowerCase() !== "main")];
    if (editing.kind === "new-doc") {
      const defaultTag =
        activeTag === null || activeTag === "Main" || activeTag === ""
          ? "Main"
          : activeTag;
      return (
        <DocumentEditor
          mode="rich"
          initialSection={defaultTag}
          knownSections={known}
          onSave={onSaveNewDoc}
          onCancel={() => setEditing(null)}
          saving={saving}
        />
      );
    }
    if (editing.kind === "doc") {
      const docSection = (editing.entry.section ?? "").trim();
      const initialSection = docSection === "" ? "Main" : docSection;
      return (
        <DocumentEditor
          mode="rich"
          initialTitle={editing.entry.title}
          initialContent={editing.entry.content}
          initialSection={initialSection}
          knownSections={known}
          onSave={onSaveExistingDoc}
          onCancel={() => setEditing(null)}
          onDelete={onDeleteEditing}
          saving={saving}
        />
      );
    }
    const fileSection = (editing.file.section ?? "").trim();
    const fileInitialSection = fileSection === "" ? "Main" : fileSection;
    return (
      <DocumentEditor
        mode="plain"
        initialTitle={editing.file.name}
        initialContent={editing.text}
        titleEditable={false}
        initialSection={fileInitialSection}
        knownSections={known}
        onSave={onSaveFileText}
        onCancel={() => setEditing(null)}
        onDelete={onDeleteEditing}
        saving={saving}
      />
    );
  }

  // ── List view ─────────────────────────────────────────────────────────
  const cat = categoryFor(fileCategory);
  return (
    <>
      <div className="vb-header">
        <div>
          <div className="vb-title">{title}</div>
          <div className="vb-subtitle">
            {items.length} {items.length === 1 ? itemNoun : `${itemNoun}s`}
          </div>
        </div>
        <div className="vb-actions">
          <input
            type="search"
            className="pw-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={onUploadFile}
            disabled={busy}
          >
            + Upload file
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setEditing({ kind: "new-doc" })}
          >
            {newButtonLabel}
          </button>
        </div>
      </div>

      <div className="doc-section-tabs">
        <button
          type="button"
          className={
            "doc-section-tab" + (activeTag === null ? " active" : "")
          }
          onClick={() => setActiveTag(null)}
        >
          All
        </button>
        <button
          type="button"
          className={
            "doc-section-tab" + (activeTag === "Main" ? " active" : "")
          }
          onClick={() => setActiveTag("Main")}
          title="Items in the Main tag (default)"
        >
          Main
        </button>
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className={
              "doc-section-tab" + (activeTag === t ? " active" : "")
            }
            onClick={() => setActiveTag(t)}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          className="doc-section-tab doc-section-add"
          onClick={() => {
            const name = window.prompt(
              "New tag name (e.g. House things, Letters, Finances):"
            );
            if (!name) return;
            const trimmed = name.trim();
            if (!trimmed) return;
            setExtraTags((prev) =>
              prev.includes(trimmed) ? prev : [...prev, trimmed]
            );
            setActiveTag(trimmed);
          }}
          title="Create a new tag"
        >
          + Tag
        </button>
      </div>

      <div className="vb-body">
        {error && <div className="vb-error">{error}</div>}

        {loading ? (
          <div className="bene-empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="bene-empty">
            Nothing here yet. Click <strong>{newButtonLabel}</strong> to write
            one, or drop a file below.
          </div>
        ) : filtered.length === 0 ? (
          <div className="bene-empty">No items match "{search}".</div>
        ) : (
          <div className="doc-unified-list">
            {filtered.map((item) => (
              <div
                key={`${item.kind}:${item.id}`}
                className="doc-row"
                onClick={() => onOpen(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void onOpen(item);
                  }
                }}
              >
                <div
                  className="file-icon"
                  style={{ background: cat?.bg ?? "#eee" }}
                >
                  {item.kind === "doc" ? (
                    <DocGlyph />
                  ) : (
                    CATEGORY_ICONS[fileCategory] && (
                      <img
                        src={CATEGORY_ICONS[fileCategory]}
                        alt=""
                        className="file-icon-glyph"
                      />
                    )
                  )}
                </div>
                <div className="doc-row-main">
                  <div className="doc-row-title">{item.title}</div>
                  <div className="doc-row-meta">
                    {item.kind === "doc"
                      ? `Updated ${formatDate(item.updated)}`
                      : `Added ${formatDate(item.updated)} · ${formatSize(item.size)}`}
                    {item.kind === "doc" && item.snippet && (
                      <> · {item.snippet}</>
                    )}
                  </div>
                </div>
                <span
                  className="file-tag"
                  style={{ background: cat?.bg, color: cat?.fg }}
                >
                  {item.tag}
                  {item.kind === "file" && item.editable && " · editable"}
                </span>
                <button
                  type="button"
                  className="file-row-action"
                  onClick={(e) => onDownloadItem(item, e)}
                  aria-label={`Download ${item.title}`}
                  title={item.kind === "doc" ? "Download as PDF / HTML / Markdown / TXT" : "Download"}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 2v7M4 6.5l3 3 3-3M2.5 11h9"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="file-row-action file-row-delete"
                  onClick={(e) => onDeleteItem(item, e)}
                  aria-label={`Delete ${item.title}`}
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 4h8M5.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M4 4l.5 7a1 1 0 001 1h3a1 1 0 001-1L10 4"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <DropZone category={fileCategory} onDrop={onDropFile} busy={busy} />
      </div>

      {previewLoading && (
        <div className="modal-backdrop">
          <div className="preview-loading">Decrypting…</div>
        </div>
      )}

      {preview && (
        <PreviewModal
          filename={preview.file.name}
          data={preview.data}
          kind={preview.kind}
          onClose={() => setPreview(null)}
          onDownload={() => {
            const f = preview.file;
            setPreview(null);
            void onDownloadFile(f);
          }}
        />
      )}
    </>
  );
}

function DocGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ opacity: 0.75 }}
    >
      <path
        d="M3 1.5h5l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1" />
      <path
        d="M4.5 7.5h5M4.5 9.5h5M4.5 11.5h3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
