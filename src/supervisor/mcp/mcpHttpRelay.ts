import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import type { Readable, Writable } from "node:stream";
import { isMcpToolVisibleTo } from "@/shared/mcpAppResources";
import type { McpHttpRelayConfig } from "./mcpToolFilterConfig";

/**
 * Stdio <-> Streamable HTTP relay for a Poracode-served MCP endpoint.
 *
 * The endpoint already applies the server's tool policy and owns the MCP
 * session, so messages pass through unchanged instead of being re-negotiated
 * by an SDK client/server pair. Keeping the MCP SDK and schema validation out
 * of this process is what keeps one relay per server per agent session cheap.
 */

// Matches the MCP SDK's stdio transport limit.
const MAX_LINE_CHARS = 10 * 1024 * 1024;
const DELETE_TIMEOUT_MS = 1_000;

type JsonRpcId = string | number;

interface JsonRpcMessage {
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
}

interface PendingRequest {
  readonly method: string;
  readonly controller: AbortController;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface HttpResult {
  status: number;
  contentType: string;
  body: string;
}

export interface McpHttpRelay {
  /** Settles after the client disconnected (or `close`) and cleanup finished. */
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number";
}

function headerValue(response: IncomingMessage, name: string): string | undefined {
  const value = response.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseMessages({ contentType, body }: HttpResult): JsonRpcMessage[] {
  if (contentType.includes("text/event-stream")) {
    const messages: JsonRpcMessage[] = [];
    for (const event of body.split(/\r?\n\r?\n/u)) {
      const data = event
        .split(/\r?\n/u)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /u, ""))
        .join("\n");
      if (data.trim()) messages.push(JSON.parse(data) as JsonRpcMessage);
    }
    return messages;
  }
  // JSON responses may be preceded by keepalive whitespace for long tool calls.
  const text = body.trim();
  if (!text) return [];
  const parsed = JSON.parse(text) as JsonRpcMessage | JsonRpcMessage[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function startMcpHttpRelay(options: {
  config: McpHttpRelayConfig;
  input: Readable;
  output: Writable;
}): McpHttpRelay {
  const { config, input, output } = options;
  const url = new URL(config.url);
  const secure = url.protocol === "https:";
  // Requests are sporadic; a reused socket can race the server's keep-alive
  // close and fail a tool call, while a fresh loopback connection is cheap.
  const agent = secure ? new HttpsAgent({ keepAlive: false }) : new HttpAgent({ keepAlive: false });
  const send = secure ? httpsRequest : httpRequest;
  const disabledTools = new Set(config.disabledTools);
  const pending = new Map<JsonRpcId, PendingRequest>();
  let sessionId: string | undefined;
  let protocolVersion: string | undefined;
  // Every other message needs the session id the initialize response carries.
  let initialized: Promise<void> = Promise.resolve();
  let closing: Promise<void> | undefined;
  let settleClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    settleClosed = resolve;
  });

  const write = (message: unknown) => {
    if (!closing) output.write(`${JSON.stringify(message)}\n`);
  };
  const fail = (id: JsonRpcId, code: number, message: string) =>
    write({ jsonrpc: "2.0", id, error: { code, message } });

  function sessionHeaders(): Record<string, string> {
    return {
      ...config.headers,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
    };
  }

  function post(body: string, signal?: AbortSignal): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
      const request = send(
        url,
        {
          method: "POST",
          agent,
          ...(signal ? { signal } : {}),
          headers: {
            ...sessionHeaders(),
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "content-length": Buffer.byteLength(body),
          },
        },
        (response) => {
          sessionId ??= headerValue(response, "mcp-session-id");
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("error", reject);
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              contentType: headerValue(response, "content-type") ?? "",
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          // An aborted or reset response is not guaranteed an "error" event.
          response.on("close", () => {
            if (!response.complete) reject(new Error("MCP server response was interrupted"));
          });
        },
      );
      request.on("error", reject);
      request.end(body);
    });
  }

  function settle(id: JsonRpcId): PendingRequest | undefined {
    const request = pending.get(id);
    if (!request) return undefined;
    pending.delete(id);
    clearTimeout(request.timer);
    return request;
  }

  function deliver(message: JsonRpcMessage): void {
    if (message.method === undefined && isJsonRpcId(message.id)) {
      const request = settle(message.id);
      // Late responses after a timeout or cancellation are not delivered.
      if (!request) return;
      const result = message.result as Record<string, unknown> | undefined;
      if (request.method === "initialize" && typeof result?.protocolVersion === "string") {
        protocolVersion = result.protocolVersion;
      }
      if (request.method === "tools/list" && Array.isArray(result?.tools)) {
        message = {
          ...message,
          result: {
            ...result,
            tools: (result.tools as { name?: unknown; _meta?: Record<string, unknown> }[]).filter(
              (tool) =>
                !(typeof tool.name === "string" && disabledTools.has(tool.name)) &&
                isMcpToolVisibleTo(tool, "model"),
            ),
          },
        };
      }
    }
    write(message);
  }

  /** Notifications and responses to server requests: no reply is owed. */
  function forward(line: string): Promise<void> {
    return initialized
      .then(() => (closing ? undefined : post(line)))
      .then((result) => {
        if (result && result.status < 300)
          for (const message of parseMessages(result)) deliver(message);
      })
      .catch(() => undefined);
  }

  /** Cancel upstream first, then release the abandoned HTTP request. */
  function cancel(request: PendingRequest, line: string): void {
    // MCP never cancels initialize, and anything forwarded now would queue behind it.
    if (request.method === "initialize") return request.controller.abort();
    void forward(line).finally(() => request.controller.abort());
  }

  function timeOut(id: JsonRpcId): void {
    const request = settle(id);
    if (!request) return;
    cancel(
      request,
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: id, reason: "Request timed out" },
      }),
    );
    fail(id, -32001, "Request timed out");
  }

  async function dispatch(id: JsonRpcId, entry: PendingRequest, line: string): Promise<void> {
    if (entry.method !== "initialize") await initialized;
    if (pending.get(id) !== entry || closing) return;
    try {
      const result = await post(line, entry.controller.signal);
      if (result.status >= 300) {
        if (settle(id)) fail(id, -32603, `MCP server responded with HTTP ${result.status}`);
        return;
      }
      for (const message of parseMessages(result)) deliver(message);
      if (pending.get(id) === entry) {
        settle(id);
        fail(id, -32603, "MCP server returned no response");
      }
    } catch (error) {
      if (pending.get(id) !== entry) return;
      settle(id);
      fail(id, -32603, error instanceof Error ? error.message : "MCP server request failed");
    }
  }

  function receiveRequest(id: JsonRpcId, method: string, params: unknown, line: string): void {
    if (method === "tools/call") {
      const name = (params as { name?: unknown } | undefined)?.name;
      if (typeof name === "string" && disabledTools.has(name)) {
        write({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [{ type: "text", text: `Tool disabled by Poracode: ${name}` }],
          },
        });
        return;
      }
    }
    settle(id)?.controller.abort();
    const entry: PendingRequest = {
      method,
      controller: new AbortController(),
      timer: setTimeout(() => timeOut(id), config.timeoutMs),
    };
    pending.set(id, entry);
    const dispatched = dispatch(id, entry, line);
    if (method === "initialize") initialized = dispatched;
  }

  function receive(line: string): void {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    if (typeof message.method === "string" && isJsonRpcId(message.id)) {
      receiveRequest(message.id, message.method, message.params, line);
      return;
    }
    if (message.method === "notifications/cancelled") {
      const requestId = (message.params as { requestId?: unknown } | undefined)?.requestId;
      const request = isJsonRpcId(requestId) ? settle(requestId) : undefined;
      if (request) cancel(request, line);
      else void forward(line);
      return;
    }
    void forward(line);
  }

  function deleteSession(): Promise<void> {
    return new Promise((resolve) => {
      const request = send(
        url,
        { method: "DELETE", agent, headers: sessionHeaders(), timeout: DELETE_TIMEOUT_MS },
        (response) => {
          response.resume();
          response.on("close", () => resolve());
          response.on("error", () => resolve());
        },
      );
      request.on("timeout", () => request.destroy());
      request.on("error", () => resolve());
      request.end();
    });
  }

  let buffer = "";
  const onData = (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/u, "");
      buffer = buffer.slice(index + 1);
      if (line.trim()) receive(line);
      index = buffer.indexOf("\n");
    }
    if (buffer.length > MAX_LINE_CHARS) void close();
  };

  function close(): Promise<void> {
    closing ??= (async () => {
      input.off("data", onData);
      buffer = "";
      for (const id of [...pending.keys()]) settle(id)?.controller.abort();
      if (sessionId) await deleteSession();
      agent.destroy();
    })().finally(settleClosed);
    return closing;
  }
  const onEnd = () => void close();

  input.setEncoding("utf8");
  input.on("data", onData);
  input.once("end", onEnd);
  input.on("error", onEnd);
  output.on("error", onEnd);
  return { closed, close };
}
