import { useCallback, useEffect, useState } from "react";
import { tauri } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";

export function useFiles() {
  const { setFiles, upsertFile, removeFile } = useVaultStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await tauri.listFiles();
      list.sort((a, b) => (a.added_at < b.added_at ? 1 : -1));
      setFiles(list);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [setFiles]);

  const addFromPath = useCallback(
    async (
      sourcePath: string,
      category: string,
      section?: string | null
    ) => {
      const entry = await tauri.addFile(sourcePath, category, section ?? null);
      upsertFile(entry);
      return entry;
    },
    [upsertFile]
  );

  const remove = useCallback(
    async (id: string) => {
      await tauri.deleteFile(id);
      removeFile(id);
    },
    [removeFile]
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  return { loading, error, refresh, addFromPath, remove };
}
