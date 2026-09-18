import { describe, expect, it, vi } from "vitest";
import { filterSupervisorEventForInterests } from "@/backend/BackendHostCore";
import {
  RendererStreamOwnership,
  type RendererStreamFallbackWindow,
} from "@/backend/RendererStreamOwnership";
import { planDesktopRelay, type DesktopRelayPlan } from "@/backend/supervisorEventFallback";
import type { RendererStreamDeliveryTarget } from "@/shared/backendHostProtocol";
import { agentStatusSchema, type AgentStatus } from "@/shared/contracts";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  createRendererEventDispatcher,
  type RendererEventDispatchTarget,
} from "./rendererEventDispatch";
import { RendererStreamGrantAuthority } from "./rendererStreamGrantAuthority";

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

const IDS = {
  mainShell: 1,
  auxFallback: 2,
  quickComposer: 7,
  goneFallback: 9,
};

function fallbackWindow(
  windowId: number,
  generation: number,
  interests: LiveEventInterests,
  receivesShellRemainder: boolean,
): RendererStreamFallbackWindow {
  return { windowId, generation, interests, receivesShellRemainder };
}

function planFor(
  event: SupervisorEvent,
  fallbackWindows: readonly RendererStreamFallbackWindow[],
  ownershipArmed = true,
): DesktopRelayPlan {
  return planDesktopRelay({
    event,
    ownershipArmed,
    fallbackWindows,
    isTerminalBootstrapRetainedFor: () => false,
    filterEventForInterests: (entry, interests) =>
      filterSupervisorEventForInterests(entry, interests),
    filterShellEvent: (entry) => entry,
  });
}

function makeDispatcher(options: { quickComposerWindowId?: number | null } = {}) {
  const authority = new RendererStreamGrantAuthority({
    pushDeliveryTable: async () => {},
    onError: vi.fn<(error: unknown) => void>(),
    shellRemainderWindowId: () => IDS.mainShell,
    interestsByWindow: () => new Map(),
  });
  const sent: Array<{
    windowId: number;
    event: SupervisorEvent;
    rendererSequence: number | undefined;
  }> = [];
  const shell: Array<{ event: SupervisorEvent; rendererSequence: number | undefined }> = [];
  const native: SupervisorEvent[] = [];
  const forwarded: SupervisorEvent[] = [];
  const resolveTargetWindow = (
    target: RendererStreamDeliveryTarget,
  ): RendererEventDispatchTarget | null => {
    if (![IDS.mainShell, IDS.auxFallback, IDS.quickComposer].includes(target.windowId)) return null;
    return {
      windowId: target.windowId,
      send: (event, rendererSequence) =>
        sent.push({ windowId: target.windowId, event, rendererSequence }),
    };
  };
  const dispatch = createRendererEventDispatcher({
    isStaleDeliveryTarget: (target) => authority.isStaleDeliveryTarget(target),
    resolveTargetWindow,
    sendToShell: (event, rendererSequence) => shell.push({ event, rendererSequence }),
    applyNativeState: (event) => native.push(event),
    forwardAgentStatus: (event) => forwarded.push(event),
    quickComposerWindowId: () => options.quickComposerWindowId ?? null,
  });
  const deliver = (plan: DesktopRelayPlan, rendererSequence?: number) => {
    if (plan.mode === "legacy") {
      if (plan.shellEvent) dispatch(plan.shellEvent, rendererSequence);
      return;
    }
    for (const copy of plan.copies) dispatch(copy.event, rendererSequence, copy.target);
    if (plan.shellEvent) dispatch(plan.shellEvent, undefined);
  };
  return { dispatch, deliver, authority, sent, shell, native, forwarded };
}

const EMPTY_INTERESTS: LiveEventInterests = {
  terminalThreadIds: [],
  runtimeThreadIds: [],
  allRuntimeEvents: false,
};

const INTERESTS: LiveEventInterests = {
  terminalThreadIds: [],
  runtimeThreadIds: ["t-1"],
  allRuntimeEvents: false,
};

describe("createRendererEventDispatcher", () => {
  it("delivers an agent status to the quick composer exactly once, through the shell forward", () => {
    const { deliver, sent, shell, native, forwarded } = makeDispatcher({
      quickComposerWindowId: IDS.quickComposer,
    });
    const plan = planFor(STATUS, [
      fallbackWindow(IDS.mainShell, 1, EMPTY_INTERESTS, true),
      fallbackWindow(IDS.quickComposer, 2, EMPTY_INTERESTS, false),
    ]);
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") return;

    deliver(plan, 4);

    // The overlay's single path is the shell forward; the planned fallback
    // copy is structurally redundant and must not be sent.
    expect(sent.filter((entry) => entry.windowId === IDS.quickComposer)).toEqual([]);
    expect(forwarded).toEqual([STATUS]);
    expect(sent.length + forwarded.length).toBe(1);
    // Native/control state still applies exactly once, on the shell path.
    expect(native).toEqual([STATUS]);
    expect(shell).toEqual([{ event: plan.shellEvent, rendererSequence: undefined }]);
  });

  it("delivers consecutive identical agent statuses independently", () => {
    const { deliver, forwarded } = makeDispatcher({ quickComposerWindowId: IDS.quickComposer });
    const plan = planFor(STATUS, [
      fallbackWindow(IDS.mainShell, 1, EMPTY_INTERESTS, true),
      fallbackWindow(IDS.quickComposer, 2, EMPTY_INTERESTS, false),
    ]);
    const second = statusEvent();

    deliver(plan, 4);
    deliver(plan, 5);
    deliver(planFor(second, []), undefined);

    expect(forwarded).toEqual([STATUS, STATUS, second]);
  });

  it("still delivers the forward when the targeted copy is for a stale grant epoch", () => {
    const { deliver, authority, sent, native, forwarded } = makeDispatcher({
      quickComposerWindowId: IDS.quickComposer,
    });
    const stale = authority.ensureGrant(IDS.quickComposer);
    authority.dropGrant(IDS.quickComposer);
    authority.ensureGrant(IDS.quickComposer);

    const plan = planFor(STATUS, [
      fallbackWindow(IDS.mainShell, 1, EMPTY_INTERESTS, true),
      fallbackWindow(IDS.quickComposer, stale.generation, EMPTY_INTERESTS, false),
    ]);
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") return;

    deliver(plan, 3);

    expect(sent).toEqual([]);
    expect(forwarded).toEqual([STATUS]);
    expect(native).toEqual([STATUS]);
  });

  it("still delivers the forward when the targeted window no longer resolves", () => {
    const { deliver, sent, native, forwarded } = makeDispatcher({
      quickComposerWindowId: IDS.quickComposer,
    });
    const plan = planFor(STATUS, [
      fallbackWindow(IDS.mainShell, 1, EMPTY_INTERESTS, true),
      fallbackWindow(IDS.goneFallback, 4, EMPTY_INTERESTS, false),
    ]);
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") return;

    deliver(plan, 3);

    expect(sent).toEqual([]);
    expect(forwarded).toEqual([STATUS]);
    expect(native).toEqual([STATUS]);
  });

  it("preserves legacy/startup delivery, native handling, and forwarding", () => {
    const { deliver, sent, native, shell, forwarded } = makeDispatcher({
      quickComposerWindowId: IDS.quickComposer,
    });
    deliver(planFor(STATUS, [], false), 9);
    expect(sent).toEqual([]);
    expect(native).toEqual([STATUS]);
    expect(shell).toEqual([{ event: STATUS, rendererSequence: 9 }]);
    expect(forwarded).toEqual([STATUS]);
  });

  it("keeps the forward for a directly owned quick composer that is not a fallback window", () => {
    const { deliver, sent, forwarded } = makeDispatcher({
      quickComposerWindowId: IDS.quickComposer,
    });
    const ownership = new RendererStreamOwnership();
    ownership.setWindows([
      {
        windowId: IDS.mainShell,
        grant: { windowId: IDS.mainShell, generation: 1, binding: "main" },
        interests: EMPTY_INTERESTS,
        receivesShellRemainder: true,
      },
      {
        windowId: IDS.quickComposer,
        grant: { windowId: IDS.quickComposer, generation: 2, binding: "overlay" },
        interests: EMPTY_INTERESTS,
        receivesShellRemainder: false,
      },
    ]);
    ownership.attach(IDS.quickComposer, { ownedWindowIds: new Set([IDS.quickComposer]) });

    const plan = planFor(STATUS, ownership.fallbackWindows());
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") return;
    expect(plan.copies).toEqual([]);

    deliver(plan, 6);
    expect(sent).toEqual([]);
    expect(forwarded).toEqual([STATUS]);
  });

  it("applies native state exactly once across a mixed batch and drops no controls", () => {
    const { deliver, authority, sent, shell, native, forwarded } = makeDispatcher();
    authority.ensureGrant(1);
    authority.ensureGrant(2);
    const plan = planFor(MIXED, [
      fallbackWindow(1, 1, INTERESTS, true),
      fallbackWindow(2, 2, INTERESTS, false),
    ]);
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") return;

    deliver(plan, 7);

    expect(native).toEqual([plan.shellEvent]);
    expect(forwarded).toEqual([plan.shellEvent]);
    expect(sent).toHaveLength(2);
    // The shell-recipient window gets its copy without controls (the shell
    // remainder carries them once); the aux fallback window keeps its controls.
    expect(sent.find((entry) => entry.windowId === 1)?.event).toMatchObject({
      events: [{ type: "item.started" }],
    });
    expect(sent.find((entry) => entry.windowId === 2)?.event).toMatchObject({
      events: [{ type: "item.started" }, { type: "turn.completed" }],
    });
    expect(shell).toEqual([{ event: plan.shellEvent, rendererSequence: undefined }]);
  });

  it("applies nothing for a stale targeted copy and still handles the shell remainder", () => {
    const { deliver, authority, sent, shell, native } = makeDispatcher();
    const staleGrant = authority.ensureGrant(2);
    authority.dropGrant(2);
    authority.ensureGrant(2);

    const plan = planFor(MIXED, [
      fallbackWindow(1, 1, INTERESTS, true),
      fallbackWindow(2, staleGrant.generation, INTERESTS, false),
    ]);
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") return;

    deliver(plan, 3);
    expect(sent.map((entry) => entry.windowId)).toEqual([1]);
    expect(native).toEqual([plan.shellEvent]);
    expect(shell).toEqual([{ event: plan.shellEvent, rendererSequence: undefined }]);
  });

  it("still targets a non-agent-status control copy to the quick composer window", () => {
    const { deliver, sent } = makeDispatcher({ quickComposerWindowId: IDS.quickComposer });
    const navigation: SupervisorEvent = { type: "git-changed", projectId: "p-1" };
    const plan = planFor(navigation, [
      fallbackWindow(IDS.mainShell, 1, EMPTY_INTERESTS, true),
      fallbackWindow(IDS.quickComposer, 2, EMPTY_INTERESTS, false),
    ]);
    expect(plan.mode).toBe("targeted");
    if (plan.mode !== "targeted") return;

    deliver(plan, 8);

    expect(sent.filter((entry) => entry.windowId === IDS.quickComposer)).toHaveLength(1);
  });
});
