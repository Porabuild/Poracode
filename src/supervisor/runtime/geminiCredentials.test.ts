import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractGeminiOAuthClientFromSource,
  parseGeminiFileKeychain,
  parseGeminiKeychainCredential,
  refreshRejectedGeminiToken,
  resetGeminiOAuthClientCacheForTests,
  resolveGeminiCredentialsDir,
  resolveGeminiToken,
} from "./geminiCredentials";

function encryptFileKeychain(
  payload: unknown,
  identity: { hostname: string; username: string },
): string {
  const salt = `${identity.hostname}-${identity.username}-gemini-cli`;
  const key = scryptSync("gemini-cli-oauth", salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  let encrypted = cipher.update(JSON.stringify(payload), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

describe("geminiCredentials", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "poracode-gemini-creds-"));
    resetGeminiOAuthClientCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("parses HybridTokenStorage and MCPEncryptedFileTokenStorage envelopes", () => {
    expect(
      parseGeminiKeychainCredential(
        JSON.stringify({
          serverName: "main-account",
          token: {
            accessToken: "acc-1",
            refreshToken: "ref-1",
            expiresAt: 1_800_000_000_000,
          },
        }),
      ),
    ).toEqual({
      accessToken: "acc-1",
      refreshToken: "ref-1",
      expiresAt: 1_800_000_000_000,
    });

    expect(
      parseGeminiKeychainCredential(
        JSON.stringify({
          accessToken: "acc-2",
          refreshToken: "ref-2",
        }),
      ),
    ).toEqual({
      accessToken: "acc-2",
      refreshToken: "ref-2",
    });
  });

  it("decrypts v0.68.0 FileKeychain gemini-credentials.json payloads", () => {
    const identity = { hostname: "dev-box", username: "alice" };
    const encrypted = encryptFileKeychain(
      {
        "gemini-cli-oauth": {
          "main-account": JSON.stringify({
            token: {
              accessToken: "decrypted-access",
              refreshToken: "decrypted-refresh",
              expiresAt: 1_900_000_000_000,
            },
          }),
        },
      },
      identity,
    );

    expect(parseGeminiFileKeychain(encrypted, identity)).toEqual({
      accessToken: "decrypted-access",
      refreshToken: "decrypted-refresh",
      expiresAt: 1_900_000_000_000,
    });
    expect(
      parseGeminiFileKeychain(encrypted, { hostname: "other-box", username: "alice" }),
    ).toBeUndefined();
  });

  it("resolves credentials directory with GEMINI_CLI_HOME > GEMINI_HOME > homeDir precedence", () => {
    expect(
      resolveGeminiCredentialsDir({
        homeDir: "/fallback/home",
        env: { GEMINI_CLI_HOME: "/cli/home", GEMINI_HOME: "/legacy/home" },
      }),
    ).toBe(join("/cli/home", ".gemini"));

    expect(
      resolveGeminiCredentialsDir({
        homeDir: "/fallback/home",
        env: { GEMINI_HOME: "/legacy/home" },
      }),
    ).toBe("/legacy/home");

    expect(
      resolveGeminiCredentialsDir({
        homeDir: "/profile/home",
        env: { GEMINI_CLI_HOME: "", GEMINI_HOME: "" },
      }),
    ).toBe(join("/profile/home", ".gemini"));
  });

  it("extracts OAuth client credentials across var/const/let single and double quotes", () => {
    expect(
      extractGeminiOAuthClientFromSource(
        `const OAUTH_CLIENT_ID = 'client-123.apps.googleusercontent.com';\nlet OAUTH_CLIENT_SECRET = 'fake-test-secret-value';`,
      ),
    ).toEqual({
      clientId: "client-123.apps.googleusercontent.com",
      clientSecret: "fake-test-secret-value",
    });

    expect(
      extractGeminiOAuthClientFromSource(
        `var OAUTH_CLIENT_ID = "client-456.apps.googleusercontent.com";\nvar OAUTH_CLIENT_SECRET = "another-test-secret";`,
      ),
    ).toEqual({
      clientId: "client-456.apps.googleusercontent.com",
      clientSecret: "another-test-secret",
    });
  });

  it("falls back to encrypted FileKeychain and attaches active Google account email", async () => {
    const profileHome = join(rootDir, "profile");
    const geminiDir = join(profileHome, ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    const identity = { hostname: "unit-host", username: "tester" };
    writeFileSync(
      join(geminiDir, "gemini-credentials.json"),
      encryptFileKeychain(
        {
          "gemini-cli-oauth": {
            "main-account": JSON.stringify({
              token: {
                accessToken: "keychain-access",
                refreshToken: "keychain-refresh",
                expiresAt: Date.now() + 3_600_000,
              },
            }),
          },
        },
        identity,
      ),
      "utf8",
    );
    writeFileSync(
      join(geminiDir, "google_accounts.json"),
      JSON.stringify({ active: "tester@example.com" }),
      "utf8",
    );

    const token = await resolveGeminiToken({
      homeDir: profileHome,
      skipWsl: true,
      skipKeychain: true,
      fileKeychainIdentity: identity,
    });
    expect(token).toEqual({
      accessToken: "keychain-access",
      refreshToken: "keychain-refresh",
      expiresAt: expect.any(Number),
      raw: { email: "tester@example.com" },
    });
  });

  it("skips HTTP refresh when skipRefresh is true", async () => {
    const profileHome = join(rootDir, "expired-home");
    const geminiDir = join(profileHome, ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, "oauth_creds.json"),
      JSON.stringify({
        access_token: "expired-access",
        refresh_token: "valid-refresh",
        expiry_date: 1000,
      }),
      "utf8",
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const token = await resolveGeminiToken({
      homeDir: profileHome,
      skipWsl: true,
      skipKeychain: true,
      skipRefresh: true,
    });

    expect(token).toEqual({
      accessToken: "expired-access",
      refreshToken: "valid-refresh",
      expiresAt: 1000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a rejected access token without poisoning cache on an earlier missing-PATH call", async () => {
    const fakeBinDir = join(rootDir, "bin");
    const coreOauthDir = join(
      rootDir,
      "node_modules",
      "@google",
      "gemini-cli-core",
      "dist",
      "src",
      "code_assist",
    );
    mkdirSync(fakeBinDir, { recursive: true });
    mkdirSync(coreOauthDir, { recursive: true });
    writeFileSync(join(rootDir, "package.json"), JSON.stringify({ name: "@google/gemini-cli" }));
    writeFileSync(join(fakeBinDir, "gemini"), "#!/bin/sh\n", { mode: 0o755 });
    writeFileSync(
      join(coreOauthDir, "oauth2.js"),
      `const OAUTH_CLIENT_ID = "cli-id";\nconst OAUTH_CLIENT_SECRET = "cli-secret";\n`,
      "utf8",
    );

    const fetchMock = vi.fn<() => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(
      async () => ({
        ok: true,
        json: async () => ({ access_token: "fresh-access-token", expires_in: 3600 }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const missed = await refreshRejectedGeminiToken(
      {
        accessToken: "stale-access-token",
        refreshToken: "valid-refresh-token",
        expiresAt: Date.now() + 3_600_000,
      },
      {
        homeDir: rootDir,
        env: { PATH: "" },
        skipWsl: true,
        skipKeychain: true,
      },
    );
    expect(missed).toBeUndefined();

    const refreshed = await refreshRejectedGeminiToken(
      {
        accessToken: "stale-access-token",
        refreshToken: "valid-refresh-token",
        expiresAt: Date.now() + 3_600_000,
      },
      {
        homeDir: rootDir,
        env: { PATH: fakeBinDir },
        skipWsl: true,
        skipKeychain: true,
      },
    );

    expect(refreshed?.accessToken).toBe("fresh-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns rotated on-disk credentials before making a refresh request", async () => {
    const geminiDir = join(rootDir, ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, "oauth_creds.json"),
      JSON.stringify({
        access_token: "already-rotated-access",
        refresh_token: "valid-refresh-token",
        expiry_date: Date.now() + 3_600_000,
      }),
      "utf8",
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await refreshRejectedGeminiToken(
      {
        accessToken: "stale-access-token",
        refreshToken: "valid-refresh-token",
        expiresAt: 1000,
      },
      {
        homeDir: rootDir,
        skipWsl: true,
        skipKeychain: true,
      },
    );

    expect(resolved?.accessToken).toBe("already-rotated-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
