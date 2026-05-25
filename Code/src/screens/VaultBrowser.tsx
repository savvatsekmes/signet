import { useMemo } from "react";
import { tauri } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";
import { useFiles } from "../hooks/useFiles";
import { useBeneficiaries } from "../hooks/useBeneficiaries";
import type { CategoryKey } from "../lib/categories";
import {
  completenessSlices,
  scoreVault,
  suggestionsRemaining,
} from "../lib/completeness";
import { Sidebar } from "../components/Sidebar";
import { VaultPanel } from "../components/VaultPanel";
import { BeneficiaryManager } from "./BeneficiaryManager";
import { RecoveryCardScreen } from "./RecoveryCardScreen";
import { Settings } from "./Settings";
import { PasswordsPanel } from "./PasswordsPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { SeedsPanel } from "./SeedsPanel";
import { PersonalPanel } from "./PersonalPanel";
import { ImagesPanel } from "./ImagesPanel";

export function VaultBrowser() {
  const { files, beneficiaries, meta, browserView, setBrowserView, reset } =
    useVaultStore();

  const onLock = async () => {
    try {
      await tauri.lockVault();
    } finally {
      reset();
    }
  };
  // Mount the hooks at the shell level so the data is loaded once and shared.
  useFiles();
  useBeneficiaries();

  const counts = useMemo(() => {
    const c: Record<CategoryKey, number> = {
      documents: 0,
      passwords: 0,
      crypto: 0,
      personal: 0,
      images: 0,
    };
    for (const f of files) {
      if ((c as Record<string, number>)[f.category] !== undefined) {
        c[f.category as CategoryKey]++;
      }
    }
    // Add structured entries to their respective category badges.
    c.passwords += meta?.password_count ?? 0;
    c.documents += meta?.document_count ?? 0;
    c.personal += meta?.personal_count ?? 0;
    c.crypto += meta?.seed_count ?? 0;
    return c;
  }, [
    files,
    meta?.password_count,
    meta?.document_count,
    meta?.personal_count,
    meta?.seed_count,
  ]);

  const slices = useMemo(
    () => completenessSlices(files, beneficiaries, meta),
    [files, beneficiaries, meta]
  );
  const score = useMemo(
    () => scoreVault(files, beneficiaries, meta),
    [files, beneficiaries, meta]
  );
  const remaining = suggestionsRemaining(score);

  return (
    <div className="vault-browser">
      <Sidebar
        view={browserView}
        countByCategory={counts}
        totalCount={files.length}
        beneficiaryCount={beneficiaries.length}
        score={score}
        suggestionsRemaining={remaining}
        completenessSlices={slices}
        onSelectView={setBrowserView}
        onLock={onLock}
      />

      <div className="vb-main">
        {browserView === "beneficiaries" ? (
          <BeneficiaryManager />
        ) : browserView === "recovery" ? (
          <RecoveryCardScreen />
        ) : browserView === "settings" ? (
          <Settings />
        ) : browserView === "passwords" ? (
          <PasswordsPanel />
        ) : browserView === "documents" ? (
          <DocumentsPanel />
        ) : browserView === "crypto" ? (
          <SeedsPanel />
        ) : browserView === "personal" ? (
          <PersonalPanel />
        ) : browserView === "images" ? (
          <ImagesPanel />
        ) : (
          <VaultPanel view={browserView} />
        )}
      </div>
    </div>
  );
}
