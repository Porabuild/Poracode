import { describe, expect, it } from "vitest";
import { parseClaudeCredentials } from "./claudeCredentials";
import { parseCodexAuth } from "./codexCredentials";
import { copilotCredentialTargetFromConfig } from "./copilotCredentials";
import { cursorUserIdFromJwt } from "./cursorCredentials";

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
});
