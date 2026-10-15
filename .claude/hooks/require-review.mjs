#!/usr/bin/env node
// Gate for opening a pull request: the pre-PR review has to have passed for
// the exact commit being proposed.
//
// Two modes:
//
//   As a PreToolUse hook (no arguments; the tool call arrives as JSON on
//   stdin): blocks the GitHub MCP `create_pull_request` tool and `gh pr
//   create` unless a marker exists for the PR's head commit. Exit 2 is what
//   tells Claude Code to refuse the call and show stderr to the model.
//
//   It sees only tool calls Claude makes. The Claude app's "Create PR" button
//   and the GitHub web UI open a PR without one, so they are not gated; the
//   skill handles a branch whose PR already exists.
//
//   As a command, run by the skill once its review is clean:
//     node .claude/hooks/require-review.mjs --mark "<summary>"
//     node .claude/hooks/require-review.mjs --mark --skipped "<user's reason>"
//
// The marker is keyed on the commit SHA, so any later commit needs a fresh
// review. It lives under .git/, which is never committed and is per-clone —
// a fresh cloud container starts with no markers, which is the point.
//
// It fails open on its own errors (not a git repo, git missing): a gate that
// wedges PR creation over a broken hook costs more than one unreviewed PR.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKILL = "/pre-pr-review";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function markerDir(cwd) {
  // --git-path resolves correctly inside worktrees, where .git is a file.
  const p = git(["rev-parse", "--git-path", "luku-review"], cwd);
  return p.startsWith("/") ? p : join(cwd, p);
}

function mark(argv) {
  const cwd = process.cwd();
  const skipped = argv.includes("--skipped");
  const summary = argv.filter((a) => a !== "--mark" && a !== "--skipped").join(" ").trim();

  // A dirty tree means HEAD is not what was reviewed, and committing it would
  // move HEAD past the marker anyway.
  const dirty = git(["status", "--porcelain", "--untracked-files=no"], cwd);
  if (dirty) {
    console.error("Refusing to mark: tracked files have uncommitted changes. Commit, then review HEAD.");
    process.exit(1);
  }
  if (skipped && !summary) {
    console.error("--skipped needs the user's reason.");
    process.exit(1);
  }

  const sha = git(["rev-parse", "HEAD"], cwd);
  const dir = markerDir(cwd);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, sha),
    JSON.stringify({ sha, at: new Date().toISOString(), skipped, summary }, null, 2) + "\n",
  );
  console.log(`${skipped ? "Review skipped" : "Review recorded"} for ${sha.slice(0, 12)}.`);
}

function headSha(cwd, head) {
  // create_pull_request takes "branch" or "owner:branch". GitHub opens the
  // PR at the *remote* branch, which can differ from the local one (pushed
  // earlier, or since from another clone), so check origin's copy first.
  // Without a head, or with no such branch anywhere, use what is checked out.
  if (head) {
    const branch = head.includes(":") ? head.split(":").pop() : head;
    for (const ref of [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`]) {
      try {
        return git(["rev-parse", "--verify", ref], cwd);
      } catch {
        // no such ref — try the next
      }
    }
  }
  return git(["rev-parse", "HEAD"], cwd);
}

function gate() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const { tool_name: tool, tool_input: args = {} } = input;

  const isMcp = (tool ?? "").endsWith("create_pull_request");
  // A command segment (split on separators) that runs gh — directly, by path,
  // or behind env assignments or `env` — with `pr create` in it. Cutting at
  // separators keeps `git commit -m "... gh pr create ..."` from matching
  // unless the quoted text itself contains one. `gh api …/pulls` is not
  // caught: this is a reminder that the review is owed, not a security gate.
  const isGh = tool === "Bash" && /(^|[;&|(\n])\s*(\w+=\S*\s+|env\s+)*(\S*\/)?gh\s[^;&|\n]*\bpr\s+create\b/.test(args.command ?? "");
  if (!isMcp && !isGh) process.exit(0);

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let sha;
  let dir;
  try {
    sha = headSha(cwd, isMcp ? args.head : undefined);
    dir = markerDir(cwd);
  } catch {
    process.exit(0);
  }
  if (existsSync(join(dir, sha))) process.exit(0);

  console.error(
    [
      `No pre-PR review is recorded for ${sha.slice(0, 12)}.`,
      `Run the ${SKILL} skill on this branch first. It walks the repository's checklist,`,
      `fixes what it finds, and records the pass with`,
      `  node .claude/hooks/require-review.mjs --mark "<summary>"`,
      `If the user has explicitly asked to open the PR without a review, record that with`,
      `  node .claude/hooks/require-review.mjs --mark --skipped "<their reason>"`,
      `and say so in the PR body.`,
    ].join("\n"),
  );
  process.exit(2);
}

if (process.argv.includes("--mark")) mark(process.argv.slice(2));
else gate();
