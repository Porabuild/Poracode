import { describe, expect, it } from "vitest";
import { parseKimiCliCredential, parseKimiEnv } from "./kimiCredentials";

const NOW = 1_700_000_000_000;

describe("parseKimiEnv", () => {
  it("returns undefined when no API key is set", () => {
    expect(parseKimiEnv({})).toBeUndefined();
    expect(parseKimiEnv({ KIMI_CODE_BASE_URL: "https://proxy.test" })).toBeUndefined();
  });

  it("reads the API key and strips wrapping quotes/whitespace", () => {
    expect(parseKimiEnv({ KIMI_CODE_API_KEY: '  "kimi-key"  ' })).toEqual({
      accessToken: "kimi-key",
    });
  });

  it("carries the base-URL override on raw without polluting it when absent", () => {
    expect(parseKimiEnv({ KIMI_CODE_API_KEY: "k" })).toEqual({ accessToken: "k" });
    expect(
      parseKimiEnv({ KIMI_CODE_API_KEY: "k", KIMI_CODE_BASE_URL: "https://proxy.test" }),
    ).toEqual({ accessToken: "k", raw: { baseUrl: "https://proxy.test" } });
  });
});

describe("parseKimiCliCredential", () => {
  const freshExpiry = Math.floor(NOW / 1000) + 3600;

  it("returns a fresh access token with its expiry in epoch ms", () => {
    const content = JSON.stringify({
      access_token: "cli-token",
      refresh_token: "never-used",
      expires_at: freshExpiry,
    });
    expect(parseKimiCliCredential(content, NOW)).toEqual({
      accessToken: "cli-token",
      expiresAt: freshExpiry * 1000,
    });
  });

  it("accepts camelCase keys and millisecond expiries", () => {
    const content = JSON.stringify({ accessToken: "t", expiresAt: NOW + 3_600_000 });
    expect(parseKimiCliCredential(content, NOW)).toEqual({
      accessToken: "t",
      expiresAt: NOW + 3_600_000,
    });
  });

  it("rejects expired, near-expiry, and expiry-less tokens (read-only, no refresh)", () => {
    const expired = JSON.stringify({
      access_token: "t",
      expires_at: Math.floor(NOW / 1000) - 10,
    });
    expect(parseKimiCliCredential(expired, NOW)).toBeUndefined();

    const nearExpiry = JSON.stringify({
      access_token: "t",
      expires_at: Math.floor((NOW + 30_000) / 1000),
    });
    expect(parseKimiCliCredential(nearExpiry, NOW)).toBeUndefined();

    const noExpiry = JSON.stringify({ access_token: "t" });
    expect(parseKimiCliCredential(noExpiry, NOW)).toBeUndefined();
  });

  it("rejects malformed content", () => {
    expect(parseKimiCliCredential("not json", NOW)).toBeUndefined();
    expect(parseKimiCliCredential("[]", NOW)).toBeUndefined();
    expect(parseKimiCliCredential(JSON.stringify({ expires_at: 1 }), NOW)).toBeUndefined();
  });
});
