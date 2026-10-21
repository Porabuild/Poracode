import { describe, expect, it, vi } from "vitest";
import { threadSchema } from "@/shared/contracts/thread";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import type { HostSessionReads } from "./hostSessionAdministration";
import { administerSession } from "./hostSessionAdministration";
import type { Thread } from "@/shared/contracts/thread";

const metadata = vi.hoisted(() => ({
  update: vi.fn<(id: string, update: (thread: Thread) => Thread) => Thread | null>(),
  owner: vi.fn<() => { owner: string }>(),
}));
vi.mock("@/host/db", () => ({ dbUpdateThreadMetadata: metadata.update }));
vi.mock("@/host/db/threadWorkspaceGrants", () => ({
  dbReadThreadWorkspaceGrantOwner: metadata.owner,
}));

function fixture() {
  const thread = threadSchema.parse({
    id: "thread-fixture",
    projectId: "project-fixture",
    title: "Fixture session",
    agentKind: "fixture",
    config: {
      model: "private-model",
      executionEnvironment: { kind: "wsl", distro: "Private Distro" },
    },
    status: "working",
    attention: "working",
    sessionRef: { providerSessionId: "private-session", discoveredAt: "2026-10-20T00:00:00.000Z" },
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T01:00:00.000Z",
  });
  const reads = {
    readThread: vi.fn<HostSessionReads["readThread"]>(() => thread),
    readPage: vi.fn<HostSessionReads["readPage"]>(async () => ({
      threads: [thread],
      nextCursor: "opaque-next",
    })),
  };
  const controller = new AbortController();
  const context = {
    signal: controller.signal,
    assertActive: () => controller.signal.throwIfAborted(),
  };
  const call = vi.fn<AdminSupervisorCall>(async () => ({ confirmed: true }) as never);
  metadata.owner.mockReset().mockReturnValue({ owner: "exact-execution-owner" });
  metadata.update.mockReset().mockImplementation((_id, update) => update(thread));
  return { thread, reads, controller, context, call };
}

describe("local persisted session administration", () => {
  it.each([
    { kind: "rename", title: "Renamed" },
    { kind: "unarchive" },
    { kind: "reopen" },
  ] as const)("changes only saved metadata without provider operations (%j)", async (change) => {
    const f = fixture();
    const result = await administerSession(
      { action: "sessions-update", threadId: f.thread.id, change },
      f.context,
      f.reads,
      f.call,
    );
    expect(result).toMatchObject({ change, runtime: "unchanged", session: { id: f.thread.id } });
    expect(f.call).not.toHaveBeenCalled();
    expect(metadata.update).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private-session");
  });

  it.each(["archive", "done"] as const)(
    "joins confirmed closure and applies %s to the fresh row",
    async (kind) => {
      const f = fixture(),
        gate = Promise.withResolvers<{ confirmed: boolean }>();
      f.call.mockImplementationOnce(async () => (await gate.promise) as never);
      const fresh = {
        ...f.thread,
        title: "Concurrent title",
        status: "idle" as const,
        starred: true,
      };
      metadata.update.mockImplementation((_id, update) => {
        const next = update(fresh);
        expect(next.title).toBe("Concurrent title");
        expect(next.status).toBe("idle");
        expect(next.config).toEqual(fresh.config);
        expect(next.sessionRef).toEqual(fresh.sessionRef);
        expect(next.starred).toBe(kind !== "done");
        return next;
      });
      const pending = administerSession(
        { action: "sessions-update", threadId: f.thread.id, change: { kind } },
        f.context,
        f.reads,
        f.call,
      );
      expect(metadata.update).not.toHaveBeenCalled();
      gate.resolve({ confirmed: true });
      expect(await pending).toMatchObject({
        change: { kind },
        runtime: "retired",
        session: { [kind === "archive" ? "archived" : "done"]: true },
      });
      expect(f.call).toHaveBeenCalledExactlyOnceWith("closeThreadConfirmed", {
        threadId: f.thread.id,
      });
    },
  );

  it("refuses changed execution ownership after joining closure without a metadata write", async () => {
    const f = fixture();
    metadata.owner.mockReturnValueOnce({ owner: "before" }).mockReturnValue({ owner: "after" });
    await expect(
      administerSession(
        { action: "sessions-update", threadId: f.thread.id, change: { kind: "archive" } },
        f.context,
        f.reads,
        f.call,
      ),
    ).rejects.toThrow("identity changed");
    expect(f.call).toHaveBeenCalledTimes(1);
  });

  it("does not recreate a session removed while closure was joining", async () => {
    const f = fixture();
    metadata.update.mockReturnValue(null);
    await expect(
      administerSession(
        { action: "sessions-update", threadId: f.thread.id, change: { kind: "done" } },
        f.context,
        f.reads,
        f.call,
      ),
    ).rejects.toThrow("No metadata was recreated");
  });

  it.each(["archive", "done"] as const)("does not save %s on unconfirmed closure", async (kind) => {
    const f = fixture();
    f.call.mockResolvedValueOnce({ confirmed: false } as never);
    await expect(
      administerSession(
        { action: "sessions-update", threadId: f.thread.id, change: { kind } },
        f.context,
        f.reads,
        f.call,
      ),
    ).rejects.toThrow("not confirmed");
    expect(metadata.update).not.toHaveBeenCalled();
  });

  it("joins pending retirement on cancellation and refuses metadata afterward", async () => {
    const f = fixture(),
      gate = Promise.withResolvers<{ confirmed: boolean }>();
    f.call.mockImplementationOnce(async () => (await gate.promise) as never);
    let settled = false;
    const pending = administerSession(
      { action: "sessions-update", threadId: f.thread.id, change: { kind: "archive" } },
      f.context,
      f.reads,
      f.call,
    ).finally(() => {
      settled = true;
    });
    const observed = pending.catch((error: unknown) => error);
    f.controller.abort(new Error("cancelled by caller"));
    await Promise.resolve();
    expect(settled).toBe(false);
    gate.resolve({ confirmed: true });
    expect(await observed).toMatchObject({ message: "cancelled by caller" });
    expect(metadata.update).not.toHaveBeenCalled();
  });

  it("refuses remote projections before closure or writes", async () => {
    const f = fixture();
    f.reads.readThread.mockReturnValue({ ...f.thread, remoteServerId: "another-host" });
    await expect(
      administerSession(
        { action: "sessions-update", threadId: f.thread.id, change: { kind: "archive" } },
        f.context,
        f.reads,
        f.call,
      ),
    ).rejects.toThrow("owning host");
    expect(f.call).not.toHaveBeenCalled();
    expect(metadata.update).not.toHaveBeenCalled();
  });
  it("uses the bounded existing page/cursor/filter and projects metadata without starting a provider", async () => {
    const f = fixture();
    const result = await administerSession(
      { action: "sessions-list", limit: 2, cursor: "opaque-before", projectId: "project-fixture" },
      f.context,
      f.reads,
      f.call,
    );
    expect(f.reads.readPage).toHaveBeenCalledExactlyOnceWith({
      limit: 2,
      cursor: "opaque-before",
      projectId: "project-fixture",
    });
    expect(result).toMatchObject({
      formatVersion: 1,
      scope: "persisted-profile",
      nextCursor: "opaque-next",
      sessions: [
        {
          id: f.thread.id,
          storedStatus: "working",
          presentationMode: "terminal",
          archived: false,
          done: false,
        },
      ],
    });
    for (const privateValue of [
      "private-model",
      "Private Distro",
      "private-session",
      "sessionRef",
      "config",
    ])
      expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(f.call).not.toHaveBeenCalled();
  });

  it("inspects the exact saved ID without calling the supervisor or changing persisted state", async () => {
    const f = fixture(),
      before = JSON.stringify(f.thread);
    expect(
      await administerSession(
        { action: "sessions-inspect", threadId: f.thread.id },
        f.context,
        f.reads,
        f.call,
      ),
    ).toMatchObject({
      formatVersion: 1,
      scope: "persisted-profile",
      session: { id: f.thread.id, storedStatus: "working" },
    });
    expect(f.reads.readThread).toHaveBeenCalledExactlyOnceWith(f.thread.id);
    expect(f.call).not.toHaveBeenCalled();
    expect(JSON.stringify(f.thread)).toBe(before);
  });

  it("refuses a page which changed the requested project scope", async () => {
    const f = fixture();
    await expect(
      administerSession(
        { action: "sessions-list", limit: 1, projectId: "other-project" },
        f.context,
        f.reads,
        f.call,
      ),
    ).rejects.toThrow("limit/project");
    expect(f.call).not.toHaveBeenCalled();
  });

  it.each(["sessions-inspect", "sessions-stop"] as const)(
    "refuses an unknown saved ID before any runtime operation (%s)",
    async (action) => {
      const f = fixture();
      await expect(
        administerSession(
          { action, threadId: "not-the-selected-thread" },
          f.context,
          f.reads,
          f.call,
        ),
      ).rejects.toThrow("not found");
      expect(f.call).not.toHaveBeenCalled();
    },
  );

  it("confirms supervisor-owned retirement without deleting history or changing thread configuration", async () => {
    const f = fixture(),
      before = JSON.stringify(f.thread);
    expect(
      await administerSession(
        { action: "sessions-stop", threadId: f.thread.id },
        f.context,
        f.reads,
        f.call,
      ),
    ).toEqual({
      formatVersion: 1,
      scope: "persisted-profile",
      threadId: f.thread.id,
      retired: true,
    });
    expect(f.call).toHaveBeenCalledExactlyOnceWith("closeThreadConfirmed", {
      threadId: f.thread.id,
    });
    expect(JSON.stringify(f.thread)).toBe(before);
  });

  it("does not report success or try another process path when retirement is unconfirmed", async () => {
    const f = fixture();
    f.call.mockResolvedValueOnce({ confirmed: false } as never);
    await expect(
      administerSession(
        { action: "sessions-stop", threadId: f.thread.id },
        f.context,
        f.reads,
        f.call,
      ),
    ).rejects.toThrow("retirement was not confirmed");
    expect(f.call).toHaveBeenCalledTimes(1);
  });

  it("keeps the in-flight close joined after the caller cancels and never reports cancelled success", async () => {
    const f = fixture(),
      retirement = Promise.withResolvers<{ confirmed: boolean }>();
    f.call.mockImplementationOnce(async () => (await retirement.promise) as never);
    let settled = false;
    const pending = administerSession(
      { action: "sessions-stop", threadId: f.thread.id },
      f.context,
      f.reads,
      f.call,
    ).finally(() => {
      settled = true;
    });
    const observed = pending.catch((error: unknown) => error);
    f.controller.abort(new Error("fixture owner request cancelled"));
    await Promise.resolve();
    expect(settled).toBe(false);
    retirement.resolve({ confirmed: true });
    expect(await observed).toMatchObject({ message: "fixture owner request cancelled" });
    expect(f.call).toHaveBeenCalledTimes(1);
  });

  it("refuses an inactive request before reads or runtime effects", async () => {
    const f = fixture();
    f.controller.abort(new Error("fixture generation retired"));
    await expect(
      administerSession(
        { action: "sessions-stop", threadId: f.thread.id },
        f.context,
        f.reads,
        f.call,
      ),
    ).rejects.toThrow("generation retired");
    expect(f.reads.readThread).not.toHaveBeenCalled();
    expect(f.call).not.toHaveBeenCalled();
  });
});
