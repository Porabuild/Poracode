import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { RemoteForgeActivityEvent } from "@/shared/remote/protocol/forgeActivity";
import type { GitStateService } from "@/host/gitState/GitStateService";
import { ForgeActivityService } from "./ForgeActivityService";

type FixtureThread = Pick<Thread, "id" | "projectId" | "worktreePath" | "worktreeBranch">;
type RefreshTargetMock = ReturnType<
  typeof vi.fn<(input: Parameters<GitStateService["refreshTarget"]>[0]) => Promise<void>>
>;
type RefreshProjectPullRequestsMock = ReturnType<
  typeof vi.fn<(projectId: string, refreshOptions?: { afterMutation?: boolean }) => Promise<void>>
>;

function createService(
  options: {
    threads?: ReadonlyMap<string, FixtureThread>;
    refreshTarget?: RefreshTargetMock;
    refreshProjectPullRequests?: RefreshProjectPullRequestsMock;
  } = {},
) {
  const threads =
    options.threads ??
    new Map<string, FixtureThread>([
      ["t1", { id: "t1", projectId: "p1", worktreePath: "/wt/a", worktreeBranch: "feat-a" }],
    ]);
  const refreshTarget =
    options.refreshTarget ??
    vi.fn<(input: Parameters<GitStateService["refreshTarget"]>[0]) => Promise<void>>(
      async () => {},
    );
  const refreshProjectPullRequests =
    options.refreshProjectPullRequests ??
    vi.fn<(projectId: string, refreshOptions?: { afterMutation?: boolean }) => Promise<void>>(
      async () => {},
    );
  const publish = vi.fn<(event: RemoteForgeActivityEvent) => void>();
  const reportError = vi.fn<(error: unknown) => void>();
  const service = new ForgeActivityService({
    getThread: (threadId) => threads.get(threadId) ?? null,
    gitState: { refreshTarget, refreshProjectPullRequests },
    publish,
    reportError,
  });
  return { service, publish, reportError, refreshTarget, refreshProjectPullRequests };
}

function commandEvents(
  threadId: string,
  itemId: string,
  started: Record<string, unknown>,
  completed: Record<string, unknown> = {},
): RuntimeEvent[] {
  return [
    {
      type: "item.started",
      threadId,
      itemId,
      itemType: "command_execution",
      payload: started,
    },
    { type: "item.completed", threadId, itemId, payload: completed },
  ];
}

const pushEvent: RemoteForgeActivityEvent = {
  type: "remote-forge-activity",
  projectId: "p1",
  threadId: "t1",
  worktreePath: "/wt/a",
  branch: "feat-a",
  action: "push",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ForgeActivityService", () => {
  it("publishes a push once and refreshes the checkout after the debounce window", () => {
    const { service, publish, refreshTarget, refreshProjectPullRequests } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents(
        "t1",
        "i1",
        { command: "git add -A && git push -u origin HEAD", status: "running" },
        { exitCode: 0, status: "success" },
      ),
    });

    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(749);
    expect(publish).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(publish).toHaveBeenCalledExactlyOnceWith(pushEvent);
    expect(refreshTarget).toHaveBeenCalledExactlyOnceWith({
      projectId: "p1",
      worktreePath: "/wt/a",
      includePrDetails: true,
      afterMutation: true,
    });
    expect(refreshProjectPullRequests).not.toHaveBeenCalled();
  });

  it("publishes a created pull request and refreshes the project's pull requests", () => {
    const { service, publish, refreshProjectPullRequests } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents(
        "t1",
        "i1",
        { command: "gh pr create --fill", status: "running" },
        { exitCode: 0, status: "success" },
      ),
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-a",
      action: "create",
    });
    expect(refreshProjectPullRequests).toHaveBeenCalledExactlyOnceWith("p1", {
      afterMutation: true,
    });
  });

  it("merges command payload deltas across events", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "command_execution",
          payload: { command: "gh pr merge 12 --squash", status: "running" },
        },
        { type: "item.updated", threadId: "t1", itemId: "i1", payload: { status: "success" } },
        { type: "item.completed", threadId: "t1", itemId: "i1", payload: {} },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-a",
      action: "merge",
    });
  });

  it("ignores a command that exited non-zero", () => {
    const { service, publish, refreshTarget, refreshProjectPullRequests } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents(
        "t1",
        "i1",
        { command: "git push", status: "running" },
        { exitCode: 1, status: "success" },
      ),
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
    expect(refreshTarget).not.toHaveBeenCalled();
    expect(refreshProjectPullRequests).not.toHaveBeenCalled();
  });

  it("ignores a command whose payload status is error", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents(
        "t1",
        "i1",
        { command: "git push", status: "running" },
        { exitCode: 0, status: "error" },
      ),
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
  });

  it("ignores activity from a thread that no longer resolves", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "missing",
      events: commandEvents("missing", "i1", { command: "git push" }),
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
  });

  it("ignores activity in the Home project", () => {
    const { service, publish } = createService({
      threads: new Map<string, FixtureThread>([
        [
          "t1",
          { id: "t1", projectId: HOME_PROJECT_ID, worktreePath: "/wt/a", worktreeBranch: "feat-a" },
        ],
      ]),
    });
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents("t1", "i1", { command: "git push" }),
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
  });

  it("coalesces two items in one checkout into a single publish and refresh pair", () => {
    const { service, publish, refreshTarget, refreshProjectPullRequests } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        ...commandEvents("t1", "i1", { command: "git push", status: "running" }),
        ...commandEvents("t1", "i2", { command: "gh pr create --fill", status: "running" }),
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-a",
      action: "create",
    });
    expect(refreshTarget).toHaveBeenCalledOnce();
    expect(refreshProjectPullRequests).toHaveBeenCalledOnce();
  });

  it("classifies forge MCP tool calls from a multi-thread batch", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events-multi",
      batches: [
        {
          threadId: "t1",
          events: [
            {
              type: "item.started",
              threadId: "t1",
              itemId: "i1",
              itemType: "tool_call",
              payload: {
                name: "mcp__github__create_pull_request",
                args: { head: "feat-a" },
                status: "running",
              },
            },
            {
              type: "item.completed",
              threadId: "t1",
              itemId: "i1",
              payload: { status: "success" },
            },
          ],
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-a",
      action: "create",
    });
  });

  it("does not track ordinary tool calls", () => {
    const { service, publish, refreshTarget } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "tool_call",
          payload: { name: "mcp__fs__read_file", status: "running" },
        },
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "i1",
          payload: { status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
    expect(refreshTarget).not.toHaveBeenCalled();
  });

  it("classifies a forge MCP tool call delivered as an mcp_tool_call item", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "mcp_tool_call",
          payload: { name: "mcp__github__create_pull_request", status: "running" },
        },
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "i1",
          payload: { status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-a",
      action: "create",
    });
  });

  it("classifies a dynamic tool call by its dotted name", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "dynamic_tool_call",
          payload: { name: "github.merge_pull_request", status: "running" },
        },
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "i1",
          payload: { status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-a",
      action: "merge",
    });
  });

  it("classifies a canonical execute tool call from its args.command", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "tool_call",
          payload: {
            name: "bash",
            kind: "execute",
            args: { command: "git push origin HEAD" },
            status: "running",
          },
        },
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "i1",
          payload: { status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith(pushEvent);
  });

  it("classifies a tool call whose name and kind arrive in a later item update", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "tool_call",
          payload: { title: "Run command" },
        },
        {
          type: "item.updated",
          threadId: "t1",
          itemId: "i1",
          payload: { name: "bash", kind: "execute", args: { command: "git push" } },
        },
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "i1",
          payload: { status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith(pushEvent);
  });

  it("ignores a canonical execute tool call that does not change forge state", () => {
    const { service, publish, refreshTarget } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "tool_call",
          payload: {
            name: "bash",
            kind: "execute",
            args: { command: "ls" },
            status: "running",
          },
        },
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "i1",
          payload: { status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
    expect(refreshTarget).not.toHaveBeenCalled();
  });

  it("prefers the branch the command names over the thread's checked-out branch", () => {
    const { service, publish, refreshProjectPullRequests } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents(
        "t1",
        "i1",
        { command: "gh pr create --head feat-b --fill", status: "running" },
        { exitCode: 0, status: "success" },
      ),
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-b",
      action: "create",
    });
    expect(refreshProjectPullRequests).toHaveBeenCalledExactlyOnceWith("p1", {
      afterMutation: true,
    });
  });

  it("uses the first explicit branch named anywhere in a burst", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        ...commandEvents("t1", "i1", { command: "git push", status: "running" }),
        ...commandEvents("t1", "i2", {
          command: "gh pr create --head feat-b --fill",
          status: "running",
        }),
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: "remote-forge-activity",
      projectId: "p1",
      threadId: "t1",
      worktreePath: "/wt/a",
      branch: "feat-b",
      action: "create",
    });
  });

  it("ignores a completion for an item that never started", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "unknown",
          payload: { command: "git push", status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
  });

  it("drops pending items when the thread exits", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.started",
          threadId: "t1",
          itemId: "i1",
          itemType: "command_execution",
          payload: { command: "git push", status: "running" },
        },
      ],
    });
    service.observeSupervisorEvent({ type: "thread-exited", threadId: "t1", exitCode: 0 });
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: [
        {
          type: "item.completed",
          threadId: "t1",
          itemId: "i1",
          payload: { exitCode: 0, status: "success" },
        },
      ],
    });

    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
  });

  it("reports a rejected refresh instead of throwing", async () => {
    const error = new Error("refresh failed");
    const refreshTarget = vi.fn<
      (input: Parameters<GitStateService["refreshTarget"]>[0]) => Promise<void>
    >(async () => {
      throw error;
    });
    const { service, publish, reportError } = createService({ refreshTarget });
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents("t1", "i1", { command: "git push", status: "running" }),
    });

    expect(() => vi.advanceTimersByTime(750)).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("publishes nothing when disposed before the window closes", () => {
    const { service, publish } = createService();
    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents("t1", "i1", { command: "git push", status: "running" }),
    });

    service.dispose();
    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();

    service.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "t1",
      events: commandEvents("t1", "i2", { command: "git push", status: "running" }),
    });
    vi.advanceTimersByTime(750);
    expect(publish).not.toHaveBeenCalled();
  });
});
