import { describe, expect, it, vi } from "vitest";
import type { Project, ProjectLocation } from "@/shared/contracts";
import { ProjectWatcher } from "@/supervisor/projectWatcher";
import type { WslBridgeClient } from "@/supervisor/wsl/bridge/client";
import {
  HOST_WORKTREE_WATCH_OWNER,
  ProjectWatchLeases,
  type ProjectWatchSupervisorCaller,
} from "./ProjectWatchLeases";

type Call = readonly [string, unknown] | readonly [string, unknown, unknown];

function project(id: string, location: ProjectLocation, disabled = false): Project {
  return { id, name: id, location, createdAt: "2026-10-29T00:00:00.000Z", disabled };
}

function harness(initial: Project[]) {
  const projects = new Map(initial.map((entry) => [entry.id, entry]));
  const calls: Call[] = [];
  let gate: ((name: string, payload: unknown) => Promise<void> | void) | null = null;
  const call: ProjectWatchSupervisorCaller = async (name, payload, options) => {
    calls.push(options ? [name, payload, options] : [name, payload]);
    await gate?.(name, payload);
  };
  const leases = new ProjectWatchLeases({ call, getProject: (id) => projects.get(id) });
  return {
    leases,
    calls,
    projects,
    setGate(next: typeof gate) {
      gate = next;
    },
    drain() {
      calls.length = 0;
    },
    /** Steps for different projects interleave; each project's own order is fixed. */
    callsFor(projectId: string): Call[] {
      return calls.filter(
        ([, payload]) => (payload as { projectId: string }).projectId === projectId,
      );
    },
  };
}

const repo: ProjectLocation = { kind: "posix", path: "/repo" };
const other: ProjectLocation = { kind: "posix", path: "/other" };

describe("ProjectWatchLeases", () => {
  it.each([false, true])(
    "preserves WSL worktree routing with a root owner: %s",
    async (rootOwner) => {
      const location: ProjectLocation = {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/repo",
        uncPath: "\\\\wsl$\\Ubuntu\\home\\repo",
      };
      const watch = vi.fn<WslBridgeClient["watch"]>(async () => ({
        subscriptionId: "subscription",
        unsubscribe: async () => {},
      }));
      const watcher = new ProjectWatcher({ onGitChanged: () => {}, onTreeChanged: () => {} });
      watcher.setWslClient({
        watch,
        readFile: vi.fn<WslBridgeClient["readFile"]>(async () => {
          throw new Error("missing gitignore");
        }),
        stat: vi.fn<WslBridgeClient["stat"]>(async () => ({ stats: [] })),
      } as unknown as WslBridgeClient);
      const leases = new ProjectWatchLeases({
        getProject: () => project("p1", location),
        call: async (name, payload) => {
          if (name === "gitWatchProject") {
            const request = payload as { projectId: string; projectLocation: ProjectLocation };
            watcher.watch(request.projectId, request.projectLocation);
          } else if (name === "gitWatchWorktrees") {
            const request = payload as { projectId: string; worktreePaths: string[] };
            watcher.watchWorktrees(request.projectId, request.worktreePaths);
          } else {
            const request = payload as { projectId: string };
            await watcher.unwatch(request.projectId);
          }
        },
      });
      try {
        if (rootOwner) await leases.watchProject("client", "p1");
        await leases.pinWorktree("p1", "/home/worktree-a");
        await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(2));
        await leases.unwatchProject("client", "p1", "Ubuntu");
        await leases.pinWorktree("p1", "/home/worktree-b");
        await vi.waitFor(() => expect(watch).toHaveBeenCalledTimes(3));
        expect(watch.mock.lastCall?.[0]).toMatchObject({ linuxPath: "/home/worktree-b" });
      } finally {
        await leases.dispose();
        await watcher.dispose();
      }
    },
  );

  it("does not restore disabled projects after a supervisor reset", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("session:paired", "p1");
    h.projects.set("p1", project("p1", repo, true));
    h.leases.handleSupervisorReset();
    h.drain();

    await h.leases.reapplyAfterSupervisorStart();

    expect(h.calls).toEqual([]);
  });

  it("keeps the root watched while another owner unwatches it", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("managed-renderer", "p1");
    h.drain();

    await h.leases.unwatchProject("session:paired", "p1");

    expect(h.calls).toEqual([["gitWatchWorktrees", { projectId: "p1", worktreePaths: [] }]]);
  });

  it("re-applies the worktree union after every root watch, whatever the arrival order", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.setWorktrees("managed-renderer", "p1", ["/wt/a"]);
    await h.leases.watchProject("managed-renderer", "p1");
    await h.leases.watchProject("session:paired", "p1");

    expect(h.calls).toEqual([
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }],
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: ["/wt/a"] }],
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }],
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: ["/wt/a"] }],
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }],
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: ["/wt/a"] }],
    ]);
  });

  it("unions worktree sets so a narrower set never removes another owner's paths", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.setWorktrees("managed-renderer", "p1", ["/wt/b", "/wt/a"]);
    await h.leases.setWorktrees("session:paired", "p1", ["/wt/c", "/wt/a"]);
    await h.leases.setWorktrees("session:paired", "p1", []);

    expect(h.calls.map(([, payload]) => payload)).toEqual([
      { projectId: "p1", projectLocation: repo },
      { projectId: "p1", worktreePaths: ["/wt/a", "/wt/b"] },
      { projectId: "p1", worktreePaths: ["/wt/a", "/wt/b", "/wt/c"] },
      { projectId: "p1", worktreePaths: ["/wt/a", "/wt/b"] },
    ]);
  });

  it("unwatches only after the last root and worktree owners leave", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("managed-renderer", "p1");
    await h.leases.watchProject("session:paired", "p1");
    await h.leases.setWorktrees("session:viewer", "p1", ["/wt/c"]);
    h.drain();

    await h.leases.unwatchProject("managed-renderer", "p1");
    await h.leases.unwatchProject("session:paired", "p1");

    expect(h.calls).toEqual([
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: ["/wt/c"] }],
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: ["/wt/c"] }],
    ]);
    h.drain();
    await h.leases.unwatchProject("session:viewer", "p1");
    expect(h.calls).toEqual([["gitUnwatchProject", { projectId: "p1" }]]);
  });

  it("watches the registered location as it is when the step runs", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("managed-renderer", "p1");
    h.projects.set("p1", project("p1", other));
    await h.leases.watchProject("managed-renderer", "p1");

    expect(h.calls.filter(([name]) => name === "gitWatchProject")).toEqual([
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }],
      ["gitWatchProject", { projectId: "p1", projectLocation: other }],
    ]);
  });

  it("releases a WSL bridge only when no lease still uses its distro", async () => {
    const wsl = (linuxPath: string): ProjectLocation => ({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath,
      uncPath: `\\\\wsl$\\Ubuntu${linuxPath.replace(/\//g, "\\")}`,
    });
    const h = harness([project("p1", wsl("/home/a")), project("p2", wsl("/home/b"))]);
    await h.leases.watchProject("managed-renderer", "p1");
    await h.leases.watchProject("session:paired", "p2");
    h.drain();

    await h.leases.unwatchProject("managed-renderer", "p1", "Ubuntu");
    await h.leases.unwatchProject("session:paired", "p2", "Ubuntu");

    expect(h.calls).toEqual([
      ["gitUnwatchProject", { projectId: "p1" }],
      ["gitUnwatchProject", { projectId: "p2", releaseWslDistro: "Ubuntu" }],
    ]);
  });

  it("sweeps every owner of a disabled or deleted project", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("managed-renderer", "p1");
    await h.leases.watchProject("session:gone", "p1");
    await h.leases.setWorktrees("session:gone", "p1", ["/wt/a"]);
    h.projects.set("p1", project("p1", repo, true));
    h.drain();

    // The owner that disabled it releases; the vanished owner cannot.
    await h.leases.unwatchProject("managed-renderer", "p1");
    await h.leases.unwatchProject("session:paired", "never-registered");

    expect(h.calls).toEqual([
      ["gitUnwatchProject", { projectId: "p1" }],
      ["gitUnwatchProject", { projectId: "never-registered" }],
    ]);
    h.projects.set("p1", project("p1", repo));
    h.drain();
    await h.leases.setWorktrees("managed-renderer", "p1", []);
    expect(h.calls).toEqual([["gitWatchWorktrees", { projectId: "p1", worktreePaths: [] }]]);
  });

  it("serializes supervisor steps per project without blocking other projects", async () => {
    const h = harness([project("p1", repo), project("p2", other)]);
    const held = Promise.withResolvers<void>();
    h.setGate((name, payload) =>
      name === "gitWatchWorktrees" && (payload as { projectId: string }).projectId === "p1"
        ? held.promise
        : undefined,
    );
    await h.leases.watchProject("managed-renderer", "p1");
    h.drain();

    const narrowed = h.leases.unwatchProject("session:paired", "p1");
    const rewatched = h.leases.watchProject("session:paired", "p1");
    await h.leases.watchProject("managed-renderer", "p2");
    expect(h.calls).toEqual([
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: [] }],
      ["gitWatchProject", { projectId: "p2", projectLocation: other }],
    ]);

    held.resolve();
    await Promise.all([narrowed, rewatched]);
    expect(h.calls.slice(2)).toEqual([
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }],
    ]);
  });

  it("reads owners when each step runs, so a released watch never re-watches", async () => {
    const h = harness([project("p1", repo)]);
    const watch = h.leases.watchProject("session:paired", "p1");
    const release = h.leases.unwatchProject("session:paired", "p1");
    expect(h.calls).toEqual([]);
    await Promise.all([watch, release]);

    expect(h.calls).toEqual([
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: [] }],
      ["gitUnwatchProject", { projectId: "p1" }],
    ]);
  });

  it("releases only the revoked owner", async () => {
    const h = harness([project("p1", repo), project("p2", other)]);
    await h.leases.watchProject("managed-renderer", "p1");
    await h.leases.watchProject("session:paired", "p1");
    await h.leases.watchProject("session:paired", "p2");
    await h.leases.setWorktrees("session:paired", "p1", ["/wt/a"]);
    h.drain();

    await h.leases.releaseOwner("session:paired");

    expect(h.callsFor("p1")).toEqual([
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: [] }],
    ]);
    expect(h.callsFor("p2")).toEqual([["gitUnwatchProject", { projectId: "p2" }]]);
  });

  it("keeps host pins through client set changes until the host unpins", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.pinWorktree("p1", "C:\\wt\\Feature");
    await h.leases.pinWorktree("p1", "C:\\wt\\Feature");
    await h.leases.setWorktrees("managed-renderer", "p1", ["/wt/a"]);
    await h.leases.setWorktrees("managed-renderer", "p1", []);
    await h.leases.unwatchProject("session:paired", "p1");
    h.drain();

    await h.leases.unpinWorktree("p1", "c:/wt/feature");

    expect(h.calls).toEqual([["gitUnwatchProject", { projectId: "p1" }]]);
    expect(HOST_WORKTREE_WATCH_OWNER).toBe("host:worktree-lifecycle");
  });

  it("restores every lease after a reset, root then union, without starting a supervisor", async () => {
    const h = harness([project("p1", repo), project("p2", other)]);
    await h.leases.watchProject("managed-renderer", "p1");
    await h.leases.setWorktrees("managed-renderer", "p1", ["/wt/a"]);
    await h.leases.setWorktrees("session:paired", "p2", ["/wt/b"]);
    h.drain();

    // No lease changes after the reset: the managed window never re-sends.
    h.leases.handleSupervisorReset();
    expect(h.calls).toEqual([]);
    await h.leases.reapplyAfterSupervisorStart();

    const noStart = { startIfNeeded: false };
    expect(h.callsFor("p1")).toEqual([
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }, noStart],
      ["gitWatchWorktrees", { projectId: "p1", worktreePaths: ["/wt/a"] }, noStart],
    ]);
    expect(h.callsFor("p2")).toEqual([
      ["gitWatchProject", { projectId: "p2", projectLocation: other }, noStart],
      ["gitWatchWorktrees", { projectId: "p2", worktreePaths: ["/wt/b"] }, noStart],
    ]);
    h.drain();
    await h.leases.reapplyAfterSupervisorStart();
    expect(h.calls).toEqual([]);
  });

  it("re-applies nothing on a start that follows no reset", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("managed-renderer", "p1");
    h.drain();

    await h.leases.reapplyAfterSupervisorStart();

    expect(h.calls).toEqual([]);
  });

  it("keeps a failed re-apply pending for the next start", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("managed-renderer", "p1");
    h.leases.handleSupervisorReset();
    const unavailable = new Error("Supervisor is not running.");
    h.setGate(() => Promise.reject(unavailable));
    h.drain();

    await expect(h.leases.reapplyAfterSupervisorStart()).rejects.toBe(unavailable);
    h.setGate(null);
    await h.leases.reapplyAfterSupervisorStart();

    expect(h.calls).toEqual([
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }, { startIfNeeded: false }],
      ["gitWatchProject", { projectId: "p1", projectLocation: repo }, { startIfNeeded: false }],
    ]);
  });

  it("makes no supervisor calls once disposed", async () => {
    const h = harness([project("p1", repo)]);
    await h.leases.watchProject("managed-renderer", "p1");
    await h.leases.dispose();
    h.drain();

    await h.leases.unwatchProject("managed-renderer", "p1");
    await h.leases.releaseOwner("managed-renderer");
    h.leases.handleSupervisorReset();
    await h.leases.reapplyAfterSupervisorStart();

    expect(h.calls).toEqual([]);
  });
});
