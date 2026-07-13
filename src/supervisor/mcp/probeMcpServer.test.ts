import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { probeMcpServer } from "./probeMcpServer";

const environment = { runtime: "host", projectScoped: false } as const;
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

function stdioServer(script: string, args: string[] = [], timeoutMs = 2_000): McpServer {
  return {
    id: "stdio-test",
    name: "stdio-test",
    description: "",
    enabled: true,
    timeoutMs,
    transport: {
      type: "stdio",
      command: process.execPath,
      args: ["-e", script, ...args],
      env: {},
    },
  };
}

const STDIO_FIXTURE = String.raw`
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf("\n");
    if (index < 0) break;
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "fixture\u0000 server", version: "1.2.3" }
        }
      }) + "\n");
    } else if (message.method === "tools/list") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            { name: "one", description: "", inputSchema: { type: "object" } },
            { name: "two", description: "", inputSchema: { type: "object" } }
          ]
        }
      }) + "\n");
    }
  }
});
`;

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

async function jsonBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body?: unknown): void {
  response.statusCode = status;
  if (body !== undefined) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(body));
    return;
  }
  response.end();
}

function createAsyncServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): Server {
  return createServer((request, response) => {
    void handler(request, response).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

describe("probeMcpServer", () => {
  it("initializes a stdio server, lists its tools, and sanitizes server metadata", async () => {
    const result = await probeMcpServer(stdioServer(STDIO_FIXTURE), environment);

    expect(result).toMatchObject({
      status: "available",
      toolCount: 2,
      tools: ["one", "two"],
      environment,
      serverInfo: { name: "fixture  server", version: "1.2.3" },
    });
  });

  it("initializes Streamable HTTP and follows tools/list pagination", async () => {
    const requests: string[] = [];
    let terminated = false;
    const baseUrl = await listen(
      createAsyncServer(async (request, response) => {
        if (request.method === "GET") {
          response.statusCode = 405;
          response.end();
          return;
        }
        if (request.method === "DELETE") {
          terminated = true;
          response.end();
          return;
        }
        const message = (await jsonBody(request)) as {
          id?: number;
          method: string;
          params?: { cursor?: string };
        };
        requests.push(message.method);
        if (message.method === "initialize") {
          response.setHeader("mcp-session-id", "probe-session");
          sendJson(response, 200, {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "http-fixture", version: "1" },
            },
          });
          return;
        }
        if (message.method === "notifications/initialized") {
          sendJson(response, 202);
          return;
        }
        const secondPage = message.params?.cursor === "next";
        sendJson(response, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            tools: [
              {
                name: secondPage ? "second" : "first",
                description: "",
                inputSchema: { type: "object" },
              },
            ],
            ...(secondPage ? {} : { nextCursor: "next" }),
          },
        });
      }),
    );
    const server: McpServer = {
      id: "http-test",
      name: "http-test",
      description: "",
      enabled: true,
      timeoutMs: 2_000,
      transport: { type: "http", url: `${baseUrl}/mcp`, headers: { "x-test": "ok" } },
    };

    const result = await probeMcpServer(server, environment);

    expect(result).toMatchObject({ status: "available", toolCount: 2, tools: ["first", "second"] });
    expect(requests).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/list",
    ]);
    expect(terminated).toBe(true);
  });

  it("supports the legacy SSE transport", async () => {
    let stream: ServerResponse | undefined;
    const baseUrl = await listen(
      createAsyncServer(async (request, response) => {
        if (request.method === "GET" && request.url === "/sse") {
          stream = response;
          response.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
          });
          response.write("event: endpoint\ndata: /messages\n\n");
          return;
        }
        if (request.method !== "POST" || request.url !== "/messages") {
          response.statusCode = 404;
          response.end();
          return;
        }
        const message = (await jsonBody(request)) as { id?: number; method: string };
        response.statusCode = 202;
        response.end();
        if (message.id === undefined || !stream) return;
        const result =
          message.method === "initialize"
            ? {
                protocolVersion: "2025-06-18",
                capabilities: { tools: {} },
                serverInfo: { name: "sse-fixture", version: "1" },
              }
            : {
                tools: [{ name: "legacy", description: "", inputSchema: { type: "object" } }],
              };
        stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n\n`);
      }),
    );
    const server: McpServer = {
      id: "sse-test",
      name: "sse-test",
      description: "",
      enabled: true,
      timeoutMs: 2_000,
      transport: { type: "sse", url: `${baseUrl}/sse`, headers: {} },
    };

    await expect(probeMcpServer(server, environment)).resolves.toMatchObject({
      status: "available",
      toolCount: 1,
      tools: ["legacy"],
    });
    stream?.end();
  });

  it("distinguishes OAuth challenges without returning configured secrets", async () => {
    const secret = "secret-header-value";
    const baseUrl = await listen(
      createServer((_request, response) => {
        response.statusCode = 401;
        response.setHeader(
          "www-authenticate",
          'Bearer resource_metadata="https://login.example.test/.well-known/oauth-protected-resource"',
        );
        response.end();
      }),
    );
    const server: McpServer = {
      id: "auth-test",
      name: "auth-test",
      description: "",
      enabled: true,
      timeoutMs: 2_000,
      transport: {
        type: "http",
        url: `${baseUrl}/mcp`,
        headers: { authorization: `Bearer ${secret}` },
      },
    };

    const result = await probeMcpServer(server, environment);

    expect(result).toMatchObject({
      status: "auth-required",
      toolCount: 0,
      error: { code: "auth-required", authScheme: "oauth" },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("does not mislabel an unchallenged 403 as authentication-required", async () => {
    const baseUrl = await listen(
      createServer((_request, response) => {
        response.statusCode = 403;
        response.end("origin forbidden");
      }),
    );
    const server: McpServer = {
      id: "forbidden-test",
      name: "forbidden-test",
      description: "",
      enabled: true,
      timeoutMs: 2_000,
      transport: { type: "http", url: `${baseUrl}/mcp`, headers: {} },
    };

    await expect(probeMcpServer(server, environment)).resolves.toMatchObject({
      status: "unavailable",
      error: { code: "connection-failed" },
    });
  });

  it("times out and terminates an unresponsive stdio server", async () => {
    const directory = mkdtempSync(join(tmpdir(), "poracode-mcp-probe-"));
    const pidFile = join(directory, "pid.txt");
    const script = String.raw`
      require("node:fs").writeFileSync(process.argv[1], String(process.pid));
      process.stdin.resume();
    `;
    try {
      const result = await probeMcpServer(stdioServer(script, [pidFile], 100), environment);
      expect(result).toMatchObject({ status: "unavailable", error: { code: "timeout" } });

      const pid = Number(readFileSync(pidFile, "utf8"));
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      expect(alive).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
