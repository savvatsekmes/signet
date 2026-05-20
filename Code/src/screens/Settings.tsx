import { useEffect, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { tauri, type UpdateInfo } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { StrengthMeter, evaluateStrength } from "../components/StrengthMeter";
import { VAULT_EXT, dateStampedRename } from "../lib/filenames";

export function Settings() {
  const {
    vaultPath,
    displayName,
    meta,
    setDisplayName,
    setVaultPath,
    setMeta,
    reset,
    setRoute,
  } = useVaultStore();

  // Display name
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setDraftName(displayName ?? "");
  }, [displayName, editingName]);

  const onSaveName = async () => {
    setNameError(null);
    setNameBusy(true);
    try {
      await tauri.setDisplayName(draftName);
      setDisplayName(draftName.trim() || null);
      setEditingName(false);
    } catch (e) {
      setNameError(typeof e === "string" ? e : "Failed to update name");
    } finally {
      setNameBusy(false);
    }
  };

  // Change master password
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const newStrength = evaluateStrength(newPw, [displayName ?? ""]);
  const pwCanSubmit =
    oldPw.length > 0 &&
    newPw.length > 0 &&
    newPw === confirmPw &&
    newStrength.score >= 2 &&
    !pwBusy;

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwCanSubmit) return;
    setPwError(null);
    setPwSuccess(false);
    setPwBusy(true);
    try {
      await tauri.changeMasterPassword(oldPw, newPw);
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
      setPwSuccess(true);
    } catch (e) {
      setPwError(typeof e === "string" ? e : "Failed to change password");
    } finally {
      setPwBusy(false);
    }
  };

  // Move vault
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const onMoveVault = async () => {
    setMoveError(null);
    try {
      const target = await saveDialog({
        defaultPath: vaultPath ? dateStampedRename(vaultPath) : `vault.${VAULT_EXT}`,
        filters: [{ name: "Signet Vault", extensions: [VAULT_EXT] }],
        title: "Move vault file to…",
      });
      if (!target || typeof target !== "string") return;
      setMoveBusy(true);
      await tauri.changeVaultLocation(target);
      setVaultPath(target);
    } catch (e) {
      setMoveError(typeof e === "string" ? e : "Failed to move vault");
    } finally {
      setMoveBusy(false);
    }
  };

  const onShowInExplorer = async () => {
    if (!vaultPath) return;
    setMoveError(null);
    try {
      await tauri.showInFileExplorer(vaultPath);
    } catch (e) {
      setMoveError(typeof e === "string" ? e : "Failed to open file explorer");
    }
  };

  // Regenerate shards
  const [shardsBusy, setShardsBusy] = useState(false);
  const [shardsError, setShardsError] = useState<string | null>(null);
  const [shardsSuccess, setShardsSuccess] = useState(false);
  const onRegenShards = async () => {
    setShardsError(null);
    setShardsSuccess(false);
    if (!confirm("Regenerate shards? Existing recovery cards will become invalid — you'll need to print new ones for every beneficiary.")) {
      return;
    }
    setShardsBusy(true);
    try {
      await tauri.generateShards();
      try {
        const m = await tauri.getVaultMeta();
        setMeta(m);
      } catch { /* ignore */ }
      setShardsSuccess(true);
    } catch (e) {
      setShardsError(typeof e === "string" ? e : "Failed to regenerate shards");
    } finally {
      setShardsBusy(false);
    }
  };

  // Updates
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    tauri.getAppVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  const onCheckUpdate = async () => {
    setUpdateError(null);
    setUpdateInfo(null);
    setUpdateChecking(true);
    try {
      const info = await tauri.checkForUpdate();
      setUpdateInfo(info);
    } catch (e) {
      setUpdateError(typeof e === "string" ? e : "Failed to check for updates");
    } finally {
      setUpdateChecking(false);
    }
  };

  // Delete vault
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const onDelete = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await tauri.deleteVault();
      // After delete, send the user back through onboarding.
      reset();
      setRoute("setup");
      setVaultPath(null);
      setDisplayName(null);
    } catch (e) {
      setDeleteError(typeof e === "string" ? e : "Failed to delete vault");
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className="vb-header">
        <div>
          <div className="vb-title">Settings</div>
          <div className="vb-subtitle">
            Vault preferences, security, and updates
          </div>
        </div>
      </div>

      <div className="vb-body">
        {/* Display name */}
        <div className="settings-section">
          <div className="settings-section-title">Display name</div>
          <div className="settings-section-sub">
            Shown above the password field on the lock screen. Stored
            unencrypted in the vault header — leave blank if you'd rather not
            advertise whose vault this is.
          </div>
          {!editingName ? (
            <div className="settings-row">
              <div className="settings-row-value">
                {displayName || <span className="muted">— none —</span>}
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingName(true)}
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="settings-edit-row">
              <input
                className="password-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={64}
                placeholder="Your name"
              />
              <button
                type="button"
                className="btn-primary"
                onClick={onSaveName}
                disabled={nameBusy}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditingName(false);
                  setDraftName(displayName ?? "");
                  setNameError(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {nameError && <div className="settings-error">{nameError}</div>}
        </div>

        {/* Vault location */}
        <div className="settings-section">
          <div className="settings-section-title">Vault file location</div>
          <div className="settings-section-sub">
            Where the encrypted .signet file lives on disk. Move it to a USB or
            external drive — Signet will follow.
          </div>
          <div className="settings-row">
            <div className="settings-row-value mono">
              {vaultPath ?? "(unknown)"}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onShowInExplorer}
              disabled={!vaultPath}
              title="Open the containing folder"
            >
              Show in Explorer
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onMoveVault}
              disabled={moveBusy}
            >
              {moveBusy ? "Moving…" : "Move…"}
            </button>
          </div>
          {moveError && <div className="settings-error">{moveError}</div>}
        </div>

        {/* Change master password */}
        <div className="settings-section">
          <div className="settings-section-title">Change master password</div>
          <div className="settings-section-sub">
            Re-encrypts the entire vault with a new key. Existing recovery
            cards stay valid — they reconstruct the master key, not your
            password.
          </div>
          <form onSubmit={onChangePassword} className="settings-form">
            <label className="field-label" htmlFor="old-pw">
              Current password
            </label>
            <input
              id="old-pw"
              className="password-input"
              type="password"
              value={oldPw}
              onChange={(e) => {
                setOldPw(e.target.value);
                setPwError(null);
                setPwSuccess(false);
              }}
              spellCheck={false}
              autoComplete="current-password"
            />
            <label className="field-label" htmlFor="new-pw" style={{ marginTop: 10 }}>
              New password
            </label>
            <input
              id="new-pw"
              className="password-input"
              type="password"
              value={newPw}
              onChange={(e) => {
                setNewPw(e.target.value);
                setPwError(null);
                setPwSuccess(false);
              }}
              spellCheck={false}
              autoComplete="new-password"
            />
            <div style={{ marginTop: 6 }}>
              <StrengthMeter password={newPw} />
            </div>
            <label
              className="field-label"
              htmlFor="confirm-pw"
              style={{ marginTop: 8 }}
            >
              Confirm new password
            </label>
            <input
              id="confirm-pw"
              className="password-input"
              type="password"
              value={confirmPw}
              onChange={(e) => {
                setConfirmPw(e.target.value);
                setPwError(null);
                setPwSuccess(false);
              }}
              spellCheck={false}
              autoComplete="new-password"
            />
            {confirmPw && newPw !== confirmPw && (
              <div className="settings-error">Passwords do not match</div>
            )}
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary" disabled={!pwCanSubmit}>
                {pwBusy ? "Re-encrypting…" : "Change password"}
              </button>
            </div>
            {pwError && <div className="settings-error">{pwError}</div>}
            {pwSuccess && (
              <div className="settings-success">
                Password changed. Future unlocks need the new password.
              </div>
            )}
          </form>
        </div>

        {/* Re-generate shards */}
        <div className="settings-section">
          <div className="settings-section-title">Re-generate recovery shards</div>
          <div className="settings-section-sub">
            Re-splits the master key. <strong>Existing recovery cards stop
            working</strong> — every beneficiary needs a freshly printed card.
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onRegenShards}
            disabled={shardsBusy || (meta?.beneficiary_count ?? 0) === 0}
          >
            {shardsBusy ? "Splitting…" : "Re-generate shards"}
          </button>
          {(meta?.beneficiary_count ?? 0) === 0 && (
            <div className="settings-hint">
              Add at least one beneficiary first.
            </div>
          )}
          {shardsError && <div className="settings-error">{shardsError}</div>}
          {shardsSuccess && (
            <div className="settings-success">
              New shards generated. Reprint every recovery card from the
              Recovery cards screen.
            </div>
          )}
        </div>

        {/* Updates */}
        <div className="settings-section">
          <div className="settings-section-title">Updates</div>
          <div className="settings-section-sub">
            Signet doesn't phone home automatically. Click below to make a
            single network request to{" "}
            <span className="mono">api.github.com</span> and check the latest
            release published on the project's GitHub repo.
          </div>
          <div className="settings-row">
            <div className="settings-row-value">
              Current version: <span className="mono">{appVersion || "—"}</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onCheckUpdate}
              disabled={updateChecking}
            >
              {updateChecking ? "Checking…" : "Check for updates"}
            </button>
          </div>
          {updateError && <div className="settings-error">{updateError}</div>}
          {updateInfo && !updateInfo.update_available && (
            <div className="settings-success">
              You're on the latest version ({updateInfo.latest_version}).
            </div>
          )}
          {updateInfo && updateInfo.update_available && (
            <div className="settings-success">
              <strong>Update available:</strong> {updateInfo.latest_version}
              {updateInfo.notes && (
                <div style={{ marginTop: 4 }}>{updateInfo.notes}</div>
              )}
              {updateInfo.download_url && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      openExternal(updateInfo.download_url!).catch(() =>
                        undefined
                      )
                    }
                  >
                    Open download page
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="settings-section settings-danger">
          <div className="settings-section-title danger">Danger zone</div>
          <div className="settings-section-sub">
            Permanently delete the vault file. This cannot be undone. The
            encrypted bytes are removed from disk and the master key is wiped
            from memory.
          </div>
          <div className="settings-edit-row">
            <input
              className="password-input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE to confirm"
              spellCheck={false}
            />
            <button
              type="button"
              className="action-btn action-btn-danger"
              onClick={onDelete}
              disabled={deleteConfirm !== "DELETE" || deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete vault"}
            </button>
          </div>
          {deleteError && <div className="settings-error">{deleteError}</div>}
        </div>
      </div>
    </>
  );
}
