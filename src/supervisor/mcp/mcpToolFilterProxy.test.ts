import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Server } from "@modelcontextprotocol/server";
import type { Tool, Transport } from "@modelcontextprotocol/server";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { createUpstreamTransport, startFilterProxy, type FilterProxy } from "./mcpToolFilterProxy";

const proxies: FilterProxy[] = [];
const clients: Client[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.allSettled([
    ...proxies.splice(0).map((proxy) => proxy.close()),
    ...clients.splice(0).map((client) => client.close()),
    ...servers.splice(0).map((server) => server.close()),
  ]);
});

interface RecordedCall {
  name: string;
  args: unknown;
}

interface UpstreamFixture {
  server: Server;
  calls: RecordedCall[];
  listCursors: (string | undefined)[];
}

const ALPHA_TOOL: Tool = {
  name: "alpha",
  description: "alpha tool",
  inputSchema: { type: "object" },
};
const DISABLED_TOOL: Tool = {
  name: "secret-beta",
  description: "disabled tool",
  inputSchema: { type: "object" },
};
const GAMMA_TOOL: Tool = {
  name: "gamma",
  description: "structured tool",
  inputSchema: { type: "object" },
  outputSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: "ui://gamma/view", visibility: ["model", "app"] } },
};
const FAILING_TOOL: Tool = {
  name: "failing",
  description: "failing tool",
  inputSchema: { type: "object" },
};

async function startUpstreamFixture(): Promise<UpstreamFixture> {
  const calls: RecordedCall[] = [];
  const listCursors: (string | undefined)[] = [];
  const server = new Server(
    { name: "upstream-fixture", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler("tools/list", async (request) => {
    const cursor = request.params?.cursor;
    listCursors.push(cursor);
    if (cursor === undefined) {
      return { tools: [ALPHA_TOOL, DISABLED_TOOL], nextCursor: "page2" };
    }
    if (cursor === "page2") {
      return { tools: [GAMMA_TOOL, FAILING_TOOL] };
    }
    throw new Error(`unexpected cursor: ${String(cursor)}`);
  });
  server.setRequestHandler("tools/call", async (request) => {
    calls.push({ name: request.params.name, args: request.params.arguments });
    if (request.params.name === "gamma") {
      return {
        content: [{ type: "text", text: "gamma-result" }],
        structuredContent: { value: "structured-gamma" },
        _meta: { upstreamMeta: 7 },
      };
    }
    if (request.params.name === "failing") {
      return { content: [{ type: "text", text: "boom" }], isError: true };
    }
    return { content: [{ type: "text", text: `echo:${request.params.name}` }] };
  });
  servers.push(server);
  return { server, calls, listCursors };
}

async function startProxyThroughMemory(options: {
  upstream: UpstreamFixture;
  disabledTools: string[];
  onDownstreamClose?: () => void;
  isolateConnectionFailures?: boolean;
}): Promise<{ proxy: FilterProxy; downstream: Client }> {
  const [proxyUpstream, fixtureSide] = InMemoryTransport.createLinkedPair();
  const [proxyDownstream, clientSide] = InMemoryTransport.createLinkedPair();
  await options.upstream.server.connect(fixtureSide as unknown as Transport);

  const proxy = await startFilterProxy({
    serverName: "filter-fixture",
    disabledTools: options.disabledTools,
    ...(options.isolateConnectionFailures ? { isolateConnectionFailures: true } : {}),
    upstreamTransport: proxyUpstream as unknown as Transport,
    downstreamTransport: proxyDownstream as unknown as Transport,
  });
  proxies.push(proxy);

  if (options.onDownstreamClose) {
    const previous = clientSide.onclose;
    const notify = options.onDownstreamClose;
    clientSide.onclose = () => {
      previous?.();
      notify();
    };
  }
  const downstream = new Client({ name: "downstream-test", version: "1.0.0" });
  await downstream.connect(clientSide);
  clients.push(downstream);
  return { proxy, downstream };
}

async function startStalledSseFixture() {
  const connected = Promise.withResolvers<void>();
  const disconnected = vi.fn<() => void>();
  const http = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(": waiting for endpoint\n\n");
    request.socket.once("close", disconnected);
    connected.resolve();
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("expected local port");
  const transport = createUpstreamTransport({
    transport: { type: "sse", url: `http://127.0.0.1:${address.port}/events`, headers: {} },
  });
  return {
    transport,
    connected: connected.promise,
    disconnected,
    async close() {
      await transport.close();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

describe("mcpToolFilterProxy", () => {
  it.each([false, true])("bounds stalled SSE startup with isolation %s", async (isolation) => {
    const fixture = await startStalledSseFixture();
    const [proxySide, clientSide] = InMemoryTransport.createLinkedPair();
    let outcome: { proxy: FilterProxy } | { error: unknown } | undefined;
    void startFilterProxy({
      serverName: "stalled-sse",
      disabledTools: [],
      isolateConnectionFailures: isolation,
      timeoutMs: 250,
      upstreamTransport: fixture.transport,
      downstreamTransport: proxySide as unknown as Transport,
    }).then(
      (proxy) => {
        proxies.push(proxy);
        outcome = { proxy };
      },
      (error: unknown) => {
        outcome = { error };
      },
    );
    try {
      await fixture.connected;
      await vi.waitFor(() => expect(outcome).toBeDefined());
      expect(outcome).toHaveProperty(isolation ? "proxy" : "error");
      let toolNames: string[] = [];
      if (isolation) {
        const downstream = new Client({ name: "sse-timeout-test", version: "1.0.0" });
        clients.push(downstream);
        await downstream.connect(clientSide);
        toolNames = (await downstream.listTools()).tools.map((tool) => tool.name);
      }
      expect(toolNames).toEqual(isolation ? ["poracode_mcp_unavailable"] : []);
      await vi.waitFor(() => expect(fixture.disconnected).toHaveBeenCalled());
    } finally {
      await fixture.close();
    }
  });

  it.each([false, true])(
    "cancels pending upstream startup on stdin EOF with isolation %s",
    async (isolation) => {
      const fixture = await startStalledSseFixture();
      const input = new PassThrough();
      const output = new PassThrough();
      const downstream = new StdioServerTransport(input, output);
      const downstreamClosed = vi.fn<() => void>();
      downstream.onclose = downstreamClosed;
      let outcome: "opened" | "closed" | undefined;
      void startFilterProxy({
        serverName: "cancelled-sse",
        disabledTools: [],
        isolateConnectionFailures: isolation,
        timeoutMs: 10000,
        upstreamTransport: fixture.transport,
        downstreamTransport: downstream,
      }).then(
        (proxy) => {
          proxies.push(proxy);
          outcome = "opened";
        },
        () => {
          outcome = "closed";
        },
      );
      try {
        await fixture.connected;
        input.end();
        await vi.waitFor(() => expect(outcome).toBe("closed"));
        expect(downstreamClosed).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(fixture.disconnected).toHaveBeenCalled());
      } finally {
        await fixture.close();
        input.destroy();
        output.destroy();
      }
    },
  );

  it("keeps MCP initialization available when an upstream returns HTTP 401", async () => {
    const http = createServer((_req, res) => {
      res
        .writeHead(401, { "Content-Type": "text/plain" })
        .end("Unauthorized private-fixture-token");
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    try {
      const address = http.address();
      if (!address || typeof address === "string") throw new Error("expected local port");
      const [proxySide, clientSide] = InMemoryTransport.createLinkedPair();
      const proxy = await startFilterProxy({
        serverName: "broken-auth",
        disabledTools: [],
        isolateConnectionFailures: true,
        upstreamTransport: createUpstreamTransport({
          transport: { type: "http", url: `http://127.0.0.1:${address.port}/mcp`, headers: {} },
        }),
        downstreamTransport: proxySide as unknown as Transport,
      });
      proxies.push(proxy);
      const downstream = new Client({ name: "failure-isolation-test", version: "1.0.0" });
      clients.push(downstream);
      await downstream.connect(clientSide);
      expect((await downstream.listTools()).tools).toMatchObject([
        { name: "poracode_mcp_unavailable", description: expect.stringContaining("broken-auth") },
      ]);
      const result = await downstream.callTool({ name: "poracode_mcp_unavailable", arguments: {} });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("private-fixture-token");
    } finally {
      http.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("preserves healthy tools, filters and results with connection isolation", async () => {
    const upstream = await startUpstreamFixture();
    const { downstream } = await startProxyThroughMemory({
      upstream,
      disabledTools: ["secret-beta"],
      isolateConnectionFailures: true,
    });
    expect((await downstream.listTools()).tools.map((tool) => tool.name)).toEqual([
      "alpha",
      "gamma",
      "failing",
    ]);
    expect(await downstream.callTool({ name: "gamma", arguments: {} })).toMatchObject({
      structuredContent: { value: "structured-gamma" },
      _meta: { upstreamMeta: 7 },
    });
    expect(await downstream.callTool({ name: "secret-beta", arguments: {} })).toMatchObject({
      isError: true,
    });
  });

  it("reports tools/list failure without dropping the agent connection", async () => {
    const upstream = await startUpstreamFixture();
    upstream.server.setRequestHandler("tools/list", async () => {
      throw new Error("fixture list failure");
    });
    const { downstream } = await startProxyThroughMemory({
      upstream,
      disabledTools: [],
      isolateConnectionFailures: true,
    });
    expect((await downstream.listTools()).tools[0]?.name).toBe("poracode_mcp_unavailable");
    expect(await downstream.callTool({ name: "alpha", arguments: {} })).toMatchObject({
      isError: true,
    });
  });

  it("reports an upstream disconnect while retaining the agent connection", async () => {
    const upstream = await startUpstreamFixture();
    const { downstream } = await startProxyThroughMemory({
      upstream,
      disabledTools: [],
      isolateConnectionFailures: true,
    });
    await downstream.listTools();
    await upstream.server.close();
    expect((await downstream.listTools()).tools[0]?.name).toBe("poracode_mcp_unavailable");
    expect(await downstream.callTool({ name: "alpha", arguments: {} })).toMatchObject({
      isError: true,
    });
  });

  it("removes disabled tools from tools/list and honours upstream pagination", async () => {
    const upstream = await startUpstreamFixture();
    const { proxy, downstream } = await startProxyThroughMemory({
      upstream,
      disabledTools: ["secret-beta"],
    });

    const listed = await downstream.listTools();

    expect(listed.tools.map((tool) => tool.name)).toEqual(["alpha", "gamma", "failing"]);
    expect(listed.tools.find((tool) => tool.name === "gamma")).toEqual(GAMMA_TOOL);
    // The two upstream pages were both fetched (v2 auto-aggregates the
    // no-cursor call page by page).
    expect(upstream.listCursors).toEqual([undefined, "page2"]);
    // Both legs negotiate the latest mutually supported version.
    expect(proxy.client.getNegotiatedProtocolVersion()).toBe("2025-11-25");
    expect(downstream.getNegotiatedProtocolVersion()).toBe("2025-11-25");
    expect(proxy.server.getNegotiatedProtocolVersion()).toBe("2025-11-25");
  });

  it("forwards tools/call and returns the upstream result unchanged", async () => {
    const upstream = await startUpstreamFixture();
    const { downstream } = await startProxyThroughMemory({
      upstream,
      disabledTools: ["secret-beta"],
    });
    await downstream.listTools();

    const gamma = await downstream.callTool({ name: "gamma", arguments: { q: 1 } });

    expect(gamma.isError ?? false).toBe(false);
    expect(gamma.content).toEqual([{ type: "text", text: "gamma-result" }]);
    expect(gamma.structuredContent).toEqual({ value: "structured-gamma" });
    expect(gamma._meta).toMatchObject({ upstreamMeta: 7 });
    expect(upstream.calls).toContainEqual({ name: "gamma", args: { q: 1 } });

    const failing = await downstream.callTool({ name: "failing", arguments: {} });

    expect(failing.isError).toBe(true);
    expect(failing.content).toEqual([{ type: "text", text: "boom" }]);
  });

  it("preserves tool call metadata alongside nested arguments", async () => {
    const upstream = await startUpstreamFixture();
    let received: unknown;
    upstream.server.setRequestHandler("tools/call", async (request) => {
      received = request.params;
      return { content: [{ type: "text", text: "ok" }] };
    });
    const { downstream } = await startProxyThroughMemory({ upstream, disabledTools: [] });
    await downstream.listTools();
    const params = {
      name: "alpha",
      arguments: { nested: { values: [1, "two", null], enabled: false } },
      _meta: { "example.com/context": { account: "one", flags: ["a", "b"] } },
    };
    await downstream.callTool(params);
    expect(received).toMatchObject(params);
  });

  it("rejects tools/call for a disabled tool without contacting upstream", async () => {
    const upstream = await startUpstreamFixture();
    const { downstream } = await startProxyThroughMemory({
      upstream,
      disabledTools: ["secret-beta"],
    });

    const result = await downstream.callTool({ name: "secret-beta", arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "Tool disabled by Poracode: secret-beta" },
    ]);
    expect(upstream.calls.some((call) => call.name === "secret-beta")).toBe(false);
  });

  it("shuts the proxy down cleanly when upstream closes", async () => {
    const upstream = await startUpstreamFixture();
    let downstreamClosed = false;
    const { proxy, downstream } = await startProxyThroughMemory({
      upstream,
      disabledTools: [],
      onDownstreamClose: () => {
        downstreamClosed = true;
      },
    });
    await downstream.listTools();

    await upstream.server.close();

    await vi.waitFor(() => expect(downstreamClosed).toBe(true));
    // Explicit close stays idempotent after the upstream-driven shutdown.
    await expect(proxy.close()).resolves.toBeUndefined();
  });

  it.each([false, true])(
    "proxies and retires a real stdio upstream with isolation %s",
    async (isolateConnectionFailures) => {
      const script = String.raw`
      let buffer = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => {
        buffer += chunk;
        for (;;) {
          const index = buffer.indexOf("\n");
          if (index < 0) break;
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          if (!line.trim()) continue;
          const message = JSON.parse(line);
          if (message.method === "initialize") {
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "stdio-fixture", version: "1" }
              }
            }) + "\n");
          } else if (message.method === "notifications/initialized") {
            // no response
          } else if (message.method === "tools/list") {
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                tools: [
                  { name: "keep", description: "", inputSchema: { type: "object" } },
                  { name: "drop", description: "", inputSchema: { type: "object" } }
                ]
              }
            }) + "\n");
          } else if (message.method === "tools/call") {
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: { content: [{ type: "text", text: "ok:" + message.params.name }] }
            }) + "\n");
          }
        }
      });
    `;
      const stdio = new StdioClientTransport({
        command: process.execPath,
        args: ["-e", script],
        env: {},
        stderr: "ignore",
      });
      const [proxyDownstream, clientSide] = InMemoryTransport.createLinkedPair();
      const proxy = await startFilterProxy({
        serverName: "stdio-filter",
        disabledTools: ["drop"],
        isolateConnectionFailures,
        upstreamTransport: stdio as unknown as Transport,
        downstreamTransport: proxyDownstream as unknown as Transport,
      });
      proxies.push(proxy);
      const downstream = new Client({ name: "downstream-stdio-test", version: "1.0.0" });
      await downstream.connect(clientSide);
      clients.push(downstream);

      const listed = await downstream.listTools();

      expect(listed.tools.map((tool) => tool.name)).toEqual(["keep"]);
      expect(proxy.client.getNegotiatedProtocolVersion()).toBe("2025-11-25");

      const result = await downstream.callTool({ name: "keep", arguments: {} });

      expect(result.content).toEqual([{ type: "text", text: "ok:keep" }]);

      const disabled = await downstream.callTool({ name: "drop", arguments: {} });

      expect(disabled.isError).toBe(true);
      expect(stdio.pid).not.toBeNull();
      await downstream.close();
      await vi.waitFor(() => expect(stdio.pid).toBeNull());
    },
  );
});
