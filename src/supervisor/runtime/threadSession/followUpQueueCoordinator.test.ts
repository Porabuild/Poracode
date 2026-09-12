// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, SetPendingSteerPayload, ThreadStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SessionRuntime, QueuedStructuredTurn } from "../sessionTypes";
import type { SteerSubmissionOptions } from "./steerCoordinator";
import { FollowUpQueueCoordinator } from "./followUpQueueCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const queues: FollowUpQueueCoordinator[] = [];
afterEach(() => {
  queues.splice(0).forEach((queue) => queue.dispose());
  vi.restoreAllMocks();
});

function harness(initial: ThreadStatus = "working") {
  const session = {
    threadId: "thread",
    instanceId: "instance",
    presentationMode: "gui",
    status: initial,
    config: { model: "model" },
    structuredSession: {
      startTurn: vi.fn<() => Promise<void>>(),
      steerTurn: vi.fn<() => Promise<void>>(),
    },
  } as unknown as SessionRuntime;
  const sessions = new Map([[session.threadId, session]]);
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const prepare = vi.fn<
    (session: SessionRuntime, payload: SetPendingSteerPayload) => Promise<QueuedStructuredTurn>
  >(
    async (
      _session: SessionRuntime,
      payload: SetPendingSteerPayload,
    ): Promise<QueuedStructuredTurn> => ({
      prompt: payload.prompt,
      config: payload.config,
      ...(payload.segments ? { segments: payload.segments } : {}),
    }),
  );
  const start = vi.fn<(session: SessionRuntime, turn: QueuedStructuredTurn) => Promise<void>>(
    (_session: SessionRuntime, _turn: QueuedStructuredTurn) => Promise.resolve(),
  );
  const restart = vi.fn<(session: SessionRuntime, turn: QueuedStructuredTurn) => Promise<void>>(
    async (_session: SessionRuntime, _turn: QueuedStructuredTurn) => {},
  );
  const steer = vi.fn<
    (payload: SetPendingSteerPayload, options?: SteerSubmissionOptions) => Promise<void>
  >(async () => {});
  const queue = new FollowUpQueueCoordinator({
    sessions,
    emit,
    waitForPendingStart: async () => {},
    isCurrentSession: (candidate) => sessions.get(candidate.threadId) === candidate,
    prepareTurn: prepare,
    startStructuredTurn: start,
    restartStructuredTurn: restart,
    steer,
  });
  queues.push(queue);
  queue.onSessionAttached(session);
  function event(
    runtimeEvent:
      | Omit<Extract<RuntimeEvent, { type: "turn.started" }>, "threadId">
      | Omit<Extract<RuntimeEvent, { type: "turn.completed" }>, "threadId">,
  ) {
    queue.onStructuredRuntimeEvent(session, { ...runtimeEvent, threadId: session.threadId });
  }
  function status(value: ThreadStatus) {
    session.status = value;
    queue.onStructuredUpdate(session, value);
  }
  function begin(turnId: string) {
    event({ type: "turn.started", turnId });
    status("working");
  }
  function complete(turnId: string, state: "completed" | "cancelled" = "completed") {
    event({ type: "turn.completed", turnId, state });
    status("idle");
  }
  if (initial === "working") begin("initial");
  const add = (prompt: string) =>
    queue.queueThreadFollowUp({ threadId: "thread", prompt, config: session.config });
  const state = () => queue.getThreadFollowUpQueue("thread");
  const item = (index = 0) => ({ threadId: "thread", id: state()!.items[index]!.id });
  return {
    queue,
    session,
    sessions,
    emit,
    prepare,
    start,
    restart,
    steer,
    status,
    event,
    begin,
    complete,
    add,
    state,
    item,
  };
}

describe("follow-up queue lifecycle", () => {
  it("moves a pending message by ID without dropping concurrent additions or its metadata", async () => {
    const h = harness();
    await h.add("first");
    await h.add("second");
    const first = h.item();
    const second = h.item(1);
    const original = h.state()!.items[1];
    await h.add("new arrival");
    await h.queue.reorderQueuedThreadFollowUp({ ...second, beforeId: first.id });
    expect(h.state()?.items.map((item) => item.prompt)).toEqual(["second", "first", "new arrival"]);
    expect(h.state()?.items[0]).toEqual(original);
    h.complete("initial");
    await flush();
    expect(h.start.mock.calls[0]?.[1].prompt).toBe("second");
  });

  it("moves to the tail and keeps paused delivery paused", async () => {
    const h = harness();
    await h.add("first");
    await h.add("second");
    await h.add("third");
    const first = h.item();
    h.queue.pauseThread("thread");
    await h.queue.reorderQueuedThreadFollowUp({ ...first, beforeId: null });
    h.complete("initial");
    await flush();
    expect(h.state()).toMatchObject({
      paused: true,
      items: [{ prompt: "second" }, { prompt: "third" }, { prompt: "first" }],
    });
    expect(h.start).not.toHaveBeenCalled();
  });

  it("rejects an edit from an older snapshot without replacing newer content", async () => {
    const h = harness();
    await h.add("first");
    const item = h.state()!.items[0]!;
    await h.queue.pauseThreadFollowUps({ threadId: "thread", id: item.id });
    await h.queue.editQueuedThreadFollowUp({
      threadId: "thread",
      id: item.id,
      prompt: "newer",
      expectedStagedAt: item.stagedAt,
    });
    expect(h.state()!.items[0]!.stagedAt).toBeGreaterThan(item.stagedAt);
    await expect(
      h.queue.editQueuedThreadFollowUp({
        threadId: "thread",
        id: item.id,
        prompt: "stale",
        expectedStagedAt: item.stagedAt,
      }),
    ).rejects.toThrow("changed");
    expect(h.state()!.items[0]!.prompt).toBe("newer");
    const latest = h.state()!.items[0]!;
    await h.queue.resumeThreadFollowUps("thread");
    await expect(
      h.queue.editQueuedThreadFollowUp({
        threadId: "thread",
        id: item.id,
        prompt: "racing resume",
        expectedStagedAt: latest.stagedAt,
      }),
    ).rejects.toThrow("changed");
  });

  it("invalidates preparation when a reorder changes the head", async () => {
    const h = harness();
    await h.add("first");
    await h.add("second");
    const first = h.item();
    const second = h.item(1);
    const preparation = deferred<QueuedStructuredTurn>();
    h.prepare.mockReturnValueOnce(preparation.promise);
    h.complete("initial");
    await flush();
    await h.queue.reorderQueuedThreadFollowUp({ ...second, beforeId: first.id });
    preparation.resolve({ prompt: "stale first", config: h.session.config });
    await flush();
    expect(h.start.mock.calls.map((call) => call[1].prompt)).toEqual(["second"]);
    expect(h.state()?.items.map((item) => item.prompt)).toEqual(["first"]);
  });

  it("rejects stale moved items and anchors without changing the remaining queue", async () => {
    const h = harness();
    await h.add("first");
    await h.add("second");
    const first = h.item();
    const second = h.item(1);
    h.complete("initial");
    await flush();
    await expect(
      h.queue.reorderQueuedThreadFollowUp({ ...first, beforeId: second.id }),
    ).rejects.toThrow(first.id);
    await expect(
      h.queue.reorderQueuedThreadFollowUp({ ...second, beforeId: first.id }),
    ).rejects.toThrow(first.id);
    expect(h.state()?.items.map((item) => item.prompt)).toEqual(["second"]);
  });

  it("waits for canonical completion AND idle, then sends FIFO one whole turn at a time", async () => {
    const h = harness();
    await h.add("first");
    await h.add("second");
    h.status("idle");
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    h.event({ type: "turn.completed", turnId: "initial", state: "completed" });
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.start.mock.calls[0]![1].prompt).toBe("first");
    expect(h.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queue: expect.objectContaining({ items: [expect.objectContaining({ prompt: "second" })] }),
      }),
    );
    await flush(); // Resolved admission is not completion.
    expect(h.start).toHaveBeenCalledTimes(1);
    h.begin("first-turn");
    h.complete("first-turn");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[1]![1].prompt).toBe("second");
  });

  it("exposes queued admission before the provider reports working", async () => {
    const h = harness();
    await h.add("next");
    h.complete("initial");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);

    let admitted = false;
    const waiting = h.queue.waitForQueuedTurnAdmission("thread").then(() => {
      admitted = true;
    });
    await flush();
    expect(admitted).toBe(false);

    h.status("working");
    await waiting;
    expect(admitted).toBe(true);
  });

  it("settles an explicitly completed command that has no canonical turn", async () => {
    const h = harness("error");
    await h.add("/goal pause");
    await h.add("next");
    h.session.status = "idle";
    h.start.mockResolvedValueOnce({ outcome: "completed-without-turn" } as never);

    await h.queue.resumeThreadFollowUps("thread");
    await flush();

    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[0]?.[1].prompt).toBe("/goal pause");
    expect(h.start.mock.calls[1]?.[1].prompt).toBe("next");
  });

  it("does not dispatch when completion arrives before idle", async () => {
    const h = harness();
    await h.add("next");
    h.event({ type: "turn.completed", turnId: "initial", state: "completed" });
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    h.status("idle");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("waits for unanswered requests even after a completion/idle edge", async () => {
    const h = harness();
    await h.add("next");
    h.queue.onStructuredRuntimeEvent(h.session, {
      type: "request.opened",
      threadId: "thread",
      requestId: "request",
      requestType: "command_execution_approval",
      payload: { summary: "Read a file" },
    });
    h.status("needs_approval");
    h.complete("initial");
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    h.queue.onStructuredRuntimeEvent(h.session, {
      type: "request.resolved",
      threadId: "thread",
      requestId: "request",
      outcome: "accepted",
    } as RuntimeEvent);
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("clears stale request barriers when a provider failure pauses delivery", async () => {
    const h = harness();
    await h.add("retry me");
    h.queue.onStructuredRuntimeEvent(h.session, {
      type: "request.opened",
      threadId: "thread",
      requestId: "stale-request",
      requestType: "command_execution_approval",
      payload: { summary: "Read a file" },
    });
    h.status("error");
    expect(h.state()).toMatchObject({ paused: true, items: [{ prompt: "retry me" }] });

    h.status("idle");
    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("dispatches from a settled finished session", async () => {
    const h = harness("finished");
    await h.add("after finished");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("pauses on Stop and resumes only explicitly", async () => {
    const h = harness();
    await h.add("next");
    h.queue.pauseThread("thread");
    h.complete("initial", "cancelled");
    await flush();
    expect(h.state()?.paused).toBe(true);
    expect(h.start).not.toHaveBeenCalled();
    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("holds a message while its editor is open and keeps it paused after save", async () => {
    const h = harness();
    await h.add("next");
    const item = h.item();
    await h.queue.pauseThreadFollowUps(item);
    h.complete("initial");
    await flush();
    await h.queue.editQueuedThreadFollowUp({ ...item, prompt: "edited" });
    await flush();
    expect(h.state()?.paused).toBe(true);
    expect(h.start).not.toHaveBeenCalled();
    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.start.mock.calls[0]?.[1].prompt).toBe("edited");
  });

  it("releases the missing completion barrier after a forced Stop", async () => {
    const h = harness();
    await h.add("next");
    h.queue.pauseThread("thread");
    h.queue.onForcedInterrupt(h.session);
    h.status("idle");
    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("notifies the renderer and preserves an unadmitted entry after a forced Stop", async () => {
    const h = harness();
    await h.add("keep on force stop");
    h.complete("initial");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
    h.queue.pauseThread("thread");
    h.queue.onForcedInterrupt(h.session);
    expect(h.state()).toMatchObject({ items: [{ prompt: "keep on force stop" }] });
    expect(h.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "thread-follow-up-queue", threadId: "thread" }),
    );
  });

  it("restarts a disposed structured session instead of calling its old startTurn", async () => {
    const h = harness("error");
    await h.add("resume after close");
    h.session.ignoreExit = true;
    h.session.sessionRef = { providerSessionId: "provider-session" } as never;
    const replacement = {
      ...h.session,
      instanceId: "replacement",
      status: "idle" as const,
      ignoreExit: false,
    } as unknown as SessionRuntime;
    h.restart.mockImplementationOnce(async () => {
      h.sessions.set("thread", replacement);
      h.queue.onSessionAttached(replacement);
      replacement.status = "working";
      h.queue.onStructuredUpdate(replacement, "working");
      h.queue.onStructuredRuntimeEvent(replacement, {
        type: "turn.started",
        threadId: "thread",
        turnId: "replacement-turn",
      });
    });

    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.restart).toHaveBeenCalledTimes(1);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.state()).toBe(null);
  });

  it("retains the failed admission and remaining FIFO for retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = harness();
    await h.add("first");
    await h.add("second");
    h.start.mockRejectedValueOnce(new Error("connection lost"));
    h.complete("initial");
    await flush();
    expect(h.state()).toMatchObject({
      paused: true,
      items: [{ prompt: "first" }, { prompt: "second" }],
    });
    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[0]![1].userMessageItemId).toBe(
      h.start.mock.calls[1]![1].userMessageItemId,
    );
  });

  it("does not replay a queued turn that already began before an error", async () => {
    const h = harness();
    await h.add("first");
    await h.add("second");
    h.complete("initial");
    await flush();
    h.begin("queued");
    h.status("error");
    expect(h.state()).toMatchObject({ paused: true, items: [{ prompt: "second" }] });
    h.status("idle");
    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(2);
  });

  it.each(["remove", "edit", "stop"] as const)(
    "rechecks %s during async preparation",
    async (action) => {
      const h = harness();
      await h.add("first");
      const id = h.item();
      const preparation = deferred<QueuedStructuredTurn>();
      h.prepare.mockReturnValueOnce(preparation.promise);
      h.complete("initial");
      await flush();
      if (action === "remove") await h.queue.removeQueuedThreadFollowUp(id);
      if (action === "edit") await h.queue.editQueuedThreadFollowUp({ ...id, prompt: "edited" });
      if (action === "stop") h.queue.pauseThread("thread");
      preparation.resolve({ prompt: "stale", config: h.session.config });
      await flush();
      expect(h.start.mock.calls.map((call) => call[1].prompt)).toEqual(
        action === "edit" ? ["edited"] : [],
      );
    },
  );

  it("snapshots content at receipt and preserves queue order on edit", async () => {
    const h = harness();
    const payload: SetPendingSteerPayload = {
      threadId: "thread",
      prompt: "first",
      config: h.session.config,
      segments: [{ kind: "attachment", path: "/image.png", mimeType: "image/png" }],
    };
    const add = h.queue.queueThreadFollowUp(payload);
    payload.segments![0] = { kind: "text", content: "mutated" };
    await add;
    await h.add("second");
    const id = h.item();
    expect(h.state()?.items[0]?.segments).toEqual([
      { kind: "attachment", path: "/image.png", mimeType: "image/png" },
    ]);
    await h.queue.editQueuedThreadFollowUp({
      ...id,
      prompt: "edited",
      segments: [{ kind: "text", content: "edited" }],
    });
    expect(h.state()?.items.map((item) => item.prompt)).toEqual(["edited", "second"]);
    expect(h.item()).toEqual(id);
  });

  it("steers only the selected item through the existing path", async () => {
    const h = harness();
    await h.add("first");
    await h.add("second");
    await h.queue.steerQueuedThreadFollowUp(h.item(1));
    expect(h.steer).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "second" }),
      expect.objectContaining({
        awaitReplacement: true,
        userMessageItemId: expect.stringMatching(/^user-/),
      }),
    );
    expect(h.state()?.items.map((item) => item.prompt)).toEqual(["first"]);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("keeps the selected item until the direct steer admission resolves", async () => {
    const h = harness();
    await h.add("first");
    const item = h.item();
    const admission = deferred<void>();
    h.steer.mockImplementationOnce(async () => admission.promise);

    const steering = h.queue.steerQueuedThreadFollowUp(item);
    await flush();
    expect(h.state()?.items).toEqual([expect.objectContaining({ id: item.id, prompt: "first" })]);

    admission.resolve();
    await steering;
    expect(h.state()).toBeNull();
  });

  it("requests canonical admission for fallback steering", async () => {
    const h = harness();
    delete h.session.structuredSession!.steerTurn;
    await h.add("first");
    const item = h.item();
    h.steer.mockImplementationOnce(async (_payload, options) => {
      expect(options).toEqual(
        expect.objectContaining({ awaitReplacement: true, awaitCanonicalStart: true }),
      );
    });

    const steering = h.queue.steerQueuedThreadFollowUp(item);
    await flush();
    await steering;
    expect(h.state()).toBeNull();
  });

  it("retains a selected item if steering fails", async () => {
    const h = harness();
    await h.add("first");
    h.steer.mockRejectedValueOnce(new Error("failed"));
    await expect(h.queue.steerQueuedThreadFollowUp(h.item())).rejects.toThrow("failed");
    expect(h.state()?.items[0]?.prompt).toBe("first");
  });

  it("releases the direct barrier when turn completion precedes steer admission", async () => {
    const h = harness();
    await h.add("next");
    await h.add("steer");
    const admission = deferred<void>();
    h.steer.mockImplementationOnce(async () => {
      const direct = h.queue.beginDirectInput("thread");
      direct.markStarted(h.session);
      h.queue.noteDirectSteerSubmitted(h.session);
      try {
        await admission.promise;
      } finally {
        direct.release();
      }
    });
    const steering = h.queue.steerQueuedThreadFollowUp(h.item(1));
    await flush();
    h.complete("initial");
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    admission.resolve();
    await steering;
    await flush();
    expect(h.start.mock.calls.map((call) => call[1].prompt)).toEqual(["next"]);
  });

  it.each([true, false])(
    "handles direct steer of an already dispatched queue turn (native=%s)",
    async (native) => {
      const h = harness();
      await h.add("first");
      await h.add("second");
      h.complete("initial");
      await flush();
      h.begin("queued");
      if (!native) delete h.session.structuredSession!.steerTurn;
      const reservation = h.queue.beginDirectInput("thread");
      reservation.markStarted(h.session);
      if (native) h.queue.noteDirectSteerSubmitted(h.session);
      else {
        h.complete("queued", "cancelled");
        h.queue.noteDirectTurnSubmitted(h.session);
        h.begin("replacement");
        h.event({ type: "turn.completed", turnId: "queued", state: "cancelled" });
        h.status("idle");
        await flush();
      }
      expect(h.start).toHaveBeenCalledTimes(1);
      reservation.release();
      h.complete(native ? "queued" : "replacement");
      await flush();
      expect(h.start).toHaveBeenCalledTimes(2);
    },
  );

  it("blocks the FIFO while a direct input is being prepared", async () => {
    const h = harness();
    await h.add("next");
    const reservation = h.queue.beginDirectInput("thread");
    h.complete("initial");
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    reservation.release();
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("can resume after direct steer preparation rejects", async () => {
    const h = harness();
    await h.add("next");
    const reservation = h.queue.beginDirectInput("thread");
    reservation.markStarted(h.session);
    h.queue.directInputFailed("thread");
    reservation.release();
    h.complete("initial");
    await flush();
    expect(h.state()?.paused).toBe(true);
    await h.queue.resumeThreadFollowUps("thread");
    await flush();
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it("ignores stale session completion and retries preparation for a replacement", async () => {
    const h = harness();
    await h.add("next");
    h.queue.beginSessionReplacement("thread");
    h.queue.onSessionClosing("thread", h.session);
    const next = { ...h.session, instanceId: "next", status: "working" as const };
    h.sessions.set("thread", next);
    h.queue.onSessionAttached(next);
    h.complete("initial");
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    h.queue.onStructuredRuntimeEvent(next, {
      type: "turn.started",
      threadId: "thread",
      turnId: "next-turn",
    });
    h.queue.onStructuredRuntimeEvent(next, {
      type: "turn.completed",
      threadId: "thread",
      turnId: "next-turn",
      state: "completed",
    });
    next.status = "idle" as "working";
    h.queue.onStructuredUpdate(next, "idle");
    await flush();
    expect(h.start.mock.calls[0]?.[0]).toBe(next);
  });
});
