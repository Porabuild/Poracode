import type { CredentialStore } from "@poracode/agents-usage";
import { getUsageSecret, setUsageSecret } from "@/shared/usageSecretStore";
import { refreshRejectedClaudeToken, resolveClaudeToken } from "./claudeCredentials";
import { resolveCodexToken } from "./codexCredentials";
import { resolveCopilotToken } from "./copilotCredentials";
import { resolveCursorToken } from "./cursorCredentials";
import { resolveFactoryCliToken } from "./factoryCredentials";
import { resolveGeminiToken } from "./geminiCredentials";
import { refreshRejectedGrokToken, resolveFreshGrokToken } from "./grokTokenRefresh";
import { resolveKimiToken } from "./kimiCredentials";
import { resolveQwenUsageToken } from "./qwenCredentials";
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

type OAuthToken = NonNullable<Awaited<ReturnType<typeof resolveClaudeToken>>>;

/**
 * Per-provider OAuth token resolvers. This stays an in-file registration table
 * because usage credentials are independent from chat adapter authentication —
 * adding a usage-tracked provider is a one-line entry rather than a switch case.
 */
function tokenResolvers(
  settingsPath?: string,
): Record<string, () => Promise<OAuthToken | undefined>> {
  return {
    claude: resolveClaudeToken,
    codex: resolveCodexToken,
    copilot: resolveCopilotToken,
    cursor: resolveCursorToken,
    grok: resolveFreshGrokToken,
    gemini: resolveGeminiToken,
    // resolveFactoryCliToken is sync (returns the token directly, not a Promise);
    // wrap it so every entry shares the () => Promise<OAuthToken | undefined> shape.
    factory: async () => resolveFactoryCliToken(),
    zai: resolveZaiToken,
    kimi: resolveKimiToken,
    qwen: () => resolveQwenUsageToken(settingsPath),
  };
}

/** Per-provider refreshers, called after the provider rejected a token. */
const tokenRefreshers: Record<string, (token: OAuthToken) => Promise<OAuthToken | undefined>> = {
  claude: refreshRejectedClaudeToken,
  grok: refreshRejectedGrokToken,
};

/** Build the native credential store consumed by the usage HostPort. */
export function createNativeCredentialStore(
  cacheDir?: string,
  settingsPath?: string,
): CredentialStore {
  const resolvers = tokenResolvers(settingsPath);
  return {
    getOAuthToken: async (providerId) => resolvers[providerId]?.(),
    refreshOAuthToken: async (providerId, token) => tokenRefreshers[providerId]?.(token),
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
