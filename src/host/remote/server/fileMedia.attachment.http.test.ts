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
import { fileMediaGrants } from "./fileMedia";
import { PLAYBACK_GRANT_TTL_MS } from "./playbackGrants";

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
const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0xde, 0xad, 0xbe, 0xef]);
const pdfBytes = Buffer.from("%PDF-1.7 binary-bytes");
beforeEach(() => {
  mkdirSync("tmp/file-downloads", { recursive: true });
  root = mkdtempSync("tmp/file-downloads/media-");
  location = { kind: "posix", path: join(process.cwd(), root, "project") };
  mkdirSync(location.path);
  writeFileSync(join(location.path, "release.zip"), zipBytes);
  writeFileSync(join(location.path, "spec.pdf"), pdfBytes);
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
function download(path: string) {
  return {
    access: "project" as const,
    projectLocation: location,
    path,
    disposition: "attachment" as const,
  };
}
function externalDownload(path: string) {
  return {
    access: "external" as const,
    projectLocation: location,
    path,
    disposition: "attachment" as const,
  };
}

describe("attachment file downloads", () => {
  it("streams real ZIP and PDF bytes as octet-stream attachment with the true basename", async () => {
    const host = await startChildHost(cleanup);
    for (const [path, bytes] of [
      ["release.zip", zipBytes],
      ["spec.pdf", pdfBytes],
    ] as const) {
      const source = await client(host).createMediaSource(download(path));
      expect(source.contentType).toBe("application/octet-stream");
      expect(source.url).not.toContain(host.accessToken);
      const response = await fetch(source.url);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get("content-type")).toBe("application/octet-stream");
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="${path}"; filename*=UTF-8''${path}`,
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const range = await fetch(source.url, { headers: { range: "bytes=1-3" } });
      expect(range.status).toBe(206);
      expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(1, 4));
      expect(range.headers.get("content-disposition")).toContain("attachment");
      await client(host).releaseMediaSource(source.ticket);
      expect((await fetch(source.url)).status).toBe(401);
    }
  });

  it("keeps Unicode download names safe in filename*", async () => {
    const host = await startChildHost(cleanup);
    const name = "my repört ünïcode.zip";
    writeFileSync(join(location.kind === "posix" ? location.path : "", name), zipBytes);
    const source = await client(host).createMediaSource(download(name));
    const response = await fetch(source.url);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="my rep_rt _n_code.zip"; filename*=UTF-8''my%20rep%C3%B6rt%20%C3%BCn%C3%AFcode.zip`,
    );
  });

  it("streams a zero-byte attachment", async () => {
    const host = await startChildHost(cleanup);
    writeFileSync(join(location.kind === "posix" ? location.path : "", "empty.bin"), "");
    const source = await client(host).createMediaSource(download("empty.bin"));
    const response = await fetch(source.url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("0");
    expect(await response.text()).toBe("");
  });

  it("serves contained downloads to a viewer but refuses viewer external access and nonmedia inline requests", async () => {
    const host = await startChildHost(cleanup);
    const viewer = host.authStore.exchangePairingCredential({
      credential: host.authStore.issuePairingCredential({ scopes: ["session:read"] }).credential,
    });
    const contained = await client(host, viewer.accessToken).createMediaSource(
      download("release.zip"),
    );
    expect((await fetch(contained.url)).status).toBe(200);
    await expect(
      client(host, viewer.accessToken).createMediaSource(
        externalDownload(join(location.kind === "posix" ? location.path : "", "release.zip")),
      ),
    ).rejects.toMatchObject({ status: 403 });
    // The external lane stays available to a managing session for real files.
    const manager = host.authStore.exchangePairingCredential({
      credential: host.authStore.issuePairingCredential({
        scopes: ["session:read", "projects:manage"],
      }).credential,
    });
    const outside = join(process.cwd(), root, "outside.zip");
    writeFileSync(outside, zipBytes);
    const external = await client(host, manager.accessToken).createMediaSource(
      externalDownload(outside),
    );
    expect(Buffer.from(await (await fetch(external.url)).arrayBuffer())).toEqual(zipBytes);
    // Without the attachment option the media allowlist still applies.
    const { disposition: _dropped, ...inline } = download("release.zip");
    await expect(client(host).createMediaSource(inline)).rejects.toMatchObject({ status: 415 });
    await expect(client(host).createMediaSource(download("../escape.zip"))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("refuses symlink escapes even for attachment grants", async () => {
    const host = await startChildHost(cleanup);
    const projectPath = location.kind === "posix" ? location.path : "";
    writeFileSync(join(process.cwd(), root, "secret.zip"), zipBytes);
    symlinkSync(join(process.cwd(), root, "secret.zip"), join(projectPath, "escape.zip"));
    await expect(client(host).createMediaSource(download("escape.zip"))).rejects.toMatchObject({
      status: 403,
    });
  });

  it("retires a changed file's download grant", async () => {
    const host = await startChildHost(cleanup);
    const source = await client(host).createMediaSource(download("release.zip"));
    writeFileSync(join(location.kind === "posix" ? location.path : "", "release.zip"), "changed");
    expect((await fetch(source.url)).status).toBe(409);
  });

  it("streams an attachment through the parent environment proxy with its filename and bytes", async () => {
    const child = await startChildHost(cleanup);
    const parent = await startParentHost(cleanup);
    parent.targets.connect("env", child.port);
    const parentClient = new RemoteDesktopClient(parent.info.httpBaseUrl, parent.parentAccessToken);
    const environment = new RemoteEnvironmentClient(
      `${parent.info.httpBaseUrl}api/environments/env/proxy/`,
      child.accessToken,
      undefined,
      {
        environmentId: "env",
        parentAuthority: {
          accessToken: () => parent.parentAccessToken,
          ensureLive: async () => {},
          mintWebSocketTicket: async () => ({
            ticket: "unused",
            expiresAt: new Date().toISOString(),
          }),
          mintMediaTicket: (childTicket) => parentClient.environmentMediaTicket("env", childTicket),
          renewMediaTicket: (ticket, signal) =>
            parentClient.renewEnvironmentMediaTicket("env", ticket, signal),
          releaseMediaTicket: (ticket) => parentClient.releaseEnvironmentMediaTicket("env", ticket),
        },
      },
    );
    const source = await environment.createMediaSource(download("release.zip"));
    expect(source.url).not.toContain(child.accessToken);
    expect(source.url).not.toContain(parent.parentAccessToken);
    const response = await fetch(source.url);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(zipBytes);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="release.zip"; filename*=UTF-8''release.zip`,
    );
    await environment.releaseMediaSource(source.ticket);
    expect((await fetch(source.url)).status).toBe(401);
    environment.dispose();
  });

  // A held in-flight transfer survives admission expiry: new reads are 401,
  // the running stream is not aborted, and the last hold release retires.
  it("keeps a held in-flight download alive past admission expiry while new GETs are refused", async () => {
    const host = await startChildHost(cleanup);
    const source = await client(host).createMediaSource(download("release.zip"));
    const store = fileMediaGrants(host.authStore);
    const grant = store.read(source.ticket);
    const releaseHold = store.hold(source.ticket); // an in-flight stream's pin
    const pastAdmission = Date.now() + PLAYBACK_GRANT_TTL_MS + 60_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(pastAdmission);
    try {
      // Admission is closed but the held transfer's signal stays live.
      expect(grant.signal.aborted).toBe(false);
      expect((await fetch(source.url)).status).toBe(401);
      expect(() => store.read(source.ticket)).toThrow("expired");
      expect(grant.signal.aborted).toBe(false);
      releaseHold();
      releaseHold(); // idempotent
      expect(grant.signal.aborted).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect((await fetch(source.url)).status).toBe(401);
  });

  it("lets explicit release and session revocation interrupt a held stream", async () => {
    const host = await startChildHost(cleanup);
    const store = fileMediaGrants(host.authStore);
    for (const mode of ["release", "revoke"] as const) {
      const source = await client(host).createMediaSource(download("release.zip"));
      const grant = store.read(source.ticket);
      const releaseHold = store.hold(source.ticket);
      const sessionId = grant.sessionId;
      const spy = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.now() + PLAYBACK_GRANT_TTL_MS + 60_000);
      try {
        expect(grant.signal.aborted).toBe(false);
        if (mode === "release") store.release(source.ticket, sessionId);
        else store.revokeSession(sessionId);
        expect(grant.signal.aborted).toBe(true);
        releaseHold();
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("keeps a held parent-proxied download alive past admission expiry", async () => {
    const child = await startChildHost(cleanup);
    const parent = await startParentHost(cleanup);
    parent.targets.connect("env", child.port);
    const parentClient = new RemoteDesktopClient(parent.info.httpBaseUrl, parent.parentAccessToken);
    const environment = new RemoteEnvironmentClient(
      `${parent.info.httpBaseUrl}api/environments/env/proxy/`,
      child.accessToken,
      undefined,
      {
        environmentId: "env",
        parentAuthority: {
          accessToken: () => parent.parentAccessToken,
          ensureLive: async () => {},
          mintWebSocketTicket: async () => ({
            ticket: "unused",
            expiresAt: new Date().toISOString(),
          }),
          mintMediaTicket: (childTicket) => parentClient.environmentMediaTicket("env", childTicket),
          renewMediaTicket: (ticket, signal) =>
            parentClient.renewEnvironmentMediaTicket("env", ticket, signal),
          releaseMediaTicket: (ticket) => parentClient.releaseEnvironmentMediaTicket("env", ticket),
        },
      },
    );
    const source = await environment.createMediaSource(download("release.zip"));
    const first = await fetch(source.url);
    expect(first.status).toBe(200);
    expect(Buffer.from(await first.arrayBuffer())).toEqual(zipBytes);
    const spy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + PLAYBACK_GRANT_TTL_MS + 60_000);
    try {
      // Admission is closed on the parent too; a new proxied GET is refused.
      const second = await fetch(source.url);
      expect(second.status).toBe(401);
    } finally {
      spy.mockRestore();
    }
    environment.dispose();
  });
});
