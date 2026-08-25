import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vitest lives here rather than in a standalone `vitest.config.js`: vitest only
  // inherits `resolve.alias` from the config it actually reads, so a separate file
  // would break every `@/…` import in a test.
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    // `globals` stays off on purpose: this project has no TypeScript and therefore
    // no ambient global types, so every test imports `describe`, `it`, `expect` and
    // `vi` from "vitest" explicitly.
    globals: false,
    // Reset spies and any stubbed global/env between tests. Nothing needs it
    // today; milestone 3 fakes the Tauri SQL plugin with module-level mocks,
    // whose call history would otherwise leak across tests in a file and make
    // them order-dependent.
    restoreMocks: true,
    // Call history too, not just spies: a `vi.fn()` from a module factory keeps
    // its calls across tests in a file otherwise, so `not.toHaveBeenCalled()`
    // silently means "not called since the file started".
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    // Pinned so date behaviour is reproducible off this machine. Deliberately
    // NOT UTC: milestone 5's wrong-day bugs only appear in an offset zone, so
    // pinning UTC would hide exactly what those tests exist to catch. Paris is a
    // POSITIVE offset, though, where UTC midnight always falls on the same local
    // day — that hides a class of mistake of its own, so `dates.test.js` stubs a
    // negative-offset zone for one test of its own.
    env: { TZ: "Europe/Paris" },
    exclude: ["**/node_modules/**", "**/dist/**", "**/src-tauri/**"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
