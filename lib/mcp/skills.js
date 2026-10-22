/**
 * Agent Skills, served over MCP.
 *
 * The skills themselves live in skills/ at the repository root as ordinary
 * Agent Skills directories (SKILL.md plus any supporting files), which is the
 * one copy: the same folder can be zipped for claude.ai or bundled in a
 * plugin, and everything a client is told here is generated from it.
 *
 * Two routes reach them, because client support is uneven:
 *
 * 1. The Skills extension (SEP-2640, io.modelcontextprotocol/skills). Each
 *    file is a resource at skill://<name>/<path>, and skills/list and
 *    skills/get return an entry per skill carrying its frontmatter and a
 *    sha256 digest and size for every file. This is the standard, and what a
 *    host that loads MCP skills natively reads.
 * 2. Two tools, list_skills and read_skill (lib/mcp/tools.js). A model always
 *    sees a server's tools. Few clients load MCP skills yet, and those that
 *    show resources at all do so through a generic reader that knows nothing
 *    of skills. So this is what works today.
 *
 * Skills are the same for every user — they are instructions, not data — so
 * nothing here takes a userId, and the catalog is read once per instance.
 *
 * The directory is read at runtime, so next.config.mjs has to trace skills/
 * into the route's bundle; without that, a deployment has an empty folder and
 * every skills call fails.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";

export const SKILLS_DIR = path.join(process.cwd(), "skills");

const SKILL_FILE = "SKILL.md";

/** The Agent Skills naming rule: lowercase letters, digits and single
 *  hyphens, at most 64 characters, and equal to the directory's name. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

const MIME_TYPES = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".html": "text/html",
  ".csv": "text/csv",
  ".css": "text/css",
  ".xml": "text/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "text/plain",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/plain",
  ".py": "text/x-python",
  ".sh": "text/x-shellscript",
};

export function mimeTypeOf(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Whether a file is served as text rather than base64. read_skill can only
 *  hand a model text, so a type missing from MIME_TYPES is unreadable there. */
export const isText = (mimeType) =>
  mimeType.startsWith("text/") || mimeType === "application/json" || mimeType.endsWith("+xml");

/**
 * Reads SKILL.md's YAML frontmatter.
 *
 * Deliberately not a YAML parser: it takes flat `key: value` lines and refuses
 * anything else. skills/list must return the frontmatter *verbatim*, and a
 * host compares it field by field with its own parse of the file, so a value
 * read differently here than by a real parser — a nested map, a bare `true`
 * that YAML types as a boolean — would fail verification on the host. Refusing
 * at load time turns that into a test failure here instead.
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error("SKILL.md must begin with YAML frontmatter between --- lines");

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const field = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (!field) throw new Error(`Unsupported frontmatter line (flat key: value only): ${line}`);
    const [, key, raw] = field;
    if (Object.hasOwn(frontmatter, key)) throw new Error(`Duplicate frontmatter key: ${key}`);
    // Defined rather than assigned: assigning "__proto__" would set the
    // prototype and drop the key from what skills/list returns.
    Object.defineProperty(frontmatter, key, { value: scalar(key, raw), enumerable: true, writable: true, configurable: true });
  }
  return frontmatter;
}

function scalar(key, raw) {
  // A double-quoted YAML string escapes the way a JSON string does, for
  // everything a description is likely to hold.
  if (raw.startsWith('"')) {
    try {
      const value = JSON.parse(raw);
      if (typeof value === "string") return value;
    } catch {
      // fall through to the refusal below
    }
    throw new Error(`Malformed double-quoted value for ${key}`);
  }
  if (raw.startsWith("'")) {
    if (raw.length < 2 || !raw.endsWith("'")) throw new Error(`Malformed single-quoted value for ${key}`);
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  // A plain scalar is taken only in the shape every YAML parser reads as a
  // string: starting with a letter (so no number, date, .inf or #comment),
  // not a boolean or null word, and with nothing that starts a comment or a
  // mapping. Anything else is refused rather than guessed at.
  if (!/^[A-Za-z]/.test(raw) || /^(?:true|false|yes|no|y|n|on|off|null)$/i.test(raw) || /:(?:\s|$)|\s#/.test(raw)) {
    throw new Error(`Quote the value of ${key}: as written YAML would not read it as a plain string`);
  }
  return raw;
}

/** Every file under dir, as /-separated paths relative to it, sorted so the
 *  entry a listing returns is the same on every instance. Dotfiles are left
 *  out (editor and OS litter, not skill content). A symlink is refused rather
 *  than skipped: dropping it would leave a SKILL.md pointing at a file the
 *  server says does not exist. */
async function filesUnder(dir, prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Skill files must be regular files, not symlinks: ${rel}`);
    if (entry.isDirectory()) found.push(...(await filesUnder(path.join(dir, entry.name), rel)));
    else if (entry.isFile()) found.push(rel);
  }
  return found.sort();
}

const digestOf = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function loadSkill(root, dirName) {
  const dir = path.join(root, dirName);
  const paths = await filesUnder(dir);
  if (!paths.includes(SKILL_FILE)) return null;

  const files = await Promise.all(paths.map(async (rel) => {
    const bytes = await readFile(path.join(dir, rel));
    return {
      path: rel,
      uri: `skill://${dirName}/${rel}`,
      mimeType: mimeTypeOf(rel),
      size: bytes.length,
      digest: digestOf(bytes),
      bytes,
    };
  }));

  const skillMd = files.find((f) => f.path === SKILL_FILE);
  const frontmatter = parseFrontmatter(skillMd.bytes.toString("utf8"));
  const { name, description } = frontmatter;

  // The URI's last segment must be the frontmatter name — a host recovers
  // the name from the URI alone — and the Agent Skills spec requires it of
  // the directory anyway.
  if (name !== dirName) throw new Error(`Skill in ${dirName}/ is named "${name}"; the two must match`);
  if (!NAME.test(name) || name.length > MAX_NAME) throw new Error(`Invalid skill name: ${name}`);
  if (typeof description !== "string" || !description.trim() || description.length > MAX_DESCRIPTION) {
    throw new Error(`Skill ${name} needs a description of 1-${MAX_DESCRIPTION} characters`);
  }

  return { name, description, uri: skillMd.uri, frontmatter, files };
}

/** Reads every skill under root: each directory directly inside it that holds
 *  a SKILL.md. Throws on a skill that would not verify on a host. */
export async function loadSkills(root = SKILLS_DIR) {
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const skills = (await Promise.all(dirs.map((d) => loadSkill(root, d)))).filter(Boolean);
  return skills;
}

/** A skill as skills/list and skills/get describe it: the complete manifest
 *  a host verifies every later read against. */
function entryOf(skill) {
  return {
    uri: skill.uri,
    frontmatter: skill.frontmatter,
    resources: skill.files.map(({ uri, digest, size }) => ({ uri, digest, size })),
  };
}

/** A file as resources/list describes it. SKILL.md takes the skill's own name
 *  and description, as the extension asks. */
function resourceOf(skill, file) {
  const isSkillMd = file.path === SKILL_FILE;
  return {
    uri: file.uri,
    name: isSkillMd ? skill.name : file.path,
    ...(isSkillMd ? { description: skill.description } : {}),
    mimeType: file.mimeType,
    size: file.size,
  };
}

/**
 * The catalog under root, as the protocol and the tools use it. Loaded on
 * first use and kept: the files are part of the deployment, so they cannot
 * change under a running instance. A failed load is not kept, so the next
 * request tries again.
 */
export function skillsFrom(root = SKILLS_DIR) {
  let loading;
  const catalog = () => {
    loading ??= loadSkills(root).catch((e) => {
      loading = undefined;
      throw e;
    });
    return loading;
  };

  const fileAt = async (uri) => {
    for (const skill of await catalog()) {
      const file = skill.files.find((f) => f.uri === uri);
      if (file) return file;
    }
    return null;
  };

  return {
    catalog,

    async list() {
      return (await catalog()).map(entryOf);
    },

    /** The entry for the skill whose SKILL.md is at uri, or null. */
    async get(uri) {
      const skill = (await catalog()).find((s) => s.uri === uri);
      return skill ? entryOf(skill) : null;
    },

    async resources() {
      return (await catalog()).flatMap((skill) => skill.files.map((file) => resourceOf(skill, file)));
    },

    /** resources/read contents for uri, or null for one this server does not
     *  serve. Lookup is against the loaded list, never a path join, so no URI
     *  can reach a file outside skills/. */
    async read(uri) {
      const file = await fileAt(uri);
      if (!file) return null;
      return isText(file.mimeType)
        ? { uri, mimeType: file.mimeType, text: file.bytes.toString("utf8") }
        : { uri, mimeType: file.mimeType, blob: file.bytes.toString("base64") };
    },
  };
}

/** The deployment's own skills. */
export const SKILLS = skillsFrom();
