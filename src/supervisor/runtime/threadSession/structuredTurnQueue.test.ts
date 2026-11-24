import { describe, expect, it, vi } from "vitest";
import { messageItemPayloadSchema } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SessionRuntime } from "../sessionTypes";
import { StructuredTurnQueue, type StructuredTurnQueueContext } from "./structuredTurnQueue";
import { createFollowUpQueueHarness } from "../threadSessionManager.followUpQueueTestHarness";

function createQueue(emit: StructuredTurnQueueContext["emit"]) {
  return new StructuredTurnQueue({
    emit,
    emitTurnContinuation: vi.fn<StructuredTurnQueueContext["emitTurnContinuation"]>(),
    sessions: new Map(),
    outputPipeline: {
      updateState: vi.fn<StructuredTurnQueueContext["outputPipeline"]["updateState"]>(),
    },
    beginFailureEpisode: vi.fn<StructuredTurnQueueContext["beginFailureEpisode"]>(),
    failStructuredSession: vi.fn<StructuredTurnQueueContext["failStructuredSession"]>(),
  });
}

function runtimeEvents(emit: { mock: { calls: [SupervisorEvent][] } }) {
  return emit.mock.calls
    .map(([entry]) => entry)
    .flatMap((entry) => (entry.type === "thread-runtime-event" ? [entry.event] : []));
}

describe("StructuredTurnQueue answer metadata", () => {
  it.each(["idle", "working"] as const)(
    "forwards source identity through a %s session",
    async (status) => {
      const h = createFollowUpQueueHarness();
      h.session.status = status;
      const questionAnswer = {
        sourceItemId: "question-message",
        questions: [{ header: "", question: "Scope?", selected: [{ label: "Small" }] }],
      };
      try {
        await h.manager.sendThreadInput({
          threadId: h.session.threadId,
          prompt: "Scope?\nSmall",
          config: h.session.config,
          questionAnswer,
        });
        const send = status === "working" ? h.steerTurn : h.startTurn;
        expect(send).toHaveBeenCalledExactlyOnceWith(
          "Scope?\nSmall",
          h.session.config,
          undefined,
          expect.objectContaining({ questionAnswer }),
        );
      } finally {
        h.finish();
        await h.manager.dispose();
      }
    },
  );

  it("keeps answers on the durable user message while preserving ordinary prompt content and identity", () => {
    const emit = vi.fn<StructuredTurnQueueContext["emit"]>();
    const queue = new StructuredTurnQueue({
      emit,
      emitTurnContinuation: vi.fn<StructuredTurnQueueContext["emitTurnContinuation"]>(),
      sessions: new Map(),
      outputPipeline: {
        updateState: vi.fn<StructuredTurnQueueContext["outputPipeline"]["updateState"]>(),
      },
      beginFailureEpisode: vi.fn<StructuredTurnQueueContext["beginFailureEpisode"]>(),
      failStructuredSession: vi.fn<StructuredTurnQueueContext["failStructuredSession"]>(),
    });
    const questionAnswer = {
      questions: [{ header: "", question: "Which scope?", selected: [{ label: "Focused" }] }],
    };
    const id = queue.emitOptimisticUserMessage(
      "thread",
      "Which scope?\nFocused",
      undefined,
      "answer",
      { questionAnswer },
    );
    expect(id).toBe("answer");
    const event = emit.mock.calls
      .map(([entry]) => entry)
      .find(
        (entry) => entry.type === "thread-runtime-event" && entry.event.type === "item.started",
      );
    expect(event).toEqual({
      type: "thread-runtime-event",
      threadId: "thread",
      event: {
        type: "item.started",
        threadId: "thread",
        itemId: "answer",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "Which scope?\nFocused" }], questionAnswer },
      },
    });
    if (event?.type !== "thread-runtime-event" || event.event.type !== "item.started")
      throw new Error("Missing user message");
    expect(messageItemPayloadSchema.parse(JSON.parse(JSON.stringify(event.event.payload)))).toEqual(
      event.event.payload,
    );
  });
});

describe("StructuredTurnQueue model switch dividers", () => {
  it("records a divider only when the answering model changes", () => {
    const emit = vi.fn<StructuredTurnQueueContext["emit"]>();
    const queue = createQueue(emit);

    queue.noteTurnModel("thread", "model-a");
    queue.noteTurnModel("thread", "model-a");
    expect(runtimeEvents(emit)).toEqual([]);

    queue.noteTurnModel("thread", "model-b", { requestedItemId: "switch-1" });
    expect(runtimeEvents(emit)).toEqual([
      {
        type: "item.started",
        threadId: "thread",
        itemId: "switch-1",
        itemType: "model_switch",
        payload: { fromModel: "model-a", toModel: "model-b", at: expect.any(String) },
      },
      { type: "item.completed", threadId: "thread", itemId: "switch-1" },
    ]);

    // A later turn compares against the new baseline, not the first model.
    emit.mockClear();
    queue.noteTurnModel("thread", "model-b");
    expect(runtimeEvents(emit)).toEqual([]);
  });

  it("seeds the baseline from a launch and resets it across a provider switch", () => {
    const emit = vi.fn<StructuredTurnQueueContext["emit"]>();
    const queue = createQueue(emit);

    // No retained baseline yet: the client's seed is the previous model.
    queue.noteTurnModel("thread", "model-b", { seedModel: "model-a" });
    expect(runtimeEvents(emit).map((event) => event.type)).toEqual([
      "item.started",
      "item.completed",
    ]);

    // The retained baseline now wins over a stale seed.
    emit.mockClear();
    queue.noteTurnModel("thread", "model-b", { seedModel: "model-a" });
    expect(runtimeEvents(emit)).toEqual([]);

    // A provider switch restarts the baseline without a model divider, and
    // the next in-provider change compares against the new provider's model.
    queue.noteTurnModel("thread", "other-provider-model", { resetBaseline: true });
    expect(runtimeEvents(emit)).toEqual([]);
    queue.noteTurnModel("thread", "other-provider-model-2");
    expect(runtimeEvents(emit)).toHaveLength(2);
  });

  it("ignores blank models so an unselected config never moves the baseline", () => {
    const emit = vi.fn<StructuredTurnQueueContext["emit"]>();
    const queue = createQueue(emit);

    queue.noteTurnModel("thread", "model-a");
    queue.noteTurnModel("thread", "  ");
    queue.noteTurnModel("thread", undefined);
    queue.noteTurnModel("thread", "model-a");
    expect(runtimeEvents(emit)).toEqual([]);
  });

  it("paints the divider ahead of the prompt and records the model on it", async () => {
    const emit = vi.fn<StructuredTurnQueueContext["emit"]>();
    const startTurn = vi.fn<() => Promise<undefined>>(async () => undefined);
    const session = {
      threadId: "thread",
      instanceId: "instance-1",
      presentationMode: "gui",
      structuredSession: { startTurn },
    } as unknown as SessionRuntime;
    const queue = new StructuredTurnQueue({
      emit,
      emitTurnContinuation: vi.fn<StructuredTurnQueueContext["emitTurnContinuation"]>(),
      sessions: new Map([[session.threadId, session]]),
      outputPipeline: {
        updateState: vi.fn<StructuredTurnQueueContext["outputPipeline"]["updateState"]>(),
      },
      beginFailureEpisode: vi.fn<StructuredTurnQueueContext["beginFailureEpisode"]>(),
      failStructuredSession: vi.fn<StructuredTurnQueueContext["failStructuredSession"]>(),
    });

    await queue.start(session, { prompt: "first", config: { model: "model-a" } });
    await queue.start(session, {
      prompt: "second",
      config: { model: "model-b" },
      modelSwitchItemId: "switch-1",
    });

    const started = runtimeEvents(emit).filter((event) => event.type === "item.started");
    expect(started.map((event) => ("itemType" in event ? event.itemType : undefined))).toEqual([
      "user_message",
      "model_switch",
      "user_message",
    ]);
    const secondMessage = started[2];
    expect(secondMessage?.type === "item.started" ? secondMessage.payload : undefined).toEqual(
      expect.objectContaining({ model: "model-b" }),
    );
  });
});
