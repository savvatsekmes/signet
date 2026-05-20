import { invoke } from "@tauri-apps/api/core";

export interface ShamirConfig {
  total: number;
  required: number;
}

export interface VaultMeta {
  item_count: number;
  beneficiary_count: number;
  password_count: number;
  document_count: number;
  personal_count: number;
  seed_count: number;
  created_at: string;
  shamir: ShamirConfig;
  shards_generated: boolean;
}

export interface SeedEntry {
  id: string;
  name: string;
  chain: string;
  wallet_type: string;
  seed_phrase: string;
  derivation_path: string | null;
  public_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeedInput {
  name: string;
  chain?: string;
  wallet_type?: string;
  seed_phrase: string;
  derivation_path?: string | null;
  public_address?: string | null;
  notes?: string | null;
}

export interface DocumentMeta {
  id: string;
  title: string;
  snippet: string;
  section: string;
  kind: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentEntry {
  id: string;
  title: string;
  content: string;
  section: string;
  kind: string;
  created_at: string;
  updated_at: string;
}

export interface FileEntryMeta {
  id: string;
  name: string;
  category: string;
  size: number;
  added_at: string;
  section: string;
}

export interface PasswordEntry {
  id: string;
  name: string;
  url: string | null;
  username: string;
  password: string;
  notes: string | null;
  totp_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface PasswordInput {
  name: string;
  url?: string | null;
  username?: string;
  password: string;
  notes?: string | null;
  totp_secret?: string | null;
}

export interface BeneficiaryMeta {
  id: string;
  name: string;
  email: string;
  shard_index: number | null;
  access: string[];
  card_printed: boolean;
}

export const tauri = {
  // Vault lifecycle
  createVault: (
    password: string,
    path: string,
    displayName?: string | null
  ) =>
    invoke<VaultMeta>("create_vault", {
      password,
      path,
      displayName: displayName ?? null,
    }),
  unlockVault: (password: string, path: string) =>
    invoke<VaultMeta>("unlock_vault", { password, path }),
  lockVault: () => invoke<void>("lock_vault"),
  vaultExists: (path: string) => invoke<boolean>("vault_exists", { path }),
  defaultVaultPath: () => invoke<string>("default_vault_path"),
  getDisplayName: (path: string) =>
    invoke<string | null>("get_display_name", { path }),
  setDisplayName: (name: string) =>
    invoke<void>("set_display_name", { name }),
  getVaultMeta: () => invoke<VaultMeta>("get_vault_meta"),
  getLastVaultPath: () => invoke<string | null>("get_last_vault_path"),
  setLastVaultPath: (path: string) =>
    invoke<void>("set_last_vault_path", { path }),
  getLockoutState: (path: string) =>
    invoke<LockoutInfo>("get_lockout_state", { path }),

  // Files
  addFile: (sourcePath: string, category: string, section?: string | null) =>
    invoke<FileEntryMeta>("add_file", {
      sourcePath,
      category,
      section: section ?? null,
    }),
  setFileSection: (id: string, section: string) =>
    invoke<FileEntryMeta>("set_file_section", { id, section }),
  listFiles: (category?: string | null) =>
    invoke<FileEntryMeta[]>("list_files", { category: category ?? null }),
  getFile: (id: string) => invoke<number[]>("get_file", { id }),
  getFileData: (id: string) =>
    invoke<[string, string]>("get_file_data", { id }),
  updateFileData: (id: string, dataB64: string) =>
    invoke<FileEntryMeta>("update_file_data", { id, dataB64 }),
  deleteFile: (id: string) => invoke<void>("delete_file", { id }),
  saveFileToDisk: (id: string, outputPath: string) =>
    invoke<void>("save_file_to_disk", { id, outputPath }),
  exportAllFiles: (outputDir: string) =>
    invoke<{
      files_written: number;
      passwords_written: number;
      documents_written: number;
      seeds_written: number;
      skipped: number;
      root: string;
    }>("export_all_files", { outputDir }),

  // Passwords
  addPassword: (input: PasswordInput) =>
    invoke<PasswordEntry>("add_password", { input }),
  updatePassword: (id: string, input: PasswordInput) =>
    invoke<PasswordEntry>("update_password", { id, input }),
  deletePassword: (id: string) =>
    invoke<void>("delete_password", { id }),
  listPasswords: () => invoke<PasswordEntry[]>("list_passwords"),
  // Crypto seeds
  addSeed: (input: SeedInput) =>
    invoke<SeedEntry>("add_seed", { input }),
  updateSeed: (id: string, input: SeedInput) =>
    invoke<SeedEntry>("update_seed", { id, input }),
  deleteSeed: (id: string) => invoke<void>("delete_seed", { id }),
  listSeeds: () => invoke<SeedEntry[]>("list_seeds"),

  importPasswordsCsv: (csvPath: string) =>
    invoke<{
      imported: number;
      skipped: number;
      total_now: number;
      detected_format: string;
    }>("import_passwords_csv", { csvPath }),

  // Documents (rich-text entries)
  addDocument: (
    title: string,
    content: string,
    section?: string | null,
    kind?: string | null
  ) =>
    invoke<DocumentEntry>("add_document", {
      title,
      content,
      section: section ?? null,
      kind: kind ?? null,
    }),
  updateDocument: (
    id: string,
    title: string,
    content: string,
    section?: string | null,
    kind?: string | null
  ) =>
    invoke<DocumentEntry>("update_document", {
      id,
      title,
      content,
      section: section ?? null,
      kind: kind ?? null,
    }),
  deleteDocument: (id: string) => invoke<void>("delete_document", { id }),
  listDocuments: (kind?: string | null) =>
    invoke<DocumentMeta[]>("list_documents", { kind: kind ?? null }),
  getDocument: (id: string) => invoke<DocumentEntry>("get_document", { id }),
  exportDocumentHtml: (id: string, outputPath: string) =>
    invoke<void>("export_document_html", { id, outputPath }),
  /** Export by extension: .html, .md, or .txt — picks the renderer from the path. */
  exportDocument: (id: string, outputPath: string) =>
    invoke<void>("export_document", { id, outputPath }),

  // Beneficiaries
  addBeneficiary: (name: string, email: string, access: string[]) =>
    invoke<BeneficiaryMeta>("add_beneficiary", { name, email, access }),
  updateBeneficiary: (
    id: string,
    updates: {
      name?: string | null;
      email?: string | null;
      access?: string[] | null;
      cardPrinted?: boolean | null;
    }
  ) =>
    invoke<void>("update_beneficiary", {
      id,
      name: updates.name ?? null,
      email: updates.email ?? null,
      access: updates.access ?? null,
      cardPrinted: updates.cardPrinted ?? null,
    }),
  removeBeneficiary: (id: string) =>
    invoke<void>("remove_beneficiary", { id }),
  listBeneficiaries: () =>
    invoke<BeneficiaryMeta[]>("list_beneficiaries"),

  // Shamir
  configureShamir: (total: number, required: number) =>
    invoke<void>("configure_shamir", { total, required }),
  generateShards: () => invoke<string[]>("generate_shards"),
  reconstructFromShards: (shards: string[], vaultPath: string) =>
    invoke<VaultMeta>("reconstruct_from_shards", { shards, vaultPath }),

  // Export
  exportRecoveryPdf: (beneficiaryId: string, outputPath: string) =>
    invoke<void>("export_recovery_pdf", { beneficiaryId, outputPath }),

  // Settings
  changeMasterPassword: (oldPassword: string, newPassword: string) =>
    invoke<void>("change_master_password", { oldPassword, newPassword }),
  changeVaultLocation: (newPath: string) =>
    invoke<void>("change_vault_location", { newPath }),
  showInFileExplorer: (path: string) =>
    invoke<void>("show_in_file_explorer", { path }),
  deleteVault: () => invoke<void>("delete_vault"),

  // Updates
  getAppVersion: () => invoke<string>("get_app_version"),
  checkForUpdate: () => invoke<UpdateInfo>("check_for_update"),
  getSkippedUpdateVersion: () =>
    invoke<string | null>("get_skipped_update_version"),
  setSkippedUpdateVersion: (version: string) =>
    invoke<void>("set_skipped_update_version", { version }),
};

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string | null;
  notes: string | null;
  checked_at: string;
}

export interface LockoutInfo {
  locked: boolean;
  seconds_remaining: number;
  failed_attempts: number;
  attempts_before_lockout: number;
  consecutive_lockouts: number;
}
