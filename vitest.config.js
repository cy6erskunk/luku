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
      exclude: ["app/page.jsx", "app/layout.jsx", "app/**/__tests__/**"],
    },
  },
});
