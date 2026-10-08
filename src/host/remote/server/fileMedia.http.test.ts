import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { dbGetProjects, dbGetThreads } from "@/host/db";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RemoteEnvironmentClient } from "@/shared/remote/clientEnvironments";
import {
  startChildHost,
  startParentHost,
  type ChildHostHandle,
} from "../environments/environmentProxyTestFixtures";
import type { CleanupRegistry } from "../portForward/testFixtures";
import { testThread } from "@/host/db/runtimeItems.testFixtures";

vi.mock("@/host/db", () => ({
  addRuntimePersistenceHealthListener: vi.fn<(...args: unknown[]) => () => void>(() => () => {}),
  dbGetProjects: vi.fn<typeof dbGetProjects>(() => []),
  dbGetThreads: vi.fn<typeof dbGetThreads>(() => []),
  dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
}));

const cleanup: CleanupRegistry = [];
let root: string;
let location: ProjectLocation;
beforeEach(() => {
  mkdirSync("tmp/issue-806", { recursive: true });
  root = mkdtempSync("tmp/issue-806/media-");
  location = { kind: "posix", path: join(process.cwd(), root, "project") };
  mkdirSync(location.path);
  writeFileSync(join(location.path, "clip.mp4"), Buffer.from("0123456789"));
  vi.mocked(dbGetProjects).mockReturnValue([
    { id: "project", name: "Fixture", createdAt: "2026-01-01", location },
  ]);
  vi.mocked(dbGetThreads).mockReturnValue([]);
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  rmSync(root, { recursive: true, force: true });
});

function client(host: ChildHostHandle, token = host.accessToken) {
  return new RemoteDesktopClient(host.info.httpBaseUrl, token);
}
function file(path = "clip.mp4") {
  return { access: "project" as const, projectLocation: location, path };
}

describe("authorized editor media HTTP", () => {
  it("streams repeated ranges with exact 200/206/416 headers and hardened content types", async () => {
    const host = await startChildHost(cleanup);
    const source = await client(host).createMediaSource(file());
    expect(source).toMatchObject({ sizeBytes: 10, contentType: "video/mp4" });
    expect(source.url).not.toContain(host.accessToken);
    for (const [range, expected, status] of [
      [null, "0123456789", 200],
      ["bytes=2-5", "2345", 206],
      ["bytes=-3", "789", 206],
      ["bytes=8-", "89", 206],
      ["bytes=0-999", "0123456789", 206],
      ["bytes=0-1,3-4", "0123456789", 200],
    ] as const) {
      const response = await fetch(source.url, range ? { headers: { range } } : {});
      expect(response.status).toBe(status);
      expect(await response.text()).toBe(expected);
      expect(response.headers.get("content-length")).toBe(String(expected.length));
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain("sandbox");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    const pastEnd = await fetch(source.url, { headers: { range: "bytes=10-" } });
    expect(pastEnd.status).toBe(416);
    expect(pastEnd.headers.get("content-range")).toBe("bytes */10");
    await client(host).releaseMediaSource(source.ticket);
    expect((await fetch(source.url)).status).toBe(401);
  });

  it("requires authentication, registered roots and containment, without an absolute-path fallback", async () => {
    const host = await startChildHost(cleanup);
    await expect(client(host, "invalid").createMediaSource(file())).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      client(host).createMediaSource({
        ...file(),
        projectLocation: { kind: "posix", path: "/private" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(client(host).createMediaSource(file("../outside.mp4"))).rejects.toMatchObject({
      status: 400,
    });
    writeFileSync(join(root, "outside.mp4"), "private");
    const projectPath = location.kind === "posix" ? location.path : "";
    symlinkSync(join(process.cwd(), root, "outside.mp4"), join(projectPath, "escape.mp4"));
    await expect(client(host).createMediaSource(file("escape.mp4"))).rejects.toMatchObject({
      status: 403,
    });
    writeFileSync(join(projectPath, "active.svg"), "<svg><script>evil()</script></svg>");
    await expect(client(host).createMediaSource(file("active.svg"))).rejects.toMatchObject({
      status: 415,
    });
    const viewerGrant = host.authStore.exchangePairingCredential({
      credential: host.authStore.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    await expect(
      client(host, viewerGrant.accessToken).createMediaSource({
        access: "external",
        projectLocation: location,
        path: join(projectPath, "clip.mp4"),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rechecks project ownership, file identity and session revocation after mint", async () => {
    const host = await startChildHost(cleanup);
    const source = await client(host).createMediaSource(file());
    vi.mocked(dbGetProjects).mockReturnValue([]);
    expect((await fetch(source.url)).status).toBe(403);
    vi.mocked(dbGetProjects).mockReturnValue([
      { id: "project", name: "Fixture", createdAt: "2026-01-01", location },
    ]);
    const projectPath = location.kind === "posix" ? location.path : "";
    writeFileSync(join(projectPath, "clip.mp4"), "replaced-file");
    expect((await fetch(source.url)).status).toBe(409);
    const replacement = await client(host).createMediaSource(file());
    expect(await (await fetch(replacement.url)).text()).toBe("replaced-file");
    host.server.revokeAccessSession(
      host.authStore.authenticateBearerToken(host.accessToken).sessionId,
    );
    expect((await fetch(replacement.url)).status).toBe(401);
  });

  it("accepts only durable registered worktrees under read access", async () => {
    const host = await startChildHost(cleanup);
    const worktree = join(process.cwd(), root, "worktree");
    mkdirSync(worktree);
    writeFileSync(join(worktree, "clip.mp4"), "worktree-video");
    vi.mocked(dbGetThreads).mockReturnValue([
      { ...testThread(), projectId: "project", worktreePath: worktree },
    ]);
    const source = await client(host).createMediaSource({
      ...file(),
      projectLocation: { kind: "posix", path: worktree },
    });
    expect(await (await fetch(source.url)).text()).toBe("worktree-video");
    vi.mocked(dbGetThreads).mockReturnValue([]);
    expect((await fetch(source.url)).status).toBe(403);
  });

  it("keeps parent and child grants independently scoped across real environment proxy ranges", async () => {
    const child = await startChildHost(cleanup);
    const parent = await startParentHost(cleanup);
    parent.targets.connect("env-one", child.port);
    parent.targets.connect("env-two", child.port);
    const parentClient = new RemoteDesktopClient(parent.info.httpBaseUrl, parent.parentAccessToken);
    const environment = new RemoteEnvironmentClient(
      `${parent.info.httpBaseUrl}api/environments/env-one/proxy/`,
      child.accessToken,
      undefined,
      {
        environmentId: "env-one",
        parentAuthority: {
          accessToken: () => parent.parentAccessToken,
          ensureLive: async () => {},
          mintWebSocketTicket: async () => ({
            ticket: "unused",
            expiresAt: new Date().toISOString(),
          }),
          mintMediaTicket: (childTicket) =>
            parentClient.environmentMediaTicket("env-one", childTicket),
          releaseMediaTicket: (ticket) =>
            parentClient.releaseEnvironmentMediaTicket("env-one", ticket),
        },
      },
    );
    const source = await environment.createMediaSource(file());
    expect(source.url).not.toContain(parent.parentAccessToken);
    expect(source.url).not.toContain(child.accessToken);
    const range = await fetch(source.url, { headers: { range: "bytes=2-4" } });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe("234");
    expect((await fetch(source.url.replace("env-one/proxy", "env-two/proxy"))).status).toBe(401);
    const wrongFile = new URL(source.url);
    wrongFile.searchParams.set("ticket", `pc_media_${"a".repeat(43)}`);
    expect((await fetch(wrongFile)).status).toBe(401);
    const wrongRoute = new URL(source.url);
    wrongRoute.pathname = wrongRoute.pathname.replace("/files/media", "/files/image");
    expect((await fetch(wrongRoute)).status).toBe(401);
    await environment.releaseMediaSource(source.ticket);
    expect((await fetch(source.url)).status).toBe(401);
    // Closed previews release both budgets immediately; 40 opens cannot fill a 32-grant session.
    for (let index = 0; index < 40; index++) {
      const transient = await environment.createMediaSource(file());
      await environment.releaseMediaSource(transient.ticket);
    }
    const next = await environment.createMediaSource(file());
    parent.targets.connect("env-one", child.port);
    expect((await fetch(next.url)).status).toBe(401);
    const third = await environment.createMediaSource(file());
    parent.server.revokeAccessSession(
      parent.authStore.authenticateBearerToken(parent.parentAccessToken).sessionId,
    );
    expect((await fetch(third.url)).status).toBe(401);
    environment.dispose();
  });
});
