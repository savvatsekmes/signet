import { useEffect, useMemo } from "react";
import {
  decodeBase64Text,
  mimeFor,
  type PreviewKind,
} from "../lib/preview";

interface Props {
  filename: string;
  data: string; // base64
  kind: PreviewKind;
  onClose: () => void;
  onDownload?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreviewModal({
  filename,
  data,
  kind,
  onClose,
  onDownload,
}: Props) {
  // Estimate decoded size from base64 length (4 chars → 3 bytes).
  const approxBytes = Math.floor((data.length * 3) / 4);

  // Build a data URL for binary previews.
  const dataUrl = useMemo(() => {
    if (kind === "image" || kind === "pdf") {
      return `data:${mimeFor(filename)};base64,${data}`;
    }
    return null;
  }, [data, kind, filename]);

  const text = useMemo(() => {
    if (kind === "text") return decodeBase64Text(data);
    return null;
  }, [data, kind]);

  // ESC to close
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
        className="modal preview-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="preview-modal-header">
          <div className="preview-modal-title">
            <div className="preview-modal-name">{filename}</div>
            <div className="preview-modal-meta">
              {formatSize(approxBytes)} · {kind}
            </div>
          </div>
          <div className="preview-modal-actions">
            {onDownload && (
              <button
                type="button"
                className="btn-secondary"
                onClick={onDownload}
              >
                Download
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              aria-label="Close preview"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
        <div className={`preview-modal-body preview-${kind}`}>
          {kind === "image" && (
            <img src={dataUrl!} alt={filename} className="preview-image" />
          )}
          {kind === "pdf" && (
            <iframe
              src={dataUrl!}
              className="preview-pdf"
              title={filename}
            />
          )}
          {kind === "text" && (
            <pre className="preview-text">{text}</pre>
          )}
          {kind === "unsupported" && (
            <div className="preview-unsupported">
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                Can't preview this file type in Signet.
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                Use Download to save it to disk and open it externally.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
