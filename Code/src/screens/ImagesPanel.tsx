import { useEffect, useMemo, useState } from "react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { tauri, type FileEntryMeta } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useFiles } from "../hooks/useFiles";
import { DropZone } from "../components/DropZone";
import { PreviewModal } from "../components/PreviewModal";
import { Combobox } from "../components/Combobox";
import { previewKindFor, type PreviewKind } from "../lib/preview";
import { basename } from "../lib/filenames";

export function ImagesPanel() {
  const { files } = useVaultStore();
  const { addFromPath, remove: removeFile } = useFiles();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [preview, setPreview] = useState<{
    file: FileEntryMeta;
    kind: PreviewKind;
    data: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [tagging, setTagging] = useState<{
    file: FileEntryMeta;
    value: string;
  } | null>(null);

  const surfaceFiles = useMemo(
    () => files.filter((f) => f.category === "images"),
    [files]
  );

  const tags = useMemo<string[]>(() => {
    const set = new Set<string>(extraTags);
    for (const f of surfaceFiles) {
      const s = (f.section ?? "").trim();
      if (s.length > 0 && s.toLowerCase() !== "main") set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [surfaceFiles, extraTags]);

  const isInTag = (
    item: { section?: string | null },
    tag: string
  ): boolean => {
    const s = (item.section ?? "").trim();
    if (tag === "Main") return s === "" || s.toLowerCase() === "main";
    return s === tag;
  };

  const visible = useMemo(
    () =>
      activeTag === null
        ? surfaceFiles
        : surfaceFiles.filter((f) => isInTag(f, activeTag)),
    [surfaceFiles, activeTag]
  );

  const tagForNewItems = (): string => {
    if (activeTag === null || activeTag === "Main") return "Main";
    return activeTag;
  };

  const onUploadFile = async () => {
    setError(null);
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: [
              "png",
              "jpg",
              "jpeg",
              "gif",
              "webp",
              "bmp",
              "svg",
              "avif",
            ],
          },
        ],
        title: "Choose an image to add",
      });
      if (!selected || typeof selected !== "string") return;
      setBusy(true);
      await addFromPath(selected, "images", tagForNewItems());
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to add image");
    } finally {
      setBusy(false);
    }
  };

  const onDropFile = async (path: string) => {
    setError(null);
    setBusy(true);
    try {
      if (await tauri.isDirectory(path)) {
        const folder = basename(path) || "Imported";
        const inside = await tauri.listFilesRecursively(path);
        for (const f of inside) {
          await addFromPath(f, "images", folder);
        }
        setExtraTags((prev) =>
          prev.includes(folder) ? prev : [...prev, folder]
        );
        setActiveTag(folder);
      } else {
        await addFromPath(path, "images", tagForNewItems());
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to add image");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFile = async (id: string, name: string) => {
    setError(null);
    if (!window.confirm(`Delete "${name}"? Cannot be undone.`)) return;
    try {
      await removeFile(id);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to delete");
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
      setError(typeof err === "string" ? err : "Failed to save");
    }
  };

  const onMoveTag = (file: FileEntryMeta) => {
    setTagging({
      file,
      value: file.section && file.section.trim() ? file.section : "Main",
    });
  };

  const onConfirmTagMove = async () => {
    if (!tagging) return;
    const value = (tagging.value ?? "").trim();
    try {
      await tauri.setFileSection(tagging.file.id, value);
      const list = await tauri.listFiles();
      list.sort((a, b) => (a.added_at < b.added_at ? 1 : -1));
      useVaultStore.getState().setFiles(list);
      setTagging(null);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to move");
    }
  };

  const onOpenPreview = async (file: FileEntryMeta) => {
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

  // Per-thumbnail data URL cache (image previews on the grid).
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    visible.forEach((f) => {
      if (thumbs[f.id]) return;
      tauri
        .getFileData(f.id)
        .then(([, data]) => {
          if (cancelled) return;
          const ext = f.name.split(".").pop()?.toLowerCase() ?? "png";
          const mime =
            ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "gif"
              ? "image/gif"
              : ext === "webp"
              ? "image/webp"
              : ext === "svg"
              ? "image/svg+xml"
              : "image/png";
          setThumbs((prev) => ({
            ...prev,
            [f.id]: `data:${mime};base64,${data}`,
          }));
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((f) => f.id).join("|")]);

  return (
    <>
      <div className="vb-header">
        <div>
          <div className="vb-title">Images</div>
          <div className="vb-subtitle">
            {surfaceFiles.length} image{surfaceFiles.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="vb-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={onUploadFile}
            disabled={busy}
          >
            + Upload image
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
              "New folder name (e.g. Holidays, Family, ID photos):"
            );
            if (!name) return;
            const trimmed = name.trim();
            if (!trimmed) return;
            setExtraTags((prev) =>
              prev.includes(trimmed) ? prev : [...prev, trimmed]
            );
            setActiveTag(trimmed);
          }}
        >
          + Folder
        </button>
      </div>

      <div className="vb-body">
        {error && <div className="vb-error">{error}</div>}

        {visible.length === 0 ? (
          <div className="bene-empty">
            No images yet. Drop one below or click <strong>+ Upload image</strong>.
          </div>
        ) : (
          <div className="image-grid">
            {visible.map((f) => (
              <div key={f.id} className="image-card">
                <button
                  type="button"
                  className="image-thumb"
                  onClick={() => onOpenPreview(f)}
                  title="Click to preview"
                >
                  {thumbs[f.id] ? (
                    <img src={thumbs[f.id]} alt={f.name} />
                  ) : (
                    <div className="image-thumb-loading" />
                  )}
                </button>
                <div className="image-meta">
                  <div className="image-name" title={f.name}>{f.name}</div>
                  <div className="image-actions">
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => onMoveTag(f)}
                      title="Change folder"
                    >
                      Folder
                    </button>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => onDownloadFile(f)}
                      title="Download"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn-danger"
                      onClick={() => onDeleteFile(f.id, f.name)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DropZone category="images" onDrop={onDropFile} busy={busy} />
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

      {tagging && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setTagging(null)}
        >
          <div
            className="modal tag-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="preview-modal-header">
              <div className="preview-modal-title">
                <div className="preview-modal-name">Move to folder</div>
                <div className="preview-modal-meta">{tagging.file.name}</div>
              </div>
            </div>
            <div className="pw-form-body">
              <label className="field-label">Folder</label>
              <Combobox
                value={tagging.value}
                options={["Main", ...tags.filter((t) => t.toLowerCase() !== "main")]}
                onChange={(v) =>
                  setTagging((curr) => (curr ? { ...curr, value: v } : null))
                }
                placeholder="Main — pick or type"
              />
            </div>
            <div className="pw-form-actions">
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setTagging(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onConfirmTagMove}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
