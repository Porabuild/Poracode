import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import {
  __resetBrowserThreadCacheForTest,
  cacheBrowserThreadSnapshot,
  readCachedBrowserThreadSnapshot,
} from "./offlineThreadCache";

function snapshot(threadId: string): RemoteThreadSnapshot {
  return {
    snapshotSeq: 1,
    thread: {
      id: threadId,
      projectId: "project-1",
      title: "Cached transcript",
      agentKind: "codex",
      config: {},
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    runtimeItems: [
      {
        id: "message-1",
        threadId,
        type: "assistant_message",
        state: "completed",
        payload: { text: "available offline" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    completedTurns: [],
    contextUsage: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as RemoteThreadSnapshot;
}

afterEach(() => {
  __resetBrowserThreadCacheForTest();
});

describe("browser offline thread cache", () => {
  it("restores the last remote transcript without a host connection", async () => {
    const cached = snapshot("desktop-1:thread-1");

    await cacheBrowserThreadSnapshot(cached);
    __resetBrowserThreadCacheForTest();

    await expect(readCachedBrowserThreadSnapshot(cached.thread.id)).resolves.toEqual(cached);
  });
});
