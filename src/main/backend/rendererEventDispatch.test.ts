import { describe, expect, it } from "vitest";
import { agentStatusSchema, type AgentStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { createRendererEventDispatcher } from "./rendererEventDispatch";

/**
 * V6 B.6: live envelopes do not cross desktop IPC. Main only applies native
 * sleep-blocker state; renderer windows observe events over loopback HTTP+WS.
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
  const native: SupervisorEvent[] = [];
  const dispatch = createRendererEventDispatcher({
    applyNativeState: (event) => native.push(event),
  });
  return { dispatch, native };
}

describe("createRendererEventDispatcher (native-only, no IPC event plane)", () => {
  it("applies native state and does not require a shell or overlay forward", () => {
    const { dispatch, native } = makeDispatcher();
    dispatch(STATUS, 4);
    expect(native).toEqual([STATUS]);
  });

  it("applies consecutive identical agent statuses independently", () => {
    const { dispatch, native } = makeDispatcher();
    const second = statusEvent();
    dispatch(STATUS, 4);
    dispatch(STATUS, 5);
    dispatch(second, 6);
    expect(native).toEqual([STATUS, STATUS, second]);
  });

  it("applies mixed runtime envelopes the same way as agent status", () => {
    const { dispatch, native } = makeDispatcher();
    dispatch(MIXED, 7);
    expect(native).toEqual([MIXED]);
  });

  it("keeps applying unsequenced envelopes (recovery and bootstrap events)", () => {
    const { dispatch, native } = makeDispatcher();
    const resync: SupervisorEvent = { type: "thread-scrollback-resync", threadId: "t-1" };
    dispatch(resync);
    expect(native).toEqual([resync]);
  });
});
