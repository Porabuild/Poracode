import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { decodeThreadIdentity, type McpThreadIdentity } from "@/shared/browserMcpThread";
import { isLocalhostOrigin, readBoundedNodeRequestBody, writeJsonResponse } from "@/shared/http";
import {
  CHROME_MCP_INSTRUCTIONS,
  CHROME_TOOL_NAMES,
  CHROME_TOOLS,
  dispatchChromeTool,
  formatChromeToolResult,
  type ChromeToolContext,
} from "./chromeTools";
import type { ExternalChromeConnection } from "./ExternalChromeConnection";

/**
 * Streamable-HTTP MCP endpoint for the `chrome` server — the external-browser
 * sibling of {@link import("../BrowserMcpIngress").BrowserMcpIngress}. Agents
 * connect by URL + bearer token (handed over via env at launch) exactly like
 * the embedded `browser` server, so the two live side by side.
 */

export interface ChromeMcpIngressInfo {
  url: string;
  token: string;
  port: number;
}

const MAX_BODY = 1024 * 1024;
const MCP_PROTOCOL_VERSION = "2025-03-26";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export class ChromeMcpIngress {
  private server: Server | null = null;
  private readonly token = randomBytes(32).toString("hex");
  private info: ChromeMcpIngressInfo | null = null;
  private allowEval = false;
  private allowDataAccess = false;
  private getConnection: (() => ExternalChromeConnection | null) | null = null;

  setConnectionAccessor(getter: () => ExternalChromeConnection | null): void {
    this.getConnection = getter;
  }

  setAllowEval(allow: boolean): void {
    this.allowEval = allow;
  }

  setAllowDataAccess(allow: boolean): void {
    this.allowDataAccess = allow;
  }

  async start(): Promise<ChromeMcpIngressInfo> {
    if (this.info) return this.info;
    return await new Promise<ChromeMcpIngressInfo>((resolve, reject) => {
      const server = createServer((req, res) => this.handle(req, res));
      server.on("error", reject);
      // Bind 0.0.0.0 so WSL agents can reach the host via gateway IP; guarded by
      // a 256-bit bearer token regenerated per launch, same as the browser ingress.
      server.listen(0, "0.0.0.0", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        this.server = server;
        this.info = { url: `http://127.0.0.1:${port}`, token: this.token, port };
        resolve(this.info);
      });
    });
  }

  getInfo(): ChromeMcpIngressInfo | null {
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

  private buildContext(identity: McpThreadIdentity): ChromeToolContext {
    return {
      connection: this.getConnection?.() ?? null,
      allowEval: this.allowEval,
      allowDataAccess: this.allowDataAccess,
      ...(identity.threadId ? { threadId: identity.threadId } : {}),
      ...(identity.title ? { threadTitle: identity.title } : {}),
    };
  }

  private checkAuth(req: IncomingMessage): boolean {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ") && auth.slice(7).trim() === this.token) return true;
    const xToken = req.headers["x-lightcode-token"];
    return typeof xToken === "string" && xToken === this.token;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!req.url) return this.sendJson(res, 404, { error: "not found" });
      const path = new URL(req.url, "http://x").pathname;

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

      if (!this.checkAuth(req)) return this.sendJson(res, 401, { error: "unauthorized" });

      if (path === "/mcp" || path === "/mcp/") {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end();
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
    const raw = (
      await readBoundedNodeRequestBody(req, MAX_BODY, () => new Error("body too large"))
    ).toString("utf8");
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return this.sendJson(res, 400, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
    }

    let sessionId = req.headers["mcp-session-id"];
    if (Array.isArray(sessionId)) sessionId = sessionId[0];
    if (typeof sessionId !== "string" || !sessionId) sessionId = randomUUID();
    res.setHeader("Mcp-Session-Id", sessionId);

    if (Array.isArray(body)) {
      const out: JsonRpcResponse[] = [];
      for (const m of body) {
        const reply = await this.handleSingle(m, identity);
        if (reply) out.push(reply);
      }
      return this.sendJson(res, 200, out);
    }
    const reply = await this.handleSingle(body, identity);
    if (!reply) {
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
            serverInfo: { name: "chrome", version: "1.0.0" },
            instructions: CHROME_MCP_INSTRUCTIONS,
          },
        };
      }
      if (method === "notifications/initialized" || method === "initialized") return null;
      if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
      if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: CHROME_TOOLS } };
      if (method === "tools/call") {
        const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const name = String(p.name ?? "");
        const args = (p.arguments ?? {}) as Record<string, unknown>;
        if (!CHROME_TOOL_NAMES.has(name)) {
          return {
            jsonrpc: "2.0",
            id,
            result: { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] },
          };
        }
        let raw: unknown;
        try {
          raw = await dispatchChromeTool(name, args, this.buildContext(identity));
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
        return { jsonrpc: "2.0", id, result: formatChromeToolResult(raw) };
      }
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
    } catch (err) {
      return { jsonrpc: "2.0", id, error: { code: -32000, message: (err as Error).message } };
    }
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    writeJsonResponse(res, status, body, { cacheControl: "no-store" });
  }
}

function isJsonRpcRequest(
  value: unknown,
): value is { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (value as { method?: unknown }).method === "string"
  );
}
