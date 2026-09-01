import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Mirrors the "@/*" -> repo root mapping in jsconfig.json, which Vite does not
// read on its own. API route modules import their deps as "@/lib/...".
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": rootDir },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/**/*.{js,jsx}"],
      // layout.jsx is the metadata shell and has no behaviour to cover.
      // page.jsx is not excluded: it owns the cross-hook actions, which are
      // exactly the part no single hook's suite can reach.
      exclude: ["app/layout.jsx", "app/**/__tests__/**"],
    },
  },
});
