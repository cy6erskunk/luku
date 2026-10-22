/**
 * The tools an MCP client gets: read the vocabulary, read one card, refine a
 * card's meaning — and find and read the skills the server publishes.
 *
 * The server does no language work. The client is Claude, so it writes the
 * translations and the examples; these tools only read and write rows. That is
 * why EXAMPLE_GUIDE appears in a tool *description* — it is the only place
 * telling a chat client what standard an example it writes is held to, and it
 * is the same text app/lib/api.js puts in its prompts.
 *
 * Every handler takes userId and scopes its query by it. No tool accepts a
 * user id as an argument: the route resolves one from the bearer token and
 * nothing here can be talked out of it. The skill tools are the exception that
 * needs neither: a skill is the same for every user.
 */
import { EXAMPLE_GUIDE } from "@/lib/shared/exampleGuide";
import { isValidWordId } from "@/lib/reviews";
import { AGAIN_DELAY_MINUTES, DEFAULT_EASE_FACTOR, FAILURES_TO_FLOOR, MIN_EASE_FACTOR } from "@/lib/srs";
import { toolJson, toolText } from "./protocol.js";
import { SKILLS } from "./skills.js";
import {
  DEFAULT_LIST_LIMIT,
  LIST_FILTERS,
  MAX_EXAMPLE,
  MAX_LIST_LIMIT,
  MAX_TRANSLATIONS,
  POS_VALUES,
  getWordById,
  getWordByBase,
  isExampleText,
  isExampleTranslation,
  listWords,
  normalizePos,
  normalizeTranslations,
  updateWordContent,
} from "@/lib/words";

/**
 * What the read-only scheduling fields on a returned card mean.
 *
 * The same ground InitializeResult.instructions covers, restated here because
 * a tool description is the one thing a client cannot fail to deliver: support
 * for `instructions` is uneven, and some clients store it without ever reading
 * it. Kept to the two fields a reader would otherwise misread — `review_count`
 * looks like a lifetime total and is not, and `ease_factor` looks like
 * internal bookkeeping when it is the only difficulty signal that survives a
 * lapse.
 */
const SCHEDULE_FIELD_GUIDE =
  "Each card also carries read-only review state: review_count is the number of CONSECUTIVE passes, not how " +
  "many times the card has been seen — a failed review resets it to 0, so a long-studied card just failed " +
  `looks identical to a new one. lapses is the lifetime count of failures, which review_count cannot give you; ` +
  "it started counting only when the column was added, so a low lapses on an old card means little. " +
  `ease_factor starts at ${DEFAULT_EASE_FACTOR}, rises with each easy answer (no ceiling) and falls when the ` +
  `user struggles (floor ${MIN_EASE_FACTOR}): lower is harder, and below ${DEFAULT_EASE_FACTOR} means the card ` +
  `has lost ground overall. It saturates, though — ${FAILURES_TO_FLOOR} failures from the starting value reach ` +
  "the floor and later ones move it no further — so lapses is what separates cards once they are down there. " +
  `next_review_at is when the card is next due; a failed review sets it ${AGAIN_DELAY_MINUTES} minutes out.`;

export const definitions = [
  {
    name: "list_words",
    description:
      "List the user's saved Finnish vocabulary cards. Ordering depends on the filter: " +
      "alphabetically by Finnish base form, except \"difficult\" and \"lapsed\", which are hardest first, " +
      "and \"due\", which is by next_review_at: the most overdue first, then the ones coming due soonest. " +
      "Use filter=\"suspect\" to find cards whose translation or part of speech failed to save properly " +
      "(translations containing \"(unavailable)\", or pos \"?\"), filter=\"missing_example\" for cards with no example sentence, " +
      "filter=\"difficult\" for the ones the user has lost ground on, and filter=\"lapsed\" for the narrower set " +
      "they failed at their last review. " +
      "Returns the total matching the filter so you can page through with offset; filter=\"due\" also returns " +
      "due_now, how many cards are due already — the first due_now of that ordering, across pages.\n\n" +
      SCHEDULE_FIELD_GUIDE,
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: LIST_FILTERS,
          description:
            "Which cards to list. Defaults to \"all\". \"difficult\" returns every card that has lost ground " +
            "(ease_factor below the starting value), hardest first, which on a well-used collection can be most " +
            "of it; cards never graded are excluded. \"lapsed\" is the sharper one: only cards failed at their " +
            "most recent review, so it answers \"what should I work on now\" rather than \"what has ever been " +
            "hard\". \"due\" returns every card ordered by next_review_at, so the most overdue come first and the " +
            "next to come due follow; due_now in the result says where overdue ends.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_LIST_LIMIT,
          description: `How many cards to return, at most ${MAX_LIST_LIMIT}. Defaults to ${DEFAULT_LIST_LIMIT}.`,
        },
        offset: { type: "integer", minimum: 0, description: "How many cards to skip, for paging." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_word",
    description:
      "Read one saved card, by its id or by its Finnish base form (case-insensitive).\n\n" +
      SCHEDULE_FIELD_GUIDE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "The card's id." },
        base: { type: "string", description: "The card's Finnish dictionary form." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "update_word",
    description:
      "Refine a saved card's meaning. Supply the card's id and only the fields you are changing; " +
      "fields you omit are left alone. Returns the id and the fields that were written.\n\n" +
      "This cannot change the card's review schedule, its base form or its recorded inflections — " +
      "refining a card never costs the user their progress on it.\n\n" +
      `Examples: ${EXAMPLE_GUIDE}`,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "The card to refine." },
        translations: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: MAX_TRANSLATIONS,
          description:
            "English translations of the Finnish base form, most useful first. " +
            "Translate the dictionary form, not the inflected word the card came from.",
        },
        pos: { type: "string", enum: POS_VALUES, description: "Part of speech." },
        example: {
          type: "string",
          maxLength: MAX_EXAMPLE,
          description: "A Finnish example sentence for the card. See the guidance above.",
        },
        example_translation: {
          type: ["string", "null"],
          maxLength: MAX_EXAMPLE,
          description: "English translation of the example. Pass null to clear it.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  // The same skills as skills/list and resources/read in lib/mcp/protocol.js,
  // as tools. Most clients show a model the tools and nothing else, so for
  // them this pair is the only way a skill is found at all — which is why the
  // descriptions say when to look, not just what comes back.
  {
    name: "list_skills",
    description:
      "List the skills this server publishes: step-by-step workflows for working with the user's Luku " +
      "vocabulary, such as a practice session built from their due cards. Call this before starting " +
      "practice, a drill, a quiz or a study session with the user's words, and if a skill fits, load it " +
      "with read_skill and follow it rather than improvising. Returns each skill's name, description and files.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "read_skill",
    description:
      "Read a skill's instructions (its SKILL.md), or one of its supporting files by path. Load a skill " +
      "before doing the task it describes, then follow it. Paths a SKILL.md mentions are relative to the " +
      "skill, so pass them here as they are written. If your client already loaded this skill itself, " +
      "there is no need to call this.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The skill's name, from list_skills." },
        path: {
          type: "string",
          description: "A file within the skill, relative to it. Defaults to SKILL.md.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

/** Validation is one step; it returns either a refusal to hand straight back
 *  or the cleaned value to use. No handler re-normalises afterwards. */
function readId(args) {
  if (!isValidWordId(args.id)) return { error: "id must be a positive integer naming one of your cards" };
  return { id: args.id };
}

async function handleListWords(sql, userId, args) {
  const filter = args.filter ?? "all";
  if (!LIST_FILTERS.includes(filter)) {
    return toolText(`filter must be one of: ${LIST_FILTERS.join(", ")}`, true);
  }

  const limit = args.limit ?? DEFAULT_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    return toolText(`limit must be an integer from 1 to ${MAX_LIST_LIMIT}`, true);
  }

  const offset = args.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    return toolText("offset must be an integer of 0 or more", true);
  }

  return toolJson(await listWords(sql, userId, { filter, limit, offset }));
}

async function handleGetWord(sql, userId, args) {
  const hasId = args.id !== undefined;
  const hasBase = typeof args.base === "string" && args.base.trim() !== "";
  if (hasId === hasBase) return toolText("Give either id or base, not both and not neither", true);

  let word;
  if (hasId) {
    const parsed = readId(args);
    if (parsed.error) return toolText(parsed.error, true);
    word = await getWordById(sql, userId, parsed.id);
  } else {
    word = await getWordByBase(sql, userId, args.base.trim());
  }

  if (!word) return toolText("No such card on this user's list", true);
  return toolJson(word);
}

async function handleUpdateWord(sql, userId, args) {
  const parsed = readId(args);
  if (parsed.error) return toolText(parsed.error, true);

  // Built key by key so an omitted field stays omitted: that is what lets
  // example_translation: null mean "clear it" rather than "leave it".
  const patch = {};

  if ("translations" in args) {
    const translations = normalizeTranslations(args.translations);
    if (!translations) {
      return toolText(
        `translations must be 1-${MAX_TRANSLATIONS} non-empty strings, and may not be "(unavailable)"`,
        true,
      );
    }
    patch.translations = translations;
  }

  if ("pos" in args) {
    const pos = normalizePos(args.pos);
    if (!pos) return toolText(`pos must be one of: ${POS_VALUES.join(", ")}`, true);
    patch.pos = pos;
  }

  if ("example" in args) {
    if (!isExampleText(args.example)) {
      return toolText(`example must be a non-empty string of at most ${MAX_EXAMPLE} characters`, true);
    }
    patch.example = args.example.trim();
  }

  if ("example_translation" in args) {
    if (!isExampleTranslation(args.example_translation)) {
      return toolText(`example_translation must be a string of at most ${MAX_EXAMPLE} characters, or null`, true);
    }
    patch.example_translation = args.example_translation?.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return toolText("Nothing to change: give at least one of translations, pos, example, example_translation", true);
  }

  const updated = await updateWordContent(sql, userId, parsed.id, patch);
  if (!updated) return toolText("No such card on this user's list", true);
  return toolJson(updated);
}

async function handleListSkills(skills) {
  const catalog = await skills.catalog();
  return toolJson({
    skills: catalog.map((skill) => ({
      name: skill.name,
      description: skill.description,
      uri: skill.uri,
      files: skill.files.map((f) => f.path),
    })),
  });
}

async function handleReadSkill(skills, args) {
  if (typeof args.name !== "string" || !args.name.trim()) return toolText("name must name a skill", true);
  if (args.path !== undefined && typeof args.path !== "string") return toolText("path must be a string", true);

  const catalog = await skills.catalog();
  const skill = catalog.find((s) => s.name === args.name.trim());
  if (!skill) {
    return toolText(`No skill named ${args.name}. Skills: ${catalog.map((s) => s.name).join(", ") || "none"}`, true);
  }

  // Matched against the skill's own file list, never joined onto a directory,
  // so no path a model makes up can reach outside the skill.
  const wanted = (args.path ?? "SKILL.md").trim().replace(/^\.\//, "");
  const file = skill.files.find((f) => f.path === wanted);
  if (!file) {
    return toolText(`${skill.name} has no file ${wanted}. Files: ${skill.files.map((f) => f.path).join(", ")}`, true);
  }

  const contents = await skills.read(file.uri);
  if (contents.text === undefined) return toolText(`${wanted} is not a text file`, true);
  return toolText(contents.text);
}

const HANDLERS = {
  list_words: handleListWords,
  get_word: handleGetWord,
  update_word: handleUpdateWord,
};

/** Tools that read the skills catalog rather than the user's rows. */
const SKILL_HANDLERS = {
  list_skills: handleListSkills,
  read_skill: handleReadSkill,
};

/**
 * The toolset handleMessage() dispatches into, bound to one user.
 *
 * An unknown tool name is a tool error rather than a JSON-RPC one: a client
 * calling a tool this version does not have should be told so in a way the
 * model can read.
 *
 * `skills` is the catalog the skill tools read; tests pass a fixture one.
 */
export function toolsFor(sql, userId, skills = SKILLS) {
  return {
    definitions,
    async call(name, args) {
      // Own properties only. A plain index would resolve Object.prototype, so
      // a client naming "__proto__" reached a non-callable object and
      // "toString" reached a real function — a 500 and a nonsense result
      // respectively, from a name the model is free to make up.
      const handler = Object.hasOwn(HANDLERS, name) ? HANDLERS[name] : null;
      const skillHandler = Object.hasOwn(SKILL_HANDLERS, name) ? SKILL_HANDLERS[name] : null;
      if (!handler && !skillHandler) return toolText(`Unknown tool: ${name}`, true);
      if (args === null || typeof args !== "object" || Array.isArray(args)) {
        return toolText("Tool arguments must be an object", true);
      }
      return handler ? handler(sql, userId, args) : skillHandler(skills, args);
    },
  };
}
