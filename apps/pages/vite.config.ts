import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * apollokit-pages — TanStack Start app rendered by the shared
 * pages-runtime CF Worker. Operators' AI-built landing pages are stored
 * as JSON schemas in Postgres and rendered through this worker at
 * `<slug>.pages.apollokit.dev/...`.
 *
 * Plugin order matters:
 *   - `cloudflare()` registers the Workers SSR environment under the
 *     name `ssr`. Mounted **only at build time** — dev SSR runs in
 *     Node, so `cloudflare:workers` imports must be marked external
 *     (see ssr.external below) and the `await import('cloudflare:workers')`
 *     call sites must guard their failures (we do via createServerFn
 *     handlers that return null on import error).
 *   - `tanstackStart()` wires file-based routing + the SSR entry.
 *   - `viteReact()` enables JSX + React Refresh.
 *
 * vite-tsconfig-paths reads `tsconfig.json#paths` so `#/*` imports
 * resolve. The vite@8 `resolve.tsconfigPaths: true` shorthand doesn't
 * exist in vite@7 (which the rest of the repo pins).
 */
export default defineConfig(({ command }) => ({
  plugins: [
    devtools(),
    ...(command === "build"
      ? [cloudflare({ viteEnvironment: { name: "ssr" } })]
      : []),
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    proxy: {
      // In dev the pages worker proxies /api/* to the local server
      // worker on :8787 — same pattern as apps/admin/vite.config.ts.
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  // dev SSR runs in Node — `cloudflare:workers` is workerd-only. Mark
  // it external so vite doesn't try to resolve / pre-bundle it; our
  // dynamic imports already catch the throw and fall back gracefully.
  ...(command === "serve"
    ? {
        ssr: { external: ["cloudflare:workers"] },
        optimizeDeps: { exclude: ["cloudflare:workers"] },
      }
    : {}),
}));
