import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { IPC_EVENT_CHANNELS, type ProjectStateChangedEvent } from "@/shared/ipc";
import { closeDatabase, initDatabase } from "../db/connection";
import { dbGetProjects, dbGetThread, dbUpsertProject, dbUpsertThread } from "../db/projectsThreads";
import { dbApplyThreadRuntimeEvents, dbGetThreadRuntimeItems } from "../db/runtimeItems";
import { createLocalIpcHandlers } from "./localHandlers";
import { acknowledgeMirroredThreadIds } from "../db/mainCreatedThreads";

describe("desktop reconciliation after project repair", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "poracode-project-repair-"));
    initDatabase(join(directory, "state.sqlite"));
  });
  afterEach(() => {
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each(["original", "newest"])(
    "protects recovered %s transcripts across queued saves until the desktop echoes them",
    async (ownerId) => {
      const original: Project = {
        id: "original",
        name: "Original",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2024-01-01T00:00:00.000Z",
        scripts: { setupScript: "original setup", actions: [] },
      };
      const duplicate: Project = {
        ...original,
        id: "newest",
        createdAt: "2026-01-01T00:00:00.000Z",
        scripts: { actions: [] },
      };
      const thread: Thread = {
        id: "unseen",
        projectId: ownerId,
        title: "Saved conversation",
        agentKind: "test-agent",
        config: { model: "auto" },
        status: "inactive",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        createdAt: original.createdAt,
        updatedAt: original.createdAt,
      };
      dbUpsertProject(original, 1);
      dbUpsertProject(duplicate, 0);
      dbUpsertThread(thread, 0);
      // This is an existing conversation, not an unacknowledged new launch.
      acknowledgeMirroredThreadIds([thread.id]);
      dbApplyThreadRuntimeEvents(thread.id, [
        {
          type: "item.started",
          threadId: thread.id,
          itemId: "reply",
          itemType: "assistant_message",
          payload: { text: "saved reply" },
        },
      ]);
      expect(dbGetThreadRuntimeItems(thread.id)).toHaveLength(1);
      const send = vi.fn<(channel: string, snapshot: ProjectStateChangedEvent) => void>();
      const handlers = createLocalIpcHandlers({
        getMainWindow: () => ({ webContents: { send } }),
        getRemoteAccessServer: () => null,
      } as unknown as Parameters<typeof createLocalIpcHandlers>[0]);
      const queuedProjects = ownerId === original.id ? [duplicate] : [original];
      await handlers.dbSyncAll({ projects: queuedProjects, threads: [], viewJson: "{}" });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0]?.[0]).toBe(IPC_EVENT_CHANNELS.projectStateChanged);
      const repaired = send.mock.calls[0]![1];
      expect(repaired.projects).toEqual([original]);
      expect(repaired.recoveredThreads?.map((item) => item.id)).toEqual([thread.id]);
      // These writes were queued before the renderer received its recovery event.
      for (let i = 0; i < 3; i++) {
        await handlers.dbSyncAll({ projects: queuedProjects, threads: [], viewJson: "{}" });
        expect(dbGetThreadRuntimeItems(thread.id)).toHaveLength(1);
      }
      const repairEventCount = send.mock.calls.length;
      const snapshot = {
        projects: repaired.projects,
        threads: repaired.recoveredThreads!,
        viewJson: "{}",
      };
      await handlers.dbSyncAll(snapshot);
      expect(send).toHaveBeenCalledTimes(repairEventCount);
      expect(dbGetThreadRuntimeItems(thread.id)).toHaveLength(1);

      await handlers.dbSyncAll({
        ...snapshot,
        projects: [
          { ...original, name: "Edited", scripts: { setupScript: "edited setup", actions: [] } },
        ],
      });
      expect(dbGetProjects()[0]).toMatchObject({
        name: "Edited",
        scripts: { setupScript: "edited setup" },
      });
      const { scripts: _, ...cleared } = original;
      const newThread = { ...thread, projectId: original.id, id: "new-conversation" };
      await handlers.dbSyncAll({
        ...snapshot,
        projects: [cleared],
        threads: [...snapshot.threads, newThread],
      });
      expect(dbGetProjects()[0]?.scripts).toBeUndefined();
      expect(dbGetThread(newThread.id)?.projectId).toBe(original.id);
      expect(dbGetThreadRuntimeItems(thread.id)).toHaveLength(1);
      await handlers.dbSyncAll({ ...snapshot, projects: [cleared], threads: [newThread] });
      expect(dbGetThreadRuntimeItems(thread.id)).toEqual([]);
    },
  );
});
