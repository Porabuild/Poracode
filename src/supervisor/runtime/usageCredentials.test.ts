import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseClaudeCredentials } from "./claudeCredentials";
import { claudeKeychainAccount, claudeKeychainServiceNames } from "./macClaudeKeychain";
import { parseCodexAuth, resolveCodexToken } from "./codexCredentials";
import { copilotCredentialTargetFromConfig, resolveCopilotToken } from "./copilotCredentials";
import {
  CURSOR_CLI_KEYCHAIN_ACCOUNT,
  CURSOR_CLI_KEYCHAIN_SERVICE,
  cursorUserIdFromJwt,
  parseCursorCliEmail,
} from "./cursorCredentials";
import { parseGeminiCreds, resolveGeminiToken } from "./geminiCredentials";
import { parseGrokAuth, resolveGrokToken } from "./grokCredentials";

const tempPaths: string[] = [];

function tempProfileDir(name: string): string {
  const path = join(tmpdir(), `poracode-${name}-${process.pid}-${tempPaths.length}`);
  tempPaths.push(path);
  mkdirSync(path, { recursive: true });
  return path;
}

afterEach(() => {
  for (const path of tempPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

/** Build a JWT-shaped token whose payload carries the given claims. */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

describe("cursorUserIdFromJwt", () => {
  it("strips the identity-provider prefix from the sub claim", () => {
    expect(cursorUserIdFromJwt(fakeJwt({ sub: "auth0|user_01ABC" }))).toBe("user_01ABC");
  });

  it("returns the sub verbatim when it has no provider prefix", () => {
    expect(cursorUserIdFromJwt(fakeJwt({ sub: "user_01XYZ" }))).toBe("user_01XYZ");
  });

  it("returns undefined for a missing/malformed token or absent sub", () => {
    expect(cursorUserIdFromJwt(undefined)).toBeUndefined();
    expect(cursorUserIdFromJwt("not-a-jwt")).toBeUndefined();
    expect(cursorUserIdFromJwt(fakeJwt({ other: "x" }))).toBeUndefined();
  });
});

describe("Cursor CLI keychain fallback", () => {
  it("targets the cursor-agent keychain namespace (service + shared account)", () => {
    // The CLI builds services as `cursor-<secret>` under one `cursor-user` account.
    expect(CURSOR_CLI_KEYCHAIN_SERVICE).toBe("cursor-access-token");
    expect(CURSOR_CLI_KEYCHAIN_ACCOUNT).toBe("cursor-user");
  });

  it("extracts the signed-in email from cli-config.json authInfo", () => {
    expect(
      parseCursorCliEmail(
        JSON.stringify({ authInfo: { email: " user@example.com ", userId: 1 }, model: {} }),
      ),
    ).toBe("user@example.com");
  });

  it("returns undefined when authInfo/email is absent or JSON is invalid", () => {
    expect(parseCursorCliEmail(JSON.stringify({ authInfo: {} }))).toBeUndefined();
    expect(parseCursorCliEmail(JSON.stringify({ authInfo: { email: "" } }))).toBeUndefined();
    expect(parseCursorCliEmail("not json")).toBeUndefined();
  });
});

describe("parseClaudeCredentials", () => {
  it("extracts the OAuth bundle from a credentials file", () => {
    const token = parseClaudeCredentials(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "acc",
          refreshToken: "ref",
          expiresAt: 123,
          subscriptionType: "claude_pro",
          rateLimitTier: "default_2x",
        },
      }),
    );
    expect(token?.accessToken).toBe("acc");
    expect(token?.refreshToken).toBe("ref");
    expect(token?.subscriptionType).toBe("claude_pro");
    expect(token?.raw?.rateLimitTier).toBe("default_2x");
  });

  it("accepts a bare oauth object (no wrapper), as the Windows vault may store it", () => {
    const token = parseClaudeCredentials(
      JSON.stringify({ accessToken: "acc2", subscriptionType: "max" }),
    );
    expect(token?.accessToken).toBe("acc2");
    expect(token?.subscriptionType).toBe("max");
  });

  it("returns undefined without an access token or for invalid JSON", () => {
    expect(parseClaudeCredentials("{}")).toBeUndefined();
    expect(parseClaudeCredentials(JSON.stringify({ claudeAiOauth: {} }))).toBeUndefined();
    expect(parseClaudeCredentials("not json")).toBeUndefined();
  });
});

describe("macOS Claude keychain helpers", () => {
  it("matches Claude Code's default OAuth credential service", () => {
    expect(
      claudeKeychainServiceNames({
        CLAUDE_CONFIG_DIR: undefined,
        CLAUDE_SECURESTORAGE_CONFIG_DIR: undefined,
        CLAUDE_CODE_CUSTOM_OAUTH_URL: undefined,
      }),
    ).toEqual(["Claude Code-credentials", "Claude Code-local-oauth-credentials"]);
  });

  it("hashes non-default config dirs into the service name", () => {
    expect(
      claudeKeychainServiceNames({
        CLAUDE_CONFIG_DIR: "/tmp/poracode-claude",
        CLAUDE_SECURESTORAGE_CONFIG_DIR: undefined,
        CLAUDE_CODE_CUSTOM_OAUTH_URL: "https://claude.example.test",
      }),
    ).toEqual([
      "Claude Code-credentials-a76f884d",
      "Claude Code-custom-oauth-credentials-a76f884d",
      "Claude Code-local-oauth-credentials-a76f884d",
    ]);
  });

  it("falls back to Claude's safe account name when the username is not keychain-safe", () => {
    expect(claudeKeychainAccount({ USER: "bad user" }, "fallback")).toBe("claude-code-user");
    expect(claudeKeychainAccount({ USER: "" }, "fallback_user")).toBe("fallback_user");
  });
});

describe("parseCodexAuth", () => {
  it("extracts access token and account id from auth.json", () => {
    const token = parseCodexAuth(
      JSON.stringify({
        OPENAI_API_KEY: null,
        tokens: { access_token: "at", refresh_token: "rt", account_id: "acc-1" },
      }),
    );
    expect(token?.accessToken).toBe("at");
    expect(token?.refreshToken).toBe("rt");
    expect(token?.accountId).toBe("acc-1");
  });

  it("returns undefined when tokens are absent or JSON is invalid", () => {
    expect(parseCodexAuth(JSON.stringify({ OPENAI_API_KEY: "sk-..." }))).toBeUndefined();
    expect(parseCodexAuth("nope")).toBeUndefined();
  });

  it("reads credentials from an explicit profile home", async () => {
    const home = tempProfileDir("codex-profile");
    writeFileSync(
      join(home, "auth.json"),
      JSON.stringify({ tokens: { access_token: "profile-access", account_id: "profile-id" } }),
      "utf8",
    );

    await expect(resolveCodexToken({ CODEX_HOME: home })).resolves.toMatchObject({
      accessToken: "profile-access",
      accountId: "profile-id",
    });
  });
});

describe("copilotCredentialTargetFromConfig", () => {
  it("builds the Copilot CLI credential target from config", () => {
    expect(
      copilotCredentialTargetFromConfig(
        JSON.stringify({
          lastLoggedInUser: { host: "https://github.com", login: "octo-dev" },
        }),
      ),
    ).toBe("copilot-cli/https://github.com:octo-dev");
  });

  it("uses explicitly scoped profile environment tokens", async () => {
    await expect(
      resolveCopilotToken({
        COPILOT_HOME: tempProfileDir("copilot-profile"),
        COPILOT_GITHUB_TOKEN: "profile-token",
      }),
    ).resolves.toEqual({ accessToken: "profile-token" });
  });
});

describe("profile-scoped Gemini credentials", () => {
  it("reads .gemini/oauth_creds.json beneath GEMINI_CLI_HOME", async () => {
    const home = tempProfileDir("gemini-profile");
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(
      join(home, ".gemini", "oauth_creds.json"),
      JSON.stringify({ access_token: "profile-access", refresh_token: "profile-refresh" }),
      "utf8",
    );

    expect(parseGeminiCreds("not json")).toBeUndefined();
    await expect(resolveGeminiToken({ GEMINI_CLI_HOME: home })).resolves.toMatchObject({
      accessToken: "profile-access",
      refreshToken: "profile-refresh",
    });
  });
});

describe("profile-scoped Grok credentials", () => {
  it("reads auth.json beneath GROK_HOME", async () => {
    const home = tempProfileDir("grok-profile");
    writeFileSync(
      join(home, "auth.json"),
      JSON.stringify({ access_token: "profile-access" }),
      "utf8",
    );

    expect(parseGrokAuth("not json")).toBeUndefined();
    await expect(resolveGrokToken({ GROK_HOME: home })).resolves.toEqual({
      accessToken: "profile-access",
    });
  });
});
