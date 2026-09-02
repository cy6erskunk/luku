/**
 * The lib/ boundary, checked by resolving imports rather than by matching the
 * text of them.
 *
 * .oxlintrc.json enforces the same rule and gives faster feedback, but it can
 * only pattern-match the specifier as written, so it needs one block per
 * directory depth. This test resolves each specifier to a path and asks where
 * it lands, which is depth-proof: nest client code five levels deeper and it
 * still holds.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_LIB = path.join(ROOT, "lib");
const SHARED = path.join(ROOT, "lib", "shared");

/** Everything that ends up in the browser bundle. app/api/ is server code. */
function clientFiles(dir = path.join(ROOT, "app"), found = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (full === path.join(ROOT, "app", "api")) continue;
    if (statSync(full).isDirectory()) clientFiles(full, found);
    else if (/\.jsx?$/.test(entry)) found.push(full);
  }
  return found;
}

/** Static imports, re-exports and dynamic import() alike. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function specifiersIn(file) {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(SPECIFIER)].map((m) => m[1]);
}

function resolveSpecifier(file, specifier) {
  if (specifier.startsWith("@/")) return path.join(ROOT, specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier);
  return null; // a package, not a path
}

function crossings() {
  const files = [...clientFiles(), path.join(ROOT, "instrumentation-client.js")];
  const bad = [];
  for (const file of files) {
    for (const specifier of specifiersIn(file)) {
      const target = resolveSpecifier(file, specifier);
      if (!target) continue;
      const inServerLib = target === SERVER_LIB || target.startsWith(SERVER_LIB + path.sep);
      const inShared = target === SHARED || target.startsWith(SHARED + path.sep);
      if (inServerLib && !inShared) bad.push(`${path.relative(ROOT, file)} -> ${specifier}`);
    }
  }
  return bad;
}

describe("the lib/ boundary", () => {
  it("is not crossed by anything that reaches the browser", () => {
    // A crossing pulls the database driver, node:crypto or a secret into the
    // bundle. lib/shared/ is the exception, and it is dependency-free.
    expect(crossings()).toEqual([]);
  });

  it("actually looks at the client tree", () => {
    // Guards the check itself: a walk that silently found nothing would pass
    // the assertion above for the wrong reason.
    const files = clientFiles();
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith(path.join("app", "page.jsx")))).toBe(true);
    expect(files.every((f) => !f.includes(`${path.sep}api${path.sep}`))).toBe(true);
  });
});
