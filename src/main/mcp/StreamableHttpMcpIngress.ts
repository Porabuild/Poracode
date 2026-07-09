import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { decodeThreadIdentity, type McpThreadIdentity } from "@/shared/browserMcpThread";
import { isLocalhostOrigin, readBoundedNodeRequestBody, writeJsonResponse } from "@/shared/http";

export interface StreamableHttpMcpIngressInfo {
  url: string;
  token: string;
  port: number;
}

export interface StreamableHttpMcpToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface StreamableHttpMcpContent {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface StreamableHttpMcpToolResult {
  content: StreamableHttpMcpContent[];
  isError?: boolean;
}

export interface StreamableHttpMcpIngressOptions<TContext> {
  /**
   * Network interface to bind. Defaults to `0.0.0.0` so WSL agents can reach the
   * host-side endpoint via the gateway IP. Consumers whose surface must never be
   * reachable off the host (e.g. computer-use input control) should pass
   * `"127.0.0.1"` to bind loopback only.
   */
  bindHost?: string;
  contextUnavailableMessage?: string;
  dispatchTool(name: string, args: Record<string, unknown>, ctx: TContext): Promise<unknown>;
  formatToolResult(name: string, result: unknown): StreamableHttpMcpToolResult;
  /**
   * Build the per-request tool context. Receives the thread identity decoded
   * from the endpoint URL query (`?thread=&title=`) so each thread can be
   * scoped/named; consumers that don't need it may ignore the argument.
   */
  buildContext(identity: McpThreadIdentity): TContext | null;
  instructions: string;
  isKnownToolName(name: string): boolean;
  onBeforeToolCall?(name: string, ctx: TContext): void;
  serverInfo: { name: string; version: string };
  tools: readonly StreamableHttpMcpToolSpec[];
}

const MAX_BODY = 1024 * 1024;
const MCP_PROTOCOL_VERSION = "2025-03-26";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponseOk {
  jsonrpc: "2.0";
  id: number | string | null;
  result: unknown;
}

interface JsonRpcResponseErr {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcResponseOk | JsonRpcResponseErr;

export class StreamableHttpMcpIngress<TContext> {
  private server: Server | null = null;
  private token = randomBytes(32).toString("hex");
  private info: StreamableHttpMcpIngressInfo | null = null;

  constructor(private readonly options: StreamableHttpMcpIngressOptions<TContext>) {}

  async start(): Promise<StreamableHttpMcpIngressInfo> {
    if (this.info) return this.info;
    const bindHost = this.options.bindHost ?? "0.0.0.0";
    return await new Promise<StreamableHttpMcpIngressInfo>((resolve, reject) => {
      const server = createServer((req, res) => this.handle(req, res));
      server.on("error", reject);
      // Access is guarded by a 256-bit bearer token regenerated per app launch;
      // the URL is only ever passed to immediate child processes via env vars.
      server.listen(0, bindHost, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        this.server = server;
        this.info = { url: `http://127.0.0.1:${port}`, token: this.token, port };
        resolve(this.info);
      });
    });
  }

  getInfo(): StreamableHttpMcpIngressInfo | null {
    return this.info;
  }

  dispose(): void {
    try {
      this.server?.closeAllConnections?.();
    } catch {}
    try {
      this.server?.close();
    } catch {}
    this.server = null;
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    const body = await readBoundedNodeRequestBody(req, MAX_BODY, () => new Error("body too large"));
    return body.toString("utf8");
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    writeJsonResponse(res, status, body, { cacheControl: "no-store" });
  }

  private checkAuth(req: IncomingMessage): boolean {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ") && auth.slice(7).trim() === this.token) {
      return true;
    }
    const xToken = req.headers["x-lightcode-token"];
    return typeof xToken === "string" && xToken === this.token;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!req.url) {
        this.sendJson(res, 404, { error: "not found" });
        return;
      }
      const path = new URL(req.url, "http://x").pathname;

      // CORS preflight — restrict to localhost origins so remote web pages
      // cannot issue cross-origin requests to the MCP ingress.
      if (req.method === "OPTIONS") {
        const origin = req.headers.origin;
        if (typeof origin === "string" && isLocalhostOrigin(origin)) {
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Authorization, X-Lightcode-Token, Content-Type, Mcp-Session-Id",
          );
          res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        }
        res.statusCode = 204;
        res.end();
        return;
      }

      if (!this.checkAuth(req)) {
        this.sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      if (path === "/mcp" || path === "/mcp/") {
        if (req.method === "GET") {
          // MCP Streamable HTTP allows GET to open an SSE stream. We don't
          // push server-initiated events; return 405 with Allow header.
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end();
          return;
        }
        if (req.method !== "POST") {
          this.sendJson(res, 405, { error: "method not allowed" });
          return;
        }
        await this.handleMcp(req, res);
        return;
      }

      this.sendJson(res, 404, { error: "not found" });
    } catch (err) {
      this.sendJson(res, 500, { error: (err as Error).message ?? "internal" });
    }
  }

  private async handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const identity = decodeThreadIdentity(req.url);
    const raw = await this.readBody(req);
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      this.sendJson(res, 400, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      return;
    }

    // Mcp-Session-Id: stateless server, but echo a session id so clients
    // that key off of it have one.
    let sessionId = req.headers["mcp-session-id"];
    if (Array.isArray(sessionId)) sessionId = sessionId[0];
    if (typeof sessionId !== "string" || !sessionId) {
      sessionId = randomUUID();
    }
    res.setHeader("Mcp-Session-Id", sessionId);

    // Streamable HTTP allows a single response or a batch. Match the input.
    if (Array.isArray(body)) {
      const out: JsonRpcResponse[] = [];
      for (const message of body) {
        const reply = await this.handleSingle(message, identity);
        if (reply) out.push(reply);
      }
      this.sendJson(res, 200, out);
      return;
    }
    const reply = await this.handleSingle(body, identity);
    if (!reply) {
      // notification — no response
      res.statusCode = 202;
      res.end();
      return;
    }
    this.sendJson(res, 200, reply);
  }

  private async handleSingle(
    message: unknown,
    identity: McpThreadIdentity,
  ): Promise<JsonRpcResponse | null> {
    if (!isJsonRpcRequest(message)) return null;
    const { id = null, method, params } = message;
    try {
      if (method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: this.options.serverInfo,
            instructions: this.options.instructions,
          },
        };
      }
      if (method === "notifications/initialized" || method === "initialized") {
        return null;
      }
      if (method === "ping") {
        return { jsonrpc: "2.0", id, result: {} };
      }
      if (method === "tools/list") {
        return { jsonrpc: "2.0", id, result: { tools: this.options.tools } };
      }
      if (method === "tools/call") {
        const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const name = String(p.name ?? "");
        const args = (p.arguments ?? {}) as Record<string, unknown>;
        if (!this.options.isKnownToolName(name)) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
            },
          };
        }
        const ctx = this.options.buildContext(identity);
        if (!ctx) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [
                { type: "text", text: this.options.contextUnavailableMessage ?? "not ready" },
              ],
            },
          };
        }
        this.options.onBeforeToolCall?.(name, ctx);
        let raw: unknown;
        try {
          raw = await this.options.dispatchTool(name, args, ctx);
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [{ type: "text", text: (err as Error).message ?? String(err) }],
            },
          };
        }
        const result = this.options.formatToolResult(name, raw);
        return { jsonrpc: "2.0", id, result };
      }
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: (err as Error).message ?? "internal" },
      };
    }
  }
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (value as { method?: unknown }).method === "string"
  );
}
