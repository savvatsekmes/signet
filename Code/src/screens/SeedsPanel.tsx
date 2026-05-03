import { useEffect, useMemo, useState } from "react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import {
  tauri,
  type FileEntryMeta,
  type SeedEntry,
  type SeedInput,
} from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useFiles } from "../hooks/useFiles";
import { SeedCard } from "../components/SeedCard";
import { SeedForm } from "../components/SeedForm";
import { FileList } from "../components/FileList";
import { DropZone } from "../components/DropZone";
import { PreviewModal } from "../components/PreviewModal";
import { previewKindFor, type PreviewKind } from "../lib/preview";

export function SeedsPanel() {
  const { files, setMeta } = useVaultStore();
  const { addFromPath, remove: removeFile } = useFiles();
  const [entries, setEntries] = useState<SeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SeedEntry | "new" | null>(null);
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
      const list = await tauri.listSeeds();
      setEntries(list);
      try {
        const m = await tauri.getVaultMeta();
        setMeta(m);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to load seeds");
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
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.chain.toLowerCase().includes(q) ||
        (s.public_address ?? "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const onAdd = async (input: SeedInput) => {
    await tauri.addSeed(input);
    await refresh();
    setEditing(null);
  };

  const onUpdate = async (input: SeedInput) => {
    if (!editing || editing === "new") return;
    await tauri.updateSeed(editing.id, input);
    await refresh();
    setEditing(null);
  };

  const onDelete = async () => {
    if (!editing || editing === "new") return;
    if (
      !window.confirm(
        `Delete "${editing.name}"? The seed phrase will be erased from the vault.`
      )
    )
      return;
    try {
      await tauri.deleteSeed(editing.id);
      await refresh();
      setEditing(null);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to delete");
    }
  };

  const cryptoFiles = files.filter((f) => f.category === "crypto");

  const onUploadFile = async () => {
    setError(null);
    try {
      const selected = await openDialog({
        multiple: false,
        title: "Choose a file to add to Crypto seeds",
      });
      if (!selected || typeof selected !== "string") return;
      setBusy(true);
      await addFromPath(selected, "crypto");
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
      await addFromPath(path, "crypto");
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
          <div className="vb-title">Crypto seeds</div>
          <div className="vb-subtitle">
            {entries.length} {entries.length === 1 ? "wallet" : "wallets"}
            {cryptoFiles.length > 0 &&
              ` · ${cryptoFiles.length} file${cryptoFiles.length === 1 ? "" : "s"}`}
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
            onClick={() => setEditing("new")}
          >
            + Add wallet
          </button>
        </div>
      </div>

      <div className="vb-body">
        {error && <div className="vb-error">{error}</div>}

        {loading ? (
          <div className="bene-empty">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="bene-empty">
            No wallets yet. Click <strong>+ Add wallet</strong> to record a
            seed phrase, derivation path, and public address.
          </div>
        ) : filtered.length === 0 ? (
          <div className="bene-empty">No wallets match "{search}".</div>
        ) : (
          <div className="pw-list">
            {filtered.map((s) => (
              <SeedCard key={s.id} entry={s} onEdit={(e) => setEditing(e)} />
            ))}
          </div>
        )}

        <div className="vb-section-heading" style={{ marginTop: 18 }}>
          Files in Crypto seeds
        </div>
        <FileList
          files={cryptoFiles}
          onDelete={onDeleteFile}
          onDownload={onDownloadFile}
          onPreview={onPreviewFile}
          emptyHint="No files in Crypto seeds — drop a backup, screenshot, or any file below."
        />
        <DropZone category="crypto" onDrop={onDropFile} busy={busy} />
      </div>

      {editing === "new" && (
        <SeedForm
          initial={null}
          onSubmit={onAdd}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing && editing !== "new" && (
        <SeedForm
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
