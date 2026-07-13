import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { StreamableHttpMcpIngress } from "./StreamableHttpMcpIngress";

let ingress: StreamableHttpMcpIngress<{ ok: true }> | null = null;

function makeIngress(): StreamableHttpMcpIngress<{ ok: true }> {
  return new StreamableHttpMcpIngress<{ ok: true }>({
    // Match the computer-use consumer: loopback-only bind.
    bindHost: "127.0.0.1",
    serverInfo: { name: "test", version: "0.0.0" },
    instructions: "test",
    tools: [{ name: "noop", description: "noop", inputSchema: { type: "object" } }],
    isKnownToolName: (name) => name === "noop",
    buildContext: () => ({ ok: true }),
    dispatchTool: () => Promise.resolve({}),
    formatToolResult: () => ({ content: [{ type: "text", text: "ok" }] }),
  });
}

/**
 * `fetch` treats `Host` as a forbidden header and silently overrides it, so a
 * DNS-rebinding test needs a raw request that actually sends the forged host.
 */
function rawRequest(port: number, headers: Record<string, string>): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path: "/mcp", method: "POST", headers },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
  });
}

afterEach(() => {
  ingress?.dispose();
  ingress = null;
});

describe("StreamableHttpMcpIngress auth + host guards", () => {
  it("filters disabled tools from discovery and calls", async () => {
    ingress = makeIngress();
    const info = await ingress.start();
    const headers = {
      authorization: `Bearer ${info.token}`,
      "content-type": "application/json",
    };
    const list = await fetch(`${info.url}/mcp?thread=test&disable=noop`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect((await list.json()).result.tools).toEqual([]);

    const call = await fetch(`${info.url}/mcp?thread=test&disable=noop`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "noop", arguments: {} },
      }),
    });
    expect((await call.json()).result).toMatchObject({ isError: true });
  });

  it("accepts a valid bearer token and rejects a wrong one", async () => {
    ingress = makeIngress();
    const info = await ingress.start();

    const ok = await rawRequest(info.port, {
      Host: `127.0.0.1:${info.port}`,
      Authorization: `Bearer ${info.token}`,
      "Content-Type": "application/json",
    });
    expect(ok.status).toBe(200);

    const wrong = await rawRequest(info.port, {
      Host: `127.0.0.1:${info.port}`,
      Authorization: "Bearer not-the-token",
      "Content-Type": "application/json",
    });
    expect(wrong.status).toBe(401);

    // A same-length but wrong token must also fail (constant-time compare path).
    const sameLength = "0".repeat(info.token.length);
    const wrongSameLength = await rawRequest(info.port, {
      Host: `127.0.0.1:${info.port}`,
      Authorization: `Bearer ${sameLength}`,
      "Content-Type": "application/json",
    });
    expect(wrongSameLength.status).toBe(401);
  });

  it("rejects a foreign DNS Host but allows loopback and IP-literal hosts", async () => {
    ingress = makeIngress();
    const info = await ingress.start();

    const base = { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" };

    // DNS-rebinding: a real hostname is refused even with a valid token.
    const rebinding = await rawRequest(info.port, { ...base, Host: "evil.example.com" });
    expect(rebinding.status).toBe(403);

    // Loopback by name and by IP literal are accepted (WSL reaches the browser
    // ingress via the host-gateway IP literal, which must keep working).
    const loopbackName = await rawRequest(info.port, { ...base, Host: `localhost:${info.port}` });
    expect(loopbackName.status).toBe(200);

    const loopbackIp = await rawRequest(info.port, { ...base, Host: `127.0.0.1:${info.port}` });
    expect(loopbackIp.status).toBe(200);
  });
});
