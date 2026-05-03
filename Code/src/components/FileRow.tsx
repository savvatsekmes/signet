import { useEffect, useState } from "react";
import type { FileEntryMeta } from "../lib/tauri";
import { tauri } from "../lib/tauri";
import { categoryFor } from "../lib/categories";
import { mimeFor, previewKindFor } from "../lib/preview";
import { CATEGORY_ICONS } from "../lib/icons";

interface Props {
  file: FileEntryMeta;
  onDelete?: (id: string) => void;
  onDownload?: (file: FileEntryMeta) => void;
  onPreview?: (file: FileEntryMeta) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return iso;
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}

export function FileRow({ file, onDelete, onDownload, onPreview }: Props) {
  const cat = categoryFor(file.category);
  const onRowClick = () => onPreview?.(file);

  // For image files, lazy-load the bytes and render an actual thumbnail
  // in place of the coloured category square.
  const isImage = previewKindFor(file.name) === "image";
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    tauri
      .getFileData(file.id)
      .then(([, data]) => {
        if (!cancelled) setThumb(`data:${mimeFor(file.name)};base64,${data}`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file.id, file.name, isImage]);

  return (
    <div
      className={"file-row" + (onPreview ? " file-row-clickable" : "")}
      onClick={onPreview ? onRowClick : undefined}
      role={onPreview ? "button" : undefined}
      tabIndex={onPreview ? 0 : undefined}
      onKeyDown={
        onPreview
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick();
              }
            }
          : undefined
      }
    >
      {thumb ? (
        <div className="file-icon file-icon-thumb">
          <img src={thumb} alt="" />
        </div>
      ) : (
        <div className="file-icon" style={{ background: cat?.bg ?? "#eee" }}>
          {CATEGORY_ICONS[file.category] && (
            <img
              src={CATEGORY_ICONS[file.category]}
              alt=""
              className="file-icon-glyph"
              style={cat?.fg ? { color: cat.fg } : undefined}
            />
          )}
        </div>
      )}
      <div className="file-row-main">
        <div className="file-name">{file.name}</div>
        <div className="file-meta">
          Added {relativeTime(file.added_at)} · {formatSize(file.size)}
        </div>
      </div>
      <span
        className="file-tag"
        style={{ background: cat?.bg ?? "#eee", color: cat?.fg ?? "#333" }}
      >
        {cat?.short ?? file.category}
      </span>
      {onPreview && (
        <button
          type="button"
          className="file-row-action"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(file);
          }}
          aria-label={`Preview ${file.name}`}
          title="Preview"
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
      )}
      {onDownload && (
        <button
          type="button"
          className="file-row-action"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file);
          }}
          aria-label={`Download ${file.name}`}
          title="Download to disk"
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
      )}
      {onDelete && (
        <button
          type="button"
          className="file-row-action file-row-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file.id);
          }}
          aria-label={`Delete ${file.name}`}
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
      )}
    </div>
  );
}
