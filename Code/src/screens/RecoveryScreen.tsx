import { useEffect, useState } from "react";
import { tauri, type LockoutInfo } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";

function formatRemaining(secs: number): string {
  if (secs <= 0) return "0s";
  if (secs < 60) return `${Math.ceil(secs)}s`;
  if (secs < 3600) return `${Math.ceil(secs / 60)} min`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function RecoveryScreen() {
  const { vaultPath, setMeta, setRoute } = useVaultStore();
  const [shardsText, setShardsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockout, setLockout] = useState<LockoutInfo | null>(null);

  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    const fetchOnce = () => {
      tauri
        .getLockoutState(vaultPath)
        .then((s) => {
          if (!cancelled) setLockout(s);
        })
        .catch(() => undefined);
    };
    fetchOnce();
    const interval = window.setInterval(
      fetchOnce,
      lockout?.locked ? 1000 : 5000
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [vaultPath, lockout?.locked]);

  const parseShards = (raw: string): string[] =>
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultPath || loading) return;
    if (lockout?.locked) return;
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
      if (vaultPath) {
        tauri
          .getLockoutState(vaultPath)
          .then(setLockout)
          .catch(() => undefined);
      }
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
          disabled={lockout?.locked}
        />

        <button
          type="submit"
          className="unlock-btn"
          disabled={loading || !shardsText.trim() || lockout?.locked}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Reconstructing…
            </>
          ) : lockout?.locked ? (
            `Locked — ${formatRemaining(lockout.seconds_remaining)} left`
          ) : (
            "Unlock with shards"
          )}
        </button>

        {lockout?.locked ? (
          <div className="lockout-banner">
            <strong>Vault locked.</strong> Too many wrong attempts. Try again
            in <strong>{formatRemaining(lockout.seconds_remaining)}</strong>.
            {lockout.consecutive_lockouts > 1 && (
              <div style={{ marginTop: 4, fontSize: 10, opacity: 0.85 }}>
                {lockout.consecutive_lockouts} consecutive lockouts — each
                escalates the cooldown.
              </div>
            )}
          </div>
        ) : (
          <>
            {error && <div className="error-msg">{error}</div>}
            {!error &&
              lockout &&
              lockout.failed_attempts > 0 &&
              lockout.failed_attempts < lockout.attempts_before_lockout && (
                <div
                  className="error-msg"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {lockout.attempts_before_lockout - lockout.failed_attempts}{" "}
                  attempt
                  {lockout.attempts_before_lockout -
                    lockout.failed_attempts ===
                  1
                    ? ""
                    : "s"}{" "}
                  left before lockout
                </div>
              )}
          </>
        )}

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
