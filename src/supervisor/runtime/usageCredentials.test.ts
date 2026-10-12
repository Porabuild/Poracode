import { describe, expect, it } from "vitest";
import { parseClaudeCredentials } from "./claudeCredentials";
import { parseCodexAuth } from "./codexCredentials";
import { parseCommandCodeAuth, parseCommandCodeEnv } from "./commandCodeCredentials";
import { copilotCredentialTargetFromConfig } from "./copilotCredentials";

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

describe("Command Code credentials", () => {
  it("reads COMMAND_CODE_API_KEY and strips wrapping quotes", () => {
    expect(parseCommandCodeEnv({ COMMAND_CODE_API_KEY: '  "cc-env-key"  ' })).toEqual({
      accessToken: "cc-env-key",
    });
    expect(parseCommandCodeEnv({})).toBeUndefined();
  });

  it("extracts the API key and user name from auth.json", () => {
    expect(
      parseCommandCodeAuth(JSON.stringify({ apiKey: "cc-file-key", userName: "command-user" })),
    ).toEqual({
      accessToken: "cc-file-key",
      raw: { userName: "command-user" },
    });
  });

  it("rejects missing, blank, and malformed auth.json keys", () => {
    expect(parseCommandCodeAuth("{}")).toBeUndefined();
    expect(parseCommandCodeAuth(JSON.stringify({ apiKey: " " }))).toBeUndefined();
    expect(parseCommandCodeAuth("not json")).toBeUndefined();
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
