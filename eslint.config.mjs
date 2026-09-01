import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Style is not what this is for — there is no formatter here and reviews have
 * kept the code consistent. It is for the mistakes reading cannot reliably
 * catch: a hook called conditionally, a dependency array that has drifted from
 * the closure it describes, a variable that no longer exists.
 */
export default [
  { ignores: [".next/**", "node_modules/**", "coverage/**"] },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node },
    },
    rules: {
      // Caught deliberately-empty catch blocks, which this codebase uses on
      // purpose (localStorage in a private window, a transient poll failure).
      // A comment inside the block is the convention; requiring more noise
      // than that is not worth it.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // The client half: browser APIs, React components and hooks.
  {
    files: ["app/**/*.{js,jsx}", "instrumentation-client.js"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Route handlers and other server code run on Node and see no DOM.
  {
    files: ["app/api/**/*.js", "lib/**/*.js", "scripts/**/*.mjs", "*.config.{js,mjs}", "instrumentation.js", "sentry.*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
