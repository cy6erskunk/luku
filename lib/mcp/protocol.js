/**
 * The MCP wire protocol, by hand.
 *
 * A tools-only Streamable HTTP server is a JSON-RPC 2.0 endpoint answering
 * five methods; serving skills adds read-only resources and the two methods of
 * the Skills extension. That is still a couple of hundred lines, which is why
 * @modelcontextprotocol/sdk is not a dependency here — the same call the
 * Telegram client makes by being a fetch wrapper rather than a bot framework,
 * since sessions, SSE streams, sampling and roots would all go unused.
 *
 * What we take on by hand-rolling it is version drift: PROTOCOL_VERSION below
 * is what we claim to speak, and a spec revision is a real change to make
 * deliberately rather than something a dependency bump delivers.
 *
 * Deliberately stateless. No Mcp-Session-Id is issued, so there is nothing to
 * expire and no server memory to get out of step with a serverless instance
 * that has been recycled mid-conversation.
 */

import { INSTRUCTIONS } from "./instructions.js";
import { SKILLS_EXTENSION } from "./skills.js";

/** The revision these messages are written against. */
export const PROTOCOL_VERSION = "2025-06-18";

export const SERVER_INFO = { name: "luku", version: "1.0.0" };

/** JSON-RPC 2.0 error codes, the five this server can raise. */
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

/** MCP's own code for resources/read of a URI the server does not serve. */
export const RESOURCE_NOT_FOUND = -32002;

export function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

/**
 * A JSON-RPC *notification* has no id and must get no reply. Returning a
 * response body for one is the single easiest way to make a strict client hang
 * up, so `null` here means "answer with 202 and an empty body".
 */
const NO_REPLY = null;

function isNotification(message) {
  return message.id === undefined || message.id === null;
}

/**
 * Dispatches one JSON-RPC message.
 *
 * `tools` is the toolset: `{ definitions, call(name, args) }`. It is passed in
 * rather than imported so this module stays testable without a database, and
 * so nothing here needs to know how the caller was authenticated.
 *
 * `skills`, when given, is a catalog from lib/mcp/skills.js. It turns on the
 * resources capability and the Skills extension (SEP-2640); without it the
 * server is tools-only and those methods are unknown, as before.
 *
 * Returns the response object, or NO_REPLY for a notification.
 */
export async function handleMessage(message, tools, skills) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, INVALID_REQUEST, "Expected a JSON-RPC object");
  }
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message.id, INVALID_REQUEST, "Not a JSON-RPC 2.0 request");
  }

  const { method, id } = message;

  // Notifications first: initialized is the only one a client is expected to
  // send, and every other notification is equally fine to accept and drop.
  if (isNotification(message)) return NO_REPLY;

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        // Echoed rather than negotiated: with one supported revision there is
        // nothing to choose between, and a client that cannot live with this
        // version is expected to disconnect.
        protocolVersion: PROTOCOL_VERSION,
        capabilities: skills
          ? {
              tools: {},
              // Read-only and fixed per deployment, so neither subscribe nor
              // listChanged.
              resources: {},
              // Declaring the extension commits the server to skills/list and
              // skills/get. directoryRead is off: an entry already lists every
              // file of its skill.
              extensions: { [SKILLS_EXTENSION]: {} },
            }
          : { tools: {} },
        serverInfo: SERVER_INFO,
        // How the vocabulary and its scheduling work, which no tool
        // description is the right place for. Support is uneven — some clients
        // store this field without reading it — so lib/mcp/tools.js restates
        // the field semantics where a client cannot miss them.
        instructions: INSTRUCTIONS,
      });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: tools.definitions });

    case "tools/call": {
      const { name, arguments: args } = message.params ?? {};
      if (typeof name !== "string") {
        // A well-formed request whose params are wrong, not a broken envelope.
        return rpcError(id, INVALID_PARAMS, "tools/call needs a tool name");
      }
      // A tool that refuses or finds nothing answers with isError, not a
      // JSON-RPC error: the model is meant to read it and try something else,
      // and a protocol error is not shown to it. Only a broken envelope is an
      // error at this level.
      return rpcResult(id, await tools.call(name, args ?? {}));
    }

    default:
      if (skills && Object.hasOwn(SKILL_METHODS, method)) {
        return SKILL_METHODS[method](id, message.params ?? {}, skills);
      }
      return rpcError(id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }
}

/** A uri param, or null when it is missing or not a string. */
const uriParam = (params) => (typeof params.uri === "string" ? params.uri : null);

/**
 * The resources and Skills-extension methods, reached only when a skills
 * catalog was passed in. Each file of each skill is a resource; nothing else
 * is.
 */
const SKILL_METHODS = {
  async "resources/list"(id, _params, skills) {
    return rpcResult(id, { resources: await skills.resources() });
  },

  // Every file is listed outright, so there are no templates — but a client
  // that sees the resources capability may ask, and an error here would read
  // as a broken server.
  async "resources/templates/list"(id) {
    return rpcResult(id, { resourceTemplates: [] });
  },

  async "resources/read"(id, params, skills) {
    const uri = uriParam(params);
    if (!uri) return rpcError(id, INVALID_PARAMS, "resources/read needs a uri");
    const contents = await skills.read(uri);
    if (!contents) return rpcError(id, RESOURCE_NOT_FOUND, `Resource not found: ${uri}`);
    return rpcResult(id, { contents: [contents] });
  },

  // The whole catalog fits on one page, so there is never a nextCursor and a
  // cursor sent anyway is ignored.
  async "skills/list"(id, _params, skills) {
    return rpcResult(id, { resultType: "complete", skills: await skills.list() });
  },

  // The extension fixes -32602 for a URI that names no skill, unlike
  // resources/read's -32002.
  async "skills/get"(id, params, skills) {
    const uri = uriParam(params);
    if (!uri) return rpcError(id, INVALID_PARAMS, "skills/get needs the uri of a skill's SKILL.md");
    const skill = await skills.get(uri);
    if (!skill) return rpcError(id, INVALID_PARAMS, `Not a skill this server serves: ${uri}`);
    return rpcResult(id, { resultType: "complete", skill });
  },
};

/** Shapes a tool's answer the way tools/call expects it. */
export function toolText(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

/** A tool result carrying structured data. The JSON goes in the text block
 *  too: a client that ignores structuredContent still shows the model
 *  something it can read. */
export function toolJson(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}
