import type { CredentialStore } from "@lightcode/agents-usage";
import { getUsageSecret } from "@/shared/usageSecretStore";
import { resolveClaudeToken } from "./claudeCredentials";
import { resolveCodexToken } from "./codexCredentials";
import { resolveCopilotToken } from "./copilotCredentials";
import { resolveCursorToken } from "./cursorCredentials";
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
        case "zai":
          return resolveZaiToken();
        default:
          return undefined;
      }
    },
    // Captured session secrets (e.g. a browser-login cookie) live in the
    // safeStorage-sealed store written by main; decrypt and return on demand.
    // Never logged.
    getSecret: async (providerId, key) =>
      cacheDir ? getUsageSecret(cacheDir, providerId, key) : undefined,
  };
}
