import type { BeneficiaryMeta } from "../lib/tauri";
import { Avatar } from "./Avatar";
import { StatusPill } from "./StatusPill";

interface Props {
  beneficiaries: BeneficiaryMeta[];
}

export function BeneficiaryStrip({ beneficiaries }: Props) {
  if (!beneficiaries.length) {
    return (
      <div className="bene-empty">
        No beneficiaries yet. Add people who should receive access in Phase 3.
      </div>
    );
  }
  return (
    <div className="bene-strip">
      {beneficiaries.map((b) => (
        <div className="bene-row" key={b.id}>
          <Avatar name={b.name} />
          <div className="bene-row-main">
            <div className="bene-name">{b.name}</div>
            <div className="bene-meta">
              {accessSummary(b.access)} ·{" "}
              {b.card_printed ? "recovery card printed" : "card not printed"}
            </div>
          </div>
          <StatusPill tone={b.card_printed ? "success" : "warning"}>
            {b.card_printed ? "Ready" : "Pending"}
          </StatusPill>
        </div>
      ))}
    </div>
  );
}

function accessSummary(access: string[]): string {
  if (!access.length) return "No access";
  if (access.length >= 4) return "Full access";
  return access.join(", ");
}
