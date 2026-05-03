import { useEffect, useState } from "react";
import type { SeedEntry, SeedInput } from "../lib/tauri";
import { Combobox } from "./Combobox";

interface Props {
  initial?: SeedEntry | null;
  onSubmit: (input: SeedInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

// Broad list — covers almost everything someone might hold a seed for. The
// input is a combobox; users can also type any custom chain name.
const CHAIN_PRESETS = [
  // Top layer 1s
  "Bitcoin",
  "Ethereum",
  "BNB Chain",
  "Solana",
  "XRP / Ripple",
  "Cardano",
  "Dogecoin",
  "Tron",
  "Toncoin",
  "Polkadot",
  "Avalanche",
  "Litecoin",
  "Cosmos",
  "NEAR",
  "Bitcoin Cash",
  "Stellar",
  "Internet Computer",
  "Hedera",
  "Aptos",
  "Sui",
  "Filecoin",
  "Algorand",
  "Tezos",
  "Monero",
  "Zcash",
  "Ethereum Classic",
  "Kaspa",
  "Dash",
  "Nano",
  // Ethereum L2s
  "Polygon",
  "Arbitrum",
  "Optimism",
  "Base",
  "zkSync",
  "Starknet",
  "Linea",
  "Scroll",
  "Blast",
  // Multi-chain wallets
  "EVM (multi-chain)",
  "Cosmos SDK (multi-chain)",
];

const WALLET_TYPES = ["Hardware", "Software", "Paper", "Brain", "Other"];

export function SeedForm({ initial, onSubmit, onCancel, onDelete }: Props) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [chain, setChain] = useState(initial?.chain ?? "Bitcoin");
  const [walletType, setWalletType] = useState(initial?.wallet_type ?? "Hardware");
  const [seedPhrase, setSeedPhrase] = useState(initial?.seed_phrase ?? "");
  const [derivationPath, setDerivationPath] = useState(
    initial?.derivation_path ?? ""
  );
  const [publicAddress, setPublicAddress] = useState(initial?.public_address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showSeed, setShowSeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const wordCount = seedPhrase.trim().split(/\s+/).filter(Boolean).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!seedPhrase.trim()) {
      setError("Seed phrase is required");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        chain: chain.trim(),
        wallet_type: walletType.trim(),
        seed_phrase: seedPhrase.trim(),
        derivation_path: derivationPath.trim() || null,
        public_address: publicAddress.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to save");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={busy ? undefined : onCancel}>
      <form
        className="modal pw-modal seed-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="preview-modal-header">
          <div className="preview-modal-title">
            <div className="preview-modal-name">
              {isEdit ? "Edit wallet" : "Add wallet"}
            </div>
            <div className="preview-modal-meta">
              Anyone with this seed phrase has full control of the wallet.
            </div>
          </div>
        </div>
        <div className="pw-form-body">
          <label className="field-label" htmlFor="seed-name">Name</label>
          <input
            id="seed-name"
            className="password-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bitcoin main, Ledger device, MetaMask…"
            spellCheck={false}
            autoFocus
          />

          <div className="seed-row-2">
            <div>
              <label className="field-label" htmlFor="seed-chain">
                Chain{" "}
                <span style={{ textTransform: "none", opacity: 0.6 }}>
                  (pick or type)
                </span>
              </label>
              <Combobox
                id="seed-chain"
                value={chain}
                options={CHAIN_PRESETS}
                onChange={setChain}
                placeholder="Bitcoin, Ethereum, custom name…"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="seed-type">Wallet type</label>
              <select
                id="seed-type"
                className="password-input"
                value={walletType}
                onChange={(e) => setWalletType(e.target.value)}
              >
                {WALLET_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="field-label" htmlFor="seed-phrase">
            Seed phrase{" "}
            {wordCount > 0 && (
              <span style={{ textTransform: "none", opacity: 0.6 }}>
                ({wordCount} word{wordCount === 1 ? "" : "s"})
              </span>
            )}
          </label>
          <div className="password-row">
            <textarea
              id="seed-phrase"
              className="password-input seed-phrase-input"
              value={seedPhrase}
              onChange={(e) => setSeedPhrase(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              rows={3}
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                WebkitTextSecurity: showSeed ? "none" : "disc",
              } as React.CSSProperties}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowSeed((s) => !s)}
              tabIndex={-1}
            >
              {showSeed ? "Hide" : "Show"}
            </button>
          </div>

          <div className="seed-row-2">
            <div>
              <label className="field-label" htmlFor="seed-deriv">
                Derivation path{" "}
                <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="seed-deriv"
                className="password-input"
                value={derivationPath}
                onChange={(e) => setDerivationPath(e.target.value)}
                placeholder="m/44'/0'/0'/0/0"
                spellCheck={false}
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12,
                }}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="seed-addr">
                Public address{" "}
                <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="seed-addr"
                className="password-input"
                value={publicAddress}
                onChange={(e) => setPublicAddress(e.target.value)}
                placeholder="bc1q… / 0x…"
                spellCheck={false}
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12,
                }}
              />
            </div>
          </div>

          <label className="field-label" htmlFor="seed-notes">
            Notes <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span>
          </label>
          <textarea
            id="seed-notes"
            className="password-input pw-notes-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            spellCheck={false}
            rows={2}
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
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add wallet"}
          </button>
        </div>
      </form>
    </div>
  );
}
