import type { FileEntryMeta } from "../lib/tauri";
import { FileRow } from "./FileRow";

interface Props {
  files: FileEntryMeta[];
  emptyHint?: string;
  onDelete?: (id: string) => void;
  onDownload?: (file: FileEntryMeta) => void;
  onPreview?: (file: FileEntryMeta) => void;
}

export function FileList({
  files,
  emptyHint,
  onDelete,
  onDownload,
  onPreview,
}: Props) {
  if (!files.length) {
    return (
      <div className="file-list file-list-empty">
        {emptyHint ?? "No files yet"}
      </div>
    );
  }
  return (
    <div className="file-list">
      {files.map((f) => (
        <FileRow
          key={f.id}
          file={f}
          onDelete={onDelete}
          onDownload={onDownload}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}
