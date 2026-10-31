import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { ThreadCrewBinding } from "@/shared/crew";
import { crewLeadMidTurnNudgeText } from "@/supervisor/crossagentMcp/crewBrief";
import type { StructuredSessionHandle } from "../agents/base";
import type { DirtySetSnapshot } from "../git/dirtySetSnapshot";
import { countOtherWorkingSessions, CrewLeadEditMonitor } from "./crewLeadEditMonitor";
import type { SessionRuntime } from "./sessionTypes";
import { SHELL_SNAPSHOT_INTERVAL_MS, type MemberRunActivity } from "./shellEditTracker";

const sidekick: ThreadCrewBinding["roles"][number] = {
  id: "sidekick",
  label: "Sidekick",
  selection: { agentKind: "example", model: "m" },
};
const crew: ThreadCrewBinding = { version: 1, policy: "crew-only", roles: [sidekick] };
const reminder = crewLeadMidTurnNudgeText(crew)!;

const turnStarted = (turnId: string): RuntimeEvent => ({
  type: "turn.started",
  threadId: "thread-1",
  turnId,
});
const turnCompleted = (turnId: string): RuntimeEvent => ({
  type: "turn.completed",
  threadId: "thread-1",
  turnId,
  state: "completed",
});
const edit = (
  itemId: string,
  options: { path?: string; parentItemId?: string } = {},
): RuntimeEvent => ({
  type: "item.started",
  threadId: "thread-1",
  itemId,
  itemType: "file_change",
  payload: { path: options.path ?? "/repo/src/a.ts", changeKind: "edit" },
  ...(options.parentItemId ? { parentItemId: options.parentItemId } : {}),
});
const progress = (
  type: "item.updated" | "item.completed",
  itemId: string,
  path: string,
): RuntimeEvent => ({
  type,
  threadId: "thread-1",
  itemId,
  payload: { path, changeKind: "edit" },
});
const command = (
  itemId: string,
  phase: "started" | "completed",
  parentItemId?: string,
): RuntimeEvent =>
  phase === "started"
    ? {
        type: "item.started",
        threadId: "thread-1",
        itemId,
        itemType: "command_execution",
        ...(parentItemId ? { parentItemId } : {}),
      }
    : { type: "item.completed", threadId: "thread-1", itemId };

interface HarnessOptions {
  capable?: boolean;
  config?: ThreadConfig;
  session?: Partial<SessionRuntime>;
  shell?: {
    snapshots: Array<DirtySetSnapshot | undefined>;
    activity?: MemberRunActivity;
  };
}

function harness(options: HarnessOptions = {}) {
  const steerContext = vi.fn<(text: string) => Promise<void>>(async () => undefined);
  const handle = {
    launchOptions: {},
    setListener: () => {},
    dispose: async () => {},
    ...(options.capable === false ? {} : { steerContext }),
  } as unknown as StructuredSessionHandle;
  const session = {
    threadId: "thread-1",
    instanceId: "instance-1",
    status: "working",
    presentationMode: "gui",
    adapter: { capabilities: { presentationMode: "gui", mcpScope: { gui: "launch" } } },
    config: options.config ?? { model: "m", crew },
    crossagentsMcpAttached: true,
    projectLocation: { kind: "posix", path: "/repo" },
    structuredSession: handle,
    ...options.session,
  } as unknown as SessionRuntime;
  let pendingUserInput = false;
  let otherWorking = 0;
  const readDirtySetSnapshot = vi.fn<() => Promise<DirtySetSnapshot | undefined>>(async () =>
    options.shell?.snapshots.shift(),
  );
  const monitor = new CrewLeadEditMonitor({
    isCurrentSession: (candidate) => candidate === session,
    hasPendingUserInput: () => pendingUserInput,
    otherWorkingSessions: () => otherWorking,
    ...(options.shell
      ? {
          memberRunActivity: () => options.shell?.activity ?? { active: 0, started: 0 },
          readDirtySetSnapshot,
        }
      : {}),
  });
  return {
    session,
    steerContext,
    readDirtySetSnapshot,
    send: (...events: RuntimeEvent[]) => {
      for (const event of events) monitor.onRuntimeEvent(session, event);
    },
    setPendingUserInput(value: boolean) {
      pendingUserInput = value;
    },
    setOtherWorkingSessions(count: number) {
      otherWorking = count;
    },
  };
}

/** Lets queued microtasks and the steer promise settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

afterEach(() => vi.restoreAllMocks());

describe("CrewLeadEditMonitor mid-turn reminder", () => {
  it("steers one hidden reminder into the running turn", async () => {
    const h = harness();
    h.send(turnStarted("turn-1"), edit("e1"));
    expect(h.steerContext).not.toHaveBeenCalled();
    await settle();

    expect(h.steerContext).toHaveBeenCalledTimes(1);
    expect(h.steerContext).toHaveBeenCalledWith(reminder);
    expect(h.session.crewLeadEditedFiles).toBeUndefined();
  });

  it("sends at most one per turn; later edits re-arm the next-turn reminder", async () => {
    const h = harness();
    h.send(turnStarted("turn-1"), edit("e1"));
    await settle();
    h.send(edit("e2"));
    await settle();
    expect(h.steerContext).toHaveBeenCalledTimes(1);
    expect(h.session.crewLeadEditedFiles).toBe(true);
  });

  it("covers edits made while the reminder is being delivered", async () => {
    const h = harness();
    let accept!: () => void;
    h.steerContext.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    h.send(turnStarted("turn-1"), edit("e1"));
    await settle();
    h.send(edit("e2"));
    accept();
    await settle();
    expect(h.steerContext).toHaveBeenCalledTimes(1);
    expect(h.session.crewLeadEditedFiles).toBeUndefined();
  });

  it("gives a new turn its own reminder", async () => {
    const h = harness();
    h.send(turnStarted("turn-1"), edit("e1"));
    await settle();
    h.send(turnCompleted("turn-1"), turnStarted("turn-2"), edit("e2"));
    await settle();
    expect(h.steerContext).toHaveBeenCalledTimes(2);
    expect(h.session.crewLeadEditedFiles).toBeUndefined();
  });

  it("keeps the next-turn reminder for a handle without steerContext", async () => {
    const h = harness({ capable: false });
    h.send(turnStarted("turn-1"), edit("e1"));
    await settle();
    expect(h.steerContext).not.toHaveBeenCalled();
    expect(h.session.crewLeadEditedFiles).toBe(true);
  });

  it("falls back to the next turn when the turn ended before the reminder was sent", async () => {
    const h = harness();
    h.send(turnStarted("turn-1"), edit("e1"), turnCompleted("turn-1"));
    await settle();
    expect(h.steerContext).not.toHaveBeenCalled();
    expect(h.session.crewLeadEditedFiles).toBe(true);

    const settled = harness();
    settled.send(turnStarted("turn-1"), edit("e1"));
    settled.session.status = "idle";
    await settle();
    expect(settled.steerContext).not.toHaveBeenCalled();
    expect(settled.session.crewLeadEditedFiles).toBe(true);
  });

  it("never competes with the user's own steering", async () => {
    const admitting = harness();
    admitting.setPendingUserInput(true);
    admitting.send(turnStarted("turn-1"), edit("e1"));
    await settle();
    expect(admitting.steerContext).not.toHaveBeenCalled();
    expect(admitting.session.crewLeadEditedFiles).toBe(true);
    // Once the user's input is admitted, a later edit still gets the turn's
    // one reminder, and it covers the earlier edit: no second reminder later.
    admitting.setPendingUserInput(false);
    admitting.send(edit("e2"));
    await settle();
    expect(admitting.steerContext).toHaveBeenCalledTimes(1);
    expect(admitting.session.crewLeadEditedFiles).toBeUndefined();

    // Input that arrives between the edit and the send is rechecked too.
    const late = harness();
    late.send(turnStarted("turn-1"), edit("e1"));
    late.setPendingUserInput(true);
    await settle();
    expect(late.steerContext).not.toHaveBeenCalled();
    expect(late.session.crewLeadEditedFiles).toBe(true);

    const staged = harness({
      session: { pendingSteer: { id: "steer-1", stagedAt: 0, prompt: "wait", config: {} } },
    } as HarnessOptions);
    staged.send(turnStarted("turn-1"), edit("e1"));
    await settle();
    expect(staged.steerContext).not.toHaveBeenCalled();
    expect(staged.session.crewLeadEditedFiles).toBe(true);
  });

  it("falls back to the next turn, silently, when the provider refuses", async () => {
    const h = harness();
    h.steerContext.mockRejectedValue(new Error("no active turn"));
    h.send(turnStarted("turn-1"), edit("e1"));
    await settle();
    expect(h.steerContext).toHaveBeenCalledTimes(1);
    expect(h.session.crewLeadEditedFiles).toBe(true);

    // The refused attempt was this turn's one reminder.
    h.session.crewLeadEditedFiles = undefined;
    h.send(edit("e2"));
    await settle();
    expect(h.steerContext).toHaveBeenCalledTimes(1);
    expect(h.session.crewLeadEditedFiles).toBe(true);
  });

  it("ignores items of members and provider-native sub-agents", async () => {
    const h = harness();
    h.send(turnStarted("turn-1"), edit("child", { parentItemId: "sub:run-1" }));
    await settle();
    expect(h.steerContext).not.toHaveBeenCalled();
    expect(h.session.crewLeadEditedFiles).toBeUndefined();
  });

  it("stays silent without a reachable crew role that could take the edit", async () => {
    const noCrew = harness({ config: { model: "m" } });
    const readOnly = harness({
      config: { model: "m", crew: { ...crew, roles: [{ ...sidekick, noEdits: true }] } },
    });
    // Unreachable crew: no reminder now and no stale one for the next prompt.
    const detached = harness({ session: { crossagentsMcpAttached: false } });
    for (const h of [noCrew, readOnly, detached]) {
      h.send(turnStarted("turn-1"), edit("e1"));
      await settle();
      expect(h.steerContext).not.toHaveBeenCalled();
      expect(h.session.crewLeadEditedFiles).toBeUndefined();
    }
  });

  it("stays silent in plan mode", async () => {
    const h = harness({ config: { model: "m", crew, mode: "plan" } });
    h.send(turnStarted("turn-1"), edit("plan", { path: "/repo/PLAN.md" }));
    await settle();
    expect(h.steerContext).not.toHaveBeenCalled();
    expect(h.session.crewLeadEditedFiles).toBeUndefined();
  });
});

describe("CrewLeadEditMonitor file edit paths", () => {
  it("counts only edits whose path lies inside the project", async () => {
    const outside = harness();
    outside.send(
      turnStarted("turn-1"),
      edit("plan", { path: "/home/dev/.claude/plans/plan.md" }),
      edit("sibling", { path: "../other/a.ts" }),
    );
    // A tool misread as an edit by its name carries an empty path.
    outside.send(edit("mcp", { path: "" }), command("mcp", "completed"));
    await settle();
    expect(outside.steerContext).not.toHaveBeenCalled();
    expect(outside.session.crewLeadEditedFiles).toBeUndefined();

    const inside = harness();
    inside.send(turnStarted("turn-1"), edit("relative", { path: "src/a.ts" }));
    await settle();
    expect(inside.steerContext).toHaveBeenCalledWith(reminder);
  });

  it("decides an edit without a path once a later update reports one", async () => {
    const h = harness();
    h.send(turnStarted("turn-1"), edit("e1", { path: "" }), edit("e2", { path: "" }));
    h.send(progress("item.updated", "e1", "/elsewhere/a.ts"));
    await settle();
    expect(h.steerContext).not.toHaveBeenCalled();

    h.send(progress("item.completed", "e2", "/repo/src/b.ts"));
    await settle();
    expect(h.steerContext).toHaveBeenCalledTimes(1);
    // e1 was already decided: its later updates no longer count.
    h.send(progress("item.completed", "e1", "/repo/src/a.ts"));
    await settle();
    expect(h.session.crewLeadEditedFiles).toBeUndefined();
  });
});

describe("CrewLeadEditMonitor shell edits", () => {
  const clean = new Map<string, string>();
  const edited = new Map([["src/a.ts", "10:2"]]);
  const editedAgain = new Map([["src/a.ts", "10:3"]]);

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Runs out the snapshot throttle so the trailing snapshot settles. */
  async function nextWindow(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SHELL_SNAPSHOT_INTERVAL_MS);
    await settle();
  }

  it("treats a worktree change after the lead's command as a lead edit", async () => {
    const h = harness({ shell: { snapshots: [clean, edited] } });
    h.send(turnStarted("turn-1"));
    await settle();
    h.send(command("cmd-1", "started"), command("cmd-1", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(2);
    expect(h.steerContext).toHaveBeenCalledTimes(1);

    // Snapshotting stops for the turn once the reminder fired.
    h.send(command("cmd-2", "started"), command("cmd-2", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(2);
  });

  it("only snapshots after the lead's own top-level commands", async () => {
    const h = harness({ shell: { snapshots: [clean, edited] } });
    h.send(turnStarted("turn-1"));
    await settle();
    h.send(
      command("sub-cmd", "started", "sub:run-1"),
      command("sub-cmd", "completed"),
      { type: "item.started", threadId: "thread-1", itemId: "read", itemType: "tool_call" },
      command("read", "completed"),
    );
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(1);
    expect(h.steerContext).not.toHaveBeenCalled();
  });

  it("does not snapshot without a reachable crew that may edit, or in plan mode", async () => {
    for (const h of [
      harness({
        session: { crossagentsMcpAttached: false },
        shell: { snapshots: [clean, edited] },
      }),
      harness({
        config: { model: "m", crew, mode: "plan" },
        shell: { snapshots: [clean, edited] },
      }),
    ]) {
      h.send(turnStarted("turn-1"), command("cmd-1", "started"), command("cmd-1", "completed"));
      await nextWindow();
      expect(h.readDirtySetSnapshot).not.toHaveBeenCalled();
    }
  });

  it("rules out changes while a sub-agent's items run or start", async () => {
    const h = harness({ shell: { snapshots: [clean, clean, edited, editedAgain] } });
    h.send(turnStarted("turn-1"));
    await settle();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(1);

    // An open sub-agent item: no snapshot after the lead's command.
    h.send(command("child-1", "started", "task-1"));
    h.send(command("cmd-1", "started"), command("cmd-1", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(1);

    // Once it completed, the next command takes a fresh baseline.
    h.send(command("child-1", "completed"));
    h.send(command("cmd-2", "started"), command("cmd-2", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(2);

    // A sub-agent item that started and finished in the interval rules it out.
    h.send(command("child-2", "started", "task-1"), command("child-2", "completed"));
    h.send(command("cmd-3", "started"), command("cmd-3", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(3);
    expect(h.steerContext).not.toHaveBeenCalled();

    // A quiet interval counts again.
    h.send(command("cmd-4", "started"), command("cmd-4", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(4);
    expect(h.steerContext).toHaveBeenCalledTimes(1);
  });

  it("treats another session working in the same place as active", async () => {
    const h = harness({ shell: { snapshots: [clean, edited, editedAgain] } });
    h.setOtherWorkingSessions(1);
    h.send(turnStarted("turn-1"));
    await settle();
    h.send(command("cmd-1", "started"), command("cmd-1", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).not.toHaveBeenCalled();

    h.setOtherWorkingSessions(0);
    h.send(command("cmd-2", "started"), command("cmd-2", "completed"));
    await nextWindow();
    h.send(command("cmd-3", "started"), command("cmd-3", "completed"));
    await nextWindow();
    expect(h.readDirtySetSnapshot).toHaveBeenCalledTimes(2);
    expect(h.steerContext).toHaveBeenCalledTimes(1);
  });
});

describe("countOtherWorkingSessions", () => {
  it("counts other working sessions whose location overlaps", () => {
    const at = (path: string, status: string, threadId = path) =>
      ({ threadId, status, projectLocation: { kind: "posix", path } }) as unknown as SessionRuntime;
    const lead = at("/repo", "working", "lead");
    const sessions = [
      lead,
      at("/repo", "working"),
      at("/repo/pkg", "working"),
      at("/", "working"),
      at("/repo", "idle", "idle-session"),
      at("/repo-2", "working"),
    ];
    expect(countOtherWorkingSessions(sessions, lead)).toBe(3);
  });
});
