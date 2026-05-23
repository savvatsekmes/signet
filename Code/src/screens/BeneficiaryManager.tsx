import { useEffect, useState } from "react";
import { tauri } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useBeneficiaries } from "../hooks/useBeneficiaries";
import { ShamirControls } from "../components/ShamirControls";
import { BeneficiaryCard } from "../components/BeneficiaryCard";
import { AddBeneficiaryForm } from "../components/AddBeneficiaryForm";

export function BeneficiaryManager() {
  const { beneficiaries, meta, setMeta } = useVaultStore();
  const { add, update, remove, refresh: refreshBenes, error: listError } =
    useBeneficiaries();

  const [total, setTotal] = useState(meta?.shamir.total ?? 3);
  const [required, setRequired] = useState(meta?.shamir.required ?? 2);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [generatedShards, setGeneratedShards] = useState<string[] | null>(null);
  const [revealedShard, setRevealedShard] = useState<number | null>(null);

  // Sync local stepper state when meta updates externally
  useEffect(() => {
    if (meta) {
      setTotal(meta.shamir.total);
      setRequired(meta.shamir.required);
    }
  }, [meta?.shamir.total, meta?.shamir.required]);

  const refreshMeta = async () => {
    try {
      const m = await tauri.getVaultMeta();
      setMeta(m);
    } catch {
      /* ignore */
    }
  };

  const onShamirChange = async (t: number, r: number) => {
    setOpError(null);
    setTotal(t);
    setRequired(r);
    try {
      await tauri.configureShamir(t, r);
      setGeneratedShards(null);
      await refreshMeta();
      await refreshBenes();
    } catch (e) {
      setOpError(typeof e === "string" ? e : "Failed to update Shamir config");
    }
  };

  const onGenerate = async () => {
    setOpError(null);
    setGenerating(true);
    setRevealedShard(null);
    try {
      const shards = await tauri.generateShards();
      setGeneratedShards(shards);
      await refreshMeta();
      await refreshBenes();
    } catch (e) {
      setOpError(typeof e === "string" ? e : "Failed to generate shards");
    } finally {
      setGenerating(false);
    }
  };

  const beneficiaryHasShards = beneficiaries.some(
    (b) => b.shard_index !== null
  );

  return (
    <>
      <div className="vb-header">
        <div>
          <div className="vb-title">Beneficiaries &amp; key shards</div>
          <div className="vb-subtitle">
            {beneficiaries.length}{" "}
            {beneficiaries.length === 1 ? "person" : "people"} ·{" "}
            {required}-of-{total} key split
          </div>
        </div>
        <div className="vb-actions">
          {!adding && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setAdding(true)}
            >
              + Add beneficiary
            </button>
          )}
        </div>
      </div>

      <div className="vb-body">
        <ShamirControls
          total={total}
          required={required}
          onChange={onShamirChange}
        />

        <div className="bene-generate-row">
          <div className="bene-generate-text">
            {beneficiaryHasShards
              ? `Shards generated. Each beneficiary's index is shown below.`
              : `No shards generated yet. Add beneficiaries, then split the key.`}
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={onGenerate}
            disabled={generating || beneficiaries.length === 0}
            title={
              beneficiaries.length === 0
                ? "Add at least one beneficiary first"
                : undefined
            }
          >
            {generating
              ? "Generating…"
              : beneficiaryHasShards
              ? "Regenerate shards"
              : "Generate shards"}
          </button>
        </div>

        {generatedShards && (
          <div className="bene-shards-display">
            <div className="vb-section-heading">Generated shards (one-time)</div>
            <div className="bene-shards-warning">
              These appear once. Phase 4 will print them as recovery cards.
              Click a row to reveal — keep your screen private.
            </div>
            <div className="bene-shards-list">
              {generatedShards.map((s, i) => (
                <div key={i} className="bene-shard-row">
                  <span className="shard-badge">Shard {i + 1}</span>
                  <span className="bene-shard-name">
                    {beneficiaries[i]?.name ?? "(unassigned)"}
                  </span>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() =>
                      setRevealedShard(revealedShard === i ? null : i)
                    }
                  >
                    {revealedShard === i ? "Hide" : "Reveal"}
                  </button>
                  {revealedShard === i && (
                    <code className="bene-shard-value">{s}</code>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(opError || listError) && (
          <div className="vb-error">{opError ?? listError}</div>
        )}

        {adding && (
          <AddBeneficiaryForm
            onAdd={async (n, e) => {
              await add(n, e);
              await refreshMeta();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        <div className="vb-section-heading">Keyholders</div>
        {beneficiaries.length === 0 ? (
          <div className="bene-empty">
            No beneficiaries yet. Add the first person above.
          </div>
        ) : (
          <div className="bene-list">
            {beneficiaries.map((b, i) => (
              <BeneficiaryCard
                key={b.id}
                beneficiary={b}
                index={i}
                onUpdate={async (id, updates) => {
                  await update(id, updates);
                  await refreshMeta();
                }}
                onRemove={async (id) => {
                  await remove(id);
                  await refreshMeta();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
