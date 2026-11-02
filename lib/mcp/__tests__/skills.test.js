/**
 * The skills catalog. A host verifies everything it is told against the
 * files themselves — a digest or size that does not match, or frontmatter
 * that reads differently from its own parse, and the skill is refused — so
 * those are the cases held here, against the shipped skills as well as
 * fixtures.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SKILLS_DIR, loadSkills, parseFrontmatter, skillsFrom } from "../skills.js";

/** Builds a skills directory from { "dir/file": contents }. */
function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), "luku-skills-"));
  for (const [rel, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), contents);
  }
  return root;
}

const skillMd = (name, description = "Does a thing.") => `---\nname: ${name}\ndescription: "${description}"\n---\n\n# ${name}\n`;

describe("the shipped skills", () => {
  let skills;
  beforeAll(async () => { skills = await loadSkills(SKILLS_DIR); });

  it("include luku-story-practice, addressed by its own name", () => {
    const story = skills.find((s) => s.name === "luku-story-practice");

    expect(story.uri).toBe("skill://luku-story-practice/SKILL.md");
    expect(story.frontmatter.name).toBe("luku-story-practice");
  });

  it("publish a digest and size computed from the bytes on disk", () => {
    // Recomputed independently: a host hashes what resources/read returns and
    // refuses the skill on any difference.
    for (const skill of skills) {
      for (const file of skill.files) {
        const bytes = readFileSync(path.join(SKILLS_DIR, skill.name, file.path));
        expect(file.digest).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
        expect(file.size).toBe(bytes.length);
      }
    }
  });

  it("stay inside the limits every host must accept", () => {
    for (const skill of skills) {
      expect(skill.files.length).toBeLessThanOrEqual(512);
      expect(skill.files.reduce((sum, f) => sum + f.size, 0)).toBeLessThanOrEqual(16 * 1024 * 1024);
    }
  });
});

describe("parseFrontmatter", () => {
  it("reads double-quoted, single-quoted and plain values", () => {
    const text = `---\nname: a-skill\ndescription: "Say \\"hi\\" — twice"\nlicense: 'It''s MIT'\ncompatibility: Needs a browser\n---\nbody`;

    expect(parseFrontmatter(text)).toEqual({
      name: "a-skill",
      description: 'Say "hi" — twice',
      license: "It's MIT",
      compatibility: "Needs a browser",
    });
  });

  it("refuses a value YAML would not read as a plain string", () => {
    // skills/list must carry the frontmatter verbatim, and a host compares it
    // with its own YAML parse; a bare true is a boolean there.
    expect(() => parseFrontmatter("---\nname: a\nbeta: true\n---\n")).toThrow(/Quote/);
    expect(() => parseFrontmatter("---\nname: a\nversion: 2.1\n---\n")).toThrow(/Quote/);
  });

  it.each([
    ["a date, which YAML 1.1 parsers type as a timestamp", "2026-10-22"],
    ["a hex number", "0x1F"],
    ["infinity", ".inf"],
    ["a comment, which YAML reads as null", "#todo"],
    ["a value ending in a colon", "foo:"],
    ["a sequence item", "- a"],
    ["a short boolean word", "y"],
  ])("refuses %s unquoted", (_label, value) => {
    expect(() => parseFrontmatter(`---\nname: a\nx: ${value}\n---\n`)).toThrow(/Quote/);
  });

  it("keeps a __proto__ key as a field rather than setting the prototype", () => {
    const frontmatter = parseFrontmatter('---\nname: a\n__proto__: "x"\n---\n');

    expect(Object.keys(frontmatter)).toEqual(["name", "__proto__"]);
    expect(JSON.parse(JSON.stringify(frontmatter))).toEqual(JSON.parse('{"name":"a","__proto__":"x"}'));
  });

  it("refuses nesting rather than flattening it", () => {
    expect(() => parseFrontmatter("---\nname: a\nmetadata:\n  version: \"1\"\n---\n")).toThrow();
  });

  it("refuses a file with no frontmatter", () => {
    expect(() => parseFrontmatter("# Just a heading\n")).toThrow(/frontmatter/);
  });
});

describe("loadSkills", () => {
  const roots = [];
  const make = (files) => {
    const root = fixture(files);
    roots.push(root);
    return root;
  };
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it("lists every file of a skill, supporting files included, under the skill's URI", async () => {
    const root = make({
      "drill/SKILL.md": skillMd("drill"),
      "drill/references/cases.md": "# Cases\n",
      "notes/README.md": "not a skill: no SKILL.md",
    });

    const [skill, ...rest] = await loadSkills(root);

    expect(rest).toEqual([]);
    expect(skill.files.map((f) => f.uri)).toEqual([
      "skill://drill/SKILL.md",
      "skill://drill/references/cases.md",
    ]);
  });

  it("leaves dotfiles out of a skill", async () => {
    const root = make({ "drill/SKILL.md": skillMd("drill"), "drill/.DS_Store": "junk", "drill/.cache/x.md": "junk" });

    const [skill] = await loadSkills(root);

    expect(skill.files.map((f) => f.path)).toEqual(["SKILL.md"]);
  });

  it("refuses a symlinked file rather than silently dropping it", async () => {
    const root = make({ "drill/SKILL.md": skillMd("drill"), "shared.md": "# Shared\n" });
    symlinkSync(path.join(root, "shared.md"), path.join(root, "drill", "shared.md"));

    await expect(loadSkills(root)).rejects.toThrow(/symlink/);
  });

  it("refuses a skill whose name is not its directory's", async () => {
    // A host recovers the name from the URI's last segment.
    const root = make({ "drill/SKILL.md": skillMd("practice") });

    await expect(loadSkills(root)).rejects.toThrow(/must match/);
  });

  it("refuses a skill with no description", async () => {
    const root = make({ "drill/SKILL.md": "---\nname: drill\n---\n" });

    await expect(loadSkills(root)).rejects.toThrow(/description/);
  });
});

describe("skillsFrom", () => {
  let root;
  let skills;
  beforeAll(() => {
    root = fixture({
      "drill/SKILL.md": skillMd("drill", "Drill one word."),
      "drill/scripts/run.py": "print('hi')\n",
      "drill/assets/logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    skills = skillsFrom(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("lists an entry carrying the verbatim frontmatter and every file's digest", async () => {
    const [entry] = await skills.list();

    expect(entry.uri).toBe("skill://drill/SKILL.md");
    expect(entry.frontmatter).toEqual({ name: "drill", description: "Drill one word." });
    expect(entry.resources).toHaveLength(3);
    expect(entry.resources.every((r) => /^sha256:[0-9a-f]{64}$/.test(r.digest))).toBe(true);
  });

  it("gets a skill only by its SKILL.md URI", async () => {
    expect(await skills.get("skill://drill/SKILL.md")).not.toBeNull();
    expect(await skills.get("skill://drill/scripts/run.py")).toBeNull();
    expect(await skills.get("skill://drill")).toBeNull();
  });

  it("gives SKILL.md the skill's name and description as a resource", async () => {
    const resources = await skills.resources();

    expect(resources.find((r) => r.uri === "skill://drill/SKILL.md")).toMatchObject({
      name: "drill",
      description: "Drill one word.",
      mimeType: "text/markdown",
    });
  });

  it("reads text as text and anything else as base64", async () => {
    expect((await skills.read("skill://drill/scripts/run.py")).text).toBe("print('hi')\n");
    expect((await skills.read("skill://drill/assets/logo.png")).blob).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
  });

  it("serves nothing outside the listed files, however the URI is spelled", async () => {
    expect(await skills.read("skill://drill/../drill/SKILL.md")).toBeNull();
    expect(await skills.read("skill://drill/missing.md")).toBeNull();
    expect(await skills.read("file:///etc/passwd")).toBeNull();
  });
});
