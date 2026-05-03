import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { tauri } from "../lib/tauri";
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

export function LockScreen() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { vaultPath, displayName, setMeta, setRoute, setVaultPath, setDisplayName } =
    useVaultStore();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !vaultPath || loading) return;
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
      setError(
        msg.toLowerCase().includes("password") ||
          msg.toLowerCase().includes("corrupted")
          ? "Incorrect password"
          : msg
      );
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
          disabled={!password || loading}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Unlocking…
            </>
          ) : (
            "Unlock vault"
          )}
        </button>

        {error && <div className="error-msg">{error}</div>}

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
