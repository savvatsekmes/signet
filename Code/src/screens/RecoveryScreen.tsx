import { useState } from "react";
import { tauri } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";

export function RecoveryScreen() {
  const { vaultPath, setMeta, setRoute } = useVaultStore();
  const [shardsText, setShardsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const parseShards = (raw: string): string[] =>
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultPath || loading) return;
    const shards = parseShards(shardsText);
    if (shards.length < 2) {
      setError("Provide at least 2 shards (one per line, or comma-separated)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const meta = await tauri.reconstructFromShards(shards, vaultPath);
      setMeta(meta);
      setShardsText("");
      setRoute("browser");
    } catch (err) {
      const msg = typeof err === "string" ? err : "Recovery failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-body">
      <form className="lock-screen" onSubmit={onSubmit} style={{ maxWidth: 460 }}>
        <div className="lock-appname">Recover with shards</div>
        <div className="lock-tagline">
          Paste the recovery shards you and the other keyholders have.
          <br />
          One per line, or comma-separated.
        </div>

        <label className="field-label" htmlFor="shards-input">
          Shards
        </label>
        <textarea
          id="shards-input"
          className="password-input"
          style={{
            height: 140,
            padding: 10,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 11,
            resize: "vertical",
            marginBottom: 14,
          }}
          value={shardsText}
          onChange={(e) => {
            setShardsText(e.target.value);
            if (error) setError(null);
          }}
          autoFocus
          spellCheck={false}
          placeholder={"AQID...==\nBAUG...=="}
        />

        <button
          type="submit"
          className="unlock-btn"
          disabled={loading || !shardsText.trim()}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Reconstructing…
            </>
          ) : (
            "Unlock with shards"
          )}
        </button>

        {error && <div className="error-msg">{error}</div>}

        <div className="divider" />
        <div className="new-vault">
          <button
            type="button"
            className="new-vault-link"
            onClick={() => setRoute("lock")}
          >
            Back to password unlock
          </button>
        </div>
      </form>
    </div>
  );
}
