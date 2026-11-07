import { afterEach, describe, expect, it, vi } from "vitest";
import { readSessionFileText, readWslLoginShellCommandOutputAsync } from "../base";
import {
  OpenCode2Goals,
  openCode2GoalCommand,
  readOpenCode2GoalState,
  resolveOpenCode2GoalStatePath,
} from "./goals";
import type { AppStoreState } from "@/renderer/state/appStore";
import { applyRuntimeEventsToState } from "@/renderer/state/slices/runtimeEventReducer";

function createGoals() {
  const goals = new OpenCode2Goals("thread-1");
  goals.commandName = "goal";
  return goals;
}

vi.mock("../base", async (importActual) => ({
  ...(await importActual<typeof import("../base")>()),
  readSessionFileText: vi.fn<typeof readSessionFileText>(),
  readWslLoginShellCommandOutputAsync: vi.fn<typeof readWslLoginShellCommandOutputAsync>(),
}));

const location = { kind: "posix", path: "/repo" } as const;
const snapshot = {
  id: "goal-1",
  sessionID: "ses-1",
  objective: "Finish the task",
  status: "active",
  tokenBudget: 10000,
  tokensUsed: 1200,
  timeUsedSeconds: 30,
  autoTurns: 2,
  createdAt: 100,
  updatedAt: 130,
  sampledAt: 132,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("OpenCode 2 goal plugin projection", () => {
  it("projects tool snapshots, usage and controls without replacing tool output", () => {
    const goals = createGoals();
    const events = goals.toolResult("create_goal", JSON.stringify({ goal: snapshot }), "ses-1");
    expect(events[0]).toMatchObject({
      type: "item.started",
      itemType: "goal",
      payload: {
        action: "set",
        objective: snapshot.objective,
        status: "active",
        tokenBudget: 10000,
        tokensUsed: 1200,
        timeUsedSeconds: 30,
        iterations: 2,
        updatedAt: 132,
        availableActions: ["edit", "pause", "clear"],
      },
    });
    expect(goals.map(snapshot, "ses-1")).toEqual([]);
    expect(goals.toolResult("unrelated", JSON.stringify({ goal: snapshot }), "ses-1")).toEqual([]);
    expect(goals.toolResult("get_goal", "not json", "ses-1")).toEqual([]);
  });

  it("updates one goal through pause, resume, limits, completion and clear", () => {
    const goals = createGoals();
    goals.map(snapshot, "ses-1");
    for (const [index, status] of [
      "paused",
      "active",
      "budgetLimited",
      "usageLimited",
      "complete",
      "unmet",
      "cancelled",
    ].entries()) {
      const events = goals.map(
        { ...snapshot, status, updatedAt: 140 + index, sampledAt: 140 + index },
        "ses-1",
      );
      expect(events[0]).toMatchObject({
        type: "item.updated",
        itemId: "opencode2-goal-thread-1-goal-1",
        payload: {
          status:
            status === "budgetLimited" || status === "usageLimited"
              ? "budget_limited"
              : status === "unmet"
                ? "failed"
                : status,
          availableActions: ["complete", "unmet", "cancelled"].includes(status)
            ? ["clear"]
            : ["edit", status === "active" ? "pause" : "resume", "clear"],
        },
      });
    }
    expect(goals.map(null, "ses-1")[0]).toMatchObject({
      type: "item.updated",
      payload: { action: "cleared" },
    });
    expect(goals.map(null, "ses-1")).toEqual([]);
    expect(goals.map({ ...snapshot, id: "goal-2", updatedAt: 160 }, "ses-1")[0]).toMatchObject({
      type: "item.started",
    });
  });

  it("uses stable IDs on restore and rejects stale or invalid snapshots", () => {
    const goals = createGoals();
    const first = goals.map(snapshot, "ses-1")[0];
    expect(createGoals().map(snapshot, "ses-1")[0]).toEqual(first);
    expect(goals.map({ ...snapshot, updatedAt: 129 }, "ses-1")).toEqual([]);
    expect(goals.map({ ...snapshot, sessionID: "other" }, "ses-1")).toEqual([]);
    expect(goals.map({ ...snapshot, status: "future" }, "ses-1")).toEqual([]);
    expect(goals.map({ ...snapshot, objective: " " }, "ses-1")).toEqual([]);
    expect(goals.map(undefined, "ses-1")).toEqual([]);
  });

  it("starts a replacement even when its projected fields match and clears old stop reasons", () => {
    const goals = createGoals();
    goals.map({ ...snapshot, status: "paused", stopReason: "paused" }, "ses-1");
    expect(goals.map({ ...snapshot, stopReason: null, blocker: null }, "ses-1")[0]).toMatchObject({
      payload: { status: "active", lastReason: "" },
    });
    expect(goals.map({ ...snapshot, id: "goal-2" }, "ses-1")[0]).toMatchObject({
      type: "item.started",
      itemId: "opencode2-goal-thread-1-goal-2",
    });
  });

  it("restores changed same-ID goals and offline clears over existing persisted items", () => {
    let state = {
      threads: [],
      runtimeRequestsByThread: {},
      runtimeContextByThread: {},
      runtimeCompletedTurnsByThread: {},
      runtimeOpenTurnByThread: {},
      runtimeStructuralVersionByThread: {},
      runtimeBackgroundTasksByThread: {},
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
    } as unknown as AppStoreState;
    const reduce = (events: ReturnType<OpenCode2Goals["map"]>) => {
      state = { ...state, ...applyRuntimeEventsToState(state, "thread-1", events) };
    };
    reduce(createGoals().map(null, "ses-1"));
    reduce(createGoals().map(snapshot, "ses-1"));
    reduce(
      createGoals().map(
        { ...snapshot, status: "paused", objective: "Edited while offline", updatedAt: 150 },
        "ses-1",
      ),
    );
    expect(
      state.runtimeItemsByIdByThread["thread-1"]?.["opencode2-goal-thread-1-goal-1"]?.payload,
    ).toMatchObject({ status: "paused", objective: "Edited while offline" });
    expect(state.runtimeItemIdsByThread["thread-1"]).toHaveLength(2);
    reduce(createGoals().map(null, "ses-1"));
    const latest = state.runtimeItemIdsByThread["thread-1"]?.at(-1);
    expect(state.runtimeItemsByIdByThread["thread-1"]?.[latest!]?.payload).toMatchObject({
      action: "cleared",
    });
  });

  it("resolves renamed commands and keeps tool-only goals read-only", () => {
    expect(
      openCode2GoalCommand(
        [
          {
            type: "document",
            info: {
              plugins: [
                {
                  package: "@prevalentware/opencode-goal-plugin",
                  options: { command_name: "mission" },
                },
              ],
            },
          },
        ],
        [{ name: "mission" }],
      ),
    ).toBe("mission");
    expect(
      openCode2GoalCommand(
        [
          {
            type: "document",
            info: {
              plugins: [
                {
                  package: "@prevalentware/opencode-goal-plugin",
                  options: { register_command: false },
                },
              ],
            },
          },
        ],
        [{ name: "goal" }],
      ),
    ).toBeUndefined();
    expect(new OpenCode2Goals("thread-1").map(snapshot, "ses-1")[0]).toMatchObject({
      payload: { availableActions: [] },
    });
  });

  it.each([1, 2, 3])("reads existing version %i stores without rewriting them", async (version) => {
    const legacy = { ...snapshot, id: undefined, sampledAt: undefined, lastAccountedAt: 125 };
    vi.mocked(readSessionFileText).mockResolvedValue(
      JSON.stringify({ version, goals: { "ses-1": legacy } }),
    );
    const raw = await readOpenCode2GoalState(location, "/goals.json", "ses-1");
    expect(new OpenCode2Goals("thread-1").map(raw, "ses-1")[0]).toMatchObject({
      itemId: "opencode2-goal-thread-1-legacy:ses-1:100",
      payload: { updatedAt: 125 },
    });
  });

  it("distinguishes a cleared store from unavailable, corrupt and future stores", async () => {
    for (const text of [undefined, "bad json", '{"version":4,"goals":{}}', '{"version":3}']) {
      vi.mocked(readSessionFileText).mockResolvedValue(text);
      expect(await readOpenCode2GoalState(location, "/goals.json", "ses-1")).toBeUndefined();
    }
    vi.mocked(readSessionFileText).mockResolvedValue('{"version":3,"goals":{}}');
    expect(await readOpenCode2GoalState(location, "/goals.json", "ses-1")).toBeNull();
    expect(new OpenCode2Goals("thread-1").map(null, "ses-1")[0]).toMatchObject({
      payload: { action: "cleared" },
    });
  });

  it("resolves the plugin's native override and WSL environment separately", async () => {
    vi.stubEnv("OPENCODE_GOAL_STATE_PATH", "/custom/goals.json");
    expect(await resolveOpenCode2GoalStatePath(location)).toBe("/custom/goals.json");
    vi.mocked(readWslLoginShellCommandOutputAsync).mockResolvedValue({
      ok: true,
      stdout: "/linux/goals.json",
      stderr: "",
    });
    const wsl = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    } as const;
    expect(await resolveOpenCode2GoalStatePath(wsl)).toBe("/linux/goals.json");
    vi.mocked(readSessionFileText).mockResolvedValue('{"version":3,"goals":{}}');
    await readOpenCode2GoalState(wsl, "/linux/goals.json", "ses-1");
    expect(readSessionFileText).toHaveBeenLastCalledWith(wsl, "/linux/goals.json");
  });
});
