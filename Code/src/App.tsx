import { useEffect, useState } from "react";
import { Titlebar } from "./components/Titlebar";
import { LockScreen } from "./screens/LockScreen";
import { SetupWizard } from "./screens/SetupWizard";
import { VaultBrowser } from "./screens/VaultBrowser";
import { RecoveryScreen } from "./screens/RecoveryScreen";
import { UpdateNotification } from "./components/UpdateNotification";
import { tauri, type UpdateInfo } from "./lib/tauri";
import { useVaultStore } from "./store/vaultStore";

export default function App() {
  const { route, setRoute, setVaultPath, setDisplayName } = useVaultStore();
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);

  // Auto-check for updates once per app launch. Silent failure — no banner if
  // the network is down or the repo is unreachable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await tauri.checkForUpdate();
        if (cancelled) return;
        if (!info.update_available) return;
        const skipped = await tauri
          .getSkippedUpdateVersion()
          .catch(() => null);
        if (cancelled) return;
        if (skipped && skipped === info.latest_version) return;
        setPendingUpdate(info);
      } catch {
        /* offline / private repo / rate limited — quietly ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      {pendingUpdate && (
        <UpdateNotification
          info={pendingUpdate}
          onClose={() => setPendingUpdate(null)}
          onSkip={() => setPendingUpdate(null)}
        />
      )}
    </div>
  );
}
