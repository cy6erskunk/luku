import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/**/*.js"],
      exclude: ["app/page.js", "app/layout.js", "app/components/**"],
    },
  },
});
