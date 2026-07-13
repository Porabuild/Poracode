import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import type { SubagentMcpHttpConfig } from "@/supervisor/agents/subagentMcp";
import type { OrchestratorThreadManager } from "./OrchestratorThreadManager";
import type { SubagentRunManager } from "./SubagentRunManager";
import { buildSubagentInstructions, dispatchTool, isKnownToolName, TOOLS } from "./toolRegistry";
import { errorResult } from "./toolResult";
import type { SpawnableAgent } from "./types";

export interface SubagentMcpIngressInfo {
  url: string;
  port: number;
}

export interface SubagentMcpIngressDeps {
  runManager: SubagentRunManager;
  /** Orchestrator lane: create/manage first-class child threads. */
  orchestrator: OrchestratorThreadManager;
  /** Catalog of installed + authenticated agents the caller may spawn. */
  getSpawnableAgents: () => Promise<SpawnableAgent[]>;
  /** Optional user-provided routing guide appended to the MCP instructions (phase 3). */
  getRoutingGuide?: () => string | undefined;
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

/**
 * Single in-process MCP server hosted in the supervisor. Speaks Streamable-HTTP
 * MCP at `POST /mcp` (JSON-RPC body, single JSON response). Unlike the browser
 * ingress, auth is PER-THREAD: each thread that opts into subagents mints its
 * own 256-bit bearer token, and `tools/call` resolves the caller's parent
 * thread from that token so spawned children attach to the right parent.
 *
 * Bind address: `127.0.0.1` everywhere except Windows, where we bind `0.0.0.0`
 * so an agent launched inside a WSL distro can reach this host ingress over the
 * WSL2 NAT gateway IP (a distro's loopback can't hit the host's `127.0.0.1`).
 * This mirrors `BrowserMcpIngress`'s posture. Tradeoff: on Windows the port is
 * reachable from any interface, so the per-thread 256-bit bearer token is the
 * security boundary — every request must present a token that maps to a
 * registered parent thread (see `resolveThreadId`). We keep the tighter
 * loopback bind on macOS/Linux since WSL only exists on Windows.
 */
export class SubagentMcpIngress {
  private server: Server | null = null;
  private info: SubagentMcpIngressInfo | null = null;
  private readonly tokenToThread = new Map<string, string>();
  private readonly threadToToken = new Map<string, string>();
  private readonly disabledToolsByThread = new Map<string, Set<string>>();

  constructor(private readonly deps: SubagentMcpIngressDeps) {}

  async start(): Promise<SubagentMcpIngressInfo> {
    if (this.info) return this.info;
    return await new Promise<SubagentMcpIngressInfo>((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res);
      });
      server.on("error", reject);
      // See the class doc comment: 0.0.0.0 on Windows for WSL reach-through,
      // loopback elsewhere. Bearer-token auth is the security boundary.
      const bindHost = process.platform === "win32" ? "0.0.0.0" : "127.0.0.1";
      server.listen(0, bindHost, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        this.server = server;
        this.info = { url: `http://127.0.0.1:${port}`, port };
        resolve(this.info);
      });
    });
  }

  getInfo(): SubagentMcpIngressInfo | null {
    return this.info;
  }

  /**
   * Register (or re-register) a parent thread. Mints a token on first call and
   * reuses it thereafter. Returns the ready-to-use MCP http config; returns
   * `undefined` before the server has bound a port.
   */
  registerThread(
    threadId: string,
    disabledTools: readonly string[] = [],
  ): SubagentMcpHttpConfig | undefined {
    if (!this.info) return undefined;
    let token = this.threadToToken.get(threadId);
    if (!token) {
      token = randomBytes(32).toString("hex");
      this.threadToToken.set(threadId, token);
      this.tokenToThread.set(token, threadId);
    }
    this.disabledToolsByThread.set(threadId, new Set(disabledTools));
    return {
      url: `${this.info.url.replace(/\/$/, "")}/mcp`,
      token,
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  unregisterThread(threadId: string): void {
    const token = this.threadToToken.get(threadId);
    if (token) this.tokenToThread.delete(token);
    this.threadToToken.delete(threadId);
    this.disabledToolsByThread.delete(threadId);
  }

  dispose(): void {
    this.tokenToThread.clear();
    this.threadToToken.clear();
    this.disabledToolsByThread.clear();
    try {
      this.server?.closeAllConnections?.();
    } catch {}
    try {
      this.server?.close();
    } catch {}
    this.server = null;
  }

  private resolveThreadId(req: IncomingMessage): string | null {
    const auth = req.headers.authorization;
    let token: string | undefined;
    if (auth && auth.startsWith("Bearer ")) {
      token = auth.slice(7).trim();
    } else {
      const xToken = req.headers["x-lightcode-token"];
      if (typeof xToken === "string") token = xToken;
    }
    if (!token) return null;
    return this.tokenToThread.get(token) ?? null;
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

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!req.url) {
        this.sendJson(res, 404, { error: "not found" });
        return;
      }
      const path = new URL(req.url, "http://x").pathname;

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      const threadId = this.resolveThreadId(req);
      if (!threadId) {
        this.sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      if (path === "/mcp" || path === "/mcp/") {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end();
          return;
        }
        await this.handleMcp(req, res, threadId);
        return;
      }

      this.sendJson(res, 404, { error: "not found" });
    } catch (err) {
      this.sendJson(res, 500, { error: (err as Error).message ?? "internal" });
    }
  }

  private async handleMcp(
    req: IncomingMessage,
    res: ServerResponse,
    threadId: string,
  ): Promise<void> {
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
    if (typeof sessionId !== "string" || !sessionId) sessionId = randomUUID();
    res.setHeader("Mcp-Session-Id", sessionId);

    if (Array.isArray(body)) {
      const out: JsonRpcResponse[] = [];
      for (const message of body) {
        const reply = await this.handleSingle(message, threadId);
        if (reply) out.push(reply);
      }
      this.sendJson(res, 200, out);
      return;
    }
    const reply = await this.handleSingle(body, threadId);
    if (!reply) {
      res.statusCode = 202;
      res.end();
      return;
    }
    this.sendJson(res, 200, reply);
  }

  private async handleSingle(message: unknown, threadId: string): Promise<JsonRpcResponse | null> {
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
            serverInfo: { name: "subagents", version: "1.0.0" },
            instructions: buildSubagentInstructions(this.deps.getRoutingGuide?.()),
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
        const disabled = this.disabledToolsByThread.get(threadId) ?? new Set<string>();
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS.filter((tool) => !disabled.has(tool.name)) },
        };
      }
      if (method === "tools/call") {
        const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const name = String(p.name ?? "");
        const args = (p.arguments ?? {}) as Record<string, unknown>;
        if (this.disabledToolsByThread.get(threadId)?.has(name)) {
          return { jsonrpc: "2.0", id, result: errorResult(`Tool disabled by Poracode: ${name}`) };
        }
        if (!isKnownToolName(name)) {
          return { jsonrpc: "2.0", id, result: errorResult(`Unknown tool: ${name}`) };
        }
        const result = await dispatchTool(name, args, {
          parentThreadId: threadId,
          runManager: this.deps.runManager,
          orchestrator: this.deps.orchestrator,
          listSpawnableAgents: this.deps.getSpawnableAgents,
        });
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
