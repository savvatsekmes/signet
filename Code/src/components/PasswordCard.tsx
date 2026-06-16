import { useState } from "react";
import type { PasswordEntry } from "../lib/tauri";
import { Avatar } from "./Avatar";

interface Props {
  entry: PasswordEntry;
  onEdit: (entry: PasswordEntry) => void;
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PasswordCard({ entry, onEdit }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const flash = (msg: string) => {
    setCopyHint(msg);
    window.setTimeout(() => setCopyHint(null), 1400);
  };

  const onCopyUser = async () => {
    if (!entry.username) return;
    if (await copy(entry.username)) flash("Username copied");
  };

  const onCopyPass = async () => {
    if (await copy(entry.password)) flash("Password copied");
  };

  return (
    <div className="pw-row">
      <Avatar name={entry.name} size={32} />
      <div className="pw-row-main">
        <div className="pw-row-name">{entry.name}</div>
        <div className="pw-row-meta">
          {entry.username && <span>{entry.username}</span>}
          {entry.username && entry.url && <span className="pw-dot">·</span>}
          {entry.url && (
            <span className="pw-row-link">{stripProtocol(entry.url)}</span>
          )}
          {entry.section && entry.section.toLowerCase() !== "main" && (
            <span className="pw-folder-pill">{entry.section}</span>
          )}
        </div>
        {revealed && (
          <code className="pw-row-pass">{entry.password}</code>
        )}
        {copyHint && <div className="pw-row-toast">{copyHint}</div>}
      </div>
      <div className="pw-row-actions">
        {entry.username && (
          <button
            type="button"
            className="action-btn"
            onClick={onCopyUser}
            title="Copy username"
          >
            Copy user
          </button>
        )}
        <button
          type="button"
          className="action-btn"
          onClick={onCopyPass}
          title="Copy password to clipboard"
        >
          Copy
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() => onEdit(entry)}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
