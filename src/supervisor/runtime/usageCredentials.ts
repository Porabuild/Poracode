import type { CredentialStore } from "@lightcode/agents-usage";
import { getUsageSecret, setUsageSecret } from "@/shared/usageSecretStore";
import { refreshRejectedClaudeToken, resolveClaudeToken } from "./claudeCredentials";
import { resolveCodexToken } from "./codexCredentials";
import { resolveCopilotToken } from "./copilotCredentials";
import { resolveCursorToken } from "./cursorCredentials";
import { resolveFactoryCliToken } from "./factoryCredentials";
import { resolveGeminiToken } from "./geminiCredentials";
import { resolveGrokToken } from "./grokCredentials";
import { resolveZaiToken } from "./zaiCredentials";

/**
 * Assembles the native (host) credential store consumed by the usage HostPort
 * from the per-provider resolvers (each in its own `*Credentials.ts` module, so
 * provider logic stays in its adapter). Captured session secrets come from the
 * safeStorage-sealed store. Secrets are never logged.
 *
 * Scope (v1): native host only, with a WSL-side fallback per provider. Secrets
 * are never logged.
 */

/** Build the native credential store consumed by the usage HostPort. */
export function createNativeCredentialStore(cacheDir?: string): CredentialStore {
  return {
    getOAuthToken: async (providerId) => {
      switch (providerId) {
        case "claude":
          return resolveClaudeToken();
        case "codex":
          return resolveCodexToken();
        case "copilot":
          return resolveCopilotToken();
        case "cursor":
          return resolveCursorToken();
        case "grok":
          return resolveGrokToken();
        case "gemini":
          return resolveGeminiToken();
        // Factory/Droid: the local `droid` CLI's token (read-only). Used as the
        // primary source before the captured browser-login secret.
        case "factory":
          return resolveFactoryCliToken();
        case "zai":
          return resolveZaiToken();
        default:
          return undefined;
      }
    },
    refreshOAuthToken: async (providerId, token) => {
      switch (providerId) {
        case "claude":
          return refreshRejectedClaudeToken(token);
        default:
          return undefined;
      }
    },
    // Captured session secrets (e.g. a browser-login cookie) live in the
    // safeStorage-sealed store written by main; decrypt and return on demand.
    // Never logged.
    getSecret: async (providerId, key) =>
      cacheDir ? getUsageSecret(cacheDir, providerId, key) : undefined,
    // Persist a rotated secret (e.g. Factory's WorkOS refresh token, which
    // WorkOS rotates on every exchange). Sealed with the same safeStorage key.
    setSecret: async (providerId, key, value) => {
      if (cacheDir) setUsageSecret(cacheDir, providerId, key, value);
    },
  };
}
