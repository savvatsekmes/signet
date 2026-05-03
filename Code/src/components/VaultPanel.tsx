import { useEffect, useMemo, useState } from "react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import {
  tauri,
  type DocumentMeta,
  type FileEntryMeta,
} from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useFiles } from "../hooks/useFiles";
import {
  CATEGORIES,
  CATEGORY_LIST,
  basenameFromPath,
  inferCategoryFromFilename,
  type CategoryDef,
  type CategoryKey,
} from "../lib/categories";
import { FileList } from "./FileList";
import { FileRow } from "./FileRow";
import { CategoryCard } from "./CategoryCard";
import { DropZone } from "./DropZone";
import { BeneficiaryStrip } from "./BeneficiaryStrip";
import { PreviewModal } from "./PreviewModal";
import { previewKindFor, type PreviewKind } from "../lib/preview";

interface Props {
  view: "all" | CategoryKey;
}

export function VaultPanel({ view }: Props) {
  const { files, beneficiaries, meta, setBrowserView, setPendingDocumentId, reset } =
    useVaultStore();
  const { addFromPath, remove, error: filesError } = useFiles();

  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [pickerCategory, setPickerCategory] =
    useState<CategoryKey>("documents");
  const [docs, setDocs] = useState<DocumentMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    tauri
      .listDocuments()
      .then((list) => {
        if (!cancelled) setDocs(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [meta?.document_count]);

  const visibleFiles = useMemo(() => {
    if (view === "all") return files;
    return files.filter((f) => f.category === view);
  }, [files, view]);

  const counts = useMemo(() => {
    const c: Record<CategoryKey, number> = {
      documents: 0,
      passwords: 0,
      crypto: 0,
      personal: 0,
      images: 0,
    };
    for (const f of files) {
      if ((c as Record<string, number>)[f.category] !== undefined) {
        c[f.category as CategoryKey]++;
      }
    }
    // Include structured entries (documents, personal, passwords, seeds) in
    // their category counts.
    c.documents += meta?.document_count ?? 0;
    c.personal += meta?.personal_count ?? 0;
    c.passwords += meta?.password_count ?? 0;
    c.crypto += meta?.seed_count ?? 0;
    return c;
  }, [
    files,
    meta?.document_count,
    meta?.personal_count,
    meta?.password_count,
    meta?.seed_count,
  ]);

  const activeCategory: CategoryDef | undefined =
    view === "all" ? undefined : CATEGORIES[view];

  // Used for the DropZone hint and as the fallback when extension can't be inferred.
  const fallbackCategory: CategoryKey =
    view === "all" ? pickerCategory : (view as CategoryKey);

  const categoryFor = (sourcePath: string): CategoryKey => {
    // When viewing a specific category, force everything dropped here into it.
    if (view !== "all") return view as CategoryKey;
    // In "all" view, prefer extension-based inference; otherwise picker default.
    const inferred = inferCategoryFromFilename(basenameFromPath(sourcePath));
    return inferred ?? pickerCategory;
  };

  const onAddFromPicker = async () => {
    setOpError(null);
    try {
      const selected = await openDialog({
        multiple: false,
        title: "Choose a file to encrypt and add to your vault",
      });
      if (!selected || typeof selected !== "string") return;
      setBusy(true);
      await addFromPath(selected, categoryFor(selected));
    } catch (err) {
      setOpError(typeof err === "string" ? err : "Failed to add file");
    } finally {
      setBusy(false);
    }
  };

  const onDropFile = async (path: string) => {
    setOpError(null);
    setBusy(true);
    try {
      await addFromPath(path, categoryFor(path));
    } catch (err) {
      setOpError(typeof err === "string" ? err : "Failed to add file");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    setOpError(null);
    try {
      await remove(id);
    } catch (err) {
      setOpError(typeof err === "string" ? err : "Failed to delete file");
    }
  };

  const onDownload = async (file: FileEntryMeta) => {
    setOpError(null);
    try {
      const target = await saveDialog({
        defaultPath: file.name,
        title: `Save ${file.name} to disk`,
      });
      if (!target || typeof target !== "string") return;
      await tauri.saveFileToDisk(file.id, target);
    } catch (err) {
      setOpError(typeof err === "string" ? err : "Failed to save file");
    }
  };

  const [exportSummary, setExportSummary] = useState<{
    files_written: number;
    passwords_written: number;
    documents_written: number;
    seeds_written: number;
    skipped: number;
    root: string;
  } | null>(null);

  const [preview, setPreview] = useState<{
    file: FileEntryMeta;
    kind: PreviewKind;
    data: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const onPreview = async (file: FileEntryMeta) => {
    setOpError(null);
    setPreviewLoading(true);
    try {
      const [, data] = await tauri.getFileData(file.id);
      setPreview({ file, kind: previewKindFor(file.name), data });
    } catch (err) {
      setOpError(typeof err === "string" ? err : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const onExportAll = async () => {
    setOpError(null);
    setExportSummary(null);
    try {
      const target = await openDialog({
        directory: true,
        title: "Choose a folder to export all files into",
      });
      if (!target || typeof target !== "string") return;
      setBusy(true);
      const result = await tauri.exportAllFiles(target);
      setExportSummary(result);
    } catch (err) {
      setOpError(typeof err === "string" ? err : "Failed to export files");
    } finally {
      setBusy(false);
    }
  };

  const onLock = async () => {
    await tauri.lockVault();
    reset();
  };

  const pendingCardCount = beneficiaries.filter((b) => !b.card_printed).length;
  const showCardsBanner =
    view === "all" && beneficiaries.length > 0 && pendingCardCount > 0;

  const lastUpdatedHint = (() => {
    if (!files.length) return meta?.created_at ? "created today" : "no files yet";
    const newest = files.reduce<string | null>((acc, f) => {
      if (!acc || f.added_at > acc) return f.added_at;
      return acc;
    }, null);
    if (!newest) return "—";
    const t = new Date(newest);
    const sameDay = t.toDateString() === new Date().toDateString();
    return sameDay
      ? "last updated today"
      : `last updated ${t.toLocaleDateString()}`;
  })();

  return (
    <>
      <div className="vb-header">
        <div>
          <div className="vb-title">
            {activeCategory ? activeCategory.label : "My vault"}
          </div>
          <div className="vb-subtitle">
            {visibleFiles.length} item
            {visibleFiles.length === 1 ? "" : "s"} · {lastUpdatedHint}
          </div>
        </div>
        <div className="vb-actions">
          {view === "all" && (
            <select
              className="cat-picker"
              value={pickerCategory}
              onChange={(e) => setPickerCategory(e.target.value as CategoryKey)}
              title="Default category when file extension can't be inferred"
            >
              {CATEGORY_LIST.map((c) => (
                <option key={c.key} value={c.key}>
                  Fallback: {c.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={onExportAll}
            disabled={
              busy ||
              (files.length === 0 &&
                (meta?.password_count ?? 0) === 0 &&
                (meta?.document_count ?? 0) === 0 &&
                (meta?.personal_count ?? 0) === 0 &&
                (meta?.seed_count ?? 0) === 0)
            }
            title="Export the whole vault: files + passwords (CSV) + documents (HTML) into a timestamped folder"
          >
            Export all…
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onLock}
            title="Clear key from memory"
          >
            Lock vault
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onAddFromPicker}
            disabled={busy}
          >
            + Add file
          </button>
        </div>
      </div>

      <div className="vb-body">
        {showCardsBanner && (
          <div className="banner banner-warning">
            <strong>Recovery cards not yet printed</strong> for{" "}
            {pendingCardCount}{" "}
            {pendingCardCount === 1 ? "beneficiary" : "beneficiaries"}. Without
            them, your beneficiaries cannot access the vault.{" "}
            <button
              type="button"
              className="banner-link"
              onClick={() => setBrowserView("recovery")}
            >
              Print cards →
            </button>
          </div>
        )}
        {view === "all" && (
          <>
            <div className="vb-section-heading">Categories</div>
            <div className="cat-grid">
              {CATEGORY_LIST.map((c) => (
                <CategoryCard
                  key={c.key}
                  category={c}
                  count={counts[c.key]}
                  onClick={() => setBrowserView(c.key)}
                />
              ))}
            </div>
          </>
        )}

        <div className="vb-section-heading">
          {view === "all" ? "Recent" : "Files"}
        </div>
        {view === "all" ? (
          <RecentList
            files={visibleFiles}
            docs={docs}
            onPreviewFile={onPreview}
            onDeleteFile={onDelete}
            onDownloadFile={onDownload}
            onOpenDoc={(id) => {
              setPendingDocumentId(id);
              setBrowserView("documents");
            }}
            onDownloadDoc={async (doc) => {
              setOpError(null);
              try {
                const safe =
                  doc.title.replace(/[^A-Za-z0-9._-]+/g, "_") || "document";
                const target = await saveDialog({
                  defaultPath: `${safe}.pdf`,
                  filters: [
                    { name: "PDF", extensions: ["pdf"] },
                    { name: "HTML (formatted)", extensions: ["html"] },
                    { name: "Markdown", extensions: ["md"] },
                    { name: "Plain text", extensions: ["txt"] },
                  ],
                  title: `Save "${doc.title}"`,
                });
                if (!target || typeof target !== "string") return;
                await tauri.exportDocument(doc.id, target);
              } catch (err) {
                setOpError(
                  typeof err === "string" ? err : "Failed to save document"
                );
              }
            }}
            onDeleteDoc={async (id, title) => {
              setOpError(null);
              if (
                !window.confirm(
                  `Delete "${title}"? This cannot be undone.`
                )
              )
                return;
              try {
                await tauri.deleteDocument(id);
                // Refresh docs list + meta so home view updates immediately
                const list = await tauri.listDocuments();
                setDocs(list);
                try {
                  const m = await tauri.getVaultMeta();
                  useVaultStore.getState().setMeta(m);
                } catch {
                  /* ignore */
                }
              } catch (err) {
                setOpError(
                  typeof err === "string" ? err : "Failed to delete document"
                );
              }
            }}
            limit={12}
          />
        ) : (
          <FileList
            files={visibleFiles}
            onDelete={onDelete}
            onDownload={onDownload}
            onPreview={onPreview}
            emptyHint={
              activeCategory
                ? `No ${activeCategory.label.toLowerCase()} yet`
                : "No files yet — drop one below to get started"
            }
          />
        )}

        {(opError || filesError) && (
          <div className="vb-error">{opError ?? filesError}</div>
        )}

        {exportSummary && (
          <div className="banner banner-success">
            <strong>
              Exported {exportSummary.files_written} file
              {exportSummary.files_written === 1 ? "" : "s"}
              {exportSummary.passwords_written > 0 &&
                ` · ${exportSummary.passwords_written} password${exportSummary.passwords_written === 1 ? "" : "s"} as CSV`}
              {exportSummary.documents_written > 0 &&
                ` · ${exportSummary.documents_written} document${exportSummary.documents_written === 1 ? "" : "s"} as HTML`}
              {exportSummary.seeds_written > 0 &&
                ` · ${exportSummary.seeds_written} wallet${exportSummary.seeds_written === 1 ? "" : "s"} as seeds.txt`}
            </strong>
            {exportSummary.skipped > 0 && (
              <> · {exportSummary.skipped} skipped</>
            )}{" "}
            into <span className="mono">{exportSummary.root}</span>
            <button
              type="button"
              className="banner-link"
              onClick={() => setExportSummary(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <DropZone category={fallbackCategory} onDrop={onDropFile} busy={busy} />

        {view === "all" && (
          <>
            <div className="vb-section-heading">Beneficiaries</div>
            <BeneficiaryStrip beneficiaries={beneficiaries} />
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setBrowserView("beneficiaries")}
              >
                Manage beneficiaries →
              </button>
            </div>
          </>
        )}
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
            void onDownload(f);
          }}
        />
      )}
    </>
  );
}

// ───────── Recent list (files + structured documents, sorted by date) ─────────

interface RecentListProps {
  files: FileEntryMeta[];
  docs: DocumentMeta[];
  onPreviewFile: (f: FileEntryMeta) => void;
  onDeleteFile: (id: string) => void;
  onDownloadFile: (f: FileEntryMeta) => void;
  onOpenDoc: (id: string) => void;
  onDownloadDoc: (doc: DocumentMeta) => void;
  onDeleteDoc: (id: string, title: string) => void;
  limit?: number;
}

type RecentRow =
  | { kind: "file"; date: string; file: FileEntryMeta }
  | { kind: "doc"; date: string; doc: DocumentMeta };

function RecentList({
  files,
  docs,
  onPreviewFile,
  onDeleteFile,
  onDownloadFile,
  onOpenDoc,
  onDownloadDoc,
  onDeleteDoc,
  limit,
}: RecentListProps) {
  const rows: RecentRow[] = [
    ...files.map<RecentRow>((f) => ({ kind: "file", date: f.added_at, file: f })),
    ...docs.map<RecentRow>((d) => ({ kind: "doc", date: d.updated_at, doc: d })),
  ];
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  const limited = typeof limit === "number" ? rows.slice(0, limit) : rows;

  if (!limited.length) {
    return (
      <div className="file-list file-list-empty">
        No files yet — drop one below or create a new document.
      </div>
    );
  }

  return (
    <div className="file-list">
      {limited.map((r) =>
        r.kind === "file" ? (
          <FileRow
            key={`f:${r.file.id}`}
            file={r.file}
            onPreview={() => onPreviewFile(r.file)}
            onDownload={() => onDownloadFile(r.file)}
            onDelete={() => onDeleteFile(r.file.id)}
          />
        ) : (
          <DocRowInline
            key={`d:${r.doc.id}`}
            doc={r.doc}
            onOpen={() => onOpenDoc(r.doc.id)}
            onDownload={() => onDownloadDoc(r.doc)}
            onDelete={() => onDeleteDoc(r.doc.id, r.doc.title)}
          />
        )
      )}
    </div>
  );
}

function DocRowInline({
  doc,
  onOpen,
  onDownload,
  onDelete,
}: {
  doc: DocumentMeta;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const docCat = CATEGORIES.documents;
  return (
    <div
      className="file-row file-row-clickable"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="file-icon" style={{ background: docCat.bg }}>
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
      </div>
      <div className="file-row-main">
        <div className="file-name">{doc.title}</div>
        <div className="file-meta">
          Updated {new Date(doc.updated_at).toLocaleString()}
          {doc.snippet ? ` · ${doc.snippet}` : ""}
        </div>
      </div>
      <span
        className="file-tag"
        style={{ background: docCat.bg, color: docCat.fg }}
      >
        Document
      </span>
      <button
        type="button"
        className="file-row-action"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label={`Open ${doc.title}`}
        title="Open in editor"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
            stroke="currentColor"
            strokeWidth="1"
          />
          <circle
            cx="7"
            cy="7"
            r="1.6"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </button>
      <button
        type="button"
        className="file-row-action"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        aria-label={`Download ${doc.title}`}
        title="Download as PDF / HTML / Markdown / TXT"
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
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${doc.title}`}
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
  );
}
