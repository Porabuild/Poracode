import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@/shared/contracts";
import { readMcpAppReference, type McpAppReference } from "@/shared/contracts/mcpApps";
import { McpAppsService } from "./McpAppsService";
import * as filterProxy from "./mcpToolFilterProxy";

const services: McpAppsService[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(services.splice(0).map((service) => service.dispose()));
  vi.restoreAllMocks();
});

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

async function connect(service: McpAppsService, threadId: string) {
  const [server] = await service.prepare(threadId, [fixture], {
    kind: "posix",
    path: process.cwd(),
  });
  if (server!.transport.type !== "http") throw new Error("Expected host proxy");
  const transport = new StreamableHTTPClientTransport(new URL(server!.transport.url), {
    requestInit: { headers: server!.transport.headers },
  });
  const client = new Client({ name: "provider-fixture", version: "1" });
  clients.push(client);
  await client.connect(transport);
  return { client, transport, server: server! };
}

function payload(threadId: string, app: McpAppReference) {
  return { threadId, app, requestId: randomUUID() };
}

describe("MCP Apps host custody", () => {
  it("forwards WSL MCP credentials through environment rather than argv", async () => {
    const create = filterProxy.createUpstreamTransport;
    const upstream = vi
      .spyOn(filterProxy, "createUpstreamTransport")
      .mockImplementationOnce(() => create(fixture));
    const service = new McpAppsService({ resolveHostAccess: async () => ({ kind: "loopback" }) });
    services.push(service);
    const [server] = await service.prepare(
      "wsl-thread",
      [
        {
          ...fixture,
          transport: {
            type: "stdio",
            command: "fixture-server",
            args: ["--serve"],
            env: { API_TOKEN: "private-fixture-value" },
          },
        },
      ],
      {
        kind: "wsl",
        distro: "fixture-distro",
        linuxPath: "/project",
        uncPath: "\\\\wsl.localhost\\fixture-distro\\project",
      },
    );
    if (server!.transport.type !== "http") throw new Error("Expected proxy");
    const client = new Client({ name: "provider-fixture", version: "1" });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server!.transport.url), {
        requestInit: { headers: server!.transport.headers },
      }),
    );
    const config = upstream.mock.calls[0]![0].transport;
    expect(config).toMatchObject({
      type: "stdio",
      args: ["-d", "fixture-distro", "--cd", "/project", "--exec", "fixture-server", "--serve"],
      env: { API_TOKEN: "private-fixture-value", WSLENV: expect.stringContaining("API_TOKEN") },
    });
    if (config.type !== "stdio") throw new Error("Expected stdio");
    expect(config.args.join(" ")).not.toContain("private-fixture-value");
  });

  it("retires a connection when upstream transport construction fails synchronously", async () => {
    vi.spyOn(filterProxy, "createUpstreamTransport").mockImplementationOnce(() => {
      throw new Error("fixture constructor failure");
    });
    const service = new McpAppsService();
    services.push(service);
    await expect(connect(service, "failed-thread")).rejects.toThrow(/502|closed|failed/iu);
    await service.releaseThread("failed-thread");
    await service.dispose();
  });

  it("serves a live deployment card and incremental logs over the provider's connection", async () => {
    const service = new McpAppsService();
    services.push(service);
    const { client } = await connect(service, "thread-one");
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "show_deployment",
      "deploy",
    ]);
    const result = await client.callTool({ name: "show_deployment", arguments: {} });
    const app = readMcpAppReference(result)!;
    expect(app).toMatchObject({
      version: 1,
      toolName: "show_deployment",
      resourceUri: "ui://fixture/deployment",
    });
    expect(result).toMatchObject({
      structuredContent: { status: "BUILDING" },
      _meta: { fixture: "preserved" },
    });
    const resource = await service.control({
      ...payload("thread-one", app),
      action: { type: "readResource" },
    });
    expect(resource.result).toMatchObject({
      contents: [
        {
          uri: app.resourceUri,
          text: expect.stringContaining("ui/initialize"),
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    });
    const tools = await service.control({
      ...payload("thread-one", app),
      action: { type: "listTools" },
    });
    expect(tools.result).toMatchObject({
      tools: [
        { name: "show_deployment" },
        { name: "refresh_deployment" },
        { name: "read_build_logs" },
      ],
    });
    const refreshed = await service.control({
      ...payload("thread-one", app),
      action: { type: "callTool", name: "refresh_deployment", arguments: { id: "deployment-1" } },
    });
    expect(refreshed.result).toMatchObject({
      structuredContent: { status: "READY", url: "https://example.com/deployment" },
    });
    const logs = await service.control({
      ...payload("thread-one", app),
      action: { type: "callTool", name: "read_build_logs", arguments: { since: 2 } },
    });
    expect(logs.result).toMatchObject({
      structuredContent: { entries: ["Build complete"], latestAt: 3 },
    });
    // A new connection would still be BUILDING; the app changed the provider's own session.
    expect(await client.callTool({ name: "show_deployment" })).toMatchObject({
      structuredContent: { status: "READY" },
    });
    await service.control({
      ...payload("thread-one", app),
      action: { type: "updateModelContext", content: [{ type: "text", text: "Deployment READY" }] },
    });
    expect(service.modelContext("thread-one")).toContain("Deployment READY");
    expect(service.modelContext("thread-two")).toBeUndefined();
    await service.control({
      ...payload("thread-one", app),
      action: { type: "updateModelContext", structuredContent: { status: "ERROR" } },
    });
    expect(service.modelContext("thread-one")).not.toContain("Deployment READY");
    expect(service.modelContext("thread-one")).toContain('"status":"ERROR"');
    await service.releaseThread("thread-one");
    expect(service.modelContext("thread-one")).toBeUndefined();
  });

  it("refuses cross-thread, forged, model-only, disabled and retired app requests", async () => {
    const service = new McpAppsService();
    services.push(service);
    const { client, transport, server } = await connect(service, "thread-one");
    const app = readMcpAppReference(await client.callTool({ name: "show_deployment" }))!;
    for (const name of ["deploy", "disabled", "missing"]) {
      await expect(
        service.control({ ...payload("thread-one", app), action: { type: "callTool", name } }),
      ).rejects.toThrow("MCP App request failed");
    }
    for (const request of [
      payload("thread-two", app),
      payload("thread-one", { ...app, sessionId: randomUUID() }),
      payload("thread-one", { ...app, toolName: "deploy" }),
      payload("thread-one", { ...app, resourceUri: "ui://other" }),
    ])
      await expect(service.control({ ...request, action: { type: "listTools" } })).rejects.toThrow(
        "session is unavailable",
      );
    if (server.transport.type !== "http") throw new Error("Expected HTTP");
    expect((await fetch(server.transport.url, { method: "POST" })).status).toBe(401);
    expect(
      (
        await fetch(server.transport.url, {
          headers: { ...server.transport.headers, Origin: "https://untrusted.test" },
        })
      ).status,
    ).toBe(403);
    await transport.terminateSession();
    await expect(
      service.control({ ...payload("thread-one", app), action: { type: "listTools" } }),
    ).rejects.toThrow("session is unavailable");
  });

  it("revokes both app references and provider credentials when the thread retires", async () => {
    const service = new McpAppsService();
    services.push(service);
    const { client, server } = await connect(service, "thread-one");
    const app = readMcpAppReference(await client.callTool({ name: "show_deployment" }))!;
    await service.releaseThread("thread-one");
    await expect(
      service.control({ ...payload("thread-one", app), action: { type: "listTools" } }),
    ).rejects.toThrow("session is unavailable");
    if (server.transport.type !== "http") throw new Error("Expected HTTP");
    expect((await fetch(server.transport.url, { headers: server.transport.headers })).status).toBe(
      404,
    );
  });
});
