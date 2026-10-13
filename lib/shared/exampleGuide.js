/**
 * What makes an example worth remembering.
 *
 * In lib/shared/ because two tiers need the same words. The browser's
 * translateWord() and suggestExample() (app/lib/api.js) put it in a prompt;
 * the MCP server puts it in a tool description (lib/mcp/tools.js), where it is
 * the only thing telling a chat client what standard an example it writes is
 * held to. A card refined over MCP and one regenerated in ExamplePicker should
 * read the same, which they only do while both aim at one description.
 *
 * No imports, per lib/shared/'s rule — a bare string cannot drag the database
 * driver or node:crypto across the boundary.
 *
 * A bare "Hän toipuu." pins the word to nothing; "Isä toipuu flunssasta
 * sohvalla." gives it a who, a from-what and a where, and the scene is what a
 * reader recalls the word by.
 */
export const EXAMPLE_GUIDE = "The example is a short (4-8 words), natural Finnish sentence that uses the base form or a common inflection of it, " +
  "set in a concrete, vivid everyday scene: a specific person, object, place or reason that makes the meaning obvious and easy to picture. " +
  "Avoid bare subject+verb sentences like \"Hän toipuu.\" and avoid generic filler. Keep the grammar at A2-B1 level.";
