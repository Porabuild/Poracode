import { describe, expect, it } from "vitest";
import {
  LIVE_PROVIDERS_REQUIRED_ENV,
  LiveProvidersRequiredError,
  parseRequiredLiveProviders,
  skipOrThrowRequired,
} from "./liveProvidersRequired";

// Pure unit coverage for the strict-mode parser. No registry import and no
// provider binary is touched: the kind list is synthetic on purpose, so the
// validation contract is tested without invoking anything.

const KINDS = ["claude", "codex", "gemini", "muse"] as const;

describe("parseRequiredLiveProviders", () => {
  it("is off when the env var is unset", () => {
    expect(parseRequiredLiveProviders(undefined, KINDS)).toEqual({ raw: "", names: [] });
  });

  it("is off when the env var is blank", () => {
    expect(parseRequiredLiveProviders("", KINDS).names).toEqual([]);
    expect(parseRequiredLiveProviders("   ", KINDS).names).toEqual([]);
  });

  it("parses a single name", () => {
    expect(parseRequiredLiveProviders("claude", KINDS)).toEqual({
      raw: "claude",
      names: ["claude"],
    });
  });

  it("parses a comma list, trims entries, and preserves order", () => {
    expect(parseRequiredLiveProviders(" gemini ,claude,codex", KINDS)).toEqual({
      raw: "gemini ,claude,codex",
      names: ["gemini", "claude", "codex"],
    });
  });

  it("resolves case-insensitively to the canonical registry kind", () => {
    expect(parseRequiredLiveProviders("Claude,GEMINI", KINDS).names).toEqual(["claude", "gemini"]);
  });

  it("fails on an empty entry between commas, naming the position", () => {
    expect(() => parseRequiredLiveProviders("claude,,codex", KINDS)).toThrowError(
      new LiveProvidersRequiredError(
        `${LIVE_PROVIDERS_REQUIRED_ENV} has an empty provider name at position 2 ` +
          `(raw value: "claude,,codex"). Use a comma-separated list of provider kinds with no ` +
          `empty entries. Known kinds: ${KINDS.join(", ")}.`,
      ),
    );
  });

  it("fails on a trailing empty entry", () => {
    expect(() => parseRequiredLiveProviders("claude,", KINDS)).toThrowError(/position 2/u);
  });

  it("fails on a whitespace-only entry", () => {
    expect(() => parseRequiredLiveProviders("claude,  ,codex", KINDS)).toThrowError(
      /empty provider name at position 2/u,
    );
  });

  it("fails on an unknown provider, listing the known kinds", () => {
    expect(() => parseRequiredLiveProviders("claude,notaprovider", KINDS)).toThrowError(
      /unknown provider "notaprovider" at position 2[\s\S]*Known provider kinds: claude, codex, gemini, muse/u,
    );
  });

  it("fails on an exact duplicate", () => {
    expect(() => parseRequiredLiveProviders("codex,codex", KINDS)).toThrowError(
      /names provider "codex" twice \(positions 1 and 2\)/u,
    );
  });

  it("fails on a case-insensitive duplicate", () => {
    expect(() => parseRequiredLiveProviders("codex,Codex", KINDS)).toThrowError(
      /names provider "codex" twice/u,
    );
  });

  it("carries the typed code on every validation failure", () => {
    let error: unknown;
    try {
      parseRequiredLiveProviders("nope", KINDS);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LiveProvidersRequiredError);
    expect((error as LiveProvidersRequiredError).code).toBe("LIVE_PROVIDERS_REQUIRED_INVALID");
  });
});

describe("skipOrThrowRequired", () => {
  it("skips with the given reason in ordinary mode", () => {
    const calls: (string | undefined)[] = [];
    skipOrThrowRequired(
      { skip: (note) => void calls.push(note) },
      false,
      "claude",
      "CLI not installed",
    );
    expect(calls).toEqual(["CLI not installed"]);
  });

  it("throws with the provider and reason in strict mode", () => {
    expect(() =>
      skipOrThrowRequired({ skip: () => undefined }, true, "claude", `authState=logged_out`),
    ).toThrowError(
      `[${LIVE_PROVIDERS_REQUIRED_ENV}] required provider "claude" could not run: authState=logged_out`,
    );
  });
});
