import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  mcpOauthBeginPayloadSchema,
  type McpOauthBeginPayload,
  type McpOauthBeginResult,
  type McpOauthClearPayload,
  type McpOauthStatusResult,
  type McpOauthWaitResult,
  type McpServer,
} from "@/shared/contracts";
import { decryptSecret, encryptSecret } from "@/shared/secretStorage";

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY_SLACK_MS = 60 * 1000;
const STORE_FILE_NAME = "mcp-oauth.json";
const CALLBACK_PATH = "/callback";

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
  servers: Record<string, StoredEntry>;
}

interface ActiveFlow {
  id: string;
  serverUrl: string;
  state: string;
  codeVerifier?: string;
  authorizationUrl?: string;
  listener?: Server | undefined;
  port?: number;
  timeout?: NodeJS.Timeout;
  settled: boolean;
  result: Promise<McpOauthWaitResult>;
  settle: (result: McpOauthWaitResult) => void;
}

function sanitizeMessage(value: unknown, fallback: string): string {
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
  private storeCache: StoreFile | undefined;

  constructor(options: McpOAuthServiceOptions) {
    this.baseDir = options.baseDir;
    this.storePath = options.storePath ?? join(options.baseDir, STORE_FILE_NAME);
  }

  async begin(input: McpOauthBeginPayload): Promise<McpOauthBeginResult> {
    const payload = mcpOauthBeginPayloadSchema.parse(input);
    const server = payload.server;
    if (!isOauthCapableTransport(server)) {
      return { status: "error", message: "Only HTTP MCP servers support sign-in." };
    }
    const serverUrl = server.transport.url;
    this.cancelFlowForServer(serverUrl);

    const flow = this.createFlow(serverUrl);
    try {
      flow.listener = await this.openLoopbackListener(flow);
      const provider = this.createProvider(serverUrl, flow);
      const result = await auth(provider, { serverUrl });
      if (result === "AUTHORIZED") {
        this.disposeFlow(flow);
        return { status: "authorized" };
      }
      if (!flow.authorizationUrl) {
        this.disposeFlow(flow);
        return { status: "error", message: "The server did not provide an authorization URL." };
      }
      this.flows.set(flow.id, flow);
      this.flowsByServer.set(serverUrl, flow);
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
    return flow.result;
  }

  clear(payload: McpOauthClearPayload): void {
    this.cancelFlowForServer(payload.url);
    const store = this.readStore();
    if (store.servers[payload.url] === undefined) return;
    delete store.servers[payload.url];
    this.writeStore(store);
  }

  status(): McpOauthStatusResult {
    const store = this.readStore();
    return {
      authenticatedUrls: Object.keys(store.servers).filter((url) => this.readTokens(url)),
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

  async applyAuthorizationToServer(server: McpServer): Promise<McpServer> {
    if (!isOauthCapableTransport(server)) return server;
    if (hasAuthorizationHeader(server.transport.headers)) return server;
    const accessToken = await this.accessToken(server.transport.url);
    if (!accessToken) return server;
    return {
      ...server,
      transport: {
        ...server.transport,
        headers: { ...server.transport.headers, Authorization: `Bearer ${accessToken}` },
      },
    };
  }

  dispose(): void {
    for (const flow of [...this.flows.values()]) {
      this.settleFlow(flow, { status: "error", message: "The sign-in flow was canceled." });
    }
  }

  private async accessToken(serverUrl: string): Promise<string | undefined> {
    const tokens = this.readTokens(serverUrl);
    if (!tokens) return undefined;
    if (!this.tokensExpired(serverUrl, tokens)) return tokens.access_token;
    if (!tokens.refresh_token) return undefined;
    try {
      const provider = this.createProvider(serverUrl);
      const result = await auth(provider, { serverUrl });
      if (result !== "AUTHORIZED") return undefined;
      return this.readTokens(serverUrl)?.access_token;
    } catch {
      return undefined;
    }
  }

  private tokensExpired(serverUrl: string, tokens: OAuthTokens): boolean {
    if (tokens.expires_in === undefined) return false;
    const savedAt = this.readStore().servers[serverUrl]?.tokensSavedAt;
    if (savedAt === undefined) return true;
    return savedAt + tokens.expires_in * 1000 - TOKEN_EXPIRY_SLACK_MS <= Date.now();
  }

  private createFlow(serverUrl: string): ActiveFlow {
    let settle!: (result: McpOauthWaitResult) => void;
    const result = new Promise<McpOauthWaitResult>((resolve) => {
      settle = resolve;
    });
    const flow: ActiveFlow = {
      id: randomUUID(),
      serverUrl,
      state: randomBytes(24).toString("base64url"),
      settled: false,
      result,
      settle,
    };
    return flow;
  }

  /**
   * Interactive when `flow` is given (captures the authorization redirect and
   * uses the loopback listener); non-interactive otherwise (refresh only —
   * a required redirect aborts the flow instead of opening a browser).
   */
  private createProvider(serverUrl: string, flow?: ActiveFlow): OAuthClientProvider {
    const service = this;
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
      clientInformation: () => service.readClientInformation(serverUrl),
      saveClientInformation: (clientInformation) => {
        service.updateEntry(serverUrl, (entry) => ({
          ...entry,
          clientInformation: encryptSecret(service.baseDir, JSON.stringify(clientInformation)),
        }));
      },
      tokens: () => service.readTokens(serverUrl),
      saveTokens: (tokens) => {
        service.updateEntry(serverUrl, (entry) => ({
          ...entry,
          tokens: encryptSecret(service.baseDir, JSON.stringify(tokens)),
          tokensSavedAt: Date.now(),
        }));
      },
      redirectToAuthorization: (authorizationUrl: URL) => {
        if (!flow) throw new Error("Interactive sign-in is required.");
        flow.authorizationUrl = authorizationUrl.toString();
      },
      saveCodeVerifier: (codeVerifier) => {
        if (!flow) throw new Error("Interactive sign-in is required.");
        flow.codeVerifier = codeVerifier;
      },
      codeVerifier: () => {
        if (!flow?.codeVerifier) throw new Error("Missing PKCE code verifier.");
        return flow.codeVerifier;
      },
      invalidateCredentials: (scope) => {
        service.updateEntry(serverUrl, (entry) => {
          if (scope === "all") return {};
          const next = { ...entry };
          if (scope === "client") delete next.clientInformation;
          if (scope === "tokens") {
            delete next.tokens;
            delete next.tokensSavedAt;
          }
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
    if (url.searchParams.get("state") !== flow.state || flow.settled) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end(CALLBACK_FAILURE_HTML);
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
    void this.exchangeAuthorizationCode(flow, code);
  }

  private async exchangeAuthorizationCode(flow: ActiveFlow, code: string): Promise<void> {
    try {
      const provider = this.createProvider(flow.serverUrl, flow);
      const result = await auth(provider, {
        serverUrl: flow.serverUrl,
        authorizationCode: code,
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
    this.disposeFlow(flow);
  }

  private disposeFlow(flow: ActiveFlow): void {
    if (flow.timeout) clearTimeout(flow.timeout);
    flow.listener?.close();
    flow.listener = undefined;
    this.flows.delete(flow.id);
    if (this.flowsByServer.get(flow.serverUrl) === flow) {
      this.flowsByServer.delete(flow.serverUrl);
    }
  }

  private readClientInformation(serverUrl: string): OAuthClientInformationMixed | undefined {
    const sealed = this.readStore().servers[serverUrl]?.clientInformation;
    if (!sealed) return undefined;
    try {
      return JSON.parse(decryptSecret(this.baseDir, sealed)) as OAuthClientInformationMixed;
    } catch {
      return undefined;
    }
  }

  private readTokens(serverUrl: string): OAuthTokens | undefined {
    const sealed = this.readStore().servers[serverUrl]?.tokens;
    if (!sealed) return undefined;
    try {
      return JSON.parse(decryptSecret(this.baseDir, sealed)) as OAuthTokens;
    } catch {
      return undefined;
    }
  }

  private updateEntry(serverUrl: string, update: (entry: StoredEntry) => StoredEntry): void {
    const store = this.readStore();
    const next = update(store.servers[serverUrl] ?? {});
    if (Object.keys(next).length === 0) delete store.servers[serverUrl];
    else store.servers[serverUrl] = next;
    this.writeStore(store);
  }

  private readStore(): StoreFile {
    if (this.storeCache) return this.storeCache;
    try {
      const parsed = JSON.parse(readFileSync(this.storePath, "utf8")) as unknown;
      const servers =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? ((parsed as { servers?: unknown }).servers ?? {})
          : {};
      this.storeCache = {
        servers:
          servers && typeof servers === "object" && !Array.isArray(servers)
            ? (servers as Record<string, StoredEntry>)
            : {},
      };
    } catch {
      this.storeCache = { servers: {} };
    }
    return this.storeCache;
  }

  private writeStore(store: StoreFile): void {
    this.storeCache = store;
    try {
      mkdirSync(dirname(this.storePath), { recursive: true });
      writeFileSync(this.storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    } catch {
      // Persisting is best-effort; in-memory credentials still work for the session.
    }
  }
}
