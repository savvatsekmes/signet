import { create } from "zustand";
import type {
  BeneficiaryMeta,
  FileEntryMeta,
  VaultMeta,
} from "../lib/tauri";

export type Route = "boot" | "lock" | "setup" | "browser" | "recovery";
export type BrowserView =
  | "all"
  | "documents"
  | "passwords"
  | "crypto"
  | "personal"
  | "images"
  | "beneficiaries"
  | "recovery"
  | "settings";

interface VaultState {
  route: Route;
  vaultPath: string | null;
  displayName: string | null;
  meta: VaultMeta | null;
  files: FileEntryMeta[];
  beneficiaries: BeneficiaryMeta[];
  browserView: BrowserView;
  /** When set, the next mount of DocumentsPanel opens this doc directly. */
  pendingDocumentId: string | null;
  setRoute: (route: Route) => void;
  setVaultPath: (path: string | null) => void;
  setDisplayName: (name: string | null) => void;
  setMeta: (meta: VaultMeta | null) => void;
  setFiles: (files: FileEntryMeta[]) => void;
  upsertFile: (file: FileEntryMeta) => void;
  removeFile: (id: string) => void;
  setBeneficiaries: (b: BeneficiaryMeta[]) => void;
  setBrowserView: (v: BrowserView) => void;
  setPendingDocumentId: (id: string | null) => void;
  reset: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  route: "boot",
  vaultPath: null,
  displayName: null,
  meta: null,
  files: [],
  beneficiaries: [],
  browserView: "all",
  pendingDocumentId: null,
  setRoute: (route) => set({ route }),
  setVaultPath: (vaultPath) => set({ vaultPath }),
  setDisplayName: (displayName) => set({ displayName }),
  setMeta: (meta) => set({ meta }),
  setFiles: (files) => set({ files }),
  upsertFile: (file) =>
    set((s) => ({
      files: [file, ...s.files.filter((f) => f.id !== file.id)],
    })),
  removeFile: (id) =>
    set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  setBeneficiaries: (beneficiaries) => set({ beneficiaries }),
  setBrowserView: (browserView) => set({ browserView }),
  setPendingDocumentId: (pendingDocumentId) => set({ pendingDocumentId }),
  reset: () =>
    set({
      route: "lock",
      meta: null,
      files: [],
      beneficiaries: [],
      browserView: "all",
      pendingDocumentId: null,
    }),
}));
