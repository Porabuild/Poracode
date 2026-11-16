import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { readMcpAppReference } from "@/shared/contracts/mcpApps";
import { resolveWslHelpersDir } from "../wsl/wslDeploy";
import { McpAppsService } from "./McpAppsService";
import { nativeMcpRelayBinaryPath } from "./McpToolFilterService";
import { startMcpHttpRelay, type McpHttpRelay } from "./mcpHttpRelay";
import {
  MCP_HTTP_RELAY_CONFIG_ENV,
  encodeMcpHttpRelayConfig,
  type McpHttpRelayConfig,
} from "./mcpToolFilterConfig";

type Message = Record<string, unknown> & { id?: unknown; method?: string };
type RelayBackend = "js" | "native";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
});

function nativeRelayBin(): string | undefined {
  const candidates = [process.env.PORACODE_MCP_RELAY_BIN];
  const helpersDir = resolveWslHelpersDir();
  if (helpersDir) candidates.push(nativeMcpRelayBinaryPath(helpersDir));
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const relayBackends: readonly RelayBackend[] = nativeRelayBin() ? ["js", "native"] : ["js"];

function spawnNativeRelay(config: Omit<McpHttpRelayConfig, "version">): {
  input: NodeJS.WritableStream;
  output: NodeJS.ReadableStream;
  relay: McpHttpRelay;
} {
  const bin = nativeRelayBin();
  if (!bin) throw new Error("native relay binary unavailable");
  const proc = spawn(bin, [], {
    env: { ...process.env, [MCP_HTTP_RELAY_CONFIG_ENV]: encodeMcpHttpRelayConfig(config) },
    stdio: ["pipe", "pipe", "ignore"],
  });
  if (!proc.stdin || !proc.stdout) throw new Error("native relay stdio unavailable");
  let exited = false;
  proc.once("exit", () => {
    exited = true;
  });
  const closed = new Promise<void>((resolve) => {
    proc.once("close", () => resolve());
    proc.once("error", () => resolve());
  });
  const relay: McpHttpRelay = {
    closed,
    async close() {
      if (exited) return;
      proc.stdin?.end();
      const killer = setTimeout(() => proc.kill("SIGKILL"), 3000);
      try {
        await closed;
      } finally {
        clearTimeout(killer);
      }
    },
  };
  return { input: proc.stdin, output: proc.stdout, relay };
}

function relayTo(config: Omit<McpHttpRelayConfig, "version">, backend: RelayBackend = "js") {
  let input: NodeJS.WritableStream;
  let output: NodeJS.ReadableStream;
  let relay: McpHttpRelay;
  if (backend === "native") {
    ({ input, output, relay } = spawnNativeRelay(config));
  } else {
    const inputStream = new PassThrough();
    const outputStream = new PassThrough();
    input = inputStream;
    output = outputStream;
    relay = startMcpHttpRelay({
      config: { version: 1, ...config },
      input: inputStream,
      output: outputStream,
    });
  }
  cleanups.push(() => relay.close());
  const received: Message[] = [];
  const waiters: Array<() => void> = [];
  let buffered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    buffered += chunk;
    let index = buffered.indexOf("\n");
    while (index !== -1) {
      received.push(JSON.parse(buffered.slice(0, index)) as Message);
      buffered = buffered.slice(index + 1);
      index = buffered.indexOf("\n");
    }
    for (const wake of waiters.splice(0)) wake();
  });
  const send = (message: Message) => input.write(`${JSON.stringify(message)}\n`);
  const reply = async (id: unknown): Promise<Message> => {
    for (;;) {
      const found = received.find((message) => message.id === id && message.method === undefined);
      if (found) return found;
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  const request = (id: number, method: string, params: Record<string, unknown> = {}) => {
    send({ jsonrpc: "2.0", id, method, params });
    return reply(id);
  };
  const initialize = () =>
    request(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "agent", version: "1" },
    });
  return { input, relay, received, send, request, initialize };
}

describe("MCP HTTP relay to a supervisor-owned route", () => {
  const fixture: McpServer = {
    id: "fixture",
    name: "fixture",
    enabled: true,
    description: "",
    timeoutMs: 5000,
    disabledTools: ["disabled"],
    transport: {
      type: "stdio",
      command: process.execPath,
      args: [join(process.cwd(), "tests/fixtures/mcp-apps/server.mjs")],
      env: {},
    },
  };

  it.each(relayBackends)(
    "passes the provider session through unchanged and ends it on disconnect (%s)",
    async (backend) => {
      const service = new McpAppsService();
      cleanups.push(() => service.dispose());
      const [route] = await service.prepare("thread-one", [fixture], {
        kind: "posix",
        path: process.cwd(),
      });
      const endpoint = route!.directTransport!;
      const agent = relayTo(
        {
          url: endpoint.url,
          headers: endpoint.headers,
          timeoutMs: 5000,
          disabledTools: ["disabled"],
        },
        backend,
      );

      expect((await agent.initialize()).result).toMatchObject({
        serverInfo: { name: "fixture" },
        capabilities: { tools: {} },
      });
      agent.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      const tools = await agent.request(2, "tools/list");
      expect(
        (tools.result as { tools: { name: string }[] }).tools.map((tool) => tool.name),
      ).toEqual(["show_deployment", "deploy"]);
      const call = await agent.request(3, "tools/call", { name: "show_deployment", arguments: {} });
      expect(call.result).toMatchObject({
        structuredContent: { status: "BUILDING" },
        _meta: { fixture: "preserved" },
      });
      // Inline MCP App custody survives the relay: the host still resolves it.
      expect(readMcpAppReference(call.result as never)).toMatchObject({
        toolName: "show_deployment",
      });
      expect(await agent.request(4, "tools/call", { name: "disabled" })).toMatchObject({
        result: { isError: true, content: [{ text: "Tool disabled by Poracode: disabled" }] },
      });

      agent.input.end();
      await agent.relay.closed;
      // The DELETE retired the provider's connection, so its app session is gone.
      const app = readMcpAppReference(call.result as never)!;
      await expect(
        service.control({
          threadId: "thread-one",
          requestId: randomUUID(),
          app,
          action: { type: "listTools" },
        }),
      ).rejects.toThrow("session is unavailable");
    },
  );
});

describe("MCP HTTP relay transport edges", () => {
  interface Seen {
    method: string;
    headers: IncomingMessage["headers"];
    body: Message | undefined;
  }

  async function endpoint(
    handle: (seen: Seen, res: ServerResponse) => void | Promise<void>,
  ): Promise<{ url: string; seen: Seen[] }> {
    const seen: Seen[] = [];
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const entry = {
          method: req.method ?? "",
          headers: req.headers,
          body: text ? (JSON.parse(text) as Message) : undefined,
        };
        seen.push(entry);
        void handle(entry, res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    );
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, seen };
  }

  function json(res: ServerResponse, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(200, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  }

  function standard({ body, method }: Seen, res: ServerResponse): boolean {
    if (method === "DELETE" || body?.id === undefined) {
      res.writeHead(method === "DELETE" ? 200 : 202).end();
      return true;
    }
    if (body.method === "initialize") {
      json(
        res,
        {
          jsonrpc: "2.0",
          id: body.id,
          result: { protocolVersion: "2025-06-18", capabilities: {} },
        },
        { "mcp-session-id": "session-7" },
      );
      return true;
    }
    return false;
  }

  it.each(relayBackends)(
    "carries the session and negotiated protocol, and parses keepalive-padded JSON (%s)",
    async (backend) => {
      const { url, seen } = await endpoint((entry, res) => {
        if (standard(entry, res)) return;
        res.writeHead(200, { "content-type": "application/json" });
        res.write("\n\n");
        setTimeout(() => {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: entry.body!.id,
              result: {
                tools: [
                  { name: "visible", inputSchema: { type: "object" } },
                  { name: "blocked", inputSchema: { type: "object" } },
                  {
                    name: "app_only",
                    inputSchema: { type: "object" },
                    _meta: { ui: { visibility: ["app"] } },
                  },
                ],
              },
            }),
          );
        }, 20);
      });
      const agent = relayTo(
        {
          url,
          headers: { Authorization: "Bearer t" },
          timeoutMs: 5000,
          disabledTools: ["blocked"],
        },
        backend,
      );

      await agent.initialize();
      const tools = await agent.request(2, "tools/list");

      expect(
        (tools.result as { tools: { name: string }[] }).tools.map((tool) => tool.name),
      ).toEqual(["visible"]);
      const list = seen.find((entry) => entry.body?.method === "tools/list")!;
      expect(list.headers).toMatchObject({
        authorization: "Bearer t",
        "mcp-session-id": "session-7",
        "mcp-protocol-version": "2025-06-18",
      });
      expect(seen[0]!.headers["mcp-session-id"]).toBeUndefined();
    },
  );

  it.each(relayBackends)(
    "forwards client notifications only after initialize completes (%s)",
    async (backend) => {
      let answerInitialize!: () => void;
      const initializeAnswered = new Promise<void>((resolve) => {
        answerInitialize = resolve;
      });
      const { url, seen } = await endpoint(async (entry, res) => {
        if (entry.body?.method === "initialize") await initializeAnswered;
        standard(entry, res);
      });
      const agent = relayTo({ url, headers: {}, timeoutMs: 5000, disabledTools: [] }, backend);

      const initialized = agent.initialize();
      agent.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(seen.map((entry) => entry.body?.method)).toEqual(["initialize"]);
      answerInitialize();
      await initialized;
      await expect
        .poll(() => seen.map((entry) => entry.body?.method))
        .toEqual(["initialize", "notifications/initialized"]);
      expect(seen[1]!.headers["mcp-session-id"]).toBe("session-7");
    },
  );

  it.each(relayBackends)(
    "times out a request, cancels it upstream, and drops the late reply (%s)",
    async (backend) => {
      const { url, seen } = await endpoint((entry, res) => {
        if (standard(entry, res)) return;
        setTimeout(() => json(res, { jsonrpc: "2.0", id: entry.body!.id, result: {} }), 200);
      });
      const agent = relayTo({ url, headers: {}, timeoutMs: 50, disabledTools: [] }, backend);
      await agent.initialize();

      expect(await agent.request(2, "tools/call", { name: "slow" })).toEqual({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32001, message: "Request timed out" },
      });
      await expect
        .poll(() => seen.find((entry) => entry.body?.method === "notifications/cancelled")?.body)
        .toMatchObject({ params: { requestId: 2 } });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(agent.received.filter((message) => message.id === 2)).toHaveLength(1);
    },
  );

  it.each(relayBackends)(
    "releases a stalled initialize so later traffic still reaches the endpoint (%s)",
    async (backend) => {
      const { url, seen } = await endpoint((entry, res) => {
        if (entry.body?.method === "initialize") return; // never answers
        if (standard(entry, res)) return;
        json(res, { jsonrpc: "2.0", id: entry.body!.id, result: { tools: [] } });
      });
      const agent = relayTo({ url, headers: {}, timeoutMs: 50, disabledTools: [] }, backend);

      expect(await agent.initialize()).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32001, message: "Request timed out" },
      });
      // Nothing may stay queued behind the abandoned initialize.
      expect((await agent.request(2, "tools/list")).result).toEqual({ tools: [] });
      // MCP never cancels initialize; the stalled request is simply released.
      expect(seen.some((entry) => entry.body?.method === "notifications/cancelled")).toBe(false);
    },
  );

  it.each(relayBackends)(
    "forwards client cancellation and never answers the cancelled request (%s)",
    async (backend) => {
      const { url, seen } = await endpoint((entry, res) => {
        if (standard(entry, res)) return;
        setTimeout(() => json(res, { jsonrpc: "2.0", id: entry.body!.id, result: {} }), 100);
      });
      const agent = relayTo({ url, headers: {}, timeoutMs: 5000, disabledTools: [] }, backend);
      await agent.initialize();

      agent.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "slow" } });
      await expect.poll(() => seen.some((entry) => entry.body?.id === 2)).toBe(true);
      agent.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 2 } });

      await expect
        .poll(() => seen.find((entry) => entry.body?.method === "notifications/cancelled")?.body)
        .toMatchObject({ params: { requestId: 2 } });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(agent.received.some((message) => message.id === 2)).toBe(false);
    },
  );

  it.each(relayBackends)(
    "answers requests with JSON-RPC errors when the endpoint fails (%s)",
    async (backend) => {
      const { url } = await endpoint((entry, res) => {
        if (standard(entry, res)) return;
        res.writeHead(500).end("boom");
      });
      const agent = relayTo({ url, headers: {}, timeoutMs: 5000, disabledTools: [] }, backend);
      await agent.initialize();

      expect(await agent.request(2, "tools/list")).toEqual({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32603, message: "MCP server responded with HTTP 500" },
      });
    },
  );

  it.each(relayBackends)(
    "ends the endpoint session when the client disconnects (%s)",
    async (backend) => {
      const { url, seen } = await endpoint((entry, res) => {
        standard(entry, res);
      });
      const agent = relayTo(
        {
          url,
          headers: { Authorization: "Bearer t" },
          timeoutMs: 5000,
          disabledTools: [],
        },
        backend,
      );
      await agent.initialize();

      agent.input.end();
      await agent.relay.closed;

      expect(seen.at(-1)).toMatchObject({
        method: "DELETE",
        headers: { authorization: "Bearer t", "mcp-session-id": "session-7" },
      });
    },
  );
});
