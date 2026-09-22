// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { RemoteThreadCommand, Thread } from "@/shared/contracts";
import type { AppControlsToolContext } from "./types";

vi.mock("../../../db", () => ({
  dbGetThreadConversationItemsPage: vi.fn<() => Promise<{ nextCursor: null; items: never[] }>>(
    async () => ({ nextCursor: null, items: [] }),
  ),
}));

import { threadTools } from "./threads";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t",
    projectId: "project-1",
    title: "before",
    agentKind: "codex",
    config: { model: "gpt-5.6" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

interface Harness {
  ctx: AppControlsToolContext;
  rows: Thread[];
  order: string[];
  closeThread: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  updateThreadRow: ReturnType<typeof vi.fn>;
  publishThreadsChanged: ReturnType<typeof vi.fn>;
  reportError: ReturnType<typeof vi.fn>;
}

function harness(overrides: { thread?: Thread } = {}): Harness {
  const thread = overrides.thread ?? makeThread();
  const rows: Thread[] = [];
  const order: string[] = [];
  const closeThread = vi.fn<() => Promise<void>>(async () => {
    order.push("close");
  });
  const emit = vi.fn<(command: RemoteThreadCommand) => boolean | Promise<boolean>>(() => true);
  const updateThreadRow = vi.fn<(threadId: string, mutate: (thread: Thread) => Thread) => void>(
    (threadId, mutate) => {
      order.push("commit");
      if (threadId === thread.id) rows.push(mutate(thread));
    },
  );
  const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>(() => {
    order.push("publish");
  });
  const reportError = vi.fn<(error: unknown) => void>();
  const ctx = {
    identity: {},
    getThread: (threadId: string) => (threadId === thread.id ? thread : null),
    getProjects: () => [],
    getProject: () => null,
    supervisor: { closeThread },
    emitRemoteThreadCommand: emit,
    updateThreadRow,
    publishThreadsChanged,
    reportError,
  } as unknown as AppControlsToolContext;
  return {
    ctx,
    rows,
    order,
    closeThread,
    emit,
    updateThreadRow,
    publishThreadsChanged,
    reportError,
  };
}

function update(args: Record<string, unknown>, ctx: AppControlsToolContext) {
  return threadTools.handlers.update_thread!(args, ctx) as Promise<{
    threadId: string;
    applied: string[];
    note?: string;
  }>;
}

describe("update_thread authoritative ordering", () => {
  it("commits and returns while a held native mirror is still pending", async () => {
    const mirror = Promise.withResolvers<boolean>();
    const h = harness();
    h.emit.mockReturnValue(mirror.promise);

    const result = await update({ threadId: "t", rename: "after" }, h.ctx);

    expect(result.applied).toEqual(["rename"]);
    expect(h.updateThreadRow).toHaveBeenCalledOnce();
    expect(h.rows.at(-1)?.title).toBe("after");
    expect(h.publishThreadsChanged).toHaveBeenCalledExactlyOnceWith(["t"]);
    mirror.resolve(true);
  });

  it("consumes and reports a rejected native mirror without failing the update", async () => {
    const mirror = Promise.withResolvers<boolean>();
    const h = harness();
    h.emit.mockReturnValue(mirror.promise);

    const result = await update({ threadId: "t", rename: "after" }, h.ctx);
    mirror.reject(new Error("native request timed out"));

    expect(result.applied).toEqual(["rename"]);
    expect(h.updateThreadRow).toHaveBeenCalledOnce();
    expect(h.rows.at(-1)?.title).toBe("after");
    await vi.waitFor(() =>
      expect(h.reportError).toHaveBeenCalledWith(new Error("native request timed out")),
    );
  });

  it("consumes a synchronously throwing mirror without failing the update", async () => {
    const h = harness();
    h.emit.mockImplementation(() => {
      throw new Error("no window bridge");
    });

    const result = await update({ threadId: "t", starred: true }, h.ctx);

    expect(result.applied).toEqual(["starred"]);
    expect(h.reportError).toHaveBeenCalledWith(new Error("no window bridge"));
  });

  it("emits nothing and publishes nothing when the durable write fails", async () => {
    const h = harness();
    h.updateThreadRow.mockImplementation(() => {
      throw new Error("disk is read-only");
    });

    await expect(update({ threadId: "t", rename: "after" }, h.ctx)).rejects.toThrow(
      "disk is read-only",
    );

    expect(h.emit).not.toHaveBeenCalled();
    expect(h.publishThreadsChanged).not.toHaveBeenCalled();
    expect(h.closeThread).not.toHaveBeenCalled();
  });

  it("closes the supervisor session for done/archive with no UI and persists the row", async () => {
    const h = harness();
    h.emit.mockReturnValue(false);

    const done = await update({ threadId: "t", done: true }, h.ctx);

    expect(h.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: "t" });
    expect(h.rows.at(-1)).toMatchObject({ done: true, starred: false, doneAt: expect.any(String) });
    expect(done.note).toMatch(/No Poracode UI is connected/);

    const archived = await update({ threadId: "t", archived: true }, h.ctx);
    expect(h.closeThread).toHaveBeenCalledTimes(2);
    expect(h.rows.at(-1)).toMatchObject({ archived: true, archivedAt: expect.any(String) });
    expect(archived.applied).toEqual(["archived"]);
  });

  it("does not close the session for unarchive or un-done", async () => {
    const h = harness({ thread: makeThread({ done: true, archived: true }) });

    await update({ threadId: "t", done: false }, h.ctx);
    await update({ threadId: "t", archived: false }, h.ctx);

    expect(h.closeThread).not.toHaveBeenCalled();
  });

  it("closes once when done and archive arrive together", async () => {
    const h = harness();

    await update({ threadId: "t", done: true, archived: true }, h.ctx);

    expect(h.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: "t" });
  });

  it("publishes one bounded invalidation after the commit, in field order", async () => {
    const h = harness();

    const result = await update(
      { threadId: "t", rename: "after", group: "g", done: true, starred: true, archived: true },
      h.ctx,
    );

    expect(result.applied).toEqual(["rename", "group", "done", "starred", "archived"]);
    expect(h.publishThreadsChanged).toHaveBeenCalledExactlyOnceWith(["t"]);
    expect(h.order).toEqual(["close", "commit", "publish"]);
    // starred is applied after done, so the later field wins (done clears
    // starred first, then starred sets it back).
    expect(h.rows.at(-1)).toMatchObject({
      title: "after",
      groupId: "g",
      groupName: "g",
      done: true,
      starred: true,
      archived: true,
    });
  });

  it("keeps rename-only timestamps untouched", async () => {
    const h = harness();

    await update({ threadId: "t", rename: "Renamed" }, h.ctx);

    expect(h.rows.at(-1)).toMatchObject({
      title: "Renamed",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("still rejects a call with no fields", async () => {
    const h = harness();
    await expect(update({ threadId: "t" }, h.ctx)).rejects.toThrow(
      "Provide at least one field to update.",
    );
  });
});
