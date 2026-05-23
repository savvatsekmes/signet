import { useState } from "react";
import type { BeneficiaryMeta } from "../lib/tauri";
import { Avatar } from "./Avatar";
import { StatusPill } from "./StatusPill";

interface Props {
  beneficiary: BeneficiaryMeta;
  index: number;
  onUpdate: (
    id: string,
    updates: { access?: string[]; cardPrinted?: boolean | null }
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function BeneficiaryCard({
  beneficiary,
  index,
  onUpdate,
  onRemove,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = index === 0 ? "Primary" : "Secondary";

  const onRemoveClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRemove(beneficiary.id);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to remove");
      setBusy(false);
    }
  };

  return (
    <div className="bene-card">
      <div className="bene-top">
        <Avatar name={beneficiary.name} size={28} />
        <div className="bene-card-main">
          <div className="bene-card-name">{beneficiary.name}</div>
          <div className="bene-card-meta">
            {role}
            {beneficiary.email ? ` · ${beneficiary.email}` : ""}
          </div>
        </div>
        {beneficiary.shard_index !== null && (
          <span className="shard-badge">
            Shard {beneficiary.shard_index + 1}
          </span>
        )}
        <StatusPill tone={beneficiary.card_printed ? "success" : "warning"}>
          {beneficiary.card_printed ? "Card printed" : "Card pending"}
        </StatusPill>
      </div>

      {error && <div className="bene-card-error">{error}</div>}

      <div className="bene-actions">
        <button
          type="button"
          className="action-btn"
          onClick={() =>
            onUpdate(beneficiary.id, {
              cardPrinted: !beneficiary.card_printed,
            })
          }
        >
          {beneficiary.card_printed
            ? "Mark card not printed"
            : "Mark card printed"}
        </button>
        <button
          type="button"
          className="action-btn action-btn-danger"
          onClick={onRemoveClick}
          disabled={busy}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
