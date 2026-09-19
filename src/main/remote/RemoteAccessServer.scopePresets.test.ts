import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOTE_HTTP_ROUTES } from "@/shared/remote/contract";
import { REMOTE_OPERATOR_SCOPES, REMOTE_VIEWER_SCOPES } from "@/shared/remote";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";

vi.mock("../db", () => {
  const appState = new Map<string, string>();
  return {
    dbAppendThreadCompletedTurn: vi.fn<(...args: unknown[]) => unknown>(),
    dbApplyThreadRuntimeEvents: vi.fn<(...args: unknown[]) => unknown>(),
    dbClaimRemoteCommand: vi.fn<(...args: unknown[]) => unknown>(() => ({ state: "claimed" })),
    dbCompleteRemoteCommand: vi.fn<(...args: unknown[]) => unknown>(),
    dbFailRemoteCommand: vi.fn<(...args: unknown[]) => unknown>(),
    dbResetRemoteCommand: vi.fn<(...args: unknown[]) => unknown>(),
    dbGetCheckpointRevertOperation: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbDeleteThread: vi.fn<(...args: unknown[]) => unknown>(),
    dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbGetProjectNotes: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbGetProjects: vi.fn<(...args: unknown[]) => unknown>(() => []),
    dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbGetThreads: vi.fn<(...args: unknown[]) => unknown>(() => []),
    dbGetThreadCompletedTurns: vi.fn<(...args: unknown[]) => unknown>(() => []),
    dbGetThreadContextUsage: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbGetLatestThreadGoalItem: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbGetLatestThreadRuntimeAnchorItemId: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbGetThreadRuntimeItem: vi.fn<(...args: unknown[]) => unknown>(() => undefined),
    dbGetThreadRuntimeItems: vi.fn<(...args: unknown[]) => unknown>(() => []),
    dbGetThreadRuntimeItemsPage: vi.fn<(...args: unknown[]) => unknown>(() => ({
      items: [],
      nextCursor: null,
    })),
    dbGetThreadRuntimeSummaries: vi.fn<(...args: unknown[]) => unknown>(() => ({})),
    dbGetThreadTerminalScrollback: vi.fn<(...args: unknown[]) => unknown>(() => ""),
    dbGetThreadTerminalScrollbackRecord: vi.fn<(...args: unknown[]) => unknown>(() => null),
    dbReplaceThreadRuntimeSnapshot: vi.fn<(...args: unknown[]) => unknown>(),
    dbGetState: vi.fn<(key: string) => string | null>((key: string) => appState.get(key) ?? null),
    dbSetState: vi.fn<(key: string, value: string) => void>((key: string, value: string) => {
      appState.set(key, value);
    }),
    dbSetProjectNotes: vi.fn<(...args: unknown[]) => unknown>(),
    dbTruncateThreadRuntimeAfter: vi.fn<(...args: unknown[]) => unknown>(),
    dbUpdateProject: vi.fn<(...args: unknown[]) => unknown>(),
    dbUpsertProject: vi.fn<(...args: unknown[]) => unknown>(),
    dbUpsertThread: vi.fn<(...args: unknown[]) => unknown>(),
    dbDeleteProject: vi.fn<(...args: unknown[]) => unknown>(),
    dbGetAllUsageEvents: vi.fn<(...args: unknown[]) => unknown>(() => []),
    getProfileDataGeneration: vi.fn<(...args: unknown[]) => unknown>(() => 0),
    bumpProfileDataGeneration: vi.fn<(...args: unknown[]) => unknown>(),
  };
});

const servers: RemoteAccessServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

function createServer(): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-test", label: "Test Desktop" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
  });
  servers.push(server);
  return server;
}

/** Issues a bearer token from an independent pairing grant: `scopes` requests a
 * narrowing; `undefined` inherits the credential's grant (Gate 6 posture). */
async function issueToken(
  server: RemoteAccessServer,
  info: RemoteAccessServerInfo,
  scopes: readonly string[] | undefined,
): Promise<string> {
  const pairingUrl = server.issueIndependentPairingUrl("Matrix grant");
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      client: { label: "Scope matrix", deviceType: "browser" },
      ...(scopes ? { scopes } : {}),
    }),
  });
  expect(response.status).toBe(200);
  const token = (await response.json()) as { accessToken: string };
  return token.accessToken;
}

async function errorCode(response: Response): Promise<string | null> {
  if (response.status === 200) return null;
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  return body?.error?.code ?? null;
}

/** A concrete path for the registry's `{param}` templates (any single segment
 * works: the scope gate runs before handlers touch the params). */
function routePath(path: string): string {
  return path.replaceAll(/\{[A-Za-z][A-Za-z0-9]*\}/g, "matrix-param");
}

describe("RemoteAccessServer scope presets (Gate 6 item 4.3)", () => {
  it("denies a viewer token on every mutating registry route", async () => {
    const server = createServer();
    const info = await server.start();
    const viewer = await issueToken(server, info, REMOTE_VIEWER_SCOPES);

    // A route is mutating when any registry scope lies outside the viewer
    // preset. The matrix is enumerated from the registry itself, so a route
    // that later gains a mutating scope joins this matrix automatically.
    const mutatingRoutes = REMOTE_HTTP_ROUTES.filter(
      (route) =>
        route.auth === "bearer" &&
        route.scopes.some((scope) => !REMOTE_VIEWER_SCOPES.includes(scope)),
    );
    expect(mutatingRoutes.length).toBeGreaterThan(20);

    for (const route of mutatingRoutes) {
      const response = await fetch(new URL(routePath(route.path), info.httpBaseUrl), {
        method: route.method,
        headers: { authorization: `Bearer ${viewer}` },
      });
      expect(`${route.id} status ${response.status}`).toBe(`${route.id} status 403`);
      expect(`${route.id} code ${await errorCode(response)}`).toBe(
        `${route.id} code missing_scope`,
      );
    }
  });

  it("admits a viewer token on every read-only registry route", async () => {
    const server = createServer();
    const info = await server.start();
    const viewer = await issueToken(server, info, REMOTE_VIEWER_SCOPES);

    const readOnlyRoutes = REMOTE_HTTP_ROUTES.filter(
      (route) =>
        route.auth === "bearer" &&
        route.scopes.length > 0 &&
        route.scopes.every((scope) => REMOTE_VIEWER_SCOPES.includes(scope)),
    );
    expect(readOnlyRoutes.length).toBeGreaterThan(15);

    for (const route of readOnlyRoutes) {
      const response = await fetch(new URL(routePath(route.path), info.httpBaseUrl), {
        method: route.method,
        headers: { authorization: `Bearer ${viewer}`, "content-type": "application/json" },
        ...(route.method === "POST" ? { body: "{}" } : {}),
      });
      // The scope gate must admit the token; whatever the handler then answers
      // for the placeholder parameters, it is never a scope denial.
      expect(`${route.id} code ${await errorCode(response)}`).not.toBe(
        `${route.id} code missing_scope`,
      );
    }

    // Representative reads answer 200 for a viewer.
    expect(
      (
        await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
          method: "POST",
          headers: { authorization: `Bearer ${viewer}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
          headers: { authorization: `Bearer ${viewer}` },
        })
      ).status,
    ).toBe(200);
  });

  it("enforces the per-procedure scope on the procedure route for viewer tokens", async () => {
    const server = createServer();
    const info = await server.start();
    const viewer = await issueToken(server, info, REMOTE_VIEWER_SCOPES);
    const call = (procedure: string, payload: Record<string, unknown>) =>
      fetch(new URL("/api/git/call", info.httpBaseUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${viewer}`, "content-type": "application/json" },
        body: JSON.stringify({ procedure, payload }),
      });

    // A mutating procedure is denied by its own scope…
    const denied = await call("gitStage", { projectId: "project-1", path: "a", content: "x" });
    expect(denied.status).toBe(403);
    expect(await errorCode(denied)).toBe("missing_scope");

    // …while a read procedure passes the scope gate (its payload validation
    // may still reject the placeholder — that is not a scope denial).
    const allowed = await call("getGitStatus", { projectId: "project-1" });
    expect(await errorCode(allowed)).not.toBe("missing_scope");
  });

  it("keeps read-only image routes usable for viewer tokens", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-remote-viewer-"));
    tempDirs.push(dir);
    const imagePath = join(dir, "pixel.png");
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const server = createServer();
    const info = await server.start();
    const viewer = await issueToken(server, info, REMOTE_VIEWER_SCOPES);

    const imageUrl = new URL("/api/files/image", info.httpBaseUrl);
    imageUrl.searchParams.set("path", imagePath);
    const response = await fetch(imageUrl, {
      headers: { authorization: `Bearer ${viewer}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    // Minting an image ticket is a read-side artifact: viewer tokens may mint.
    const minted = await fetch(new URL("/api/files/image-ticket", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${viewer}`, "content-type": "application/json" },
      body: JSON.stringify({ path: imagePath }),
    });
    expect(minted.status).toBe(200);
  });

  it("issues viewer-preset pairings server-side without any client scope request", async () => {
    const server = createServer();
    const info = await server.start();
    const pairingUrl = server.issueIndependentPairingUrl("Tablet", { preset: "viewer" });
    const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
    expect(credential).toBeTruthy();

    const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        client: { label: "Viewer tablet", deviceType: "tablet" },
      }),
    });
    expect(response.status).toBe(200);
    const token = (await response.json()) as { accessToken: string; scopes: string[] };
    expect(token.scopes).toEqual([...REMOTE_VIEWER_SCOPES]);

    const mutating = await fetch(new URL("/api/threads/matrix/send", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(mutating.status).toBe(403);
    expect(await errorCode(mutating)).toBe("missing_scope");
  });

  it("keeps the operator preset as the default grant", async () => {
    const server = createServer();
    const info = await server.start();

    // The startup pairing credential exchanges, without any scope request, to
    // the full operator set.
    const startupCredential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get(
      "token",
    );
    expect(startupCredential).toBeTruthy();
    const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: startupCredential,
        client: { label: "Operator desktop", deviceType: "desktop" },
      }),
    });
    expect(response.status).toBe(200);
    const token = (await response.json()) as { accessToken: string; scopes: string[] };
    expect(token.scopes).toEqual([...REMOTE_OPERATOR_SCOPES]);
    expect(token.scopes).toContain("session:operate");

    // An independent pairing URL defaults to the same operator preset.
    const independent = await issueToken(server, info, undefined);
    const denied = await fetch(new URL("/api/settings", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${independent}`, "content-type": "application/json" },
      body: "{}",
    });
    // session:operate passes the scope gate; the empty patch is not a scope
    // problem either way — the operator token is never scope-denied.
    expect(await errorCode(denied)).not.toBe("missing_scope");
  });
});
