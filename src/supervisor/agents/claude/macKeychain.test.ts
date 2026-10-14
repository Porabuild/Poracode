import { describe, expect, it } from "vitest";
import { claudeKeychainAccount, claudeKeychainServiceNames } from "./macKeychain";

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
