import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { dbGetProjects, dbGetThreads } from "@/host/db";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "../RemoteAccessServer";
import { RemoteAuthStore, RemoteHttpError } from "../auth";
import { baseOptions, exchangeToken } from "../environments/environmentProxyTestFixtures";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn<typeof actual.open>(actual.open) };
});
vi.mock("@/host/db", () => ({
  addRuntimePersistenceHealthListener: vi.fn<(...args: unknown[]) => () => void>(() => () => {}),
  dbGetProjects: vi.fn<typeof dbGetProjects>(() => []),
  dbGetThreads: vi.fn<typeof dbGetThreads>(() => []),
  dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
}));

let root: string;
let location: ProjectLocation;
const cleanup: (() => Promise<void>)[] = [];
beforeEach(() => {
  mkdirSync("tmp/issue-806", { recursive: true });
  root = mkdtempSync(join(process.cwd(), "tmp/issue-806/media-validation-"));
  location = { kind: "posix", path: join(root, "project") };
  mkdirSync(location.path);
  writeFileSync(join(location.path, "clip.mp4"), "0123456789");
  register();
  vi.mocked(dbGetThreads).mockReturnValue([]);
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function register() {
  vi.mocked(dbGetProjects).mockReturnValue([
    { id: "project", name: "Media", createdAt: "2026-01-01", location },
  ]);
}
async function host(callSupervisor?: RemoteAccessServerOptions["callSupervisor"]) {
  const authStore = new RemoteAuthStore();
  const server = new RemoteAccessServer(
    baseOptions({ authStore, ...(callSupervisor ? { callSupervisor } : {}) }),
  );
  cleanup.push(() => server.dispose());
  const info = await server.start();
  const token = await exchangeToken(server);
  return { owner: new RemoteDesktopClient(info.httpBaseUrl, token), authStore, token, server };
}
function file(path = "clip.mp4") {
  return { access: "project" as const, projectLocation: location, path };
}

// The mount and supervisor gate below are headless fixtures, not real Windows/WSL proof.
describe("post-await media validation over real HTTP", () => {
  it("runs one in-distro admission per request and refuses registry removal or admission failure after a slow WSL gate", async () => {
    location = {
      kind: "wsl",
      distro: "Fixture",
      linuxPath: "/fixture/project",
      uncPath: join(root, "project"),
    };
    register();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => ({ status: "binary" }) as never,
    );
    const { owner } = await host(callSupervisor);
    const source = await owner.createMediaSource(file());
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    callSupervisor.mockClear();
    const range = await fetch(source.url, { headers: { range: "bytes=2-4" } });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe("234");
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    callSupervisor.mockClear();
    expect((await owner.renewMediaSource(source.ticket)).ticket).toBe(source.ticket);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    callSupervisor.mockImplementationOnce(async () => {
      vi.mocked(dbGetProjects).mockReturnValue([]);
      return { status: "binary" } as never;
    });
    expect((await fetch(source.url, { headers: { range: "bytes=0-1" } })).status).toBe(403);
    register();
    callSupervisor.mockImplementationOnce(async () => {
      vi.mocked(dbGetProjects).mockReturnValue([]);
      return { status: "binary" } as never;
    });
    await expect(owner.renewMediaSource(source.ticket)).rejects.toMatchObject({ status: 403 });
    register();
    callSupervisor.mockRejectedValueOnce(
      new RemoteHttpError("media_path_not_contained", "Fixture denial.", 403),
    );
    expect((await fetch(source.url)).status).toBe(403);
  });

  it.each([
    "registry",
    "registry-after-stat",
    "project",
    "file",
    "symlink",
    "root",
    "revocation",
    "revocation-after-stat",
  ] as const)(
    "refuses %s mutation during open and closes the validated descriptor",
    async (mutation) => {
      const hosted = await host();
      const project = join(root, "project");
      const outside = join(root, "outside");
      mkdirSync(outside);
      writeFileSync(join(outside, "clip.mp4"), "outside-bytes");
      let path = "clip.mp4";
      if (mutation === "symlink") {
        path = "alias.mp4";
        symlinkSync(join(project, "clip.mp4"), join(project, path));
      }
      if (mutation === "root") {
        const alias = join(root, "root-alias");
        symlinkSync(project, alias);
        location = { kind: "posix", path: alias };
        register();
      }
      const source = await hosted.owner.createMediaSource(file(path));
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      let descriptorClose: ReturnType<typeof vi.spyOn> | undefined;
      vi.mocked(open).mockImplementationOnce(async (...args) => {
        const descriptor = await actual.open(...args);
        descriptorClose = vi.spyOn(descriptor, "close");
        if (mutation === "registry-after-stat" || mutation === "revocation-after-stat") {
          const originalStat = descriptor.stat.bind(descriptor);
          vi.spyOn(descriptor, "stat").mockImplementationOnce(async () => {
            const info = await originalStat();
            if (mutation === "registry-after-stat") vi.mocked(dbGetProjects).mockReturnValue([]);
            else
              hosted.server.revokeAccessSession(
                hosted.authStore.authenticateBearerToken(hosted.token).sessionId,
              );
            return info;
          });
        }
        if (mutation === "registry") vi.mocked(dbGetProjects).mockReturnValue([]);
        if (mutation === "project")
          vi.mocked(dbGetProjects).mockReturnValue([
            { id: "replacement", name: "Media", createdAt: "2026-01-01", location },
          ]);
        if (mutation === "file") writeFileSync(join(project, "clip.mp4"), "changed-file");
        if (mutation === "symlink") {
          unlinkSync(join(project, path));
          symlinkSync(join(outside, "clip.mp4"), join(project, path));
        }
        if (mutation === "root") {
          unlinkSync(join(root, "root-alias"));
          symlinkSync(outside, join(root, "root-alias"));
        }
        if (mutation === "revocation")
          hosted.server.revokeAccessSession(
            hosted.authStore.authenticateBearerToken(hosted.token).sessionId,
          );
        return descriptor;
      });
      const response = await fetch(source.url, { headers: { range: "bytes=0-1" } });
      expect(response.status).toBe(
        mutation === "file" ? 409 : mutation.startsWith("revocation") ? 401 : 403,
      );
      expect(await response.text()).not.toContain("outside-bytes");
      expect(descriptorClose).toHaveBeenCalledOnce();
    },
  );
});
