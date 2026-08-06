import { describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import {
  diffSyncedThreadIds,
  diffSyncedThreads,
  syncedProjectsChanged,
} from "./threadSyncBroadcast";

const project: Project = {
  id: "project-1",
  name: "Test project",
  location: { kind: "windows", path: "C:\\test" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function testThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Test thread",
    agentKind: "claude",
    config: { model: "sonnet" },
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
  };
}

describe("diffSyncedThreadIds", () => {
  it("returns nothing when the lists are equivalent", () => {
    const before = [testThread(), testThread({ id: "thread-2" })];
    const after = [testThread(), testThread({ id: "thread-2" })];
    expect(diffSyncedThreadIds(before, after)).toEqual([]);
  });

  it("flags remote-visible field changes", () => {
    const before = [
      testThread(),
      testThread({ id: "thread-2" }),
      testThread({ id: "thread-3" }),
      testThread({ id: "thread-4" }),
      testThread({ id: "thread-5" }),
    ];
    const after = [
      testThread({ title: "Renamed" }),
      testThread({ id: "thread-2", status: "working" }),
      testThread({ id: "thread-3", done: true }),
      testThread({ id: "thread-4", starred: true }),
      testThread({ id: "thread-5", archived: true }),
    ];
    expect(diffSyncedThreadIds(before, after)).toEqual([
      "thread-1",
      "thread-2",
      "thread-3",
      "thread-4",
      "thread-5",
    ]);
  });

  it("flags added and removed threads", () => {
    const before = [testThread(), testThread({ id: "thread-2" })];
    const after = [testThread({ id: "thread-3" })];
    expect(diffSyncedThreadIds(before, after)).toEqual(["thread-3", "thread-1", "thread-2"]);
  });

  it("ignores updatedAt-only bumps", () => {
    const before = [testThread()];
    const after = [testThread({ updatedAt: "2026-01-02T00:00:00.000Z" })];
    expect(diffSyncedThreadIds(before, after)).toEqual([]);
  });

  it("identifies only explicit finished-to-idle transitions as viewed", () => {
    const before = [
      testThread({ id: "thread-1", status: "finished" }),
      testThread({ id: "thread-2", status: "working" }),
      testThread({ id: "thread-3", status: "finished" }),
    ];
    const after = [
      testThread({ id: "thread-1", status: "idle" }),
      testThread({ id: "thread-2", status: "idle" }),
      testThread({ id: "thread-3", status: "working" }),
    ];

    expect(diffSyncedThreads(before, after)).toEqual({
      changedThreadIds: ["thread-1", "thread-2", "thread-3"],
      viewedThreadIds: ["thread-1"],
    });
  });
});

describe("syncedProjectsChanged", () => {
  it("detects added, removed, reordered, and edited projects", () => {
    const second = { ...project, id: "project-2", name: "Second project" };

    expect(syncedProjectsChanged([project], [project, second])).toBe(true);
    expect(syncedProjectsChanged([project, second], [project])).toBe(true);
    expect(syncedProjectsChanged([project, second], [second, project])).toBe(true);
    expect(syncedProjectsChanged([project], [{ ...project, name: "Renamed" }])).toBe(true);
  });

  it("ignores secret project MCP settings that remote snapshots omit", () => {
    expect(
      syncedProjectsChanged(
        [project],
        [
          {
            ...project,
            mcpServers: [
              {
                id: "private-id",
                name: "private",
                description: "Private server",
                enabled: true,
                timeoutMs: 30_000,
                transport: { type: "stdio", command: "secret", args: [], env: {} },
              },
            ],
          },
        ],
      ),
    ).toBe(false);
  });
});
