import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { tauri, type LockoutInfo } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { VAULT_OPEN_EXTS } from "../lib/filenames";
import logoUrl from "../assets/signet-logo.png";
import wordmarkUrl from "../assets/signet-wordmark.png";

function LogoMark() {
  return (
    <div className="lock-logo">
      <img src={logoUrl} alt="Signet" className="lock-logo-img" />
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
          stroke="currentColor"
          strokeWidth="1"
        />
        <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path d="M2 2l10 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function basenameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function formatRemaining(secs: number): string {
  if (secs <= 0) return "0s";
  if (secs < 60) return `${Math.ceil(secs)}s`;
  if (secs < 3600) return `${Math.ceil(secs / 60)} min`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function LockScreen() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockout, setLockout] = useState<LockoutInfo | null>(null);
  const { vaultPath, displayName, setMeta, setRoute, setVaultPath, setDisplayName } =
    useVaultStore();

  // Poll lockout state — frequently while locked (so the countdown ticks),
  // less often when not.
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !vaultPath || loading) return;
    if (lockout?.locked) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await tauri.unlockVault(password, vaultPath);
      setMeta(meta);
      // Remember the path that just successfully unlocked.
      tauri.setLastVaultPath(vaultPath).catch(() => undefined);
      setPassword("");
      setRoute("browser");
    } catch (err) {
      const msg = typeof err === "string" ? err : "Incorrect password";
      const lower = msg.toLowerCase();
      if (lower.startsWith("vault is locked")) {
        // Backend just refused because we're now locked. Refresh state.
        setError(msg);
      } else {
        setError(
          lower.includes("password") || lower.includes("corrupted")
            ? "Incorrect password"
            : msg
        );
      }
      // Refresh the lockout state — failed attempts may have just incremented
      // or pushed us into a lockout.
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

  const goCreate = () => setRoute("setup");

  const onPickVault = async () => {
    setError(null);
    try {
      const target = await openDialog({
        multiple: false,
        filters: [{ name: "Signet Vault", extensions: VAULT_OPEN_EXTS }],
        title: "Open a Signet vault",
      });
      if (!target || typeof target !== "string") return;
      const exists = await tauri.vaultExists(target);
      if (!exists) {
        setError("That file doesn't exist");
        return;
      }
      setVaultPath(target);
      try {
        const name = await tauri.getDisplayName(target);
        setDisplayName(name);
      } catch {
        setDisplayName(null);
      }
      // Remember even before unlock — they've stated this is the vault they want.
      tauri.setLastVaultPath(target).catch(() => undefined);
    } catch (e) {
      setError(typeof e === "string" ? e : "Couldn't open that file");
    }
  };

  return (
    <div className="screen-body">
      <form className="lock-screen" onSubmit={onSubmit}>
        <LogoMark />
        <img src={wordmarkUrl} alt="Signet" className="lock-wordmark" />
        <div className="lock-tagline">
          {displayName ? (
            <>Welcome back, {displayName}</>
          ) : (
            <>
              When the seal is broken,
              <br />
              they'll know what to do
            </>
          )}
        </div>

        <label className="field-label" htmlFor="vault-file">
          Vault file
        </label>
        <div className="password-row">
          <input
            id="vault-file"
            className="password-input vault-file-input"
            type="text"
            readOnly
            value={vaultPath ? basenameOf(vaultPath) : ""}
            placeholder="(no vault chosen)"
            title={vaultPath ?? ""}
          />
          <button
            type="button"
            className="vault-browse-btn"
            onClick={onPickVault}
          >
            Browse…
          </button>
        </div>
        {vaultPath && (
          <div className="vault-path-hint" title={vaultPath}>
            {vaultPath}
          </div>
        )}

        <label className="field-label" htmlFor="master-password">
          Master password
        </label>
        <div className="password-row">
          <input
            id="master-password"
            className="password-input"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            autoFocus
            autoComplete="current-password"
            spellCheck={false}
            disabled={lockout?.locked}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            <EyeIcon open={show} />
          </button>
        </div>

        <button
          type="submit"
          className="unlock-btn"
          disabled={!password || loading || lockout?.locked}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Unlocking…
            </>
          ) : lockout?.locked ? (
            `Locked — ${formatRemaining(lockout.seconds_remaining)} left`
          ) : (
            "Unlock vault"
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
          No vault yet?{" "}
          <button type="button" className="new-vault-link" onClick={goCreate}>
            Create one
          </button>
        </div>
        <div className="new-vault" style={{ marginTop: 6 }}>
          Lost your password?{" "}
          <button
            type="button"
            className="new-vault-link"
            onClick={() => setRoute("recovery")}
          >
            Open with recovery shards
          </button>
        </div>
        <div className="version">signetvault.com · v1.0.0</div>
      </form>
    </div>
  );
}
