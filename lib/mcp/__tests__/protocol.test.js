/**
 * The hand-rolled JSON-RPC layer. Since there is no SDK underneath it, the
 * cases a client would hang up over are ours to hold: a notification getting a
 * reply, a method we don't have answering as if we do, and a malformed
 * envelope being treated as a tool call.
 */
import { describe, it, expect, vi } from "vitest";
import {
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

  it("refuses a call with no tool name without invoking anything", async () => {
    const call = vi.fn();
    const res = await handleMessage(req("tools/call", { arguments: {} }), tools(call));

    expect(res.error.code).toBe(INVALID_REQUEST);
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
