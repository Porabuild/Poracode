import { clipboard } from "electron";
import type { BrowserPanelManager } from "../browser";
import type { LightcodePaths } from "@/shared/lightcodePaths";
import type { UsageLoginStateResponse } from "@/shared/contracts";
import { clearUsageSecret, hasUsageSecret, setUsageSecret } from "@/shared/usageSecretStore";
import { isCommandCodeLoginCookieLive } from "./commandCodeLoginProbe";
import { isGrokLoginCookieLive } from "./grokLoginProbe";
import { isOpenCodeLoginCookieLive } from "./openCodeLoginProbe";

/**
 * Consent-gated, user-initiated browser login that captures a provider's web
 * session cookie or OAuth token for usage collection. It reuses the in-app
 * browser panel (so login opens as a normal tab, not a separate OS window), then
 * seals the captured secret with the shared safeStorage key (see
 * `src/shared/usageSecretStore.ts`). Secret values are never logged.
 */

export interface UsageLoginResult {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

interface CookieLoginConfig {
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
}

interface GitHubDeviceLoginConfig {
  kind: "github-device";
  host: string;
  clientId: string;
  scope: string;
}

type ProviderLoginConfig = CookieLoginConfig | GitHubDeviceLoginConfig;

const PROVIDER_LABELS: Record<string, string> = {
  commandcode: "Command Code",
  copilot: "GitHub Copilot",
  grok: "Grok",
  opencode: "OpenCode",
};

const PROVIDER_CONFIGS: Record<string, ProviderLoginConfig> = {
  commandcode: {
    kind: "cookie",
    loginUrl: "https://commandcode.ai/signin",
    cookieUrl: "https://commandcode.ai/",
    // commandcode.ai is a better-auth app; cookies that share a name with
    // session/auth/token signal a candidate login.
    authCookiePattern: /session|auth|token/i,
    // Confirm the cookie actually authenticates before prompting — better-auth
    // can set a placeholder cookie before sign-in completes.
    validateSession: isCommandCodeLoginCookieLive,
  },
  copilot: {
    kind: "github-device",
    host: "github.com",
    clientId: "Iv1.b507a08c87ecfe98",
    scope: "read:user",
  },
  grok: {
    kind: "cookie",
    loginUrl: "https://grok.com/",
    cookieUrl: "https://grok.com/",
    // grok.com sets SSO/session cookies on successful auth.
    authCookiePattern: /sso|session|auth/i,
    validateSession: isGrokLoginCookieLive,
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
};

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

interface GitHubDeviceCodeResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
}

interface GitHubAccessTokenResponse {
  access_token?: string;
  error?: string;
}

export function isCookieLoginProvider(providerId: string): boolean {
  return providerId in PROVIDER_CONFIGS;
}

export class UsageLoginManager {
  private readonly inFlight = new Map<string, Promise<UsageLoginResult>>();
  private readonly deviceLoginCancel = new Map<string, () => void>();

  constructor(
    private readonly paths: LightcodePaths,
    private readonly getBrowserPanel: () => BrowserPanelManager | null,
  ) {}

  /**
   * Which login-capable providers currently have a captured secret on disk.
   * This is the persistent "signed in" signal the UI uses for the sign-in/out
   * affordance, so a failed or empty usage fetch never reads as a sign-out.
   */
  getLoginState(): UsageLoginStateResponse {
    const stored: Record<string, boolean> = {};
    for (const providerId of Object.keys(PROVIDER_CONFIGS)) {
      stored[providerId] = hasUsageSecret(this.paths.cacheDir, providerId);
    }
    return { stored };
  }

  /** Cancel an in-flight login (e.g. the user closed the browser overlay). */
  cancelLogin(providerId: string): void {
    this.getBrowserPanel()?.cancelLoginCapture();
    this.deviceLoginCancel.get(providerId)?.();
  }

  async clearLogin(providerId: string): Promise<UsageLoginResult> {
    this.cancelLogin(providerId);
    clearUsageSecret(this.paths.cacheDir, providerId);
    const config = PROVIDER_CONFIGS[providerId];
    if (config?.kind === "cookie") {
      await this.getBrowserPanel()
        ?.clearLoginCookies({
          cookieUrl: config.cookieUrl,
          authCookiePattern: config.authCookiePattern,
        })
        .catch(() => {});
    }
    return { ok: true };
  }

  startLogin(providerId: string): Promise<UsageLoginResult> {
    const existing = this.inFlight.get(providerId);
    if (existing) return existing;
    const config = PROVIDER_CONFIGS[providerId];
    if (!config) {
      return Promise.resolve({ ok: false, error: `No usage login for ${providerId}` });
    }
    const panel = this.getBrowserPanel();
    if (!panel) {
      return Promise.resolve({ ok: false, error: "Browser panel is not available" });
    }
    const run = this.runLogin(providerId, config, panel).finally(() => {
      this.inFlight.delete(providerId);
    });
    this.inFlight.set(providerId, run);
    return run;
  }

  private async runLogin(
    providerId: string,
    config: ProviderLoginConfig,
    panel: BrowserPanelManager,
  ): Promise<UsageLoginResult> {
    if (config.kind === "github-device") {
      return this.runGitHubDeviceLogin(providerId, config, panel);
    }

    const result = await panel.captureLoginCookies({
      loginUrl: config.loginUrl,
      cookieUrl: config.cookieUrl,
      authCookiePattern: config.authCookiePattern,
      timeoutMs: LOGIN_TIMEOUT_MS,
      providerLabel: PROVIDER_LABELS[providerId] ?? providerId,
      ...(config.validateSession ? { validateSession: config.validateSession } : {}),
    });
    if (!result.ok || !result.cookie) {
      return {
        ok: false,
        ...(result.cancelled ? { cancelled: true } : {}),
        ...(result.error ? { error: result.error } : {}),
      };
    }
    setUsageSecret(this.paths.cacheDir, providerId, "cookie", result.cookie);
    return { ok: true };
  }

  private async runGitHubDeviceLogin(
    providerId: string,
    config: GitHubDeviceLoginConfig,
    panel: BrowserPanelManager,
  ): Promise<UsageLoginResult> {
    const device = await requestGitHubDeviceCode(config);
    if (!device.device_code || !device.user_code || !device.verification_uri) {
      return { ok: false, error: "GitHub did not return a device code" };
    }

    const url = device.verification_uri_complete ?? device.verification_uri;
    let tabId: string | undefined;
    try {
      tabId = (await panel.createTab({ url, activate: true })).tabId;
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? "Failed to open login tab" };
    }

    const providerLabel = PROVIDER_LABELS[providerId] ?? providerId;
    clipboard.writeText(device.user_code);
    panel.showUsageLoginDeviceCode({
      providerId,
      providerLabel,
      code: device.user_code,
    });

    return await new Promise((resolve) => {
      let settled = false;
      let pollTimer: NodeJS.Timeout | undefined;
      const tokenUrl = `https://${config.host}/login/oauth/access_token`;
      const expiresAt = Date.now() + (device.expires_in ?? 900) * 1000;
      let intervalMs = Math.max(1, device.interval ?? 5) * 1000;

      const finish = (result: UsageLoginResult): void => {
        if (settled) return;
        settled = true;
        this.deviceLoginCancel.delete(providerId);
        if (pollTimer) clearTimeout(pollTimer);
        if (tabId) void panel.closeTab(tabId).catch(() => {});
        panel.clearUsageLoginDeviceCode(providerId);
        resolve(result);
      };
      this.deviceLoginCancel.set(providerId, () => finish({ ok: false, cancelled: true }));

      const schedulePoll = (): void => {
        const delay = Math.min(intervalMs, Math.max(0, expiresAt - Date.now()));
        pollTimer = setTimeout(() => void poll(), delay);
      };

      const poll = async (): Promise<void> => {
        if (settled) return;
        if (Date.now() >= expiresAt) {
          finish({ ok: false, error: "Login timed out" });
          return;
        }
        try {
          const response = await requestGitHubAccessToken(
            tokenUrl,
            config.clientId,
            device.device_code!,
          );
          if (response.access_token) {
            setUsageSecret(this.paths.cacheDir, providerId, "token", response.access_token);
            finish({ ok: true });
            return;
          }
          if (response.error === "authorization_pending") {
            schedulePoll();
            return;
          }
          if (response.error === "slow_down") {
            intervalMs += 5_000;
            schedulePoll();
            return;
          }
          finish({ ok: false, error: "GitHub login failed" });
        } catch {
          finish({ ok: false, error: "GitHub login failed" });
        }
      };

      schedulePoll();
    });
  }
}

async function requestGitHubDeviceCode(
  config: GitHubDeviceLoginConfig,
): Promise<GitHubDeviceCodeResponse> {
  const response = await fetch(`https://${config.host}/login/device/code`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      scope: config.scope,
    }).toString(),
  });
  if (!response.ok) return {};
  return (await response.json()) as GitHubDeviceCodeResponse;
}

async function requestGitHubAccessToken(
  url: string,
  clientId: string,
  deviceCode: string,
): Promise<GitHubAccessTokenResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }).toString(),
  });
  return (await response.json()) as GitHubAccessTokenResponse;
}
