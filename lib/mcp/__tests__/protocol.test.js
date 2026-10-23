/**
 * The hand-rolled JSON-RPC layer. Since there is no SDK underneath it, the
 * cases a client would hang up over are ours to hold: a notification getting a
 * reply, a method we don't have answering as if we do, and a malformed
 * envelope being treated as a tool call.
 */
import { describe, it, expect, vi } from "vitest";
import {
  RESOURCE_NOT_FOUND,
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  PROTOCOL_VERSION,
  handleMessage,
  toolJson,
  toolText,
} from "../protocol.js";

const DEFINITIONS = [{ name: "list_words", description: "…", inputSchema: { type: "object" } }];

const tools = (call = vi.fn(() => toolText("ok"))) => ({ definitions: DEFINITIONS, call });

const req = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

describe("initialize", () => {
  it("answers with the protocol version it claims and a tools capability", async () => {
    const res = await handleMessage(req("initialize"), tools());

    expect(res.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(res.result.capabilities).toEqual({ tools: {} });
  });

  it("hands the client the scheduling model up front, which no tool description covers", async () => {
    // The handshake is the only point a client learns how the SRS behaves
    // without spending a round trip on it.
    const res = await handleMessage(req("initialize"), tools());

    expect(res.result.instructions).toContain("SM-2");
    expect(res.result.serverInfo.name).toBe("luku");
  });
});

describe("notifications", () => {
  it("returns nothing for notifications/initialized rather than a reply a client would reject", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, tools());

    expect(res).toBeNull();
  });

  it("drops an unknown notification instead of answering method-not-found", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", method: "notifications/cancelled" }, tools());

    expect(res).toBeNull();
  });
});

describe("malformed messages", () => {
  it("rejects a message that is not a JSON-RPC 2.0 request", async () => {
    const res = await handleMessage({ id: 1, method: "tools/list" }, tools());

    expect(res.error.code).toBe(INVALID_REQUEST);
  });

  it("rejects an array, which would otherwise read as a request with no method", async () => {
    const res = await handleMessage([req("tools/list")], tools());

    expect(res.error.code).toBe(INVALID_REQUEST);
  });

  it("reports an unknown method rather than falling through to a tool call", async () => {
    const call = vi.fn();
    const res = await handleMessage(req("resources/list"), tools(call));

    expect(res.error.code).toBe(METHOD_NOT_FOUND);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("tools/call", () => {
  it("passes the tool name and arguments through", async () => {
    const call = vi.fn(() => toolText("done"));
    await handleMessage(req("tools/call", { name: "update_word", arguments: { id: 3 } }), tools(call));

    expect(call).toHaveBeenCalledWith("update_word", { id: 3 });
  });

  it("defaults missing arguments to an empty object", async () => {
    const call = vi.fn(() => toolText("done"));
    await handleMessage(req("tools/call", { name: "list_words" }), tools(call));

    expect(call).toHaveBeenCalledWith("list_words", {});
  });

  it("refuses a call with no tool name as invalid params, without invoking anything", async () => {
    const call = vi.fn();
    const res = await handleMessage(req("tools/call", { arguments: {} }), tools(call));

    // The envelope is a valid request; its params are wrong. -32600 would say
    // the message itself was unparseable as a request, which it was not.
    expect(res.error.code).toBe(INVALID_PARAMS);
    expect(res.error.code).not.toBe(INVALID_REQUEST);
    expect(call).not.toHaveBeenCalled();
  });

  it("returns a tool's refusal as a successful result, so the model can read it", async () => {
    const res = await handleMessage(
      req("tools/call", { name: "get_word", arguments: {} }),
      tools(() => toolText("No such card", true)),
    );

    expect(res.error).toBeUndefined();
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toBe("No such card");
  });
});

describe("tools/list", () => {
  it("hands back the toolset's definitions", async () => {
    const res = await handleMessage(req("tools/list"), tools());

    expect(res.result.tools).toEqual(DEFINITIONS);
  });
});

describe("toolJson", () => {
  it("carries the value as both structured content and readable text", () => {
    const result = toolJson({ id: 4, pos: "verb" });

    expect(result.structuredContent).toEqual({ id: 4, pos: "verb" });
    expect(JSON.parse(result.content[0].text)).toEqual({ id: 4, pos: "verb" });
    expect(result.isError).toBe(false);
  });
});

describe("skills", () => {
  const ENTRY = {
    uri: "skill://drill/SKILL.md",
    frontmatter: { name: "drill", description: "Drill one word." },
    resources: [{ uri: "skill://drill/SKILL.md", digest: `sha256:${"0".repeat(64)}`, size: 40 }],
  };
  const skills = {
    list: vi.fn(async () => [ENTRY]),
    get: vi.fn(async (uri) => (uri === ENTRY.uri ? ENTRY : null)),
    resources: vi.fn(async () => [{ uri: ENTRY.uri, name: "drill", mimeType: "text/markdown" }]),
    read: vi.fn(async (uri) => (uri === ENTRY.uri ? { uri, mimeType: "text/markdown", text: "---" } : null)),
  };

  it("declares resources and the Skills extension when it has skills to serve", async () => {
    const res = await handleMessage(req("initialize"), tools(), skills);

    expect(res.result.capabilities).toEqual({
      tools: {},
      resources: {},
      extensions: { "io.modelcontextprotocol/skills": {} },
    });
  });

  it("lists every skill's entry", async () => {
    const res = await handleMessage(req("skills/list", {}), tools(), skills);

    expect(res.result.skills).toEqual([ENTRY]);
    expect(res.result.nextCursor).toBeUndefined();
  });

  it("gets one skill by its SKILL.md URI", async () => {
    const res = await handleMessage(req("skills/get", { uri: ENTRY.uri }), tools(), skills);

    expect(res.result.skill).toEqual(ENTRY);
  });

  it("answers skills/get for a URI it does not serve with invalid params, as the extension requires", async () => {
    const res = await handleMessage(req("skills/get", { uri: "skill://other/SKILL.md" }), tools(), skills);

    expect(res.error.code).toBe(INVALID_PARAMS);
  });

  it("reads a skill file as a resource", async () => {
    const res = await handleMessage(req("resources/read", { uri: ENTRY.uri }), tools(), skills);

    expect(res.result.contents).toEqual([{ uri: ENTRY.uri, mimeType: "text/markdown", text: "---" }]);
  });

  it("reports an unknown resource with MCP's resource-not-found code", async () => {
    const res = await handleMessage(req("resources/read", { uri: "skill://other/SKILL.md" }), tools(), skills);

    expect(res.error.code).toBe(RESOURCE_NOT_FOUND);
  });

  it("refuses resources/read with no uri as invalid params", async () => {
    const res = await handleMessage(req("resources/read", {}), tools(), skills);

    expect(res.error.code).toBe(INVALID_PARAMS);
  });

  it("answers resources/templates/list with none, rather than an unknown method", async () => {
    const res = await handleMessage(req("resources/templates/list"), tools(), skills);

    expect(res.result.resourceTemplates).toEqual([]);
  });

  it("knows none of these methods when no skills are passed in", async () => {
    for (const method of ["skills/list", "skills/get", "resources/read", "resources/templates/list"]) {
      const res = await handleMessage(req(method, {}), tools());
      expect(res.error.code).toBe(METHOD_NOT_FOUND);
    }
  });

  it("does not resolve an inherited property name as a method", async () => {
    const res = await handleMessage(req("toString"), tools(), skills);

    expect(res.error.code).toBe(METHOD_NOT_FOUND);
  });
});
