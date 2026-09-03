import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { encryptSecret } from "@/shared/secretStorage";
import { McpOAuthService } from "./McpOAuthService";

interface FakeAuthServer {
  url: string;
  tokenRequests: URLSearchParams[];
  close: () => void;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * Minimal OAuth 2.1 authorization server + MCP resource on one origin:
 * metadata discovery, dynamic client registration, and a token endpoint that
 * grants `at-1` for authorization codes and `at-2` for refresh tokens.
 */
async function startFakeAuthServer(options: { expiresIn: number }): Promise<FakeAuthServer> {
  const tokenRequests: URLSearchParams[] = [];
  let server!: Server;
  let origin = "";

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", origin);
    if (req.method === "GET" && url.pathname.includes("oauth-protected-resource")) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "GET" && url.pathname.includes("oauth-authorization-server")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        }),
      );
      return;
    }
    if (req.method === "GET" && url.pathname.includes("openid-configuration")) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "POST" && url.pathname === "/register") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
      req.on("end", () => {
        const metadata = JSON.parse(body) as Record<string, unknown>;
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...metadata, client_id: "fake-client" }));
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/token") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        tokenRequests.push(params);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: params.get("grant_type") === "refresh_token" ? "at-2" : "at-1",
            token_type: "Bearer",
            refresh_token: "rt-1",
            expires_in: options.expiresIn,
          }),
        );
      });
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no address");
  origin = `http://127.0.0.1:${address.port}`;
  const fake: FakeAuthServer = { url: origin, tokenRequests, close: () => server.close() };
  cleanups.push(fake.close);
  return fake;
}

function makeService(): McpOAuthService {
  const dir = mkdtempSync(join(tmpdir(), "poracode-mcp-oauth-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const service = new McpOAuthService({ baseDir: dir });
  cleanups.push(() => service.dispose());
  return service;
}

function httpServer(url: string): McpServer {
  return {
    id: "server-1",
    name: "vercel",
    description: "",
    enabled: true,
    timeoutMs: 30_000,
    transport: { type: "http", url: `${url}/mcp`, headers: {} },
  };
}

async function completeBrowserLeg(authorizationUrl: string): Promise<void> {
  const url = new URL(authorizationUrl);
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(redirectUri).toBeTruthy();
  const callback = new URL(redirectUri as string);
  callback.searchParams.set("code", "fake-code");
  callback.searchParams.set("state", state ?? "");
  const response = await fetch(callback);
  expect(response.status).toBe(200);
}

describe("McpOAuthService", () => {
  it("completes the DCR + PKCE authorization flow through the loopback callback", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const service = makeService();
    const server = httpServer(fake.url);

    const begin = await service.begin({ server });
    expect(begin.status).toBe("redirect");
    if (begin.status !== "redirect") return;
    expect(begin.authorizationUrl).toContain(`${fake.url}/authorize`);

    const waitPromise = service.wait({ flowId: begin.flowId });
    await completeBrowserLeg(begin.authorizationUrl);
    expect(await waitPromise).toEqual({ status: "authorized" });

    expect(fake.tokenRequests[0]?.get("grant_type")).toBe("authorization_code");
    expect(fake.tokenRequests[0]?.get("code")).toBe("fake-code");
    expect(service.status().authenticatedUrls).toEqual([`${fake.url}/mcp`]);

    const authorized = await service.applyAuthorizationToServer(server);
    expect(
      authorized.transport.type === "http" ? authorized.transport.headers.Authorization : "",
    ).toBe("Bearer at-1");
  });

  it("refreshes expired tokens when applying authorization", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 1 });
    const service = makeService();
    const server = httpServer(fake.url);

    const begin = await service.begin({ server });
    expect(begin.status).toBe("redirect");
    if (begin.status !== "redirect") return;
    const waitPromise = service.wait({ flowId: begin.flowId });
    await completeBrowserLeg(begin.authorizationUrl);
    expect(await waitPromise).toEqual({ status: "authorized" });

    const authorized = await service.applyAuthorizationToServer(server);
    expect(
      authorized.transport.type === "http" ? authorized.transport.headers.Authorization : "",
    ).toBe("Bearer at-2");
    expect(fake.tokenRequests.at(-1)?.get("grant_type")).toBe("refresh_token");
    expect(fake.tokenRequests.at(-1)?.get("refresh_token")).toBe("rt-1");
  });

  it("rejects stdio servers and leaves user-provided Authorization headers alone", async () => {
    const service = makeService();
    const stdio: McpServer = {
      id: "stdio-1",
      name: "local",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "node", args: [], env: {} },
    };
    expect(await service.begin({ server: stdio })).toEqual({
      status: "error",
      message: "Only HTTP MCP servers support sign-in.",
    });

    const manual: McpServer = {
      ...httpServer("http://127.0.0.1:9"),
      transport: {
        type: "http",
        url: "http://127.0.0.1:9/mcp",
        headers: { authorization: "Bearer manual" },
      },
    };
    expect(await service.applyAuthorizationToServer(manual)).toBe(manual);
  });

  it("clears stored credentials and stops reporting the URL as authenticated", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const service = makeService();
    const server = httpServer(fake.url);

    const begin = await service.begin({ server });
    if (begin.status !== "redirect") throw new Error("expected redirect");
    const waitPromise = service.wait({ flowId: begin.flowId });
    await completeBrowserLeg(begin.authorizationUrl);
    await waitPromise;

    service.clear({ url: `${fake.url}/mcp` });
    expect(service.status().authenticatedUrls).toEqual([]);
    const untouched = await service.applyAuthorizationToServer(server);
    expect(untouched).toBe(server);
  });

  it("does not report credentials encrypted with an unavailable key as authenticated", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-mcp-oauth-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const url = "https://mcp.vercel.com";
    const sealed = encryptSecret(dir, JSON.stringify({ access_token: "old" }));
    const ciphertextStart = sealed.lastIndexOf(":") + 1;
    const invalidSealed = `${sealed.slice(0, ciphertextStart)}${sealed[ciphertextStart] === "A" ? "B" : "A"}${sealed.slice(ciphertextStart + 1)}`;
    writeFileSync(
      join(dir, "mcp-oauth.json"),
      JSON.stringify({
        servers: {
          [url]: { tokens: invalidSealed },
        },
      }),
    );
    const service = new McpOAuthService({ baseDir: dir });
    cleanups.push(() => service.dispose());

    expect(service.status().authenticatedUrls).toEqual([]);
  });

  it("stops reporting expired tokens without a refresh token as authenticated", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-mcp-oauth-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const url = "https://mcp.vercel.com";
    const sealed = encryptSecret(
      dir,
      JSON.stringify({ access_token: "expired", expires_in: 3600 }),
    );
    writeFileSync(
      join(dir, "mcp-oauth.json"),
      JSON.stringify({
        servers: {
          [url]: { tokens: sealed, tokensSavedAt: Date.now() - 2 * 3600 * 1000 },
        },
      }),
    );
    const service = new McpOAuthService({ baseDir: dir });
    cleanups.push(() => service.dispose());

    // No refresh token means the next turn would be sent without an
    // `Authorization` header and fail-closed agents abort with
    // `MCP load failed ... Unauthorized` — so the URL must read as signed out.
    expect(service.status().authenticatedUrls).toEqual([]);
    const server: McpServer = {
      id: "vercel",
      name: "Vercel",
      description: "",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "http", url, headers: {} },
    };
    expect(await service.applyAuthorizationToServer(server)).toBe(server);
  });

  it("keeps reporting expired tokens with a refresh token as authenticated", () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-mcp-oauth-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const url = "https://mcp.vercel.com";
    const sealed = encryptSecret(
      dir,
      JSON.stringify({ access_token: "expired", refresh_token: "rt-1", expires_in: 3600 }),
    );
    writeFileSync(
      join(dir, "mcp-oauth.json"),
      JSON.stringify({
        servers: {
          [url]: { tokens: sealed, tokensSavedAt: Date.now() - 2 * 3600 * 1000 },
        },
      }),
    );
    const service = new McpOAuthService({ baseDir: dir });
    cleanups.push(() => service.dispose());

    expect(service.status().authenticatedUrls).toEqual([url]);
  });

  it("ignores callbacks with a mismatched state parameter", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const service = makeService();

    const begin = await service.begin({ server: httpServer(fake.url) });
    if (begin.status !== "redirect") throw new Error("expected redirect");
    const url = new URL(begin.authorizationUrl);
    const callback = new URL(url.searchParams.get("redirect_uri") as string);
    callback.searchParams.set("code", "attacker-code");
    callback.searchParams.set("state", "wrong-state");
    const response = await fetch(callback);
    expect(response.status).toBe(400);
    expect(fake.tokenRequests).toHaveLength(0);
    expect(service.status().authenticatedUrls).toEqual([]);
  });
});
