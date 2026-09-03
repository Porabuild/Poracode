import { describe, expect, it } from "vitest";
import {
  isMspRpcError,
  isRetryableMspError,
  MspRpcError,
  parseMspFrame,
  parseMspInitializeResult,
  parseMspModelListResult,
} from "./protocol";

describe("parseMspFrame", () => {
  it("parses success responses with object results", () => {
    expect(parseMspFrame({ jsonrpc: "2.0", id: 3, result: { models: [] } })).toEqual({
      kind: "response",
      id: 3,
      result: { models: [] },
    });
  });

  it("parses error responses with kind and retryable detail", () => {
    expect(
      parseMspFrame({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32001, message: "busy", data: { kind: "overloaded", retryable: true } },
      }),
    ).toEqual({
      kind: "response",
      id: 1,
      error: {
        code: -32001,
        message: "busy",
        data: { kind: "overloaded", retryable: true },
        retryable: true,
      },
    });
  });

  it("parses notifications with and without params", () => {
    expect(parseMspFrame({ jsonrpc: "2.0", method: "initialized" })).toEqual({
      kind: "notification",
      method: "initialized",
      params: {},
    });
    expect(
      parseMspFrame({ jsonrpc: "2.0", method: "turn/started", params: { turnId: "t" } }),
    ).toMatchObject({ kind: "notification", method: "turn/started" });
  });

  it("parses server-initiated requests", () => {
    expect(
      parseMspFrame({ jsonrpc: "2.0", id: 41, method: "approval/request", params: { a: 1 } }),
    ).toEqual({
      kind: "request",
      id: 41,
      method: "approval/request",
      params: { a: 1 },
    });
  });

  it("rejects garbage, scalar results, and null-id errors", () => {
    expect(parseMspFrame({ nope: true }).kind).toBe("unknown");
    expect(parseMspFrame({ jsonrpc: "2.0", id: 1, result: 42 }).kind).toBe("unknown");
    expect(
      parseMspFrame({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "x" } }).kind,
    ).toBe("unknown");
    expect(parseMspFrame("nope").kind).toBe("unknown");
  });
});

describe("isRetryableMspError", () => {
  const retryable = (kind: string, flag?: boolean) =>
    new MspRpcError("busy", {
      code: -32001,
      kind,
      ...(flag === undefined ? {} : { retryable: flag }),
    });

  it("honors the server verdict first, then the overloaded/backpressured kinds", () => {
    expect(isRetryableMspError(retryable("overloaded"))).toBe(true);
    expect(isRetryableMspError(retryable("backpressured"))).toBe(true);
    expect(isRetryableMspError(retryable("internal"))).toBe(false);
    expect(isRetryableMspError(retryable("overloaded", false))).toBe(false);
    expect(isRetryableMspError(retryable("internal", true))).toBe(true);
    expect(isRetryableMspError(new Error("plain"))).toBe(false);
    expect(isMspRpcError(retryable("overloaded"))).toBe(true);
  });
});

describe("parseMspInitializeResult", () => {
  it("defaults absent members (absent durability reads as durable per the schema)", () => {
    expect(parseMspInitializeResult({})).toMatchObject({
      sessionDurability: "durable",
      grantedCapabilities: [],
      experimentalApi: false,
    });
  });
});

describe("model/list transcript validation", () => {
  // Exact server result frame from the public model-round-trip conformance
  // transcript (meta-models/muse-code-sdk, schema/msp/transcripts). It
  // exercises a non-Muse provider, null limits, and the isActive/isDefault
  // flags our picker merge depends on.
  const transcriptResult = {
    models: [
      {
        contextLimit: null,
        cost: null,
        description: null,
        displayLabel: "gpt-5.5",
        isActive: false,
        isDefault: false,
        modelId: "gpt-5.5",
        outputLimit: null,
        profileId: null,
        providerId: "openai",
        releaseDate: null,
      },
      {
        contextLimit: null,
        cost: null,
        description: null,
        displayLabel: "gpt-5.6-sol",
        isActive: true,
        isDefault: true,
        modelId: "gpt-5.6-sol",
        outputLimit: null,
        profileId: null,
        providerId: "openai",
        releaseDate: null,
      },
    ],
    profileId: null,
    providerId: "openai",
    source: "fakeCatalog",
  };

  it("parses the transcript's catalog rows verbatim", () => {
    const parsed = parseMspModelListResult(transcriptResult);
    expect(parsed.providerId).toBe("openai");
    expect(parsed.source).toBe("fakeCatalog");
    expect(parsed.models.map((m) => [m.modelId, m.displayLabel, m.isActive, m.isDefault])).toEqual([
      ["gpt-5.5", "gpt-5.5", false, false],
      ["gpt-5.6-sol", "gpt-5.6-sol", true, true],
    ]);
    // Null limits stay null (caller falls back to the known 1M window).
    expect(parsed.models.every((m) => m.contextLimit === null)).toBe(true);
  });
});
