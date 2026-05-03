import { useState } from "react";
import type { SeedEntry } from "../lib/tauri";
import { Avatar } from "./Avatar";

interface Props {
  entry: SeedEntry;
  onEdit: (entry: SeedEntry) => void;
}

function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SeedCard({ entry, onEdit }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const flash = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 1400);
  };

  const onCopySeed = async () => {
    if (await copy(entry.seed_phrase)) flash("Seed copied — paste somewhere safe");
  };

  const onCopyAddress = async () => {
    if (entry.public_address && (await copy(entry.public_address))) {
      flash("Address copied");
    }
  };

  return (
    <div className="pw-row seed-row">
      <Avatar name={entry.name} size={32} />
      <div className="pw-row-main">
        <div className="pw-row-name">{entry.name}</div>
        <div className="pw-row-meta">
          {entry.chain && <span>{entry.chain}</span>}
          {entry.chain && entry.wallet_type && <span className="pw-dot">·</span>}
          {entry.wallet_type && <span>{entry.wallet_type}</span>}
          {entry.public_address && (
            <>
              <span className="pw-dot">·</span>
              <span className="mono" style={{ fontSize: 10 }}>
                {truncateMiddle(entry.public_address, 28)}
              </span>
            </>
          )}
        </div>
        {revealed && (
          <code className="pw-row-pass seed-phrase-display">
            {entry.seed_phrase}
          </code>
        )}
        {hint && <div className="pw-row-toast">{hint}</div>}
      </div>
      <div className="pw-row-actions">
        {entry.public_address && (
          <button
            type="button"
            className="action-btn"
            onClick={onCopyAddress}
            title="Copy public address"
          >
            Copy addr
          </button>
        )}
        <button
          type="button"
          className="action-btn"
          onClick={onCopySeed}
          title="Copy seed phrase"
        >
          Copy seed
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
