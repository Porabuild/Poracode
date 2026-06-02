/**
 * The capability surface a caller injects into the collectors. Everything that
 * touches the outside world lives here so the collectors stay pure and the same
 * code runs in a Node supervisor, a CLI, or (for formatters only) a browser.
 */

export interface HttpRequest {
  method?: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  /** Lower-cased header names recommended; collectors read defensively. */
  headers: Record<string, string>;
  body: string;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

/**
 * A normalized access-token bundle. The host resolves the provider's native
 * credential source (creds file / Windows Credential Manager / env var / WSL
 * UNC) and returns this shape, or `undefined` when the provider is not signed
 * in. For token-only providers (e.g. a GitHub PAT for Copilot) only
 * `accessToken` is populated.
 */
export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
  tokenType?: string;
  accountId?: string;
  /** Vendor plan/subscription hint when the creds file carries one. */
  subscriptionType?: string;
  /** Remaining provider-specific fields, for collectors that need extras. */
  raw?: Record<string, unknown>;
}

export interface CredentialStore {
  /** Primary access token for a provider, or undefined when not signed in. */
  getOAuthToken(providerId: string): Promise<OAuthToken | undefined>;
  /** Generic secret (e.g. a captured session cookie) for cookie providers. */
  getSecret(providerId: string, key: string): Promise<string | undefined>;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Client version identifiers some usage endpoints require in headers. These rot
 * over time (the APIs are private); the host may override the package defaults.
 */
export interface ClientVersions {
  claudeCode?: string;
  codex?: string;
  copilotChat?: string;
  editor?: string;
}

export interface HostPort {
  http: HttpClient;
  credentials: CredentialStore;
  /** Epoch milliseconds; injected so countdowns and snapshots are deterministic. */
  now(): number;
  clientVersions?: ClientVersions;
  log?: Logger;
}

export interface CollectOptions {
  signal?: AbortSignal;
}
