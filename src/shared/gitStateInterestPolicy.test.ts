import { describe, expect, it } from "vitest";
import type { Thread, ThreadStatus } from "./contracts";
import {
  buildRemoteGitTargetInterests,
  MAX_REMOTE_GIT_TARGET_INTERESTS,
} from "./gitStateInterestPolicy";

function thread(
  id: string,
  status: ThreadStatus,
  updatedAt: string,
  overrides: Partial<Thread> = {},
): Thread {
  return {
    id,
    projectId: "project-1",
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5" },
    status,
    attention: "none",
    canResumeWithConfig: false,
    worktreePath: `/repo/worktrees/${id}`,
    archived: false,
    done: false,
    starred: false,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

describe("buildRemoteGitTargetInterests", () => {
  it("retains only the selected and turn-active targets", () => {
    const threads = [
      thread("recent-idle", "idle", "2026-07-30T12:05:00.000Z"),
      thread("selected", "idle", "2026-07-30T12:00:00.000Z"),
      thread("working", "working", "2026-07-30T11:00:00.000Z"),
      thread("approval", "needs_approval", "2026-07-30T10:00:00.000Z"),
    ];

    expect(buildRemoteGitTargetInterests(threads, { selectedThreadId: "selected" })).toEqual([
      {
        kind: "target",
        projectId: "project-1",
        worktreePath: "/repo/worktrees/selected",
        includePrDetails: true,
      },
      {
        kind: "target",
        projectId: "project-1",
        worktreePath: "/repo/worktrees/working",
        includePrDetails: true,
      },
      {
        kind: "target",
        projectId: "project-1",
        worktreePath: "/repo/worktrees/approval",
        includePrDetails: true,
      },
    ]);
  });

  it("hard-caps and deduplicates targets across threads", () => {
    const threads = Array.from({ length: 10 }, (_, index) =>
      thread(
        `working-${index}`,
        "working",
        `2026-07-30T12:${String(index).padStart(2, "0")}:00.000Z`,
        {
          ...(index === 8 ? { worktreePath: "/repo/worktrees/working-9" } : {}),
        },
      ),
    );

    const interests = buildRemoteGitTargetInterests(threads);

    expect(interests).toHaveLength(MAX_REMOTE_GIT_TARGET_INTERESTS);
    expect(new Set(interests.map((interest) => JSON.stringify(interest))).size).toBe(
      MAX_REMOTE_GIT_TARGET_INTERESTS,
    );
  });

  it("fills a bounded one-shot warm-up from recent non-archived threads", () => {
    const threads = [
      thread("archived", "idle", "2026-07-30T13:00:00.000Z", { archived: true }),
      thread("recent", "idle", "2026-07-30T12:00:00.000Z"),
      thread("older", "finished", "2026-07-30T11:00:00.000Z"),
    ];

    expect(buildRemoteGitTargetInterests(threads, { includeRecentFallback: true })).toEqual([
      {
        kind: "target",
        projectId: "project-1",
        worktreePath: "/repo/worktrees/recent",
        includePrDetails: true,
      },
      {
        kind: "target",
        projectId: "project-1",
        worktreePath: "/repo/worktrees/older",
        includePrDetails: true,
      },
    ]);
  });
});
