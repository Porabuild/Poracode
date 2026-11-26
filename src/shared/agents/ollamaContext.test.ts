import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CONTEXT_WINDOW_TOKENS, MIN_CONTEXT_WINDOW_TOKENS } from "../contextWindow";
import {
  generateOllamaContextAliasId,
  isOllamaContextLength,
  isOllamaLoopbackEndpoint,
  isValidOllamaInstalledModelId,
  OLLAMA_CONTEXT_ALIAS_PREFIX,
  ollamaContextAlias,
  parseOllamaContextInput,
} from "./ollamaContext";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ollama context lengths", () => {
  it("accepts exact whole token counts in the shared context-window range", () => {
    for (const tokens of [
      MIN_CONTEXT_WINDOW_TOKENS,
      32768,
      65536,
      81920,
      88000,
      90112,
      200000,
      MAX_CONTEXT_WINDOW_TOKENS,
    ]) {
      expect(isOllamaContextLength(tokens)).toBe(true);
    }
    for (const invalid of [0, 999, 10_000_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isOllamaContextLength(invalid)).toBe(false);
    }
  });

  it("parses blank as Server default and rejects malformed or out-of-range edits", () => {
    expect(parseOllamaContextInput("")).toEqual({ kind: "default" });
    expect(parseOllamaContextInput("   ")).toEqual({ kind: "default" });
    expect(parseOllamaContextInput("88000")).toEqual({ kind: "valid", tokens: 88000 });
    expect(parseOllamaContextInput("", true)).toEqual({ kind: "invalid" });
    expect(parseOllamaContextInput("1.5")).toEqual({ kind: "invalid" });
    expect(parseOllamaContextInput("0")).toEqual({ kind: "invalid" });
    expect(parseOllamaContextInput("999")).toEqual({ kind: "invalid" });
    expect(parseOllamaContextInput("10000001")).toEqual({ kind: "invalid" });
    expect(parseOllamaContextInput("-1000")).toEqual({ kind: "invalid" });
  });
});

describe("local Ollama model ids", () => {
  it.each([
    "inkling-2-mini:latest",
    "qwen3-coder:30b",
    "Registry.Example:5000/Team/Model:Q4",
    "acme/rocket-7b@sha256:abc",
  ])("accepts a safe installed id %s", (model) => {
    expect(isValidOllamaInstalledModelId(model)).toBe(true);
  });

  it.each([
    "",
    "model;rm -rf /",
    "model --help",
    "model$(id)",
    "model`id`",
    "model\nnext",
    "model 'quoted'",
    "model:cloud",
    "model-cloud",
    `m${"e".repeat(220)}`,
  ])("rejects unsafe or cloud id %s", (model) => {
    expect(isValidOllamaInstalledModelId(model)).toBe(false);
  });
});

describe("Ollama context endpoints", () => {
  const cases: Array<[string, string | undefined, boolean]> = [
    ["http://127.0.0.1:11434", "http://127.0.0.1:11434", true],
    ["http://127.0.0.1:11434/", "http://127.0.0.1:11434", true],
    ["http://127.0.0.1:11434/v1", "http://127.0.0.1:11434/v1", true],
    ["http://127.0.0.1:11434/v1/", "http://127.0.0.1:11434/v1/", true],
    ["http://localhost:11434", undefined, false],
    ["https://127.0.0.1:11434", undefined, false],
    ["http://127.0.0.1:80", undefined, false],
    ["http://127.0.0.1:11434/models", undefined, false],
    ["http://127.0.0.1:11434/v1", "http://127.0.0.1:11434", false],
  ];

  it.each(cases)("%s (expected %s) eligibility is %s", (endpoint, expected, allowed) => {
    expect(isOllamaLoopbackEndpoint(endpoint, expected)).toBe(allowed);
  });
});

describe("Ollama context aliases", () => {
  it("is deterministic for the same base, window, and creation id", () => {
    const first = ollamaContextAlias("inkling-2-mini:latest", 65536, "0123456789abcdef");
    const second = ollamaContextAlias("inkling-2-mini:latest", 65536, "0123456789abcdef");
    expect(first).toBe(second);
    expect(first.startsWith(OLLAMA_CONTEXT_ALIAS_PREFIX)).toBe(true);
    expect(first).toMatch(/^poracode-ctx-65536-[0-9a-f]{12}-[0-9a-f]{16}$/u);
    expect(first.length).toBeLessThanOrEqual(200);
  });

  it("keeps an exact custom token count instead of a preset", () => {
    const alias = ollamaContextAlias("inkling-2-mini:latest", 88000, "0123456789abcdef");
    expect(alias).toMatch(/^poracode-ctx-88000-[0-9a-f]{12}-[0-9a-f]{16}$/u);
    expect(alias).not.toContain("86K");
  });

  it("never reuses an alias across creations of the same base and window", () => {
    expect(ollamaContextAlias("inkling-2-mini:latest", 65536, "0123456789abcdef")).not.toBe(
      ollamaContextAlias("inkling-2-mini:latest", 65536, "fedcba9876543210"),
    );
  });

  it("uses getRandomValues without requiring randomUUID", () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
    vi.stubGlobal("crypto", {
      getRandomValues: (target: Uint8Array) => {
        target.set(bytes);
        return target;
      },
    });
    expect("randomUUID" in globalThis.crypto).toBe(false);
    expect(generateOllamaContextAliasId()).toBe("000102030405060708090a0b0c0d0e0f");
    const alias = ollamaContextAlias("inkling-2-mini:latest", 65536);
    expect(alias).toMatch(/^poracode-ctx-65536-[0-9a-f]{12}-000102030405060708090a0b0c0d0e0f$/u);
  });
});
