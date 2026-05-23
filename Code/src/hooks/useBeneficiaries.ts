import { useCallback, useEffect, useState } from "react";
import { tauri } from "../lib/tauri";
import { useVaultStore } from "../store/vaultStore";

export function useBeneficiaries() {
  const { setBeneficiaries } = useVaultStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await tauri.listBeneficiaries();
      setBeneficiaries(list);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to load beneficiaries");
    } finally {
      setLoading(false);
    }
  }, [setBeneficiaries]);

  const add = useCallback(
    async (name: string, email: string) => {
      await tauri.addBeneficiary(name, email, []);
      await refresh();
    },
    [refresh]
  );

  const update = useCallback(
    async (
      id: string,
      updates: {
        name?: string | null;
        email?: string | null;
        access?: string[] | null;
        cardPrinted?: boolean | null;
      }
    ) => {
      await tauri.updateBeneficiary(id, updates);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await tauri.removeBeneficiary(id);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  return { loading, error, refresh, add, update, remove };
}
