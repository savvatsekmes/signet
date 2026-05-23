export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "signet.theme";

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<(mode: ThemeMode) => void>();

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return mediaQuery.matches ? "dark" : "light";
  return mode;
}

function apply(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolve(mode);
}

export function getThemeMode(): ThemeMode {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  apply(mode);
  listeners.forEach((cb) => cb(mode));
}

export function subscribeTheme(cb: (mode: ThemeMode) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Re-resolve when the OS preference changes, but only while in "system" mode.
mediaQuery.addEventListener("change", () => {
  if (getThemeMode() === "system") apply("system");
});
