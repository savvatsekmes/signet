import { useState } from "react";
import type { BeneficiaryMeta } from "../lib/tauri";
import { CATEGORY_LIST, categoryFor } from "../lib/categories";
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
  const [editing, setEditing] = useState(false);
  const [draftAccess, setDraftAccess] = useState<string[]>(beneficiary.access);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = index === 0 ? "Primary" : "Secondary";

  const toggleAccess = (key: string) => {
    setDraftAccess((curr) =>
      curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key]
    );
  };

  const saveAccess = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUpdate(beneficiary.id, { access: draftAccess });
      setEditing(false);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to update access");
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setDraftAccess(beneficiary.access);
    setEditing(false);
    setError(null);
  };

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

      {editing ? (
        <div className="bene-edit-access">
          <div className="bene-edit-label">Intended access:</div>
          <div className="access-pills">
            {CATEGORY_LIST.map((c) => {
              const selected = draftAccess.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  className="access-pill"
                  onClick={() => toggleAccess(c.key)}
                  style={{
                    background: selected ? c.bg : "transparent",
                    color: selected ? c.fg : "var(--color-text-tertiary)",
                    border: selected
                      ? "0.5px solid transparent"
                      : "0.5px dashed var(--color-border-medium)",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="access-pills">
          {beneficiary.access.length === 0 ? (
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              No category access yet
            </span>
          ) : (
            beneficiary.access.map((key) => {
              const cat = categoryFor(key);
              if (!cat) return null;
              return (
                <span
                  key={key}
                  className="access-pill"
                  style={{ background: cat.bg, color: cat.fg }}
                >
                  {cat.label}
                </span>
              );
            })
          )}
        </div>
      )}

      {error && <div className="bene-card-error">{error}</div>}

      <div className="bene-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="action-btn action-btn-primary"
              onClick={saveAccess}
              disabled={busy}
            >
              Save
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={cancelEdit}
              disabled={busy}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="action-btn"
              onClick={() => setEditing(true)}
            >
              Edit intended access
            </button>
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
          </>
        )}
      </div>
    </div>
  );
}
