import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    // 2420/2421 instead of the Vite-default 1420/1421 — on Windows those land
    // inside a WinNAT/Hyper-V reserved port range (1350-1449), which makes the
    // dev server fail to bind with EACCES. 2420/2421 sit in a free gap.
    port: 2420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 2421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
