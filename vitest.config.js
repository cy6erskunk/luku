import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/**/*.{js,jsx}"],
      exclude: ["app/page.jsx", "app/layout.jsx", "app/**/__tests__/**"],
    },
  },
});
