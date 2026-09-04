import { clipboard } from "electron";
import type { BrowserPanelManager } from "../browser";
import type { PoracodePaths } from "@/shared/poracodePaths";
import type { UsageLoginStateResponse } from "@/shared/contracts";
import { clearUsageSecret, hasUsageSecret, setUsageSecret } from "@/shared/usageSecretStore";
import {
  PROVIDER_CONFIGS,
  USAGE_PROVIDER_BY_ID,
  usageProviderLabel,
  type GitHubDeviceLoginConfig,
  type LocalStorageLoginConfig,
  type ProviderLoginConfig,
} from "./providerLoginConfigs";

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

/** Read one search param from a captured login URL, if present. */
function readUrlParam(url: string | undefined, param: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get(param) ?? undefined;
  } catch {
    return undefined;
  }
}

export class UsageLoginManager {
  private readonly inFlight = new Map<string, Promise<UsageLoginResult>>();
  private readonly deviceLoginCancel = new Map<string, () => void>();

  constructor(
    private readonly paths: PoracodePaths,
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
        .catch((error) => {
          console.warn("[usage-login] failed to clear login cookies:", error);
        });
    }
    return { ok: true };
  }

  /**
   * Seal a user-pasted API key for an API-key or hybrid provider. The stored
   * secret is the persistent "signed in" signal; the collector validates the key
   * itself on the next fetch, so a bad key simply re-prompts via `auth-missing`.
   */
  submitApiKey(providerId: string, apiKey: string): Promise<UsageLoginResult> {
    const config = PROVIDER_CONFIGS[providerId];
    const descriptor = USAGE_PROVIDER_BY_ID.get(providerId);
    if (
      config?.kind !== "api-key" &&
      !(config?.kind === "cookie" && descriptor?.apiKeyFallback === true)
    ) {
      return Promise.resolve({ ok: false, error: `No API-key login for ${providerId}` });
    }
    const trimmed = apiKey.trim();
    if (!trimmed) return Promise.resolve({ ok: false, error: "API key is empty" });
    setUsageSecret(this.paths.cacheDir, providerId, "apiKey", trimmed);
    return Promise.resolve({ ok: true });
  }

  startLogin(providerId: string): Promise<UsageLoginResult> {
    const existing = this.inFlight.get(providerId);
    if (existing) return existing;
    const config = PROVIDER_CONFIGS[providerId];
    if (!config) {
      return Promise.resolve({ ok: false, error: `No usage login for ${providerId}` });
    }
    if (config.kind === "api-key") {
      // API-key providers have no browser step; the renderer calls submitApiKey.
      return Promise.resolve({
        ok: false,
        error: `${usageProviderLabel(providerId)} uses a pasted API key`,
      });
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
    if (config.kind === "local-storage") {
      return this.runLocalStorageLogin(providerId, config, panel);
    }
    if (config.kind === "api-key") {
      // Unreachable: startLogin returns before calling runLogin for api-key
      // providers. Present only to narrow the union to CookieLoginConfig below.
      throw new Error(`runLogin reached for api-key provider ${providerId}`);
    }

    const result = await panel.captureLoginCookies({
      loginUrl: config.loginUrl,
      cookieUrl: config.cookieUrl,
      authCookiePattern: config.authCookiePattern,
      timeoutMs: LOGIN_TIMEOUT_MS,
      providerLabel: usageProviderLabel(providerId),
      ...(config.validateSession ? { validateSession: config.validateSession } : {}),
      ...(config.validateTabUrl ? { validateTabUrl: config.validateTabUrl } : {}),
    });
    if (!result.ok || !result.cookie) {
      return {
        ok: false,
        ...(result.cancelled ? { cancelled: true } : {}),
        ...(result.error ? { error: result.error } : {}),
      };
    }
    setUsageSecret(this.paths.cacheDir, providerId, "cookie", result.cookie);
    for (const { param, secretKey } of config.captureUrlParams ?? []) {
      const value = readUrlParam(result.url, param);
      if (value) setUsageSecret(this.paths.cacheDir, providerId, secretKey, value);
    }
    return { ok: true };
  }

  private async runLocalStorageLogin(
    providerId: string,
    config: LocalStorageLoginConfig,
    panel: BrowserPanelManager,
  ): Promise<UsageLoginResult> {
    const result = await panel.captureLoginLocalStorage({
      loginUrl: config.loginUrl,
      keys: Object.keys(config.store),
      requiredKey: config.requiredKey,
      timeoutMs: LOGIN_TIMEOUT_MS,
      providerLabel: usageProviderLabel(providerId),
    });
    if (!result.ok || !result.values) {
      return {
        ok: false,
        ...(result.cancelled ? { cancelled: true } : {}),
        ...(result.error ? { error: result.error } : {}),
      };
    }
    for (const [storageKey, secretKey] of Object.entries(config.store)) {
      const value = result.values[storageKey];
      if (value) setUsageSecret(this.paths.cacheDir, providerId, secretKey, value);
    }
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

    const providerLabel = usageProviderLabel(providerId);
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
        if (tabId)
          void panel.closeTab(tabId).catch((error) => {
            console.warn("[usage-login] failed to close login tab:", error);
          });
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
