import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import {
  dbGetProjects,
  dbGetProject,
  dbGetThreads,
  dbUpsertProject,
  dbUpsertThread,
} from "@/host/db/projectsThreads";
import { onProjectThreadDataChanged } from "@/host/db/projectThreadChanges";
import { nativeBindingEnv, testThread } from "@/host/db/runtimeItems.testFixtures";
import { applyAppCatalogEdit } from "./appCatalogOrder";
import type { RemoteServerContext } from "./context";

beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  for (const [slot, id] of ["source", "target", "unused"].entries()) {
    dbUpsertProject(
      {
        id,
        name: id,
        location: { kind: "posix", path: `/fixture/${id}` },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      slot * 10,
    );
  }
  for (const [slot, id] of ["a", "outside", "b", "c"].entries()) {
    dbUpsertThread(
      {
        ...testThread(),
        id,
        title: `Thread ${id}`,
        projectId: id === "outside" ? "target" : "source",
        status: "idle",
      },
      slot * 10,
    );
  }
});

afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

function fixture() {
  const publishCatalogChanged = vi.fn<RemoteServerContext["publishCatalogChanged"]>();
  const publishThreadsChanged = vi.fn<RemoteServerContext["publishThreadsChanged"]>();
  const dispatchThreadCommand =
    vi.fn<NonNullable<RemoteServerContext["options"]["dispatchThreadCommand"]>>();
  const ctx = {
    options: { dispatchThreadCommand },
    publishCatalogChanged,
    publishThreadsChanged,
  } as unknown as RemoteServerContext;
  return { ctx, publishCatalogChanged, publishThreadsChanged, dispatchThreadCommand };
}

describe("App Controls manual catalog order", () => {
  it("sets the saved draft without replacing other project fields or replaying a stale edit", async () => {
    const f = fixture();
    const projectId = "source";
    const before = dbGetProject(projectId)!;
    const lastDraftConfig = {
      agentKind: "codex",
      model: "chosen",
      fast: false,
      worktreeMode: true,
    };
    const command = { kind: "set-draft-config", projectId, lastDraftConfig } as const;
    await expect(applyAppCatalogEdit(f.ctx, command, "draft-edited-1")).resolves.toEqual({
      changed: true,
    });
    expect(dbGetProject(projectId)).toEqual({ ...before, lastDraftConfig });

    await applyAppCatalogEdit(f.ctx, { ...command, lastDraftConfig: null }, "draft-cleared-2");
    await expect(applyAppCatalogEdit(f.ctx, command, "draft-edited-1")).resolves.toEqual({
      changed: true,
    });
    expect(dbGetProject(projectId)).toEqual(before);
    expect(f.publishCatalogChanged).toHaveBeenCalledTimes(2);
  });

  it("moves a project on the owning host and publishes a bounded catalog change once", async () => {
    const f = fixture();
    const command = {
      kind: "reorder",
      projectId: "target",
      targetProjectId: "source",
      placement: "before",
    } as const;
    await expect(applyAppCatalogEdit(f.ctx, command, "order-project-1")).resolves.toEqual({
      changed: true,
    });
    expect(dbGetProjects().map((row) => row.id)).toEqual(["target", "source", "unused"]);
    expect(f.publishCatalogChanged).toHaveBeenCalledOnce();
    await expect(applyAppCatalogEdit(f.ctx, command, "order-project-1")).resolves.toEqual({
      changed: true,
    });
    await expect(applyAppCatalogEdit(f.ctx, command, "order-project-2")).resolves.toEqual({
      changed: false,
    });
    expect(f.publishCatalogChanged).toHaveBeenCalledOnce();
    expect(f.dispatchThreadCommand).not.toHaveBeenCalled();
  });

  it("moves a project thread block and replays its receipt without changing later order", async () => {
    const f = fixture();
    const command = {
      kind: "reorder",
      projectId: "source",
      threadId: "a",
      threadIds: ["a", "b"],
      targetThreadId: "c",
      placement: "after",
    } as const;
    await expect(
      applyAppCatalogEdit(
        f.ctx,
        {
          ...command,
          threadIds: [...command.threadIds],
        },
        "order-block-1",
      ),
    ).resolves.toEqual({ changed: true });
    expect(dbGetThreads().map((row) => row.id)).toEqual(["c", "outside", "a", "b"]);
    expect(f.publishThreadsChanged).toHaveBeenCalledExactlyOnceWith(["a", "b", "c"]);

    await expect(
      applyAppCatalogEdit(
        f.ctx,
        {
          kind: "reorder-flat",
          projectId: "source",
          threadId: "b",
          targetThreadId: "outside",
          placement: "before",
        },
        "order-flat-1",
      ),
    ).resolves.toEqual({ changed: true });
    expect(dbGetThreads().map((row) => [row.id, row.projectId, row.title, row.status])).toEqual([
      ["c", "source", "Thread c", "idle"],
      ["b", "source", "Thread b", "idle"],
      ["outside", "target", "Thread outside", "idle"],
      ["a", "source", "Thread a", "idle"],
    ]);
    await expect(
      applyAppCatalogEdit(
        f.ctx,
        {
          ...command,
          threadIds: [...command.threadIds],
        },
        "order-block-1",
      ),
    ).resolves.toEqual({ changed: true });
    expect(dbGetThreads().map((row) => row.id)).toEqual(["c", "b", "outside", "a"]);
    expect(f.publishThreadsChanged).toHaveBeenCalledTimes(2);
    expect(f.dispatchThreadCommand).not.toHaveBeenCalled();
  });

  it("refuses stale references and reserves the receipt for one set of coordinates", async () => {
    const f = fixture();
    const command = {
      kind: "reorder",
      projectId: "source",
      threadId: "a",
      threadIds: ["a"],
      targetThreadId: "outside",
      placement: "before",
    } as const;
    await expect(
      applyAppCatalogEdit(
        f.ctx,
        {
          ...command,
          threadIds: ["a"],
        },
        "order-invalid-1",
      ),
    ).rejects.toMatchObject({ code: "thread_project_mismatch" });
    await expect(
      applyAppCatalogEdit(
        f.ctx,
        {
          ...command,
          threadIds: ["a"],
          targetThreadId: "c",
        },
        "order-invalid-1",
      ),
    ).rejects.toMatchObject({ code: "command_id_conflict" });
    expect(dbGetThreads().map((row) => row.id)).toEqual(["a", "outside", "b", "c"]);
    expect(f.publishThreadsChanged).not.toHaveBeenCalled();
  });

  it("reports a committed reorder when an observer throws after the write", async () => {
    const f = fixture();
    const unsubscribe = onProjectThreadDataChanged(() => {
      throw new Error("Observer closed");
    });
    const command = {
      kind: "reorder",
      projectId: "unused",
      targetProjectId: "source",
      placement: "before",
    } as const;
    try {
      const result = await applyAppCatalogEdit(f.ctx, command, "order-observer-1");
      expect(result).toMatchObject({ changed: true, publicationWarning: expect.any(String) });
      expect(dbGetProjects().map((row) => row.id)).toEqual(["unused", "source", "target"]);
      expect(f.publishCatalogChanged).toHaveBeenCalledOnce();
      await expect(applyAppCatalogEdit(f.ctx, command, "order-observer-1")).resolves.toEqual(
        result,
      );
      expect(f.publishCatalogChanged).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });
});
