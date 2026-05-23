import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  tauri,
  type FileEntryMeta,
  type PasswordEntry,
  type PasswordInput,
} from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useFiles } from "../hooks/useFiles";
import { PasswordCard } from "../components/PasswordCard";
import { PasswordForm } from "../components/PasswordForm";
import { FileList } from "../components/FileList";
import { DropZone } from "../components/DropZone";
import { PreviewModal } from "../components/PreviewModal";
import { previewKindFor, type PreviewKind } from "../lib/preview";

export function PasswordsPanel() {
  const { files, setMeta } = useVaultStore();
  const { addFromPath, remove: removeFile } = useFiles();
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PasswordEntry | null | "new">(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    file: FileEntryMeta;
    kind: PreviewKind;
    data: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    total_now: number;
    detected_format: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const refresh = async () => {
    setError(null);
    try {
      const list = await tauri.listPasswords();
      setEntries(list);
      try {
        const m = await tauri.getVaultMeta();
        setMeta(m);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to load passwords");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        (e.url ?? "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const onAdd = async (input: PasswordInput) => {
    await tauri.addPassword(input);
    await refresh();
    setEditing(null);
  };

  const onUpdate = async (input: PasswordInput) => {
    if (!editing || editing === "new") return;
    await tauri.updatePassword(editing.id, input);
    await refresh();
    setEditing(null);
  };

  const onDelete = async () => {
    if (!editing || editing === "new") return;
    if (!confirm(`Delete "${editing.name}"? This cannot be undone.`)) return;
    try {
      await tauri.deletePassword(editing.id);
      await refresh();
      setEditing(null);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to delete");
    }
  };

  const passwordFiles = files.filter((f) => f.category === "passwords");

  const onUploadFile = async () => {
    setError(null);
    try {
      const selected = await openDialog({
        multiple: false,
        title: "Choose a file to encrypt and add to Passwords",
      });
      if (!selected || typeof selected !== "string") return;
      setBusy(true);
      await addFromPath(selected, "passwords");
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
      if (await tauri.isDirectory(path)) {
        const inside = await tauri.listFilesRecursively(path);
        for (const f of inside) await addFromPath(f, "passwords");
      } else {
        await addFromPath(path, "passwords");
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to add file");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFile = async (id: string) => {
    setError(null);
    try {
      await removeFile(id);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to delete file");
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

  const onImportCsv = async () => {
    setError(null);
    setImportSummary(null);
    try {
      const target = await openDialog({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
        title: "Choose a Google Passwords / Bitwarden CSV export",
      });
      if (!target || typeof target !== "string") return;
      setImporting(true);
      const result = await tauri.importPasswordsCsv(target);
      setImportSummary(result);
      await refresh();
    } catch (err) {
      setError(typeof err === "string" ? err : "Import failed");
    } finally {
      setImporting(false);
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

  return (
    <>
      <div className="vb-header">
        <div>
          <div className="vb-title">Passwords</div>
          <div className="vb-subtitle">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
            {passwordFiles.length > 0 &&
              ` · ${passwordFiles.length} file${passwordFiles.length === 1 ? "" : "s"}`}
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
            onClick={onImportCsv}
            disabled={importing}
            title="Import passwords from a Google Passwords / Bitwarden / 1Password CSV export"
          >
            {importing ? "Importing…" : "Import CSV…"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onUploadFile}
            disabled={busy}
            title="Add a file (e.g. KeePass DB) to this category"
          >
            + Upload file
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setEditing("new")}
          >
            + Add password
          </button>
        </div>
      </div>

      <div className="vb-body">
        {error && <div className="vb-error">{error}</div>}

        {importSummary && (
          <div className="banner banner-success">
            <strong>Imported {importSummary.imported} password
            {importSummary.imported === 1 ? "" : "s"}</strong>{" "}
            from <em>{importSummary.detected_format}</em>
            {importSummary.skipped > 0 && (
              <> · {importSummary.skipped} skipped (missing name or password)</>
            )}{" "}
            · {importSummary.total_now} total
            <button
              type="button"
              className="banner-link"
              onClick={() => setImportSummary(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="bene-empty">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="bene-empty">
            No passwords yet. Click <strong>+ Add password</strong> to create
            your first entry — name, website, username, password, and any
            notes.
          </div>
        ) : filtered.length === 0 ? (
          <div className="bene-empty">No passwords match "{search}".</div>
        ) : (
          <div className="pw-list">
            {filtered.map((p) => (
              <PasswordCard
                key={p.id}
                entry={p}
                onEdit={(e) => setEditing(e)}
              />
            ))}
          </div>
        )}

        <div className="vb-section-heading" style={{ marginTop: 18 }}>
          Files in Passwords
        </div>
        <FileList
          files={passwordFiles}
          onDelete={onDeleteFile}
          onDownload={onDownloadFile}
          onPreview={onPreviewFile}
          emptyHint="No password files yet — drop a CSV export, KeePass DB, or any other file below."
        />
        <DropZone category="passwords" onDrop={onDropFile} busy={busy} />
      </div>

      {editing === "new" && (
        <PasswordForm
          initial={null}
          onSubmit={onAdd}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing && editing !== "new" && (
        <PasswordForm
          initial={editing}
          onSubmit={onUpdate}
          onDelete={onDelete}
          onCancel={() => setEditing(null)}
        />
      )}

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
