import { useState } from "react";
import { CATEGORY_LIST } from "../lib/categories";

interface Props {
  onAdd: (name: string, email: string, access: string[]) => Promise<void>;
  onCancel: () => void;
}

export function AddBeneficiaryForm({ onAdd, onCancel }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<string[]>([
    "documents",
    "passwords",
    "personal",
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (k: string) =>
    setAccess((curr) =>
      curr.includes(k) ? curr.filter((x) => x !== k) : [...curr, k]
    );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(name.trim(), email.trim(), access);
      setName("");
      setEmail("");
      setAccess(["documents", "passwords", "personal"]);
      onCancel();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to add beneficiary");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="bene-add" onSubmit={onSubmit}>
      <div className="bene-add-row">
        <div style={{ flex: 1 }}>
          <label className="field-label" htmlFor="bene-name">Name</label>
          <input
            id="bene-name"
            className="password-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            spellCheck={false}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label" htmlFor="bene-email">Email (optional)</label>
          <input
            id="bene-email"
            className="password-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="bene-add-access">
        <div className="field-label">Intended access</div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-tertiary)",
            marginTop: -2,
            marginBottom: 6,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          What you'd like them to look at. Anyone with K shards can decrypt the
          full vault — this is a directive, not a cryptographic boundary.
        </div>
        <div className="access-pills">
          {CATEGORY_LIST.map((c) => {
            const selected = access.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                className="access-pill"
                onClick={() => toggle(c.key)}
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

      {error && <div className="bene-card-error">{error}</div>}

      <div className="bene-add-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add beneficiary"}
        </button>
      </div>
    </form>
  );
}
