import { describe, expect, it, vi } from "vitest";
import { agentStatusSchema, type AgentStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { createRendererEventDispatcher } from "./rendererEventDispatch";

/**
 * Collapsed single-path dispatcher tests (V5 plan 2.5): every event crosses
 * the desktop-IPC channel once, untargeted and sequenced. Main applies native
 * state once, sends the event to its window once, and keeps the quick
 * composer overlay's agent statuses on the single shell-forward path. The
 * former targeted-copy/stale-generation plumbing was deleted with the
 * renderer-direct stream.
 */

const MIXED: SupervisorEvent = {
  type: "thread-runtime-events",
  threadId: "t-1",
  events: [
    { type: "item.started", threadId: "t-1", itemId: "i-1", itemType: "assistant_message" },
    { type: "turn.completed", threadId: "t-1", turnId: "turn-1", state: "completed" },
  ],
};

const STATUS_ENTRY: AgentStatus = agentStatusSchema.parse({
  kind: "claude",
  label: "Claude",
  installed: true,
  authState: "authenticated",
  capabilities: {},
});

function statusEvent(statuses: AgentStatus[] = [STATUS_ENTRY]): SupervisorEvent {
  return { type: "windows-agent-statuses", statuses };
}

const STATUS = statusEvent();

function makeDispatcher() {
  const shell: Array<{ event: SupervisorEvent; rendererSequence: number | undefined }> = [];
  const native: SupervisorEvent[] = [];
  const forwarded: SupervisorEvent[] = [];
  const dispatch = createRendererEventDispatcher({
    sendToShell: (event, rendererSequence) => shell.push({ event, rendererSequence }),
    applyNativeState: (event) => native.push(event),
    forwardAgentStatus: (event) => forwarded.push(event),
  });
  return { dispatch, shell, native, forwarded };
}

describe("createRendererEventDispatcher (collapsed single path)", () => {
  it("sends the sequenced event to the shell window, applies native state once, forwards statuses once", () => {
    const { dispatch, shell, native, forwarded } = makeDispatcher();
    dispatch(STATUS, 4);
    expect(shell).toEqual([{ event: STATUS, rendererSequence: 4 }]);
    expect(native).toEqual([STATUS]);
    expect(forwarded).toEqual([STATUS]);
    // Exactly one overlay delivery: the shell forward.
    expect(forwarded).toHaveLength(1);
  });

  it("delivers consecutive identical agent statuses independently", () => {
    const { dispatch, forwarded } = makeDispatcher();
    const second = statusEvent();
    dispatch(STATUS, 4);
    dispatch(STATUS, 5);
    dispatch(second, 6);
    expect(forwarded).toEqual([STATUS, STATUS, second]);
  });

  it("does not forward non-agent-status events to the overlay channel", () => {
    const { dispatch, shell, forwarded } = makeDispatcher();
    dispatch(MIXED, 7);
    expect(forwarded).toEqual([]);
    expect(shell).toEqual([{ event: MIXED, rendererSequence: 7 }]);
  });

  it("keeps applying unsequenced envelopes (recovery and bootstrap events)", () => {
    const { dispatch, shell, native } = makeDispatcher();
    const resync: SupervisorEvent = { type: "thread-scrollback-resync", threadId: "t-1" };
    dispatch(resync);
    expect(shell).toEqual([{ event: resync, rendererSequence: undefined }]);
    expect(native).toEqual([resync]);
  });

  it("forwards only when the reporter reports an agent-status event", () => {
    const forwarded: SupervisorEvent[] = [];
    const reporter = vi.fn<(event: SupervisorEvent) => number>((event) => forwarded.push(event));
    const dispatch = createRendererEventDispatcher({
      sendToShell: () => {},
      applyNativeState: () => {},
      forwardAgentStatus: reporter,
    });
    dispatch(MIXED, 1);
    expect(reporter).not.toHaveBeenCalled();
    dispatch(STATUS, 2);
    expect(reporter).toHaveBeenCalledOnce();
  });
});
