import type { FileEntryMeta, BeneficiaryMeta, VaultMeta } from "./tauri";

export interface CompletenessSlice {
  key: string;
  label: string;
  weight: number;
  satisfied: boolean;
}

const WILL_REGEX = /\b(will|testament|legal)\b/i;

/**
 * Per the Phase 5 spec:
 *   Documents (any)        +20%
 *   Passwords              +20%
 *   Crypto seeds           +10%
 *   Personal               +10%
 *   Beneficiary w/ card    +20%
 *   Will / legal document  +20%
 */
export function completenessSlices(
  files: FileEntryMeta[],
  beneficiaries: BeneficiaryMeta[],
  meta?: VaultMeta | null
): CompletenessSlice[] {
  const hasWill = files.some(
    (f) => f.category === "documents" && WILL_REGEX.test(f.name)
  );
  const hasPasswords =
    files.some((f) => f.category === "passwords") ||
    (meta?.password_count ?? 0) > 0;
  const hasDocuments =
    files.some((f) => f.category === "documents") ||
    (meta?.document_count ?? 0) > 0;
  return [
    {
      key: "documents",
      label: "Add a document",
      weight: 20,
      satisfied: hasDocuments,
    },
    {
      key: "passwords",
      label: "Add password entries",
      weight: 20,
      satisfied: hasPasswords,
    },
    {
      key: "crypto",
      label: "Add crypto seeds",
      weight: 10,
      satisfied:
        files.some((f) => f.category === "crypto") ||
        (meta?.seed_count ?? 0) > 0,
    },
    {
      key: "personal",
      label: "Add a personal message",
      weight: 10,
      satisfied:
        files.some((f) => f.category === "personal") ||
        (meta?.personal_count ?? 0) > 0,
    },
    {
      key: "beneficiary_card",
      label: "Beneficiary with card printed",
      weight: 20,
      satisfied: beneficiaries.some((b) => b.card_printed),
    },
    {
      key: "will",
      label: "Will or legal document",
      weight: 20,
      satisfied: hasWill,
    },
  ];
}

export function scoreVault(
  files: FileEntryMeta[],
  beneficiaries: BeneficiaryMeta[],
  meta?: VaultMeta | null
): number {
  return completenessSlices(files, beneficiaries, meta)
    .filter((s) => s.satisfied)
    .reduce((acc, s) => acc + s.weight, 0);
}

export function suggestionsRemaining(score: number): number {
  return Math.max(0, Math.ceil((100 - score) / 20));
}

export function missingSlices(
  files: FileEntryMeta[],
  beneficiaries: BeneficiaryMeta[],
  meta?: VaultMeta | null
): CompletenessSlice[] {
  return completenessSlices(files, beneficiaries, meta).filter((s) => !s.satisfied);
}
