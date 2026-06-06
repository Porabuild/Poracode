import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

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
  contextUnavailableMessage?: string;
  dispatchTool(name: string, args: Record<string, unknown>, ctx: TContext): Promise<unknown>;
  formatToolResult(name: string, result: unknown): StreamableHttpMcpToolResult;
  buildContext(): TContext | null;
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
    return await new Promise<StreamableHttpMcpIngressInfo>((resolve, reject) => {
      const server = createServer((req, res) => this.handle(req, res));
      server.on("error", reject);
      // Bind 0.0.0.0 so WSL agents can reach host-side ingress endpoints when
      // they are proxied through an in-distro bridge. Access is guarded by a
      // per-launch bearer token passed only to child agent processes.
      server.listen(0, "0.0.0.0", () => {
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
    return await new Promise<string>((resolve, reject) => {
      let total = 0;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BODY) {
          req.destroy();
          reject(new Error("body too large"));
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
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

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, X-Lightcode-Token, Content-Type, Mcp-Session-Id",
        );
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end();
        return;
      }

      if (!this.checkAuth(req)) {
        this.sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      if (path === "/mcp" || path === "/mcp/") {
        if (req.method === "GET") {
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

    let sessionId = req.headers["mcp-session-id"];
    if (Array.isArray(sessionId)) sessionId = sessionId[0];
    if (typeof sessionId !== "string" || !sessionId) {
      sessionId = randomUUID();
    }
    res.setHeader("Mcp-Session-Id", sessionId);

    if (Array.isArray(body)) {
      const out: JsonRpcResponse[] = [];
      for (const message of body) {
        const reply = await this.handleSingle(message);
        if (reply) out.push(reply);
      }
      this.sendJson(res, 200, out);
      return;
    }
    const reply = await this.handleSingle(body);
    if (!reply) {
      res.statusCode = 202;
      res.end();
      return;
    }
    this.sendJson(res, 200, reply);
  }

  private async handleSingle(message: unknown): Promise<JsonRpcResponse | null> {
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
        const ctx = this.options.buildContext();
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
