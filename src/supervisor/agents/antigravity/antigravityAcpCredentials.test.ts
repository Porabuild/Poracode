import { describe, expect, it, vi } from "vitest";
import {
  ANTIGRAVITY_GOOGLE_TOKEN_URI,
  parseAntigravityAcpCredentials,
  resolveAntigravityAcpCredentials,
} from "./antigravityAcpCredentials";

const VALID = JSON.stringify({
  client_id: "client-id",
  client_secret: "client-secret",
  refresh_token: "refresh-token",
  token_uri: ANTIGRAVITY_GOOGLE_TOKEN_URI,
  project_id: "project-id",
});

describe("parseAntigravityAcpCredentials", () => {
  it("parses the official ACP token artifact", () => {
    expect(parseAntigravityAcpCredentials(VALID)).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
  });

  it("rejects malformed credentials and non-Google token destinations", () => {
    expect(parseAntigravityAcpCredentials("not json")).toBeUndefined();
    expect(
      parseAntigravityAcpCredentials(
        JSON.stringify({
          client_id: "client-id",
          client_secret: "client-secret",
          refresh_token: "refresh-token",
          token_uri: "https://example.com/token",
        }),
      ),
    ).toBeUndefined();
  });
});

describe("resolveAntigravityAcpCredentials", () => {
  it("prefers the OS keychain item without touching the file or WSL", async () => {
    const readNative = vi.fn<() => Promise<string | undefined>>();
    const readWsl = vi.fn<() => Promise<string | undefined>>();
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => VALID,
      readNative,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(readNative).not.toHaveBeenCalled();
    expect(readWsl).not.toHaveBeenCalled();
  });

  it("falls back to the native file when the keychain has no usable item", async () => {
    const readWsl = vi.fn<() => Promise<string | undefined>>();
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => "not json",
      readNative: async () => VALID,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(readWsl).not.toHaveBeenCalled();
  });

  it("falls back to the gated WSL credential sweep", async () => {
    const readWsl = vi.fn<() => Promise<string | undefined>>().mockResolvedValue(VALID);
    const credentials = await resolveAntigravityAcpCredentials({
      readKeychain: async () => undefined,
      readNative: async () => undefined,
      readWsl,
    });
    expect(credentials?.refreshToken).toBe("refresh-token");
    expect(readWsl).toHaveBeenCalledOnce();
  });
});
