import { expect, it, vi } from "vitest";
import type { StructuredInterruptWatchdog } from "./threadSession/structuredInterruptWatchdog";
import { createFollowUpQueueHarness } from "./threadSessionManager.followUpQueueTestHarness";

vi.mock("node-pty", () => ({ spawn: vi.fn<() => never>() }));

it("routes a working goal pause to the structured turn interrupt", async () => {
  const { manager, session, startTurn } = createFollowUpQueueHarness();
  const interruptTurn = vi.fn<() => Promise<void>>(async () => {});
  session.status = "working";
  session.adapter.goalPauseInterruptsTurn = true;
  session.structuredSession!.interruptTurn = interruptTurn;

  try {
    await manager.controlThreadGoal({ threadId: session.threadId, action: "pause" });

    expect(interruptTurn).toHaveBeenCalledOnce();
    expect(startTurn).not.toHaveBeenCalled();
  } finally {
    const watchdog = (
      manager as unknown as { structuredInterruptWatchdog: StructuredInterruptWatchdog }
    ).structuredInterruptWatchdog;
    watchdog.clearStructuredInterruptWatchdog(session);
    await manager.dispose();
  }
});

it("starts a prompt for clear on an idle goal-capable session", async () => {
  const { manager, session, startTurn, finish, completion } = createFollowUpQueueHarness();
  session.adapter.buildGoalControlPrompt = (control) =>
    control.action === "clear" ? "/goal clear" : undefined;
  const goalControl = manager.controlThreadGoal({ threadId: session.threadId, action: "clear" });

  try {
    await vi.waitFor(() => expect(startTurn).toHaveBeenCalledOnce());
    expect(startTurn.mock.calls[0]?.[0]).toBe("/goal clear");
    finish();
    await goalControl;
    await completion;
  } finally {
    finish();
    await manager.dispose();
  }
});

it("rejects a pause when the provider has no pause-as-interrupt capability", async () => {
  const { manager, session, startTurn } = createFollowUpQueueHarness();
  try {
    await expect(
      manager.controlThreadGoal({ threadId: session.threadId, action: "pause" }),
    ).rejects.toThrow("does not support this goal control");
    expect(startTurn).not.toHaveBeenCalled();
  } finally {
    await manager.dispose();
  }
});
