import { useEffect, useState } from "react";
import type { PasswordEntry, PasswordInput } from "../lib/tauri";

interface Props {
  initial?: PasswordEntry | null;
  onSubmit: (input: PasswordInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

export function PasswordForm({ initial, onSubmit, onCancel, onDelete }: Props) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim() || null,
        username: username.trim(),
        password,
        notes: notes.trim() || null,
        totp_secret: null,
      });
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to save");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={busy ? undefined : onCancel}>
      <form
        className="modal pw-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="preview-modal-header">
          <div className="preview-modal-title">
            <div className="preview-modal-name">
              {isEdit ? "Edit password" : "Add password"}
            </div>
          </div>
        </div>
        <div className="pw-form-body">
          <label className="field-label" htmlFor="pw-name">Name</label>
          <input
            id="pw-name"
            className="password-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gmail, Bank, Netflix…"
            spellCheck={false}
            autoFocus
          />

          <label className="field-label" htmlFor="pw-url">Website / URL <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span></label>
          <input
            id="pw-url"
            className="password-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://gmail.com"
            spellCheck={false}
          />

          <label className="field-label" htmlFor="pw-user">Username / email <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span></label>
          <input
            id="pw-user"
            className="password-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="me@example.com"
            spellCheck={false}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="pw-pass">Password</label>
          <div className="password-row">
            <input
              id="pw-pass"
              className="password-input"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide" : "Show"}
              tabIndex={-1}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>

          <label className="field-label" htmlFor="pw-notes">Notes <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span></label>
          <textarea
            id="pw-notes"
            className="password-input pw-notes-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            spellCheck={false}
            rows={3}
          />

          {error && <div className="error-msg" style={{ textAlign: "left" }}>{error}</div>}
        </div>
        <div className="pw-form-actions">
          {isEdit && onDelete && (
            <button
              type="button"
              className="action-btn action-btn-danger"
              onClick={onDelete}
              disabled={busy}
            >
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add password"}
          </button>
        </div>
      </form>
    </div>
  );
}
