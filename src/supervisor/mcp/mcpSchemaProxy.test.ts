import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { Server, type Tool, type Transport } from "@modelcontextprotocol/server";
import { startSchemaProxy } from "./mcpSchemaProxy";
import { createUpstreamTransport } from "./mcpToolFilterProxy";
import { createServer } from "node:http";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map((close) => close()));
});

async function fixture(
  options: { inputSchema?: Tool["inputSchema"]; maxSchemaDepth?: number } = {},
) {
  const upstream = new Server(
    { name: "original-server", version: "1" },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
      },
    },
  );
  upstream.setRequestHandler("tools/list", async () => ({
    tools: [
      {
        name: "fixture",
        inputSchema: options.inputSchema ?? {
          type: "object",
          properties: { email: { type: "string", pattern: "[" } },
        },
        _meta: { fixture: true },
      },
    ],
  }));
  upstream.setRequestHandler("resources/list", async () => ({
    resources: [{ uri: "fixture://marker", name: "marker" }],
  }));
  upstream.setRequestHandler("resources/templates/list", async () => ({
    resourceTemplates: [{ uriTemplate: "fixture://{marker}", name: "marker" }],
  }));
  upstream.setRequestHandler("resources/read", async () => ({
    contents: [{ uri: "fixture://marker", mimeType: "text/plain", text: "RESOURCE_OK" }],
  }));
  upstream.setRequestHandler("prompts/list", async () => ({ prompts: [{ name: "marker" }] }));
  upstream.setRequestHandler("prompts/get", async () => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: "PROMPT_OK" } }],
  }));
  const [upstreamTransport, serverSide] = InMemoryTransport.createLinkedPair();
  const [downstreamTransport, clientSide] = InMemoryTransport.createLinkedPair();
  await upstream.connect(serverSide);
  const proxy = await startSchemaProxy({
    upstreamTransport,
    downstreamTransport,
    timeoutMs: 1000,
    ...(options.maxSchemaDepth !== undefined ? { maxSchemaDepth: options.maxSchemaDepth } : {}),
  });
  const client = new Client(
    { name: "original-client", version: "1" },
    { capabilities: { roots: { listChanged: true } } },
  );
  client.setRequestHandler("roots/list", async () => ({
    roots: [{ uri: "file:///fixture", name: "fixture" }],
  }));
  cleanups.push(
    () => client.close(),
    () => proxy.close(),
    () => upstream.close(),
  );
  await client.connect(clientSide);
  return { client, upstream };
}

describe("schema-only MCP protocol proxy", () => {
  it("limits deep tool schemas while forwarding arguments unchanged", async () => {
    let nested: unknown = { type: "string" };
    for (let i = 0; i < 11; i += 1) nested = { type: "object", properties: { x: nested } };
    const { client, upstream } = await fixture({
      inputSchema: nested as Tool["inputSchema"],
      maxSchemaDepth: 10,
    });
    const listed = (await client.listTools()).tools[0]!;
    expect(listed.description).toContain(JSON.stringify(nested));
    expect(listed.inputSchema).not.toEqual(nested);
    let received: unknown;
    upstream.setRequestHandler("tools/call", async (request) => {
      received = request.params.arguments;
      return { content: [{ type: "text", text: "ok" }] };
    });
    const args = { x: { x: { marker: "original" } } };
    await client.callTool({ name: "fixture", arguments: args });
    expect(received).toEqual(args);
  });

  it("normalizes only tool schemas and preserves capabilities, resources, prompts and reverse requests", async () => {
    const { client, upstream } = await fixture();
    expect(client.getServerVersion()).toEqual({ name: "original-server", version: "1" });
    expect(client.getServerCapabilities()).toMatchObject({
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
    });
    expect((await client.listTools()).tools[0]).toMatchObject({
      inputSchema: { properties: { email: { type: "string" } } },
      _meta: { fixture: true },
    });
    expect((await client.listTools()).tools[0]?.inputSchema.properties?.email).not.toHaveProperty(
      "pattern",
    );
    expect((await client.listResources()).resources).toEqual([
      { uri: "fixture://marker", name: "marker" },
    ]);
    expect((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate).toBe(
      "fixture://{marker}",
    );
    expect((await client.readResource({ uri: "fixture://marker" })).contents[0]).toMatchObject({
      text: "RESOURCE_OK",
    });
    expect((await client.listPrompts()).prompts[0]?.name).toBe("marker");
    expect((await client.getPrompt({ name: "marker" })).messages[0]?.content).toMatchObject({
      text: "PROMPT_OK",
    });
    expect((await upstream.listRoots()).roots).toEqual([
      { uri: "file:///fixture", name: "fixture" },
    ]);
    const changed = vi.fn<() => void>();
    client.setNotificationHandler("notifications/resources/list_changed", changed);
    await upstream.notification({ method: "notifications/resources/list_changed" });
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce());
  });

  it("forwards cancellation to an active upstream tool request", async () => {
    const { client, upstream } = await fixture();
    let started = false;
    let cancelled = false;
    upstream.setRequestHandler(
      "tools/call",
      (_request, extra) =>
        new Promise((resolve) => {
          started = true;
          extra.mcpReq.signal.addEventListener(
            "abort",
            () => {
              cancelled = true;
              resolve({ content: [{ type: "text", text: "cancelled" }], isError: true });
            },
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const rejected = client.callTool(
      { name: "fixture", arguments: {} },
      { signal: controller.signal },
    );
    void rejected.catch(() => undefined);
    await vi.waitFor(() => expect(started).toBe(true));
    controller.abort();
    await expect(rejected).rejects.toThrow(/abort/i);
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it("observes downstream EOF during slow startup and closes a late upstream", async () => {
    const late = Promise.withResolvers<void>();
    const upstream: Transport = {
      start: vi.fn<() => Promise<void>>(() => late.promise),
      send: vi.fn<Transport["send"]>(async () => {}),
      close: vi.fn<() => Promise<void>>(async () => {}),
    };
    const downstream: Transport = {
      start: vi.fn<() => Promise<void>>(async () => {}),
      send: vi.fn<Transport["send"]>(async () => {}),
      close: vi.fn<() => Promise<void>>(async () => {}),
    };
    const opening = startSchemaProxy({
      upstreamTransport: upstream,
      downstreamTransport: downstream,
      timeoutMs: 1000,
    });
    void opening.catch(() => undefined);
    await vi.waitFor(() => expect(upstream.start).toHaveBeenCalledOnce());
    downstream.onclose?.();
    await expect(opening).rejects.toThrow("closed during startup");
    late.resolve();
    await vi.waitFor(() => expect(upstream.close).toHaveBeenCalledTimes(2));
    expect(downstream.close).toHaveBeenCalledTimes(2);
  });

  it("carries the selected protocol version to transports and refuses unsupported peers", async () => {
    const upstream: Transport = {
      start: async () => {},
      send: vi.fn<Transport["send"]>(async () => {}),
      close: vi.fn<() => Promise<void>>(async () => {}),
      setProtocolVersion: vi.fn<(version: string) => void>(),
    };
    const downstream: Transport = {
      start: async () => {},
      send: vi.fn<Transport["send"]>(async () => {}),
      close: vi.fn<() => Promise<void>>(async () => {}),
      setProtocolVersion: vi.fn<(version: string) => void>(),
    };
    const proxy = await startSchemaProxy({
      upstreamTransport: upstream,
      downstreamTransport: downstream,
      timeoutMs: 1000,
    });
    cleanups.push(() => proxy.close());
    downstream.onmessage?.({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    upstream.onmessage?.({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05" } });
    expect(upstream.setProtocolVersion).toHaveBeenCalledWith("2024-11-05");
    expect(downstream.setProtocolVersion).toHaveBeenCalledWith("2024-11-05");
    downstream.onmessage?.({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} });
    upstream.onmessage?.({
      jsonrpc: "2.0",
      id: 2,
      result: { protocolVersion: "unsupported-future" },
    });
    await vi.waitFor(() => expect(upstream.close).toHaveBeenCalledOnce());
    expect(downstream.send).toHaveBeenCalledTimes(1);
  });
});

it("waits for HTTP initialization acceptance without blocking queued or active cancellation", async () => {
  let initialized = false;
  let releaseInitialized!: () => void;
  const acceptInitialized = new Promise<void>((resolve) => {
    releaseInitialized = resolve;
  });
  const initializedReceived = Promise.withResolvers<void>();
  let toolCalls = 0;
  let cancelled = false;
  const pending = new Map<string | number, import("node:http").ServerResponse>();
  const http = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const message = JSON.parse(body) as {
        id?: string | number;
        method: string;
        params?: { requestId?: string | number };
      };
      const reply = (result: unknown) => {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
      };
      if (message.method === "initialize") {
        reply({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "http-fixture", version: "1" },
        });
        return;
      }
      if (message.method === "notifications/initialized") {
        initializedReceived.resolve();
        void acceptInitialized.then(() => {
          initialized = true;
          res.writeHead(202).end();
        });
        return;
      }
      if (!initialized) {
        res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32000, message: "notInitialized" },
          }),
        );
        return;
      }
      if (message.method === "tools/list") {
        reply({ tools: [{ name: "fixture", inputSchema: { type: "object" } }] });
        return;
      }
      if (message.method === "tools/call" && message.id !== undefined) {
        toolCalls += 1;
        pending.set(message.id, res);
        return;
      }
      if (message.method === "notifications/cancelled") {
        const id = message.params?.requestId;
        const target = id === undefined ? undefined : pending.get(id);
        if (target) {
          cancelled = true;
          target
            .writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [], isError: true } }));
        }
        res.writeHead(202).end();
        return;
      }
      res.writeHead(202).end();
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw Error("No fixture port");
  cleanups.push(async () => {
    releaseInitialized();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  const upstream = createUpstreamTransport({
    transport: { type: "http", url: `http://127.0.0.1:${address.port}/mcp`, headers: {} },
  });
  const [downstream, clientSide] = InMemoryTransport.createLinkedPair();
  const proxy = await startSchemaProxy({
    upstreamTransport: upstream,
    downstreamTransport: downstream,
    timeoutMs: 1000,
  });
  const client = new Client({ name: "stdio-peer", version: "1" });
  cleanups.push(
    () => client.close(),
    () => proxy.close(),
  );
  await client.connect(clientSide);
  await initializedReceived.promise;
  const queuedAbort = new AbortController();
  const rejected = client.callTool(
    { name: "fixture", arguments: {} },
    { signal: queuedAbort.signal },
  );
  void rejected.catch(() => undefined);
  queuedAbort.abort();
  await expect(rejected).rejects.toThrow(/abort/i);
  const listing = client.listTools();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(initialized).toBe(false);
  releaseInitialized();
  expect((await listing).tools[0]?.name).toBe("fixture");
  expect(toolCalls).toBe(0);
  const activeAbort = new AbortController();
  const activeRejected = client.callTool(
    { name: "fixture", arguments: {} },
    { signal: activeAbort.signal },
  );
  void activeRejected.catch(() => undefined);
  await vi.waitFor(() => expect(toolCalls).toBe(1));
  activeAbort.abort();
  await expect(activeRejected).rejects.toThrow(/abort/i);
  await vi.waitFor(() => expect(cancelled).toBe(true));
});
