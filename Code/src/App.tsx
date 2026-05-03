import { useEffect } from "react";
import { Titlebar } from "./components/Titlebar";
import { LockScreen } from "./screens/LockScreen";
import { SetupWizard } from "./screens/SetupWizard";
import { VaultBrowser } from "./screens/VaultBrowser";
import { RecoveryScreen } from "./screens/RecoveryScreen";
import { tauri } from "./lib/tauri";
import { useVaultStore } from "./store/vaultStore";

export default function App() {
  const { route, setRoute, setVaultPath, setDisplayName } = useVaultStore();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Prefer the last vault the user opened; fall back to next-to-exe default.
        const last = await tauri.getLastVaultPath().catch(() => null);
        const fallback = await tauri.defaultVaultPath();
        const candidate =
          last && (await tauri.vaultExists(last).catch(() => false))
            ? last
            : fallback;
        if (cancelled) return;
        setVaultPath(candidate);
        const exists = await tauri.vaultExists(candidate);
        if (cancelled) return;
        if (exists) {
          try {
            const name = await tauri.getDisplayName(candidate);
            if (!cancelled) setDisplayName(name);
          } catch {
            if (!cancelled) setDisplayName(null);
          }
          setRoute("lock");
        } else {
          setDisplayName(null);
          setRoute("setup");
        }
      } catch {
        if (!cancelled) setRoute("setup");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRoute, setVaultPath, setDisplayName]);

  return (
    <div className="app-shell">
      <Titlebar />
      {route === "boot" && <div className="placeholder" />}
      {route === "lock" && <LockScreen />}
      {route === "setup" && <SetupWizard />}
      {route === "recovery" && <RecoveryScreen />}
      {route === "browser" && <VaultBrowser />}
    </div>
  );
}
