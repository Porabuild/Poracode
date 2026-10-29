import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import {
  auth,
  IssuerMismatchError,
  validateAuthorizationResponseIssuer,
} from "@modelcontextprotocol/client";
import type {
  OAuthClientProvider,
  OAuthClientMetadata,
  OAuthTokens,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/client";
import {
  mcpOauthBeginPayloadSchema,
  isValidMcpServerUrl,
  type McpOauthBeginPayload,
  type McpOauthBeginResult,
  type McpOauthClearPayload,
  type McpOauthStatusResult,
  type McpOauthWaitResult,
  type McpServer,
} from "@/shared/contracts";
import { decryptSecret, encryptSecret } from "@/shared/secretStorage";
import { writeFileAtomic } from "@/shared/atomicFile";
import { fetchWithSignal, McpOAuthRefresh } from "./McpOAuthRefresh";

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY_SLACK_MS = 60 * 1000;
const STORE_FILE_NAME = "mcp-oauth.json";
const CALLBACK_PATH = "/callback";
// Version 1 preserves the legacy URL slots and adds independent opaque account keys.
// Callback issuer validation is flow-local; existing sealed credentials remain valid.
export const MCP_OAUTH_STORE_VERSION = 1;

const CALLBACK_SUCCESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Poracode</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; margin-top: 4rem;">
<p>Sign-in complete. You can close this window and return to Poracode.</p></body></html>`;
const CALLBACK_FAILURE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Poracode</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; margin-top: 4rem;">
<p>Sign-in failed. You can close this window and retry from Poracode.</p></body></html>`;

/** Sealed-at-rest per-server credential entry. Values are `encryptSecret` strings. */
interface StoredEntry {
  clientInformation?: string;
  tokens?: string;
  /** Epoch ms when `tokens` was saved; used with `expires_in` for expiry. */
  tokensSavedAt?: number;
}

interface StoreFile {
  version: typeof MCP_OAUTH_STORE_VERSION;
  servers: Record<string, StoredEntry>;
}

interface ActiveFlow {
  id: string;
  serverUrl: string;
  credentialKey: string;
  state: string;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  exchanging?: boolean;
  authorizationUrl?: string;
  listener?: Server | undefined;
  port?: number;
  timeout?: NodeJS.Timeout;
  settled: boolean;
  controller: AbortController;
  ownerSignal?: AbortSignal;
  pending: Set<Promise<unknown>>;
  closing?: Promise<void>;
  unlinkCancellation?: () => void;
  result: Promise<McpOauthWaitResult>;
  settle: (result: McpOauthWaitResult) => void;
}

function sanitizeMessage(value: unknown, fallback: string): string {
  if (value instanceof IssuerMismatchError && value.kind === "authorization_response")
    return "The sign-in response did not match the expected authorization server.";
  const raw =
    typeof value === "string" ? value : value instanceof Error ? value.message : undefined;
  if (!raw) return fallback;
  const sanitized = Array.from(raw, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .trim()
    .slice(0, 200);
  return sanitized || fallback;
}

function isOauthCapableTransport(server: McpServer): server is McpServer & {
  transport: { type: "http" | "sse"; url: string; headers: Record<string, string> };
} {
  return server.transport.type === "http" || server.transport.type === "sse";
}

function hasAuthorizationHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
}

export interface McpOAuthServiceOptions {
  baseDir: string;
  /** Test seam: overrides where the sealed credential store is written. */
  storePath?: string;
  /** Test seam: override the silent refresh budget (normally the MCP server's timeout). */
  refreshTimeoutMs?: number;
}

/**
 * OAuth 2.1 client for user-configured HTTP/SSE MCP servers: RFC 9728 resource
 * discovery, dynamic client registration, authorization-code + PKCE via a
 * loopback redirect listener, and refresh — all delegated to the MCP SDK's
 * `auth()`. Credentials are sealed with the shared secret-storage key before
 * touching disk and never leave the supervisor process.
 */
export class McpOAuthService {
  private readonly baseDir: string;
  private readonly storePath: string;
  private readonly flows = new Map<string, ActiveFlow>();
  private readonly flowsByServer = new Map<string, ActiveFlow>();
  private readonly credentialEpochs = new Map<string, number>();
  private readonly refresh: McpOAuthRefresh;
  private readonly ownedFlows = new Set<ActiveFlow>();
  private disposed = false;
  private disposing: Promise<void> | undefined;
  private storeCache: StoreFile | undefined;
  private unsupportedStore = false;

  constructor(options: McpOAuthServiceOptions) {
    this.baseDir = options.baseDir;
    this.storePath = options.storePath ?? join(options.baseDir, STORE_FILE_NAME);
    this.refresh = new McpOAuthRefresh(options.refreshTimeoutMs);
  }

  async begin(input: McpOauthBeginPayload): Promise<McpOauthBeginResult> {
    const payload = mcpOauthBeginPayloadSchema.parse(input);
    return this.beginForCredential(payload.server);
  }

  /** Internal plugin account path. Keys are supervisor-owned and never accepted over generic MCP RPC. */
  async beginForCredential(
    server: McpServer,
    credentialKey?: string,
    signal?: AbortSignal,
  ): Promise<McpOauthBeginResult> {
    if (this.disposed || signal?.aborted)
      return {
        status: "error",
        message: "Sign-in was canceled or the supervisor is shutting down.",
      };
    if (!isOauthCapableTransport(server)) {
      return { status: "error", message: "Only HTTP MCP servers support sign-in." };
    }
    this.readStore();
    if (this.unsupportedStore)
      return { status: "error", message: "Unsupported MCP OAuth store version." };
    const serverUrl = server.transport.url;
    const key = credentialKey ?? serverUrl;
    this.cancelFlowForServer(key);
    this.refresh.invalidate(key);

    const flow = this.createFlow(serverUrl, key, signal);
    this.ownedFlows.add(flow);
    this.flows.set(flow.id, flow);
    this.flowsByServer.set(key, flow);
    if (signal) {
      const cancel = () =>
        this.settleFlow(flow, { status: "error", message: "Sign-in was canceled." });
      signal.addEventListener("abort", cancel, { once: true });
      flow.unlinkCancellation = () => signal.removeEventListener("abort", cancel);
    }
    const result = await this.trackFlow(flow, this.startFlow(flow));
    if (result.status !== "redirect" || signal?.aborted) await this.joinFlow(flow);
    return signal?.aborted ? { status: "error", message: "Sign-in was canceled." } : result;
  }

  private async startFlow(flow: ActiveFlow): Promise<McpOauthBeginResult> {
    try {
      flow.controller.signal.throwIfAborted();
      flow.listener = await this.openLoopbackListener(flow);
      flow.controller.signal.throwIfAborted();
      if (flow.settled) {
        this.disposeFlow(flow);
        return { status: "error", message: "Sign-in was canceled." };
      }
      const provider = this.createProvider(
        flow.serverUrl,
        flow,
        flow.controller.signal,
        flow.credentialKey,
      );
      const result = await auth(provider, {
        serverUrl: flow.serverUrl,
        fetchFn: fetchWithSignal(flow.controller.signal),
      });
      flow.controller.signal.throwIfAborted();
      if (flow.settled) {
        this.disposeFlow(flow);
        return { status: "error", message: "Sign-in was canceled." };
      }
      if (result === "AUTHORIZED") {
        this.disposeFlow(flow);
        return { status: "authorized" };
      }
      if (!flow.authorizationUrl) {
        this.disposeFlow(flow);
        return { status: "error", message: "The server did not provide an authorization URL." };
      }
      flow.timeout = setTimeout(() => {
        this.settleFlow(flow, { status: "error", message: "Sign-in timed out." });
      }, FLOW_TIMEOUT_MS);
      flow.timeout.unref?.();
      return { status: "redirect", flowId: flow.id, authorizationUrl: flow.authorizationUrl };
    } catch (error) {
      this.disposeFlow(flow);
      return {
        status: "error",
        message: sanitizeMessage(error, "Could not start the sign-in flow."),
      };
    }
  }

  async wait(payload: { flowId: string }): Promise<McpOauthWaitResult> {
    const flow = this.flows.get(payload.flowId);
    if (!flow) return { status: "error", message: "The sign-in flow is no longer active." };
    const result = await flow.result;
    await this.joinFlow(flow);
    this.disposeFlow(flow);
    return result;
  }

  clear(payload: McpOauthClearPayload): void {
    if (!isValidMcpServerUrl(payload.url))
      throw new Error("This operation only clears HTTP MCP server credentials.");
    this.clearCredential(payload.url);
  }

  clearCredential(key: string): void {
    this.credentialEpochs.set(key, (this.credentialEpochs.get(key) ?? 0) + 1);
    this.cancelFlowForServer(key);
    this.refresh.invalidate(key);
    const store = this.readStore();
    if (this.unsupportedStore) throw new Error("Unsupported MCP OAuth store version.");
    if (store.servers[key] === undefined) return;
    const servers = { ...store.servers };
    delete servers[key];
    this.writeStore({ ...store, servers });
  }

  credentialStatus(key: string): {
    status: "connected" | "expired" | "disconnected";
    scopes: string[];
  } {
    const tokens = this.readTokens(key);
    return {
      status: !tokens
        ? "disconnected"
        : this.tokensExpired(key, tokens) && !tokens.refresh_token
          ? "expired"
          : "connected",
      scopes: typeof tokens?.scope === "string" ? tokens.scope.split(/\s+/u).filter(Boolean) : [],
    };
  }

  /** No network I/O. Manual headers always retain precedence over shared sign-in. */
  hasAuthorization(server: McpServer, credentialKey?: string): boolean {
    if (!isOauthCapableTransport(server) || hasAuthorizationHeader(server.transport.headers)) {
      return false;
    }
    const key = credentialKey ?? server.transport.url;
    const tokens = this.readTokens(key);
    return Boolean(tokens && (!this.tokensExpired(key, tokens) || tokens.refresh_token));
  }

  /** Refresh keeps this stable; signing out or starting a new sign-in revokes old consumers. */
  authorizationVersion(serverUrl: string, credentialKey?: string): number {
    return this.refresh.version(credentialKey ?? serverUrl);
  }

  status(): McpOauthStatusResult {
    const store = this.readStore();
    return {
      // A stored entry alone does not mean the next turn can authenticate:
      // an expired access token without a refresh token will be sent as no
      // `Authorization` header at all, and fail-closed agents (e.g. Antigravity
      // ACP) abort the whole turn with `MCP load failed ... Unauthorized`.
      // Only report URLs whose tokens are still usable (or refreshable).
      authenticatedUrls: Object.keys(store.servers).filter((url) => {
        if (!isValidMcpServerUrl(url)) return false;
        const tokens = this.readTokens(url);
        if (!tokens) return false;
        if (!this.tokensExpired(url, tokens)) return true;
        return Boolean(tokens.refresh_token);
      }),
    };
  }

  /**
   * Injects a fresh `Authorization` header into HTTP/SSE servers that have
   * stored credentials and no user-provided Authorization header. Silent on
   * failure: the server is passed through unchanged and the agent/probe
   * surfaces the resulting 401 as auth-required.
   */
  async applyAuthorization(servers: McpServer[]): Promise<McpServer[]> {
    return Promise.all(servers.map((server) => this.applyAuthorizationToServer(server)));
  }

  async applyAuthorizationToServer(server: McpServer, credentialKey?: string): Promise<McpServer> {
    if (!isOauthCapableTransport(server)) return server;
    if (hasAuthorizationHeader(server.transport.headers)) return server;
    const accessToken = await this.accessToken(
      server.transport.url,
      credentialKey ?? server.transport.url,
      server.timeoutMs,
    );
    if (!accessToken) return server;
    return {
      ...server,
      transport: {
        ...server.transport,
        headers: { ...server.transport.headers, Authorization: `Bearer ${accessToken}` },
      },
    };
  }

  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.disposed = true;
    const flows = [...this.ownedFlows];
    for (const flow of flows) {
      this.settleFlow(flow, { status: "error", message: "The sign-in flow was canceled." });
      this.disposeFlow(flow);
    }
    this.disposing = (async () => {
      await Promise.all([this.refresh.dispose(), ...flows.map((flow) => this.joinFlow(flow))]);
    })();
    return this.disposing;
  }

  /** Internal operation custody; signals and credential keys never cross IPC. */
  async retireAuthentication(signal: AbortSignal): Promise<void> {
    const flows = [...this.ownedFlows].filter((flow) => flow.ownerSignal === signal);
    for (const flow of flows) {
      this.settleFlow(flow, { status: "error", message: "Sign-in was canceled." });
      this.disposeFlow(flow);
    }
    await Promise.all(flows.map((flow) => this.joinFlow(flow)));
  }

  private trackFlow<T>(flow: ActiveFlow, pending: Promise<T>): Promise<T> {
    flow.pending.add(pending);
    const retire = () => {
      flow.pending.delete(pending);
    };
    void pending.then(retire, retire);
    return pending;
  }

  private async joinFlow(flow: ActiveFlow): Promise<void> {
    while (flow.pending.size) await Promise.allSettled([...flow.pending]);
    await flow.closing;
    this.ownedFlows.delete(flow);
  }

  private async accessToken(
    serverUrl: string,
    credentialKey: string,
    timeoutMs: number,
  ): Promise<string | undefined> {
    const tokens = this.readTokens(credentialKey);
    if (!tokens) return undefined;
    if (!this.tokensExpired(credentialKey, tokens)) return tokens.access_token;
    if (!tokens.refresh_token) return undefined;
    return this.refresh.run(
      credentialKey,
      async (signal) => {
        const provider = this.createProvider(serverUrl, undefined, signal, credentialKey);
        const result = await auth(provider, { serverUrl, fetchFn: fetchWithSignal(signal) });
        signal.throwIfAborted();
        if (result !== "AUTHORIZED") return undefined;
        return this.readTokens(credentialKey)?.access_token;
      },
      timeoutMs,
    );
  }

  private tokensExpired(serverUrl: string, tokens: OAuthTokens): boolean {
    if (tokens.expires_in === undefined) return false;
    const savedAt = this.readStore().servers[serverUrl]?.tokensSavedAt;
    if (savedAt === undefined) return true;
    return savedAt + tokens.expires_in * 1000 - TOKEN_EXPIRY_SLACK_MS <= Date.now();
  }

  private createFlow(
    serverUrl: string,
    credentialKey: string,
    ownerSignal?: AbortSignal,
  ): ActiveFlow {
    let settle!: (result: McpOauthWaitResult) => void;
    const result = new Promise<McpOauthWaitResult>((resolve) => {
      settle = resolve;
    });
    const flow: ActiveFlow = {
      id: randomUUID(),
      serverUrl,
      credentialKey,
      state: randomBytes(24).toString("base64url"),
      settled: false,
      controller: new AbortController(),
      ...(ownerSignal ? { ownerSignal } : {}),
      pending: new Set(),
      result,
      settle,
    };
    return flow;
  }

  /**
   * Interactive when `flow` is given (captures the authorization redirect and
   * uses the loopback listener); non-interactive otherwise (refresh only —
   * a required redirect aborts the flow instead of opening a browser).
   *
   * Deliberately implements only the v2 `OAuthClientProvider` members needed
   * for the authorization-code + PKCE + refresh-token flow. The optional v2
   * hooks are left at their SDK defaults, which are correct for this public
   * loopback client: `addClientAuthentication` (default `none` handling),
   * `validateResourceURL` (default RFC 9728 check), `prepareTokenRequest`
   * (default authorization-code grant), `clientMetadataUrl` (DCR is used),
   * `dpop` (plain Bearer tokens), `scopeForRefresh` (retain granted scopes),
   * `saveResourceUrl`/`resourceUrl`
   * (Cross-App Access only), and the deprecated
   * `saveAuthorizationServerUrl`/`authorizationServerUrl` pair (written by the
   * SDK but never read). The `ctx.issuer` argument on the persistence methods
   * is ignored: each credential slot round-trips the SDK's
   * issuer stamp through the encrypted JSON store untouched.
   */
  private createProvider(
    serverUrl: string,
    flow?: ActiveFlow,
    signal?: AbortSignal,
    credentialKey = serverUrl,
  ): OAuthClientProvider {
    const service = this;
    const epoch = this.credentialEpochs.get(credentialKey) ?? 0;
    const assertCurrent = () => {
      if (flow?.settled || (service.credentialEpochs.get(credentialKey) ?? 0) !== epoch)
        throw new Error("Sign-in was canceled.");
    };
    const redirectUrl = flow?.port
      ? `http://127.0.0.1:${flow.port}${CALLBACK_PATH}`
      : "http://127.0.0.1/unused-callback";
    return {
      get redirectUrl() {
        return redirectUrl;
      },
      get clientMetadata(): OAuthClientMetadata {
        return {
          client_name: "Poracode",
          redirect_uris: [redirectUrl],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        };
      },
      state: () => {
        if (!flow) throw new Error("Interactive sign-in is required.");
        return flow.state;
      },
      clientInformation: () => service.readClientInformation(credentialKey),
      saveClientInformation: (clientInformation) => {
        assertCurrent();
        signal?.throwIfAborted();
        service.updateEntry(credentialKey, (entry) => ({
          ...entry,
          clientInformation: encryptSecret(service.baseDir, JSON.stringify(clientInformation)),
        }));
      },
      tokens: () => service.readTokens(credentialKey),
      saveTokens: (tokens) => {
        assertCurrent();
        signal?.throwIfAborted();
        const previous = service.readTokens(credentialKey);
        // A refresh may omit an unchanged scope; a new authorization grant may not inherit it.
        const previousScope = flow?.exchanging ? undefined : previous?.scope;
        const savedTokens =
          tokens.scope === undefined && previousScope !== undefined
            ? { ...tokens, scope: previousScope }
            : tokens;
        // The SDK stamps legacy tokens with their issuer before refreshing.
        // That metadata write must not make an expired token look fresh if the
        // grant stalls or fails, including to concurrent MCP connections.
        const issuerStamp =
          previous &&
          !previous.issuer &&
          savedTokens.issuer &&
          Object.entries(previous).every(
            ([key, value]) => Reflect.get(savedTokens, key) === value,
          ) &&
          Object.keys(savedTokens).length === Object.keys(previous).length + 1;
        service.updateEntry(credentialKey, (entry) => ({
          ...entry,
          tokens: encryptSecret(service.baseDir, JSON.stringify(savedTokens)),
          ...(!issuerStamp ? { tokensSavedAt: Date.now() } : {}),
        }));
      },
      redirectToAuthorization: (authorizationUrl: URL) => {
        assertCurrent();
        if (!flow) throw new Error("Interactive sign-in is required.");
        flow.authorizationUrl = authorizationUrl.toString();
      },
      saveCodeVerifier: (codeVerifier) => {
        assertCurrent();
        if (!flow) throw new Error("Interactive sign-in is required.");
        flow.codeVerifier = codeVerifier;
      },
      codeVerifier: () => {
        if (!flow?.codeVerifier) throw new Error("Missing PKCE code verifier.");
        return flow.codeVerifier;
      },
      saveDiscoveryState: (state) => {
        assertCurrent();
        if (flow) flow.discoveryState = state;
      },
      discoveryState: () => flow?.discoveryState,
      invalidateCredentials: (scope) => {
        assertCurrent();
        signal?.throwIfAborted();
        service.updateEntry(credentialKey, (entry) => {
          if (scope === "all") return {};
          const next = { ...entry };
          if (scope === "client") delete next.clientInformation;
          if (scope === "tokens") {
            delete next.tokens;
            delete next.tokensSavedAt;
          }
          if (scope === "discovery" && flow) delete flow.discoveryState;
          // v2 splits the old single "all" invalidation into separate
          // "client" + "tokens" calls with the same net effect. "verifier"
          // (kept in-memory on the active flow, not in this store) requires
          // no persisted update. Discovery is bound to the active flow only.
          return next;
        });
      },
    };
  }

  private openLoopbackListener(flow: ActiveFlow): Promise<Server> {
    return new Promise((resolve, reject) => {
      const listener = createServer((req, res) => this.handleCallback(flow, req, res));
      listener.on("error", reject);
      listener.listen(0, "127.0.0.1", () => {
        const address = listener.address();
        if (address === null || typeof address === "string") {
          listener.close();
          reject(new Error("Could not open the sign-in callback listener."));
          return;
        }
        flow.port = address.port;
        listener.removeListener("error", reject);
        resolve(listener);
      });
    });
  }

  private handleCallback(flow: ActiveFlow, req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${flow.port}`);
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    // An attacker on another local account cannot know the state value; a
    // mismatched callback is ignored without consuming the pending flow.
    if (url.searchParams.get("state") !== flow.state || flow.settled || flow.exchanging) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end(CALLBACK_FAILURE_HTML);
      return;
    }

    const iss = url.searchParams.get("iss") ?? undefined;
    const metadata = flow.discoveryState?.authorizationServerMetadata;
    try {
      // Error callbacks need the same issuer validation as successful callbacks
      // before any server-supplied error description can reach the user.
      validateAuthorizationResponseIssuer({
        iss,
        expectedIssuer: metadata?.issuer,
        issParameterSupported: metadata?.authorization_response_iss_parameter_supported === true,
      });
    } catch (error) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(CALLBACK_FAILURE_HTML);
      this.settleFlow(flow, {
        status: "error",
        message: sanitizeMessage(error, "Sign-in was denied."),
      });
      return;
    }

    const oauthError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (oauthError !== null || !code) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(CALLBACK_FAILURE_HTML);
      this.settleFlow(flow, {
        status: "error",
        message: sanitizeMessage(
          url.searchParams.get("error_description") ?? oauthError,
          "Sign-in was denied.",
        ),
      });
      return;
    }

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(CALLBACK_SUCCESS_HTML);
    flow.exchanging = true;
    void this.trackFlow(flow, this.exchangeAuthorizationCode(flow, code, iss));
  }

  private async exchangeAuthorizationCode(
    flow: ActiveFlow,
    code: string,
    iss?: string,
  ): Promise<void> {
    try {
      const provider = this.createProvider(
        flow.serverUrl,
        flow,
        flow.controller.signal,
        flow.credentialKey,
      );
      const result = await auth(provider, {
        serverUrl: flow.serverUrl,
        authorizationCode: code,
        // Forward the decoded callback issuer for SDK validation (RFC 9207).
        // Keep absence distinct from an empty value; never infer it from discovery.
        ...(iss !== undefined ? { iss } : {}),
        fetchFn: fetchWithSignal(flow.controller.signal),
      });
      this.settleFlow(
        flow,
        result === "AUTHORIZED"
          ? { status: "authorized" }
          : { status: "error", message: "The authorization could not be completed." },
      );
    } catch (error) {
      this.settleFlow(flow, {
        status: "error",
        message: sanitizeMessage(error, "The authorization could not be completed."),
      });
    }
  }

  private cancelFlowForServer(serverUrl: string): void {
    const flow = this.flowsByServer.get(serverUrl);
    if (flow) {
      this.settleFlow(flow, { status: "error", message: "The sign-in flow was restarted." });
    }
  }

  private settleFlow(flow: ActiveFlow, result: McpOauthWaitResult): void {
    if (!flow.settled) {
      flow.settled = true;
      flow.settle(result);
    }
    this.disposeFlow(flow, true);
    // Retire completed/canceled work even if a legacy caller never waits. Failed
    // joins keep their actual custody and are retried/refused by owner shutdown.
    void this.joinFlow(flow).catch(() => undefined);
  }

  private disposeFlow(flow: ActiveFlow, retainResult = false): void {
    flow.controller.abort();
    flow.unlinkCancellation?.();
    if (flow.timeout) clearTimeout(flow.timeout);
    const listener = flow.listener;
    if (listener) {
      flow.closing = this.trackFlow(
        flow,
        new Promise<void>((resolve, reject) => {
          listener.close((error) => {
            if (error && !("code" in error && error.code === "ERR_SERVER_NOT_RUNNING"))
              reject(error);
            else resolve();
          });
        }),
      );
      // This listener only accepts the OAuth callback; no request may retain
      // supervisor custody after cancellation, including partial HTTP headers.
      listener.closeAllConnections();
    }
    flow.listener = undefined;
    if (retainResult && !this.disposed) {
      flow.timeout = setTimeout(() => this.flows.delete(flow.id), FLOW_TIMEOUT_MS);
      flow.timeout.unref?.();
    } else this.flows.delete(flow.id);
    if (this.flowsByServer.get(flow.credentialKey) === flow) {
      this.flowsByServer.delete(flow.credentialKey);
    }
  }

  private readClientInformation(serverUrl: string): StoredOAuthClientInformation | undefined {
    const sealed = this.readStore().servers[serverUrl]?.clientInformation;
    if (!sealed) return undefined;
    try {
      // v2 stamps an optional `issuer` on save; pre-upgrade entries without it
      // still parse — the SDK accepts unstamped credentials and re-saves them
      // with the stamp, so no migration is needed.
      return JSON.parse(decryptSecret(this.baseDir, sealed)) as StoredOAuthClientInformation;
    } catch {
      return undefined;
    }
  }

  private readTokens(serverUrl: string): StoredOAuthTokens | undefined {
    const sealed = this.readStore().servers[serverUrl]?.tokens;
    if (!sealed) return undefined;
    try {
      // Same issuer-stamp back-compat as client information above.
      return JSON.parse(decryptSecret(this.baseDir, sealed)) as StoredOAuthTokens;
    } catch {
      return undefined;
    }
  }

  private updateEntry(serverUrl: string, update: (entry: StoredEntry) => StoredEntry): void {
    const current = this.readStore();
    const store = { ...current, servers: { ...current.servers } };
    const next = update(store.servers[serverUrl] ?? {});
    if (Object.keys(next).length === 0) delete store.servers[serverUrl];
    else store.servers[serverUrl] = next;
    this.writeStore(store);
  }

  private readStore(): StoreFile {
    if (this.storeCache) return this.storeCache;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.storePath, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        this.storeCache = { version: MCP_OAUTH_STORE_VERSION, servers: {} };
        return this.storeCache;
      }
      // The legacy writer was not atomic; a truncated file must degrade to "no
      // credentials" instead of breaking every HTTP MCP launch and status read.
      this.storeCache = { version: MCP_OAUTH_STORE_VERSION, servers: {} };
      return this.storeCache;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "version" in parsed &&
      parsed.version !== MCP_OAUTH_STORE_VERSION
    ) {
      // Preserve a newer/unknown store: reads degrade to empty, writes refuse.
      this.unsupportedStore = true;
      this.storeCache = { version: MCP_OAUTH_STORE_VERSION, servers: {} };
      return this.storeCache;
    }
    const servers =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? ((parsed as { servers?: unknown }).servers ?? {})
        : {};
    this.storeCache = {
      version: MCP_OAUTH_STORE_VERSION,
      servers:
        servers && typeof servers === "object" && !Array.isArray(servers)
          ? (servers as Record<string, StoredEntry>)
          : {},
    };
    return this.storeCache;
  }

  private writeStore(store: StoreFile): void {
    if (this.unsupportedStore) throw new Error("Unsupported MCP OAuth store version.");
    writeFileAtomic(this.storePath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    this.storeCache = store;
  }
}
