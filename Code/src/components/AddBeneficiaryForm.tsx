import { useState } from "react";

interface Props {
  onAdd: (name: string, email: string) => Promise<void>;
  onCancel: () => void;
}

export function AddBeneficiaryForm({ onAdd, onCancel }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(name.trim(), email.trim());
      setName("");
      setEmail("");
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
