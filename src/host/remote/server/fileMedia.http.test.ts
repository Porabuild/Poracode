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
  startUpstream,
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
  vi.restoreAllMocks();
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

  it("renews real-socket direct ranges past the original expiry using the same ticket and URL, rejects other sessions/expired/released tickets", async () => {
    const host = await startChildHost(cleanup);
    const owner = client(host);
    const source = await owner.createMediaSource(file());
    const initialExpiry = Date.parse(source.expiresAt);
    const other = host.authStore.exchangePairingCredential({
      credential: host.authStore.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    await expect(
      client(host, other.accessToken).renewMediaSource(source.ticket),
    ).rejects.toMatchObject({ status: 401 });
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 90_000);
    const renewed = await owner.renewMediaSource(source.ticket);
    expect(renewed.ticket).toBe(source.ticket);
    expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(initialExpiry);
    clock.mockReturnValue(initialExpiry + 1);
    const range = await fetch(source.url, { headers: { range: "bytes=3-6" } });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe("3456");
    expect(range.headers.get("x-poracode-media-expires-at")).toBe(renewed.expiresAt);
    await owner.releaseMediaSource(source.ticket);
    await expect(owner.renewMediaSource(source.ticket)).rejects.toMatchObject({ status: 401 });
    const expired = await owner.createMediaSource(file());
    clock.mockReturnValue(Date.parse(expired.expiresAt));
    await expect(owner.renewMediaSource(expired.ticket)).rejects.toMatchObject({ status: 401 });
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
    await expect(client(host).renewMediaSource(source.ticket)).rejects.toMatchObject({
      status: 403,
    });
    vi.mocked(dbGetProjects).mockReturnValue([
      { id: "project", name: "Fixture", createdAt: "2026-01-01", location },
    ]);
    vi.mocked(dbGetProjects).mockReturnValue([
      { id: "replacement-owner", name: "Fixture", createdAt: "2026-01-01", location },
    ]);
    await expect(client(host).renewMediaSource(source.ticket)).rejects.toMatchObject({
      status: 403,
      code: "media_owner_changed",
    });
    expect((await fetch(source.url)).status).toBe(403);
    vi.mocked(dbGetProjects).mockReturnValue([
      { id: "project", name: "Fixture", createdAt: "2026-01-01", location },
    ]);
    const projectPath = location.kind === "posix" ? location.path : "";
    writeFileSync(join(projectPath, "clip.mp4"), "replaced-file");
    expect((await fetch(source.url)).status).toBe(409);
    await expect(client(host).renewMediaSource(source.ticket)).rejects.toMatchObject({
      status: 409,
    });
    const replacement = await client(host).createMediaSource(file());
    expect(await (await fetch(replacement.url)).text()).toBe("replaced-file");
    host.server.revokeAccessSession(
      host.authStore.authenticateBearerToken(host.accessToken).sessionId,
    );
    expect((await fetch(replacement.url)).status).toBe(401);
    await expect(client(host).renewMediaSource(replacement.ticket)).rejects.toMatchObject({
      status: 401,
    });
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
          renewMediaTicket: (ticket, signal) =>
            parentClient.renewEnvironmentMediaTicket("env-one", ticket, signal),
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
    const now = Date.now();
    const originalExpiry = Date.parse(source.expiresAt);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 90_000);
    const renewed = await environment.renewMediaSource(source.ticket);
    expect(renewed.ticket).toBe(source.ticket);
    clock.mockReturnValue(originalExpiry + 1);
    const renewedRange = await fetch(source.url, { headers: { range: "bytes=4-7" } });
    expect(renewedRange.status).toBe(206);
    expect(await renewedRange.text()).toBe("4567");
    clock.mockReturnValue(now + 180_000);
    const twiceRenewed = await environment.renewMediaSource(source.ticket);
    expect(twiceRenewed.ticket).toBe(source.ticket);
    clock.mockReturnValue(now + 241_000);
    const later = await fetch(source.url, { headers: { range: "bytes=7-9" } });
    expect(later.status).toBe(206);
    expect(await later.text()).toBe("789");
    const parentTicket = new URL(source.url).searchParams.get("parentMediaTicket")!;
    // Child renewal alone cannot revive a parent that has naturally expired.
    clock.mockReturnValue(Date.parse(twiceRenewed.expiresAt));
    await expect(
      parentClient.renewEnvironmentMediaTicket("env-one", parentTicket),
    ).rejects.toMatchObject({ status: 401 });
    clock.mockRestore();
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
    await expect(environment.renewMediaSource(next.ticket)).rejects.toMatchObject({ status: 401 });
    const third = await environment.createMediaSource(file());
    parent.server.revokeAccessSession(
      parent.authStore.authenticateBearerToken(parent.parentAccessToken).sessionId,
    );
    expect((await fetch(third.url)).status).toBe(401);
    environment.dispose();
  });
  it("caps the parent at a verified child lease and refuses cross-session, scope, child retirement and late target/release races", async () => {
    const child = await startChildHost(cleanup);
    const parent = await startParentHost(cleanup);
    parent.targets.connect("env", child.port);
    const parentClient = new RemoteDesktopClient(parent.info.httpBaseUrl, parent.parentAccessToken);
    const childClient = client(child);
    const childSource = await childClient.createMediaSource(file());
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 90_000);
    const grant = await parentClient.environmentMediaTicket("env", childSource.ticket);
    expect(Date.parse(grant.expiresAt)).toBe(Date.parse(childSource.expiresAt));
    const other = parent.authStore.exchangePairingCredential({
      credential: parent.authStore.issuePairingCredential({
        scopes: ["session:operate", "ports:forward"],
      }).credential,
    });
    const otherClient = new RemoteDesktopClient(parent.info.httpBaseUrl, other.accessToken);
    await expect(
      otherClient.renewEnvironmentMediaTicket("env", grant.ticket),
    ).rejects.toMatchObject({ status: 401 });
    const viewer = parent.authStore.exchangePairingCredential({
      credential: parent.authStore.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    await expect(
      new RemoteDesktopClient(
        parent.info.httpBaseUrl,
        viewer.accessToken,
      ).renewEnvironmentMediaTicket("env", grant.ticket),
    ).rejects.toMatchObject({ status: 403 });
    vi.mocked(dbGetProjects).mockReturnValue([]);
    await expect(
      parentClient.renewEnvironmentMediaTicket("env", grant.ticket),
    ).rejects.toMatchObject({ status: 401 });
    vi.mocked(dbGetProjects).mockReturnValue([
      { id: "project", name: "Fixture", createdAt: "2026-01-01", location },
    ]);
    await childClient.releaseMediaSource(childSource.ticket);
    await expect(
      parentClient.renewEnvironmentMediaTicket("env", grant.ticket),
    ).rejects.toMatchObject({ status: 401 });
    clock.mockRestore();

    writeFileSync(join(location.kind === "posix" ? location.path : "", "empty.wav"), "");
    const empty = await childClient.createMediaSource(file("empty.wav"));
    const emptyParent = await parentClient.environmentMediaTicket("env", empty.ticket);
    expect(emptyParent.expiresAt).toBe(empty.expiresAt);
    await parentClient.releaseEnvironmentMediaTicket("env", emptyParent.ticket);
    await childClient.releaseMediaSource(empty.ticket);

    // A controlled child socket delays its verified expiry response so release/generation
    // races are exercised across real HTTP, not by calling a grant store mock.
    let hold = false;
    let started!: () => void;
    let pending!: import("node:http").ServerResponse;
    let waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const upstream = await startUpstream(cleanup, (_req, res) => {
      if (hold) {
        pending = res;
        started();
        return;
      }
      res.writeHead(206, {
        "x-poracode-media-expires-at": new Date(Date.now() + 120_000).toISOString(),
        "content-length": "1",
      });
      res.end("x");
    });
    parent.targets.connect("controlled", upstream.port);
    const ticket = `pc_media_${"x".repeat(43)}`;
    const first = await parentClient.environmentMediaTicket("controlled", ticket);
    hold = true;
    const renewal = parentClient.renewEnvironmentMediaTicket("controlled", first.ticket);
    // Attach a rejection handler before aborting the socket.
    const refused = renewal.catch((error: unknown) => error);
    await waiting;
    await parentClient.releaseEnvironmentMediaTicket("controlled", first.ticket);
    pending.end();
    expect(await refused).toMatchObject({ status: 401 });
    expect(parent.gateway.activeLegCount()).toBe(0);
    hold = false;
    const second = await parentClient.environmentMediaTicket("controlled", ticket);
    hold = true;
    waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const next = parentClient.renewEnvironmentMediaTicket("controlled", second.ticket);
    const generationRefused = next.catch((error: unknown) => error);
    await waiting;
    parent.targets.connect("controlled", upstream.port, { childDesktopId: "replacement-child" });
    pending.end();
    expect(await generationRefused).toMatchObject({ status: 401 });
    expect(parent.gateway.activeLegCount()).toBe(0);
  });
});
