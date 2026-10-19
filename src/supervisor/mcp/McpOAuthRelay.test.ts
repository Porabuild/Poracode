import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import type { McpServer } from "@/shared/contracts";
import { writeJsonResponse } from "@/shared/http";
import { McpOAuthRelay } from "./McpOAuthRelay";
import { createUpstreamTransport } from "./mcpToolFilterProxy";
import type { WslHostAccessResolver } from "../wsl/hostAccess";

const location = { kind: "posix", path: "/fixture" } as const;
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function rawGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number | undefined; body: string; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    request(url, { headers }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
      res.on("error", reject);
    })
      .on("error", reject)
      .end();
  });
}

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing address");
  return `http://127.0.0.1:${address.port}`;
}

function config(url: string, type: "http" | "sse" = "http"): McpServer {
  return {
    id: "test",
    name: "test",
    description: "",
    enabled: true,
    timeoutMs: 2_000,
    transport: { type, url, headers: { "X-Workspace": "one" } },
  };
}

function fixture(gate?: Promise<void>) {
  let version = 0;
  let token = "upstream-one";
  const authorize = vi.fn<(server: McpServer) => Promise<McpServer>>(async (server) => {
    await gate;
    if (server.transport.type === "stdio") return server;
    return {
      ...server,
      transport: {
        ...server.transport,
        headers: { ...server.transport.headers, Authorization: `Bearer ${token}` },
      },
    };
  });
  const oauth = {
    hasAuthorization: (server: McpServer) =>
      server.transport.type !== "stdio" &&
      !Object.keys(server.transport.headers).some((name) => name.toLowerCase() === "authorization"),
    authorizationVersion: () => version,
    applyAuthorization: (servers: McpServer[]) => Promise.all(servers.map(authorize)),
    applyAuthorizationToServer: authorize,
  };
  const relay = new McpOAuthRelay(oauth);
  cleanups.push(() => relay.dispose());
  return {
    relay,
    oauth,
    authorize,
    rotate: () => {
      token = "upstream-two";
    },
    revoke: () => {
      version += 1;
    },
  };
}

function endpoint(server: McpServer): { url: string; headers: Record<string, string> } {
  if (server.transport.type === "stdio") throw new Error("HTTP expected");
  return server.transport;
}

describe("McpOAuthRelay", () => {
  it("prepares stable launch credentials without waiting for external OAuth", async () => {
    const gate = Promise.withResolvers<void>();
    const headers: IncomingHttpHeaders[] = [];
    const upstream = await listen((req, res) => {
      headers.push(req.headers);
      res.setHeader("Mcp-Session-Id", "session-one");
      res.end("ready");
    });
    const { relay, authorize } = fixture(gate.promise);
    const source = config(`${upstream}/mcp?workspace=one`);
    const prepared = endpoint((await relay.prepare([source], location))[0]!);
    expect(authorize).not.toHaveBeenCalled();
    const response = rawGet(prepared.url, {
      ...prepared.headers,
      "Mcp-Protocol-Version": "2025-11-25",
      Cookie: "local=secret",
      Connection: "x-hop",
      "X-Hop": "secret",
    });
    await vi.waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
    expect(headers).toHaveLength(0);
    gate.resolve();
    expect((await response).body).toBe("ready");
    expect((await response).headers["mcp-session-id"]).toBe("session-one");
    expect(headers[0]).toMatchObject({
      authorization: "Bearer upstream-one",
      "x-workspace": "one",
      "mcp-protocol-version": "2025-11-25",
    });
    expect(headers[0]?.cookie).toBeUndefined();
    expect(headers[0]?.["x-hop"]).toBeUndefined();
    expect(await relay.prepare([source], location)).toEqual([
      { ...source, transport: { ...prepared, type: "http" } },
    ]);
  });

  it("uses fresh upstream tokens without changing pool identity and revokes old account routes", async () => {
    const tokens: Array<string | undefined> = [];
    const upstream = await listen((req, res) => {
      tokens.push(req.headers.authorization);
      res.end();
    });
    const { relay, rotate, revoke } = fixture();
    const source = config(upstream);
    const first = endpoint((await relay.prepare([source], location))[0]!);
    await (await fetch(first.url, { headers: first.headers })).text();
    rotate();
    const refreshed = endpoint((await relay.prepare([source], location))[0]!);
    expect(refreshed).toEqual(first);
    await (await fetch(refreshed.url, { headers: refreshed.headers })).text();
    expect(tokens).toEqual(["Bearer upstream-one", "Bearer upstream-two"]);
    revoke();
    expect((await fetch(first.url, { headers: first.headers })).status).toBe(401);
    const nextAccount = endpoint((await relay.prepare([source], location))[0]!);
    expect(nextAccount).not.toEqual(first);
    expect((await fetch(nextAccount.url, { headers: first.headers })).status).toBe(401);
    expect(tokens).toHaveLength(2);
  });

  it("reuses redirect targets and rejects cross-origin redirects", async () => {
    const upstream = await listen((req, res) => {
      if (req.url === "/mcp") res.writeHead(307, { Location: "/canonical" }).end();
      else if (req.url === "/untrusted")
        res.writeHead(307, { Location: "https://other.test/mcp" }).end();
      else res.end("ready");
    });
    const { relay } = fixture();
    const prepared = endpoint((await relay.prepare([config(`${upstream}/mcp`)], location))[0]!);
    const first = await rawGet(prepared.url, prepared.headers);
    const second = await rawGet(prepared.url, prepared.headers);
    expect(first.status).toBe(307);
    expect(second.headers.location).toBe(first.headers.location);
    expect(
      (await rawGet(new URL(first.headers.location!, prepared.url).href, prepared.headers)).body,
    ).toBe("ready");
    const untrusted = endpoint(
      (await relay.prepare([config(`${upstream}/untrusted`)], location))[0]!,
    );
    expect((await rawGet(untrusted.url, untrusted.headers)).status).toBe(502);
  });

  it("removes revoked routes while preserving active refreshed connections", async () => {
    const { relay, oauth, rotate, revoke } = fixture();
    const source = config("https://upstream.test/mcp");
    let previous = endpoint((await relay.prepare([source], location))[0]!);
    rotate();
    expect(endpoint((await relay.prepare([source], location))[0]!)).toEqual(previous);
    for (let index = 0; index < 3; index++) {
      revoke();
      const next = endpoint((await relay.prepare([source], location))[0]!);
      expect(next).not.toEqual(previous);
      expect((await rawGet(previous.url, previous.headers)).status).toBe(404);
      previous = next;
    }
    revoke();
    oauth.hasAuthorization = () => false;
    expect(await relay.prepare([source], location)).toEqual([source]);
    expect((await rawGet(previous.url, previous.headers)).status).toBe(404);
  });

  it("preserves manual credentials and stdio configuration", async () => {
    const { relay, authorize } = fixture();
    const manual = config("https://example.test/mcp");
    if (manual.transport.type === "stdio") throw new Error("HTTP expected");
    manual.transport.headers.authorization = "Bearer manual";
    const stdio: McpServer = {
      ...manual,
      transport: { type: "stdio", command: "test", args: [], env: {} },
    };
    const sources = [manual, stdio];
    expect(await relay.prepare(sources, location)).toBe(sources);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("uses a changed authentication budget instead of a cached launch's timeout", async () => {
    const upstream = await listen((_req, res) => res.end());
    const { relay, authorize } = fixture();
    await relay.prepare([config(upstream)], location);
    const updated = { ...config(upstream), timeoutMs: 60_000 };
    const prepared = endpoint((await relay.prepare([updated], location))[0]!);
    await (await fetch(prepared.url, { headers: prepared.headers })).text();
    expect(authorize).toHaveBeenLastCalledWith(expect.objectContaining({ timeoutMs: 60_000 }));
  });

  it("rejects untrusted origins, hosts and cross-resource credentials", async () => {
    const { relay } = fixture();
    const [first, second] = await relay.prepare(
      [config("https://one.test/mcp"), config("https://two.test/mcp")],
      location,
    );
    const one = endpoint(first!);
    const two = endpoint(second!);
    expect(
      (await fetch(one.url, { headers: { ...one.headers, Origin: "https://evil.test" } })).status,
    ).toBe(403);
    expect((await rawGet(one.url, { ...one.headers, Host: "evil.test" })).status).toBe(403);
    expect((await fetch(two.url, { headers: one.headers })).status).toBe(401);
    expect((await fetch(`${one.url}/extra`, { headers: one.headers })).status).toBe(404);
  });

  it.each(["http", "sse"] as const)(
    "preserves %s initialization, tools, resources and prompts end to end",
    async (type) => {
      const received: IncomingHttpHeaders[] = [];
      const messagePaths: Array<string | undefined> = [];
      let stream: ServerResponse | undefined;
      const base = await listen((req, res) => {
        received.push(req.headers);
        if (req.headers.authorization !== "Bearer upstream-one") {
          res.writeHead(401).end();
          return;
        }
        if (req.method === "GET") {
          if (type === "http") {
            res.writeHead(405).end();
            return;
          }
          stream = res;
          res.writeHead(200, { "content-type": "text/event-stream" });
          // Split the initial endpoint across chunks, including CRLF framing.
          res.write("event: end");
          res.write("point\r\ndata: /messages?session=one\r\n\r\n");
          return;
        }
        if (req.method === "DELETE") {
          res.writeHead(204).end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          messagePaths.push(req.url);
          const message = JSON.parse(body) as {
            id?: number;
            method: string;
            params?: { protocolVersion?: string };
          };
          if (message.id === undefined) {
            res.writeHead(202).end();
            return;
          }
          const result =
            message.method === "initialize"
              ? {
                  protocolVersion: message.params?.protocolVersion,
                  capabilities: { tools: {}, resources: {}, prompts: {} },
                  serverInfo: { name: "upstream", version: "1" },
                }
              : message.method === "tools/list"
                ? { tools: [{ name: "echo", inputSchema: { type: "object" } }] }
                : message.method === "tools/call"
                  ? {
                      content: [{ type: "text", text: "hello" }],
                      structuredContent: { answer: 42 },
                      _meta: { original: true },
                    }
                  : message.method === "resources/list"
                    ? { resources: [{ uri: "test://resource", name: "resource" }] }
                    : { prompts: [{ name: "prompt" }] };
          const reply = { jsonrpc: "2.0", id: message.id, result };
          if (type === "sse") {
            stream?.write(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
            res.writeHead(202).end();
          } else {
            res.setHeader("Mcp-Session-Id", "session-one");
            writeJsonResponse(res, 200, reply);
          }
        });
      });
      const { relay } = fixture();
      const server = (await relay.prepare([config(`${base}/mcp`, type)], location))[0]!;
      const client = new Client({ name: "relay-test", version: "1" });
      cleanups.push(() => client.close());
      await client.connect(createUpstreamTransport(server));
      expect((await client.listTools()).tools[0]?.name).toBe("echo");
      expect(await client.callTool({ name: "echo", arguments: {} })).toMatchObject({
        structuredContent: { answer: 42 },
        _meta: { original: true },
      });
      expect((await client.listResources()).resources[0]?.uri).toBe("test://resource");
      expect((await client.listPrompts()).prompts[0]?.name).toBe("prompt");
      expect(received.every((headers) => headers["x-workspace"] === "one")).toBe(true);
      expect(
        messagePaths.every((path) => path === (type === "sse" ? "/messages?session=one" : "/mcp")),
      ).toBe(true);
      expect(received.some((headers) => headers["mcp-session-id"] === "session-one")).toBe(
        type === "http",
      );
    },
  );

  it("uses WSL gateway access and retains the direct fallback when unavailable", async () => {
    const f = fixture();
    const hostAccess = {
      resolveHostAccess: vi
        .fn<WslHostAccessResolver["resolveHostAccess"]>()
        .mockResolvedValue({ kind: "gateway", ip: "172.20.0.1" }),
    };
    const relay = new McpOAuthRelay(f.oauth, hostAccess);
    cleanups.push(() => relay.dispose());
    const wsl = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/fixture",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\fixture",
    } as const;
    expect(endpoint((await relay.prepare([config("https://upstream.test")], wsl))[0]!).url).toMatch(
      /^http:\/\/172\.20\.0\.1:/u,
    );
    hostAccess.resolveHostAccess.mockResolvedValue(undefined);
    expect(
      endpoint((await relay.prepare([config("https://upstream.test")], wsl))[0]!).headers
        .Authorization,
    ).toBe("Bearer upstream-one");
  });

  it("cancels open upstream streams and rejects preparation after shutdown", async () => {
    const connected = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const upstream = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": ready\n\n");
      res.once("close", () => closed.resolve());
      connected.resolve();
    });
    const { relay } = fixture();
    const server = endpoint((await relay.prepare([config(upstream)], location))[0]!);
    const response = fetch(server.url, { headers: server.headers }).then(async (res) => {
      await res.text().catch(() => undefined);
    });
    await connected.promise;
    await relay.dispose();
    await closed.promise;
    await response;
    await expect(relay.prepare([config(upstream)], location)).rejects.toThrow("shutting down");
  });
});
