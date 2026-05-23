import { useState } from "react";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import logoUrl from "../assets/signet-logo.png";
import wordmarkUrl from "../assets/signet-wordmark.png";
import { tauri } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { CATEGORY_LIST } from "../lib/categories";
import {
  VAULT_EXT,
  VAULT_OPEN_EXTS,
  suggestedVaultFilename,
} from "../lib/filenames";
import { WizardSteps } from "../components/WizardSteps";
import { StrengthMeter, evaluateStrength } from "../components/StrengthMeter";
import { ShamirControls } from "../components/ShamirControls";
import { LegalModal } from "../components/LegalModal";
import termsMarkdown from "../assets/legal/terms.md?raw";
import privacyMarkdown from "../assets/legal/privacy.md?raw";

interface DraftBeneficiary {
  name: string;
  email: string;
  access: string[];
}

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "password", label: "Master password" },
  { id: "beneficiaries", label: "Beneficiaries" },
  { id: "recovery", label: "Recovery" },
];

export function SetupWizard() {
  const {
    vaultPath: defaultPath,
    setMeta,
    setDisplayName,
    setRoute,
    setVaultPath,
  } = useVaultStore();

  const [stepIndex, setStepIndex] = useState(0);
  const [openExistingError, setOpenExistingError] = useState<string | null>(null);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const onOpenExisting = async () => {
    setOpenExistingError(null);
    try {
      const target = await openDialog({
        multiple: false,
        filters: [{ name: "Signet Vault", extensions: VAULT_OPEN_EXTS }],
        title: "Open an existing Signet vault",
      });
      if (!target || typeof target !== "string") return;
      const exists = await tauri.vaultExists(target);
      if (!exists) {
        setOpenExistingError("That file doesn't exist.");
        return;
      }
      setVaultPath(target);
      try {
        const dn = await tauri.getDisplayName(target);
        setDisplayName(dn);
      } catch {
        setDisplayName(null);
      }
      tauri.setLastVaultPath(target).catch(() => undefined);
      setRoute("lock");
    } catch (e) {
      setOpenExistingError(typeof e === "string" ? e : "Couldn't open that file");
    }
  };

  // Step 2 state
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Step 3 state
  const [drafts, setDrafts] = useState<DraftBeneficiary[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftAccess, setDraftAccess] = useState<string[]>([
    "documents",
    "passwords",
    "personal",
  ]);
  const [showAddForm, setShowAddForm] = useState(true);
  const [total, setTotal] = useState(3);
  const [required, setRequired] = useState(2);

  // Step 4 state
  const [vaultLocation, setVaultLocation] = useState<string | null>(defaultPath);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdShards, setCreatedShards] = useState<string[] | null>(null);
  const [createdBeneficiaryIds, setCreatedBeneficiaryIds] = useState<
    { id: string; name: string; shardIndex: number | null }[]
  >([]);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printedIds, setPrintedIds] = useState<Set<string>>(new Set());

  const next = () => setStepIndex((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStepIndex((s) => Math.max(0, s - 1));

  const passwordStrength = evaluateStrength(password, [name]);
  const passwordsMatch = password === confirm && password.length > 0;
  const canContinuePassword = passwordsMatch && passwordStrength.score >= 2;

  const toggleDraftAccess = (k: string) =>
    setDraftAccess((curr) =>
      curr.includes(k) ? curr.filter((x) => x !== k) : [...curr, k]
    );

  const addDraft = () => {
    if (!draftName.trim()) return;
    setDrafts((d) => [
      ...d,
      {
        name: draftName.trim(),
        email: draftEmail.trim(),
        access: [...draftAccess],
      },
    ]);
    setDraftName("");
    setDraftEmail("");
    setDraftAccess(["documents", "passwords", "personal"]);
    setShowAddForm(false);
  };

  const removeDraft = (i: number) =>
    setDrafts((d) => d.filter((_, idx) => idx !== i));

  const onPickLocation = async () => {
    try {
      const target = await saveDialog({
        defaultPath: vaultLocation ?? suggestedVaultFilename(name),
        filters: [{ name: "Signet Vault", extensions: [VAULT_EXT] }],
        title: "Choose where to save your vault",
      });
      if (target && typeof target === "string") setVaultLocation(target);
    } catch {
      /* swallow */
    }
  };

  const onPickFolder = async () => {
    try {
      const target = await openDialog({
        directory: true,
        title: "Choose a folder for your vault",
      });
      if (target && typeof target === "string") {
        const sep = target.includes("\\") ? "\\" : "/";
        setVaultLocation(
          target.replace(/[\\/]+$/, "") + sep + suggestedVaultFilename(name)
        );
      }
    } catch {
      /* swallow */
    }
  };

  const onCreate = async () => {
    if (!vaultLocation) {
      setCreateError("Pick a save location first");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const meta = await tauri.createVault(
        password,
        vaultLocation,
        name.trim() || null
      );
      setMeta(meta);
      setDisplayName(name.trim() || null);
      useVaultStore.getState().setVaultPath(vaultLocation);
      tauri.setLastVaultPath(vaultLocation).catch(() => undefined);

      const created: { id: string; name: string; shardIndex: number | null }[] = [];
      for (const d of drafts) {
        const b = await tauri.addBeneficiary(d.name, d.email, d.access);
        created.push({ id: b.id, name: b.name, shardIndex: null });
      }

      if (drafts.length > 0) {
        const safeTotal = Math.max(2, Math.min(7, drafts.length));
        const safeReq = Math.max(2, Math.min(safeTotal, required));
        await tauri.configureShamir(safeTotal, safeReq);
        const shards = await tauri.generateShards();
        const refreshed = await tauri.listBeneficiaries();
        for (let i = 0; i < created.length; i++) {
          const match = refreshed.find((b) => b.id === created[i].id);
          if (match) created[i].shardIndex = match.shard_index;
        }
        setCreatedShards(shards);
        setCreatedBeneficiaryIds(created);
      }

      if (drafts.length === 0) {
        try {
          const m = await tauri.getVaultMeta();
          setMeta(m);
        } catch {
          /* ignore */
        }
        setRoute("browser");
      }
    } catch (e) {
      setCreateError(typeof e === "string" ? e : "Failed to create vault");
    } finally {
      setCreating(false);
    }
  };

  const onPrintCard = async (b: {
    id: string;
    name: string;
    shardIndex: number | null;
  }) => {
    if (b.shardIndex === null) return;
    try {
      const safe = b.name.replace(/[^a-zA-Z0-9-_]+/g, "_");
      const target = await saveDialog({
        defaultPath: `signet-recovery-${safe}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!target || typeof target !== "string") return;
      setPrintingId(b.id);
      await tauri.exportRecoveryPdf(b.id, target);
      await tauri.updateBeneficiary(b.id, { cardPrinted: true });
      try {
        await openExternal(target);
      } catch {
        /* user can open manually */
      }
      setPrintedIds((s) => {
        const nextSet = new Set(s);
        nextSet.add(b.id);
        return nextSet;
      });
    } catch (e) {
      setCreateError(typeof e === "string" ? e : "Failed to export card");
    } finally {
      setPrintingId(null);
    }
  };

  const onFinish = async () => {
    try {
      const m = await tauri.getVaultMeta();
      setMeta(m);
    } catch {
      /* ignore */
    }
    setRoute("browser");
  };

  const created = createdShards !== null;

  return (
    <div className="screen-body">
      <div className="wizard">
        <WizardSteps steps={STEPS} currentIndex={stepIndex} />

        {stepIndex === 0 && (
          <div className="wizard-step">
            <div className="wizard-welcome">
              <div className="lock-logo" style={{ marginBottom: 18 }}>
                <img src={logoUrl} alt="" className="lock-logo-img" />
              </div>
              <img
                src={wordmarkUrl}
                alt="Signet"
                className="wizard-welcome-wordmark"
              />
              <div className="wizard-welcome-tag">
                Local, encrypted vault for the people you leave behind.
              </div>
              <ul className="wizard-welcome-list">
                <li>
                  Store your passwords, documents, and crypto seeds safely.
                </li>
                <li>Choose people you trust to receive them.</li>
                <li>No servers. No cloud. No subscriptions.</li>
              </ul>
            </div>
            <label className="tos-accept-row">
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
              />
              <span>
                I have read and accept the{" "}
                <button
                  type="button"
                  className="tos-accept-link"
                  onClick={() => setShowTerms(true)}
                >
                  Terms of Service
                </button>{" "}
                and{" "}
                <button
                  type="button"
                  className="tos-accept-link"
                  onClick={() => setShowPrivacy(true)}
                >
                  Privacy Policy
                </button>
                .
              </span>
            </label>
            <div className="wizard-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onOpenExisting}
              >
                Open an existing vault…
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={next}
                disabled={!tosAccepted}
                title={
                  !tosAccepted
                    ? "Please accept the Terms and Privacy Policy first"
                    : undefined
                }
              >
                Begin setup →
              </button>
            </div>
            {openExistingError && (
              <div
                className="error-msg"
                style={{ textAlign: "right", marginTop: 8 }}
              >
                {openExistingError}
              </div>
            )}
            {showTerms && (
              <LegalModal
                title="Terms of Service"
                markdown={termsMarkdown}
                onClose={() => setShowTerms(false)}
              />
            )}
            {showPrivacy && (
              <LegalModal
                title="Privacy Policy"
                markdown={privacyMarkdown}
                onClose={() => setShowPrivacy(false)}
              />
            )}
          </div>
        )}

        {stepIndex === 1 && (
          <div className="wizard-step">
            <div className="wizard-section-title">Set your master password</div>
            <div className="wizard-section-sub">
              This password encrypts everything in your vault. It is never
              stored anywhere — not on your device, not on any server.
            </div>

            <div className="info-box info-box-warning">
              <strong>Write it down.</strong> If you lose this password and
              don't have enough recovery shards, the vault cannot be opened.
            </div>

            <label className="field-label" htmlFor="wiz-name">
              Your name{" "}
              <span style={{ textTransform: "none", opacity: 0.6 }}>
                (optional, shown on lock screen)
              </span>
            </label>
            <input
              id="wiz-name"
              className="password-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              spellCheck={false}
              style={{ marginBottom: 14 }}
            />

            <label className="field-label" htmlFor="wiz-pw">
              Master password
            </label>
            <input
              id="wiz-pw"
              className="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              spellCheck={false}
              style={{ marginBottom: 12 }}
            />

            <StrengthMeter password={password} userInputs={[name]} />

            <label
              className="field-label"
              htmlFor="wiz-confirm"
              style={{ marginTop: 6 }}
            >
              Confirm password
            </label>
            <input
              id="wiz-confirm"
              className="password-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              spellCheck={false}
              style={{ marginBottom: 14 }}
            />
            {confirm && password !== confirm && (
              <div
                className="error-msg"
                style={{ textAlign: "left", marginTop: -6, marginBottom: 12 }}
              >
                Passwords do not match
              </div>
            )}

            <div className="info-box">
              <strong>How Signet protects you.</strong> Your password is run
              through Argon2id — a memory-hard algorithm that makes brute-force
              attacks extremely expensive. Your vault uses XChaCha20-Poly1305
              authenticated encryption. Nobody can read your files.
            </div>

            <div className="info-box" style={{ marginTop: 8 }}>
              <strong>Own a YubiKey or other FIDO2 key?</strong> After
              finishing setup you can require it for every unlock from{" "}
              <em>Settings → Hardware key</em>. Your master password alone
              won't be enough — a physical key tap is too. Shamir recovery
              still works without the YubiKey.
            </div>

            <div className="wizard-actions">
              <button type="button" className="btn-secondary" onClick={back}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={next}
                disabled={!canContinuePassword}
                title={
                  !passwordsMatch
                    ? "Passwords must match"
                    : passwordStrength.score < 2
                    ? "Pick a stronger password"
                    : undefined
                }
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {stepIndex === 2 && (
          <div className="wizard-step">
            <div className="wizard-section-title">
              Add the people who should receive access
            </div>
            <div className="wizard-section-sub">
              You can skip this and add beneficiaries later. The vault will
              still be encrypted and protected by your master password.
            </div>

            {drafts.length > 0 && (
              <div className="bene-list" style={{ marginBottom: 12 }}>
                {drafts.map((d, i) => (
                  <div className="bene-card" key={i}>
                    <div className="bene-top">
                      <div
                        className="avatar"
                        style={{
                          background: "var(--color-bg-tertiary)",
                          color: "var(--color-text-secondary)",
                          width: 28,
                          height: 28,
                          fontSize: 10,
                        }}
                      >
                        {d.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="bene-card-main">
                        <div className="bene-card-name">{d.name}</div>
                        <div className="bene-card-meta">
                          {d.email || "no email"} · intended access:{" "}
                          {d.access.length === 0
                            ? "none yet"
                            : d.access.length >= 5
                            ? "all categories"
                            : d.access.join(", ")}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="action-btn action-btn-danger"
                        onClick={() => removeDraft(i)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!showAddForm && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAddForm(true)}
                style={{ marginBottom: 12 }}
              >
                + Add another beneficiary
              </button>
            )}

            {showAddForm && (
              <div className="bene-add">
                <div className="bene-add-row">
                  <div style={{ flex: 1 }}>
                    <label className="field-label">Name</label>
                    <input
                      className="password-input"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      autoFocus
                      spellCheck={false}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="field-label">Email (optional)</label>
                    <input
                      className="password-input"
                      type="email"
                      value={draftEmail}
                      onChange={(e) => setDraftEmail(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                </div>
                <div className="bene-add-access">
                  <div className="field-label">Intended access</div>
                  <div className="access-pills">
                    {CATEGORY_LIST.map((c) => {
                      const selected = draftAccess.includes(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          className="access-pill"
                          onClick={() => toggleDraftAccess(c.key)}
                          style={{
                            background: selected ? c.bg : "transparent",
                            color: selected
                              ? c.fg
                              : "var(--color-text-tertiary)",
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
                <div className="bene-add-actions">
                  {drafts.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setShowAddForm(false);
                        setDraftName("");
                        setDraftEmail("");
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={addDraft}
                    disabled={!draftName.trim()}
                  >
                    Add beneficiary
                  </button>
                </div>
              </div>
            )}

            {drafts.length >= 2 && (
              <ShamirControls
                total={Math.min(total, drafts.length)}
                required={Math.min(required, drafts.length)}
                onChange={(t, r) => {
                  setTotal(t);
                  setRequired(r);
                }}
              />
            )}

            <div className="wizard-actions">
              <button type="button" className="btn-secondary" onClick={back}>
                Back
              </button>
              <button type="button" className="btn-primary" onClick={next}>
                {drafts.length === 0 ? "Skip — add later" : "Continue →"}
              </button>
            </div>
          </div>
        )}

        {stepIndex === 3 && (
          <div className="wizard-step">
            {!created ? (
              <>
                <div className="wizard-section-title">Almost done</div>
                <div className="wizard-section-sub">
                  Pick where to save your vault file, then press Create. After
                  that, print recovery cards for each beneficiary if you added
                  any.
                </div>

                <label className="field-label">Vault save location</label>
                <div
                  className="password-input"
                  style={{
                    fontSize: 11,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    color: "var(--color-text-secondary)",
                    height: "auto",
                    minHeight: 38,
                    padding: "10px 12px",
                    wordBreak: "break-all",
                    whiteSpace: "normal",
                    display: "block",
                    marginBottom: 10,
                  }}
                >
                  {vaultLocation ?? "(no location set)"}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onPickLocation}
                  >
                    Choose file…
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onPickFolder}
                  >
                    Choose folder…
                  </button>
                  {defaultPath && vaultLocation !== defaultPath && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setVaultLocation(defaultPath)}
                    >
                      Reset to default
                    </button>
                  )}
                </div>

                <div className="info-box">
                  <strong>What happens next.</strong> Signet will encrypt your
                  vault with Argon2id + XChaCha20-Poly1305, save it to the
                  location above
                  {drafts.length > 0
                    ? `, then split the master key into ${Math.max(
                        2,
                        Math.min(7, drafts.length)
                      )} shards (any ${Math.max(
                        2,
                        Math.min(Math.min(7, drafts.length), required)
                      )} reconstruct the key).`
                    : "."}
                </div>

                {createError && (
                  <div className="error-msg" style={{ textAlign: "left" }}>
                    {createError}
                  </div>
                )}

                <div className="wizard-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={back}
                    disabled={creating}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={onCreate}
                    disabled={creating || !vaultLocation}
                  >
                    {creating ? (
                      <>
                        <span className="spinner" />
                        Encrypting your vault…
                      </>
                    ) : (
                      "Create my vault"
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="wizard-section-title">Print recovery cards</div>
                <div className="wizard-section-sub">
                  Your vault is encrypted and saved. Print a card for each
                  beneficiary now and store it with them. Without these cards
                  they cannot recover the vault.
                </div>

                <div className="bene-list" style={{ marginBottom: 12 }}>
                  {createdBeneficiaryIds.map((b) => (
                    <div className="bene-card" key={b.id}>
                      <div className="bene-top">
                        <div
                          className="avatar"
                          style={{
                            background: "var(--color-bg-tertiary)",
                            color: "var(--color-text-secondary)",
                            width: 28,
                            height: 28,
                            fontSize: 10,
                          }}
                        >
                          {b.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="bene-card-main">
                          <div className="bene-card-name">{b.name}</div>
                          <div className="bene-card-meta">
                            {b.shardIndex !== null
                              ? `Shard ${b.shardIndex + 1}`
                              : "No shard assigned"}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => onPrintCard(b)}
                          disabled={
                            printingId === b.id || b.shardIndex === null
                          }
                        >
                          {printingId === b.id
                            ? "Generating…"
                            : printedIds.has(b.id)
                            ? "Reprint card"
                            : "Print card"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {createError && (
                  <div className="error-msg" style={{ textAlign: "left" }}>
                    {createError}
                  </div>
                )}

                <div className="wizard-actions">
                  <span />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={onFinish}
                  >
                    {printedIds.size === createdBeneficiaryIds.length
                      ? "Open my vault →"
                      : "I'll print these later →"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
