import type { CompletenessSlice } from "../lib/completeness";

interface Props {
  score: number;
  remaining: number;
  slices?: CompletenessSlice[];
}

export function CompletionBar({ score, remaining, slices }: Props) {
  const pct = Math.max(0, Math.min(100, score));
  const hint =
    remaining === 0
      ? "Vault complete"
      : `${remaining} item${remaining === 1 ? "" : "s"} suggested`;

  const tooltip = slices
    ? slices
        .map((s) => `${s.satisfied ? "✓" : "•"} ${s.label} (+${s.weight}%)`)
        .join("\n")
    : undefined;

  return (
    <div className="health" title={tooltip}>
      <div className="health-label">Vault completeness</div>
      <div className="health-bar">
        <div className="health-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="health-stats">
        <span>{pct}%</span>
        <span>{hint}</span>
      </div>
    </div>
  );
}
