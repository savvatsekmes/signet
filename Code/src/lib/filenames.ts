/** File extension Signet writes for new vaults. */
export const VAULT_EXT = "signet";

/** Extensions accepted by file pickers (new + legacy .sgt). */
export const VAULT_OPEN_EXTS = ["signet", "sgt"];

/** Strip characters that would be hostile in a filename across OSes. */
function safe(part: string): string {
  return part
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Build "alex_vault_2026-05-03.signet" from an optional display name. */
export function suggestedVaultFilename(displayName?: string | null): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = displayName ? safe(displayName) : "";
  if (!base) return `vault_${date}.${VAULT_EXT}`;
  return `${base}_vault_${date}.${VAULT_EXT}`;
}

/** Build a fresh date-stamped name based on an existing path's basename. */
export function dateStampedRename(currentPath: string): string {
  const idx = Math.max(currentPath.lastIndexOf("\\"), currentPath.lastIndexOf("/"));
  const base = idx >= 0 ? currentPath.slice(idx + 1) : currentPath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const date = new Date().toISOString().slice(0, 10);
  // If the stem already ends in _YYYY-MM-DD, replace it; otherwise append.
  const cleanStem = stem.replace(/_\d{4}-\d{2}-\d{2}$/, "");
  return `${cleanStem}_${date}.${VAULT_EXT}`;
}
