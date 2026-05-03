import { useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { tauri } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useBeneficiaries } from "../hooks/useBeneficiaries";
import type { BeneficiaryMeta } from "../lib/tauri";
import { Avatar } from "../components/Avatar";
import { StatusPill } from "../components/StatusPill";

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "_").replace(/^_+|_+$/g, "") || "card";
}

export function RecoveryCardScreen() {
  const { beneficiaries, meta } = useVaultStore();
  const { update, refresh } = useBeneficiaries();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const shardsGenerated = meta?.shards_generated ?? false;
  const allPrinted =
    beneficiaries.length > 0 && beneficiaries.every((b) => b.card_printed);
  const anyPending =
    beneficiaries.length > 0 && beneficiaries.some((b) => !b.card_printed);

  const onPrint = async (b: BeneficiaryMeta) => {
    setOpError(null);
    if (b.shard_index === null) {
      setOpError(
        `${b.name} has no shard yet. Go to Beneficiaries and click "Generate shards" first.`
      );
      return;
    }
    try {
      const suggested = `signet-recovery-${safeFilename(b.name)}.pdf`;
      const target = await saveDialog({
        defaultPath: suggested,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!target || typeof target !== "string") return;
      setBusyId(b.id);
      await tauri.exportRecoveryPdf(b.id, target);
      // Mark card_printed = true
      await update(b.id, { cardPrinted: true });
      await refresh();
      // Open the PDF in the system viewer
      try {
        await openExternal(target);
      } catch {
        /* user can open it manually */
      }
    } catch (e) {
      setOpError(typeof e === "string" ? e : "Failed to export recovery card");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="vb-header">
        <div>
          <div className="vb-title">Recovery cards</div>
          <div className="vb-subtitle">
            {beneficiaries.length}{" "}
            {beneficiaries.length === 1 ? "card" : "cards"} ·{" "}
            {allPrinted ? "all printed" : `${beneficiaries.filter((b) => b.card_printed).length} of ${beneficiaries.length} printed`}
          </div>
        </div>
      </div>

      <div className="vb-body">
        {!shardsGenerated && beneficiaries.length > 0 && (
          <div className="banner banner-warning">
            <strong>Generate shards first.</strong> Go to{" "}
            <em>Beneficiaries</em> and click "Generate shards" before printing
            cards.
          </div>
        )}

        {anyPending && shardsGenerated && (
          <div className="banner banner-warning">
            <strong>Recovery cards not yet printed.</strong> Your beneficiaries
            cannot access the vault without these. Print each card and store it
            with the keyholder.
          </div>
        )}

        {beneficiaries.length === 0 && (
          <div className="bene-empty">
            No beneficiaries yet. Add some in the Beneficiaries section first.
          </div>
        )}

        {opError && <div className="vb-error">{opError}</div>}

        <div className="recovery-card-list">
          {beneficiaries.map((b) => (
            <div key={b.id} className="recovery-card-row">
              <div className="recovery-card-preview">
                <div className="recovery-card-thumb">
                  <div className="recovery-card-thumb-header">SIGNET</div>
                  <div className="recovery-card-thumb-name">{b.name}</div>
                  <div className="recovery-card-thumb-qr">
                    {b.shard_index !== null ? `Shard ${b.shard_index + 1}` : "—"}
                  </div>
                </div>
              </div>
              <div className="recovery-card-info">
                <div className="recovery-card-name">
                  <Avatar name={b.name} size={24} />
                  <span>{b.name}</span>
                  <StatusPill tone={b.card_printed ? "success" : "warning"}>
                    {b.card_printed ? "Card printed" : "Card pending"}
                  </StatusPill>
                </div>
                <div className="recovery-card-meta">
                  {b.shard_index !== null
                    ? `Shard ${b.shard_index + 1}`
                    : "No shard assigned — generate shards first"}
                  {b.email ? ` · ${b.email}` : ""}
                </div>
                <div className="recovery-card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onPrint(b)}
                    disabled={busyId === b.id || b.shard_index === null}
                  >
                    {busyId === b.id
                      ? "Generating…"
                      : b.card_printed
                      ? "Reprint card"
                      : "Print card"}
                  </button>
                  {b.card_printed && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={async () => {
                        try {
                          await update(b.id, { cardPrinted: false });
                          await refresh();
                        } catch {
                          /* swallow */
                        }
                      }}
                      disabled={busyId === b.id}
                    >
                      Mark not printed
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
