import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { decryptSecret, encryptSecret } from "@/shared/secretStorage";
import { McpOAuthService } from "./McpOAuthService";

interface FakeAuthServer {
  url: string;
  tokenRequests: URLSearchParams[];
  registerRequests: string[];
  close: () => void;
}

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
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
  refreshGate?: Promise<void>;
  codeExchangeGate?: Promise<void>;
  omitCodeScope?: boolean;
  issParameterSupported?: boolean;
  protectedResourceMetadata?: boolean;
}): Promise<FakeAuthServer> {
  const tokenRequests: URLSearchParams[] = [];
  const registerRequests: string[] = [];
  let server!: Server;
  let origin = "";

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", origin);
    if (req.method === "GET" && url.pathname.includes("oauth-protected-resource")) {
      if (options.protectedResourceMetadata) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            resource: `${origin}/mcp`,
            authorization_servers: [origin],
            scopes_supported: ["notes:read"],
          }),
        );
        return;
      }
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
          ...(options.issParameterSupported !== undefined
            ? { authorization_response_iss_parameter_supported: options.issParameterSupported }
            : {}),
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
      const respond = async () => {
        const params = new URLSearchParams(body);
        tokenRequests.push(params);
        if (params.get("grant_type") === "refresh_token") await options.refreshGate;
        if (params.get("grant_type") === "authorization_code") await options.codeExchangeGate;
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
            ...(params.get("grant_type") === "authorization_code" && !options.omitCodeScope
              ? { scope: "notes:read" }
              : {}),
          }),
        );
      };
      req.on("end", () => {
        void respond().catch(() => res.destroy());
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

async function completeBrowserLeg(authorizationUrl: string, iss?: string): Promise<void> {
  const url = new URL(authorizationUrl);
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(redirectUri).toBeTruthy();
  const callback = new URL(redirectUri as string);
  callback.searchParams.set("code", "fake-code");
  callback.searchParams.set("state", state ?? "");
  if (iss !== undefined) callback.searchParams.set("iss", iss);
  const response = await fetch(callback);
  expect(response.status).toBe(200);
}

describe("McpOAuthService", () => {
  it.each([false, true])(
    "completes issuer-bound sign-in with existing credentials: %s",
    async (existingCredentials) => {
      const fake = await startFakeAuthServer({ expiresIn: 3600, issParameterSupported: true });
      const dir = tempDir();
      const server = httpServer(fake.url);
      if (existingCredentials)
        seedV1Store(dir, `${fake.url}/mcp`, { access_token: "expired", expires_in: 1 });
      const service = makeServiceAt(dir);
      const begin = await service.begin({ server });
      if (begin.status !== "redirect") throw new Error("Expected redirect");

      await completeBrowserLeg(begin.authorizationUrl, fake.url);
      expect(await service.wait({ flowId: begin.flowId })).toEqual({ status: "authorized" });
      expect(fake.tokenRequests).toHaveLength(1);
      expect(fake.tokenRequests[0]?.get("code")).toBe("fake-code");
      expect((await service.applyAuthorizationToServer(server)).transport).toMatchObject({
        headers: { Authorization: "Bearer at-1" },
      });
    },
  );

  it.each([
    { issParameterSupported: true, iss: undefined },
    { issParameterSupported: true, iss: "" },
    { issParameterSupported: true, iss: "https://other.example" },
    { issParameterSupported: false, iss: "https://other.example" },
  ])("rejects an invalid callback issuer: %j", async ({ issParameterSupported, iss }) => {
    const fake = await startFakeAuthServer({ expiresIn: 3600, issParameterSupported });
    const service = makeService();
    const begin = await service.begin({ server: httpServer(fake.url) });
    if (begin.status !== "redirect") throw new Error("Expected redirect");

    await completeBrowserLeg(begin.authorizationUrl, iss);
    expect(await service.wait({ flowId: begin.flowId })).toMatchObject({
      status: "error",
      message: "The sign-in response did not match the expected authorization server.",
    });
    expect(fake.tokenRequests).toEqual([]);
    expect(service.status().authenticatedUrls).toEqual([]);
  });

  it("preserves discovered resource, scope, PKCE and issuer-stamped credentials", async () => {
    const fake = await startFakeAuthServer({
      expiresIn: 3600,
      issParameterSupported: true,
      protectedResourceMetadata: true,
    });
    const dir = tempDir();
    const service = makeServiceAt(dir);
    const server = httpServer(fake.url);
    const begin = await service.begin({ server });
    if (begin.status !== "redirect") throw new Error("Expected redirect");
    const authorization = new URL(begin.authorizationUrl).searchParams;
    expect(authorization.get("resource")).toBe(`${fake.url}/mcp`);
    expect(authorization.get("scope")).toBe("notes:read");
    expect(authorization.get("code_challenge_method")).toBe("S256");
    expect(JSON.parse(fake.registerRequests[0]!)).toMatchObject({
      redirect_uris: [authorization.get("redirect_uri")],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
      scope: "notes:read",
    });

    await completeBrowserLeg(begin.authorizationUrl, fake.url);
    expect(await service.wait({ flowId: begin.flowId })).toEqual({ status: "authorized" });
    const request = fake.tokenRequests[0]!;
    expect(request.get("resource")).toBe(`${fake.url}/mcp`);
    expect(request.get("redirect_uri")).toBe(authorization.get("redirect_uri"));
    expect(createHash("sha256").update(request.get("code_verifier")!).digest("base64url")).toBe(
      authorization.get("code_challenge"),
    );
    const store = JSON.parse(readFileSync(join(dir, "mcp-oauth.json"), "utf8")) as {
      servers: Record<string, { clientInformation: string; tokens: string }>;
    };
    const entry = store.servers[`${fake.url}/mcp`]!;
    expect(JSON.parse(decryptSecret(dir, entry.clientInformation))).toMatchObject({
      client_id: "fake-client",
      issuer: fake.url,
      scope: "notes:read",
    });
    expect(JSON.parse(decryptSecret(dir, entry.tokens))).toMatchObject({
      access_token: "at-1",
      refresh_token: "rt-1",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "notes:read",
      issuer: fake.url,
    });
    expect((await makeServiceAt(dir).applyAuthorizationToServer(server)).transport).toMatchObject({
      headers: { Authorization: "Bearer at-1" },
    });
  });

  it.each(["matching", "mismatched", "missing"])(
    "validates the %s issuer before displaying an OAuth denial",
    async (issuer) => {
      const fake = await startFakeAuthServer({ expiresIn: 3600, issParameterSupported: true });
      const service = makeService();
      const begin = await service.begin({ server: httpServer(fake.url) });
      if (begin.status !== "redirect") throw new Error("Expected redirect");
      const authorization = new URL(begin.authorizationUrl).searchParams;
      const callback = new URL(authorization.get("redirect_uri")!);
      callback.searchParams.set("state", authorization.get("state")!);
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("error_description", "server-provided denial");
      if (issuer !== "missing")
        callback.searchParams.set(
          "iss",
          issuer === "matching" ? fake.url : "https://other.example",
        );
      expect((await fetch(callback)).status).toBe(200);
      expect(await service.wait({ flowId: begin.flowId })).toEqual({
        status: "error",
        message:
          issuer === "matching"
            ? "server-provided denial"
            : "The sign-in response did not match the expected authorization server.",
      });
      expect(fake.tokenRequests).toEqual([]);
    },
  );

  it("keeps independent plugin account slots at the same endpoint and preserves completed browser results", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const service = makeService();
    const server = httpServer(fake.url);
    const first = await service.beginForCredential(server, "plugin-account-v1:first");
    const second = await service.beginForCredential(server, "plugin-account-v1:second");
    if (first.status !== "redirect" || second.status !== "redirect")
      throw new Error("Expected redirects");
    await completeBrowserLeg(first.authorizationUrl);
    await expect
      .poll(() => service.credentialStatus("plugin-account-v1:first").status)
      .toBe("connected");
    expect(await service.wait({ flowId: first.flowId })).toEqual({ status: "authorized" });
    await completeBrowserLeg(second.authorizationUrl);
    expect(await service.wait({ flowId: second.flowId })).toEqual({ status: "authorized" });
    expect(service.status().authenticatedUrls).toEqual([]);
    expect(await service.applyAuthorizationToServer(server)).toBe(server);
    expect(() => service.clear({ url: "plugin-account-v1:first" })).toThrow("HTTP MCP");
    expect(service.credentialStatus("plugin-account-v1:first").status).toBe("connected");
    service.clearCredential("plugin-account-v1:first");
    expect(service.credentialStatus("plugin-account-v1:first").status).toBe("disconnected");
    expect(service.credentialStatus("plugin-account-v1:second").status).toBe("connected");
    expect(
      (await service.applyAuthorizationToServer(server, "plugin-account-v1:second")).transport,
    ).toMatchObject({ headers: { Authorization: "Bearer at-1" } });
  });

  it("cancels only the logged-out account's pending OAuth flow", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const service = makeService();
    const server = httpServer(fake.url);
    const first = await service.beginForCredential(server, "plugin-account-v1:first");
    const second = await service.beginForCredential(server, "plugin-account-v1:second");
    if (first.status !== "redirect" || second.status !== "redirect")
      throw new Error("Expected redirects");
    service.clearCredential("plugin-account-v1:first");
    expect((await service.wait({ flowId: first.flowId })).status).toBe("error");
    await completeBrowserLeg(second.authorizationUrl);
    expect(await service.wait({ flowId: second.flowId })).toEqual({ status: "authorized" });
    expect(service.credentialStatus("plugin-account-v1:first").status).toBe("disconnected");
  });

  it("refuses future credential stores before OAuth registration and preserves their bytes", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const dir = tempDir();
    const future = JSON.stringify({ version: 99, servers: { future: { tokens: "preserve" } } });
    writeFileSync(join(dir, "mcp-oauth.json"), future);
    const service = makeServiceAt(dir);
    expect(service.status().authenticatedUrls).toEqual([]);
    await expect(service.begin({ server: httpServer(fake.url) })).resolves.toMatchObject({
      status: "error",
      message: "Unsupported MCP OAuth store version.",
    });
    expect(fake.registerRequests).toEqual([]);
    expect(() => service.clear({ url: "https://future.example/mcp" })).toThrow("Unsupported");
    expect(readFileSync(join(dir, "mcp-oauth.json"), "utf8")).toBe(future);
  });

  it("degrades a truncated credential store to no credentials", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "mcp-oauth.json"), "{");
    const service = makeServiceAt(dir);
    const server = httpServer("https://example.invalid");
    expect(service.status().authenticatedUrls).toEqual([]);
    expect(await service.applyAuthorizationToServer(server)).toBe(server);
  });

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

  it("does not resurrect a cancelled sign-in over its replacement after PKCE generation", async () => {
    const hashStarted = Promise.withResolvers<void>();
    const hashGate = Promise.withResolvers<void>();
    const codeGate = Promise.withResolvers<void>();
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(async (...args) => {
      hashStarted.resolve();
      await hashGate.promise;
      return originalDigest(...args);
    });
    try {
      const fake = await startFakeAuthServer({
        expiresIn: 3600,
        codeExchangeGate: codeGate.promise,
      });
      const service = makeService();
      const server = httpServer(fake.url);
      const first = service.begin({ server });
      await hashStarted.promise;
      const replacement = await service.begin({ server });
      if (replacement.status !== "redirect") throw new Error("expected replacement redirect");
      hashGate.resolve();
      expect(await first).toMatchObject({ status: "error" });
      const waiting = service.wait({ flowId: replacement.flowId });
      await completeBrowserLeg(replacement.authorizationUrl);
      await vi.waitFor(() => expect(fake.tokenRequests).toHaveLength(1));
      service.clear({ url: `${fake.url}/mcp` });
      codeGate.resolve();
      expect(await waiting).toMatchObject({ status: "error" });
      expect(service.status().authenticatedUrls).toEqual([]);
    } finally {
      hashGate.resolve();
      codeGate.resolve();
      digest.mockRestore();
    }
  });

  it.each(["caller", "owner"] as const)(
    "cancels and joins a real SDK token exchange through %s custody without canceling another account",
    async (custody) => {
      const gate = Promise.withResolvers<void>();
      const fake = await startFakeAuthServer({ expiresIn: 3600, codeExchangeGate: gate.promise });
      const service = makeService();
      const selected = httpServer(fake.url);
      const controller = new AbortController();
      const first = await service.beginForCredential(
        selected,
        "plugin-account-v1:canceled",
        controller.signal,
      );
      const second = await service.beginForCredential(selected, "plugin-account-v1:retained");
      if (first.status !== "redirect" || second.status !== "redirect")
        throw new Error("Expected independent redirects");
      const waiting = service.wait({ flowId: first.flowId });
      try {
        await completeBrowserLeg(first.authorizationUrl);
        await vi.waitFor(() => expect(fake.tokenRequests).toHaveLength(1));
        if (custody === "caller") controller.abort();
        else await service.retireAuthentication(controller.signal);
        await expect(waiting).resolves.toMatchObject({ status: "error" });
        expect(service.credentialStatus("plugin-account-v1:canceled").status).toBe("disconnected");
        const callback = new URL(first.authorizationUrl).searchParams.get("redirect_uri")!;
        await expect(fetch(callback)).rejects.toThrow("fetch failed");
        gate.resolve();
        await completeBrowserLeg(second.authorizationUrl);
        await expect(service.wait({ flowId: second.flowId })).resolves.toEqual({
          status: "authorized",
        });
        expect(service.credentialStatus("plugin-account-v1:retained").status).toBe("connected");
        expect(service.status().authenticatedUrls).toEqual([]);
      } finally {
        controller.abort();
        gate.resolve();
        await waiting;
      }
    },
  );

  it("delivers the browser denial page before retiring its callback listener", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const service = makeService();
    const begun = await service.begin({ server: httpServer(fake.url) });
    if (begun.status !== "redirect") throw new Error("Expected redirect");
    const authorization = new URL(begun.authorizationUrl);
    const callback = new URL(authorization.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", authorization.searchParams.get("state")!);
    callback.searchParams.set("error", "access_denied");
    const response = await fetch(callback);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Sign-in failed.");
    await expect(service.wait({ flowId: begun.flowId })).resolves.toMatchObject({
      status: "error",
    });
    expect(fake.tokenRequests).toHaveLength(0);
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
    expect(service.credentialStatus(`${fake.url}/mcp`).scopes).toEqual(["notes:read"]);
  });

  it("does not inherit old scopes into a fresh authorization grant", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600, omitCodeScope: true });
    const dir = tempDir();
    const url = `${fake.url}/mcp`;
    seedV1Store(dir, url, { access_token: "expired", expires_in: 1, scope: "old:write" });
    const service = makeServiceAt(dir);
    const begin = await service.begin({ server: httpServer(fake.url) });
    if (begin.status !== "redirect") throw new Error("Expected a fresh authorization grant");
    await completeBrowserLeg(begin.authorizationUrl);
    expect(await service.wait({ flowId: begin.flowId })).toEqual({ status: "authorized" });
    expect(service.credentialStatus(url).scopes).toEqual([]);
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

  it("coalesces simultaneous refreshes of pre-upgrade credentials", async () => {
    const fake = await startFakeAuthServer({ expiresIn: 3600 });
    const dir = tempDir();
    seedV1Store(dir, `${fake.url}/mcp`, {
      access_token: "old",
      token_type: "Bearer",
      refresh_token: "rt-1",
      expires_in: 3600,
    });
    const service = makeServiceAt(dir);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => service.applyAuthorizationToServer(httpServer(fake.url))),
    );
    expect(fake.tokenRequests).toHaveLength(1);
    for (const server of results)
      expect(server.transport).toMatchObject({ headers: { Authorization: "Bearer at-2" } });
  });

  it("bounds a stalled refresh without discarding refreshable credentials", async () => {
    const gate = Promise.withResolvers<void>();
    const fake = await startFakeAuthServer({ expiresIn: 3600, refreshGate: gate.promise });
    const dir = tempDir();
    seedV1Store(dir, `${fake.url}/mcp`, {
      access_token: "old",
      token_type: "Bearer",
      refresh_token: "rt-1",
      expires_in: 3600,
    });
    const service = new McpOAuthService({ baseDir: dir, refreshTimeoutMs: 200 });
    cleanups.push(() => service.dispose());
    const server = httpServer(fake.url);
    const pending = service.applyAuthorizationToServer(server);
    await vi.waitFor(() => expect(fake.tokenRequests).toHaveLength(1));
    expect(await pending).toBe(server);
    expect(service.status().authenticatedUrls).toEqual([`${fake.url}/mcp`]);
    gate.resolve();
  });

  it("joins a refresh already awaiting its grant instead of using issuer-stamped expired tokens", async () => {
    const gate = Promise.withResolvers<void>();
    const fake = await startFakeAuthServer({ expiresIn: 3600, refreshGate: gate.promise });
    const dir = tempDir();
    seedV1Store(dir, `${fake.url}/mcp`, {
      access_token: "old",
      token_type: "Bearer",
      refresh_token: "rt-1",
      expires_in: 3600,
    });
    const service = makeServiceAt(dir);
    const first = service.applyAuthorizationToServer(httpServer(fake.url));
    await vi.waitFor(() => expect(fake.tokenRequests).toHaveLength(1));
    const second = service.applyAuthorizationToServer(httpServer(fake.url));
    gate.resolve();
    for (const server of await Promise.all([first, second])) {
      expect(server.transport).toMatchObject({ headers: { Authorization: "Bearer at-2" } });
    }
    expect(fake.tokenRequests).toHaveLength(1);
  });

  it.each(["clear", "dispose"] as const)(
    "cancels an in-flight refresh on %s without restoring credentials",
    async (action) => {
      const gate = Promise.withResolvers<void>();
      const fake = await startFakeAuthServer({ expiresIn: 3600, refreshGate: gate.promise });
      const dir = tempDir();
      const url = `${fake.url}/mcp`;
      seedV1Store(dir, url, {
        access_token: "old",
        token_type: "Bearer",
        refresh_token: "rt-1",
        expires_in: 3600,
      });
      const service = makeServiceAt(dir);
      const server = httpServer(fake.url);
      const pending = service.applyAuthorizationToServer(server);
      await vi.waitFor(() => expect(fake.tokenRequests).toHaveLength(1));
      const original = (
        JSON.parse(readFileSync(join(dir, "mcp-oauth.json"), "utf8")) as {
          servers: Record<string, unknown>;
        }
      ).servers[url];
      if (action === "clear") service.clear({ url });
      else await service.dispose();
      expect(await pending).toBe(server);
      gate.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));
      const persisted = JSON.parse(readFileSync(join(dir, "mcp-oauth.json"), "utf8")) as {
        servers: Record<string, unknown>;
      };
      expect(persisted.servers[url]).toEqual(action === "clear" ? undefined : original);
    },
  );

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
    // Issuer stamping is a metadata upgrade, not a successful refresh. A
    // second connection must not receive the old expired token as "fresh".
    expect(await service.applyAuthorizationToServer(server)).toBe(server);
    expect(fake.tokenRequests).toHaveLength(2);
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
