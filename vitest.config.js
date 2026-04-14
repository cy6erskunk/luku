import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/**/*.{js,jsx}"],
      exclude: [
        "app/page.js",
        "app/layout.js",
        "app/components/SignIn.jsx",
        "app/**/__tests__/**",
      ],
    },
  },
});
