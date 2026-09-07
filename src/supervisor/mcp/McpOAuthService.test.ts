import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { decryptSecret, encryptSecret } from "@/shared/secretStorage";
import { McpOAuthService } from "./McpOAuthService";

interface FakeAuthServer {
  url: string;
  tokenRequests: URLSearchParams[];
  registerRequests: string[];
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
async function startFakeAuthServer(options: {
  expiresIn: number;
  /** Reject the refresh_token grant: OAuth error body, or a 401 challenge. */
  failRefresh?: "invalid_grant" | "unauthorized";
  /** Reject the authorization_code grant with an OAuth error body. */
  failCodeExchange?: boolean;
}): Promise<FakeAuthServer> {
  const tokenRequests: URLSearchParams[] = [];
  const registerRequests: string[] = [];
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
        registerRequests.push(body);
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
        if (params.get("grant_type") === "refresh_token" && options.failRefresh) {
          if (options.failRefresh === "unauthorized") {
            res.writeHead(401, {
              "content-type": "application/json",
              "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token", error_description="token rejected"`,
            });
            res.end(JSON.stringify({ error: "invalid_token" }));
          } else {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                error: "invalid_grant",
                error_description: "refresh token rejected",
              }),
            );
          }
          return;
        }
        if (params.get("grant_type") === "authorization_code" && options.failCodeExchange) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "authorization code rejected",
            }),
          );
          return;
        }
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
  const fake: FakeAuthServer = {
    url: origin,
    tokenRequests,
    registerRequests,
    close: () => server.close(),
  };
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

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-mcp-oauth-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeServiceAt(dir: string): McpOAuthService {
  const service = new McpOAuthService({ baseDir: dir });
  cleanups.push(() => service.dispose());
  return service;
}

/**
 * Writes a store file in the exact v1 on-disk format, built by hand from the
 * current schema: encrypted blobs with no v2 `issuer` stamp, keyed by
 * server URL with a `tokensSavedAt` timestamp.
 */
function seedV1Store(dir: string, url: string, tokens: Record<string, unknown>): void {
  const clientSealed = encryptSecret(dir, JSON.stringify({ client_id: "fake-client" }));
  const tokensSealed = encryptSecret(dir, JSON.stringify(tokens));
  writeFileSync(
    join(dir, "mcp-oauth.json"),
    JSON.stringify({
      servers: {
        [url]: {
          clientInformation: clientSealed,
          tokens: tokensSealed,
          tokensSavedAt: Date.now() - 2 * 3600 * 1000,
        },
      },
    }),
  );
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

  it("reads a pre-upgrade store without re-registering the client", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const dir = tempDir();
    const url = `${fake.url}/mcp`;
    // Exact v1 format: expired but refreshable tokens, neither blob carrying
    // the v2 `issuer` stamp.
    seedV1Store(dir, url, {
      access_token: "old-at",
      token_type: "Bearer",
      refresh_token: "rt-1",
      expires_in: 3600,
    });
    const service = makeServiceAt(dir);

    expect(service.status().authenticatedUrls).toEqual([url]);

    const authorized = await service.applyAuthorizationToServer(httpServer(fake.url));
    expect(
      authorized.transport.type === "http" ? authorized.transport.headers.Authorization : "",
    ).toBe("Bearer at-2");
    // The stored client_id was handed to auth() and reused for the refresh:
    // no dynamic client registration round-trip happened.
    expect(fake.registerRequests).toHaveLength(0);
    expect(fake.tokenRequests.at(-1)?.get("grant_type")).toBe("refresh_token");
    expect(fake.tokenRequests.at(-1)?.get("refresh_token")).toBe("rt-1");

    // v2 re-saves both blobs with the additive `issuer` stamp; the wire shape
    // itself is unchanged.
    const persisted = JSON.parse(readFileSync(join(dir, "mcp-oauth.json"), "utf8")) as {
      servers: Record<string, { clientInformation?: string; tokens?: string }>;
    };
    const savedTokens = JSON.parse(decryptSecret(dir, persisted.servers[url]?.tokens ?? "")) as {
      access_token?: string;
      issuer?: string;
    };
    const savedClient = JSON.parse(
      decryptSecret(dir, persisted.servers[url]?.clientInformation ?? ""),
    ) as { client_id?: string; issuer?: string };
    expect(savedTokens.access_token).toBe("at-2");
    expect(savedTokens.issuer).toBe(fake.url);
    expect(savedClient.client_id).toBe("fake-client");
    expect(savedClient.issuer).toBe(fake.url);
  });

  it("drops stored tokens when the refresh grant is rejected", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600, failRefresh: "invalid_grant" });
    const dir = tempDir();
    const url = `${fake.url}/mcp`;
    seedV1Store(dir, url, {
      access_token: "old-at",
      token_type: "Bearer",
      refresh_token: "rt-1",
      expires_in: 3600,
    });
    const service = makeServiceAt(dir);
    const server = httpServer(fake.url);

    expect(service.status().authenticatedUrls).toEqual([url]);
    // No usable token: the server passes through untouched so the downstream
    // 401 surfaces to the caller instead of being masked here.
    expect(await service.applyAuthorizationToServer(server)).toBe(server);
    // The rejected refresh invalidated the stored tokens, and no interactive
    // re-registration was persisted behind our back.
    expect(service.status().authenticatedUrls).toEqual([]);
    expect(fake.registerRequests).toHaveLength(0);
  });

  it("passes the server through when refresh answers 401 with resource metadata", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600, failRefresh: "unauthorized" });
    const dir = tempDir();
    const url = `${fake.url}/mcp`;
    seedV1Store(dir, url, {
      access_token: "old-at",
      token_type: "Bearer",
      refresh_token: "rt-1",
      expires_in: 3600,
    });
    const service = makeServiceAt(dir);
    const server = httpServer(fake.url);

    // A transport-level 401 is not an invalid_grant: nothing is invalidated,
    // the request goes out without an Authorization header, and the 401 with
    // its WWW-Authenticate resource metadata reaches the caller (the probe
    // layer consumes the challenge from there).
    expect(await service.applyAuthorizationToServer(server)).toBe(server);
    expect(service.status().authenticatedUrls).toEqual([url]);
    expect(fake.registerRequests).toHaveLength(0);
  });

  it("reports a rejected authorization-code exchange through wait()", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600, failCodeExchange: true });
    const service = makeService();

    const begin = await service.begin({ server: httpServer(fake.url) });
    expect(begin.status).toBe("redirect");
    if (begin.status !== "redirect") return;

    const waitPromise = service.wait({ flowId: begin.flowId });
    await completeBrowserLeg(begin.authorizationUrl);
    expect((await waitPromise).status).toBe("error");
    expect(service.status().authenticatedUrls).toEqual([]);
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
