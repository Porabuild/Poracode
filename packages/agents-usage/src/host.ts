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
  bodyBytes?: Uint8Array;
  timeoutMs?: number;
  /** Redirect policy for requests carrying credentials. Defaults to `follow`. */
  redirect?: "follow" | "error" | "manual";
}

export interface HttpResponse {
  status: number;
  /** Lower-cased header names recommended; collectors read defensively. */
  headers: Record<string, string>;
  body: string;
  bodyBytes?: Uint8Array;
  /**
   * Raw `Set-Cookie` values, one entry per header line. `headers` cannot carry
   * them: the Headers API has no reliable generic multi-value read, so repeated
   * `set-cookie` entries collapse into one comma-joined string that cannot be
   * split back apart safely (cookie attributes contain commas). Hosts that can
   * expose them populate this; collectors that rotate a stored session cookie
   * read it (see `cookieJar.ts`) and degrade gracefully when it is absent.
   */
  setCookies?: string[];
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
  /**
   * Return a fresh/fallback OAuth token after the provider rejected `token`.
   * Optional: hosts that can refresh provider-native OAuth credentials implement
   * it. Collectors may retry once or more with returned tokens, and should still
   * degrade gracefully when omitted.
   */
  refreshOAuthToken?(providerId: string, token: OAuthToken): Promise<OAuthToken | undefined>;
  /** Generic secret (e.g. a captured session cookie) for cookie providers. */
  getSecret(providerId: string, key: string): Promise<string | undefined>;
  /**
   * Persist a generic secret. Optional: only hosts with a writable secret store
   * implement it. Needed by collectors that rotate a stored credential — e.g.
   * Factory exchanges a WorkOS refresh token (which WorkOS rotates on each use)
   * for a fresh access token and must write the new refresh token back.
   */
  setSecret?(providerId: string, key: string, value: string): Promise<void>;
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
