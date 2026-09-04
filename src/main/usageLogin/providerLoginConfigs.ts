import {
  ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL,
  allUsageProviderDescriptors,
} from "@poracode/agents-usage";
import { isOpenCodeLoginCookieLive } from "./openCodeLoginProbe";
import { isQoderLoginCookieLive } from "./qoderLoginProbe";

/**
 * The per-provider browser-login configuration table, split out of
 * `UsageLoginManager` so that class stays focused on running a login and so the
 * cookie mirror (`UsageLoginCookieMirror.ts`) can reuse the same cookie targets
 * instead of duplicating URLs and cookie-name patterns.
 */

export interface CookieLoginConfig {
  kind: "cookie";
  /** Page the user signs in on. */
  loginUrl: string;
  /** URL whose applicable cookies are captured and sent as the API Cookie header. */
  cookieUrl: string;
  /** A captured cookie matching this signals a *candidate* login. */
  authCookiePattern: RegExp;
  /**
   * Optional second gate run on the captured `Cookie` header before prompting.
   * A matching cookie name is necessary but not sufficient — stale or
   * mid-`/authorize` cookies can share the name — so providers that can cheaply
   * verify a live session return false here to keep polling instead of falsely
   * reporting "Found a signed-in session".
   */
  validateSession?: (cookieHeader: string) => Promise<boolean>;
  /** Replace the cookie-name candidate gate with a predicate on the login tab's URL. */
  validateTabUrl?: (url: string) => boolean;
  /** Map selected login URL search parameters to their stored secret keys. */
  captureUrlParams?: readonly { param: string; secretKey: string }[];
}

export interface GitHubDeviceLoginConfig {
  kind: "github-device";
  host: string;
  clientId: string;
  scope: string;
}

export interface LocalStorageLoginConfig {
  kind: "local-storage";
  /** Page the user signs in on (whose localStorage holds the session tokens). */
  loginUrl: string;
  /** A non-empty value for this localStorage key signals a completed login. */
  requiredKey: string;
  /** localStorage key → stored secret key. All present keys are sealed on success. */
  store: Record<string, string>;
}

/**
 * The provider authenticates its usage API with a long-lived key the user pastes
 * in (for example, z.ai or Kimi). There is no browser/OAuth step — the key is
 * sealed via `UsageLoginManager.submitApiKey` and read back by the collector —
 * but the provider still lives in {@link PROVIDER_CONFIGS} so its stored-secret
 * state surfaces like any login.
 */
export interface ApiKeyLoginConfig {
  kind: "api-key";
}

export type ProviderLoginConfig =
  | CookieLoginConfig
  | GitHubDeviceLoginConfig
  | LocalStorageLoginConfig
  | ApiKeyLoginConfig;

export const USAGE_PROVIDER_BY_ID = new Map(
  allUsageProviderDescriptors().map((descriptor) => [descriptor.id, descriptor]),
);

export function usageProviderLabel(providerId: string): string {
  return USAGE_PROVIDER_BY_ID.get(providerId)?.label ?? providerId;
}

function isAlibabaConsoleSessionCandidate(cookieHeader: string): boolean {
  const names = new Set(
    cookieHeader
      .split(";")
      .map((part) => part.slice(0, Math.max(0, part.indexOf("="))).trim())
      .filter(Boolean),
  );
  return (
    names.has("login_aliyunid_ticket") &&
    (names.has("login_aliyunid_pk") || names.has("login_current_pk") || names.has("login_aliyunid"))
  );
}

export const PROVIDER_CONFIGS: Record<string, ProviderLoginConfig> = {
  copilot: {
    kind: "github-device",
    host: "github.com",
    clientId: "Iv1.b507a08c87ecfe98",
    scope: "read:user",
  },
  factory: {
    kind: "local-storage",
    loginUrl: "https://app.factory.ai/",
    // app.factory.ai sets NO session cookie — it stores WorkOS AuthKit tokens in
    // localStorage. Capture the rotating refresh token (the durable credential)
    // plus the current access token; the collector exchanges/refreshes as needed.
    // The refresh-token key only appears after a completed login, so its presence
    // alone is a safe prompt gate (no private-endpoint probe — the Grok lesson).
    requiredKey: "workos:refresh-token",
    store: {
      "workos:refresh-token": "refresh-token",
      "workos:access-token": "access-token",
    },
  },
  grok: {
    kind: "cookie",
    loginUrl: "https://grok.com/",
    cookieUrl: "https://grok.com/",
    // grok.com sets `sso` / `sso-rw` cookies after auth. Do not gate the
    // confirmation dialog on Grok's private usage endpoint: when that endpoint
    // drifts, a visibly signed-in browser session otherwise never prompts.
    authCookiePattern: /^sso(?:-rw)?$/i,
  },
  opencode: {
    kind: "cookie",
    loginUrl: "https://opencode.ai/auth",
    cookieUrl: "https://opencode.ai/",
    authCookiePattern: /^(?:auth|__Host-auth)$/i,
    // The OpenAuth `/authorize` page can set an `auth`-named cookie before the
    // user signs in, and stale values linger in the jar — so confirm the cookie
    // actually authenticates before prompting.
    validateSession: isOpenCodeLoginCookieLive,
  },
  qwen: {
    kind: "cookie",
    loginUrl: ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL,
    cookieUrl: "https://modelstudio.console.alibabacloud.com/",
    authCookiePattern: /^login_(?:aliyunid_ticket|aliyunid_pk|current_pk|aliyunid)$/i,
    validateSession: async (cookieHeader) => isAlibabaConsoleSessionCandidate(cookieHeader),
  },
  qoder: {
    kind: "cookie",
    loginUrl: "https://qoder.com/",
    cookieUrl: "https://qoder.com/",
    // qoder.com sets non-auth cookies on every page load (qoder_locale, anti-bot
    // tokens) whose names match these fragments, and the real session cookie's
    // name is not pinned — so a name match alone must not report a signed-in
    // session; confirm the header actually authenticates first (opencode's lesson).
    authCookiePattern: /(?:qoder|session|token|auth)/i,
    validateSession: isQoderLoginCookieLive,
  },
};

for (const descriptor of USAGE_PROVIDER_BY_ID.values()) {
  if (descriptor.needsLogin && descriptor.mechanism === "api-key") {
    PROVIDER_CONFIGS[descriptor.id] = { kind: "api-key" };
  }
}

for (const providerId of Object.keys(PROVIDER_CONFIGS)) {
  if (!USAGE_PROVIDER_BY_ID.has(providerId)) {
    throw new Error(`Usage login config has no provider descriptor: ${providerId}`);
  }
}

/** Every cookie-login provider, for consumers that mirror the live cookie jar. */
export function cookieLoginTargets(): { providerId: string; config: CookieLoginConfig }[] {
  return Object.entries(PROVIDER_CONFIGS).flatMap(([providerId, config]) =>
    config.kind === "cookie" ? [{ providerId, config }] : [],
  );
}
