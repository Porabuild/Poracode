import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { ThreadNotificationPublisher } from "@/host/remote/ThreadNotificationPublisher";
import type { UserNotification } from "@/shared/threadNotification";
import { CodexRpcResponseError } from "./appServerRpc";
import { CodexAsyncQuestionAttention } from "./asyncQuestionAttention";
import { setupCodexStructuredSession as setup } from "./structuredSessionTestHarness";

const turn = (status = "inProgress") => ({
  threadId: "provider-thread",
  turn: { id: "turn-user", status },
});
const question = (id = "question-1", title = "Which scope?") => ({
  threadId: "provider-thread",
  turnId: "turn-user",
  item: {
    id,
    type: "agentMessage",
    text: "",
    delivery: "async",
    questions: [{ title, options: ["Small", "Full"] }],
  },
});
const needsReply = { status: "working", attention: "needs_reply" };

describe("Codex async question attention", () => {
  it.each(["item/started", "item/completed"])(
    "raises attention for questions first delivered by %s and keeps it through ongoing work and completion",
    (method) => {
      const h = setup();
      h.notify("turn/started", turn());
      if (method === "item/completed") {
        h.notify("item/started", {
          ...question(),
          item: { id: "question-1", type: "agentMessage", text: "" },
        });
      }
      h.notify(method, question());
      expect(h.updates.at(-1)).toEqual(needsReply);
      expect(h.events.some((event) => event.type === "request.opened")).toBe(false);

      h.notify("thread/status/changed", {
        threadId: "provider-thread",
        status: { type: "active", activeFlags: [] },
      });
      expect(h.updates.at(-1)).toEqual(needsReply);
      h.notify("turn/started", {
        threadId: "provider-thread",
        turn: { id: "turn-continuation", status: "inProgress" },
      });
      expect(h.updates.at(-1)).toEqual(needsReply);
      h.notify("turn/completed", turn("completed"));
      h.notify("thread/status/changed", { threadId: "provider-thread", status: { type: "idle" } });
      h.notify("turn/completed", {
        threadId: "provider-thread",
        turn: { id: "turn-continuation", status: "completed" },
      });
      expect(h.updates.at(-1)).toEqual({ status: "idle", attention: "needs_reply" });
      expect(h.events).toContainEqual(
        expect.objectContaining({ type: "turn.completed", state: "completed" }),
      );
    },
  );

  it("steers an answer into the running turn and clears attention without a second turn", async () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/started", question());

    await h.session.steerTurn("Which scope?\nSmall", { model: "gpt-5.4" });

    expect(h.requests.map(({ method }) => method)).toEqual([
      "thread/settings/update",
      "turn/steer",
    ]);
    expect(h.updates.at(-1)).toEqual({ status: "working", attention: "working" });
    // Completion repeats the same metadata, after the user has already answered.
    h.notify("item/completed", question());
    expect(h.updates.at(-1)).toEqual({ status: "working", attention: "working" });
    h.notify("turn/completed", turn("completed"));
    expect(h.updates.at(-1)).toEqual({ status: "idle", attention: "none" });
  });

  it("starts a normal turn when answering after the agent has finished", async () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("turn/completed", turn("completed"));

    await h.session.startTurn("Use the small scope", { model: "gpt-5.4" });

    expect(h.requests.map(({ method }) => method)).toEqual(["turn/start"]);
    expect(h.updates.at(-1)).toEqual({ status: "working", attention: "working" });
  });

  it("keeps another question pending when two clients answer the same source", async () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("item/completed", question("question-2", "Which platform?"));
    const source = h.events.find(
      (event) => event.type === "item.started" && event.itemType === "assistant_message",
    );
    if (source?.type !== "item.started") throw new Error("Missing question message");
    const questionAnswer = {
      sourceItemId: source.itemId,
      questions: [{ header: "", question: "Which scope?", selected: [{ label: "Small" }] }],
    };

    await h.session.steerTurn("Which scope?\nSmall", { model: "gpt-5.4" }, undefined, {
      questionAnswer,
    });
    await h.session.steerTurn("Which scope?\nSmall", { model: "gpt-5.4" }, undefined, {
      questionAnswer,
    });
    h.notify("turn/completed", turn("completed"));

    expect(h.updates.at(-1)).toEqual({ status: "idle", attention: "needs_reply" });
    expect(
      h.events.filter(
        (event) => event.type === "item.started" && event.itemType === "user_message",
      ),
    ).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ questionAnswer }) }),
      expect.objectContaining({ payload: expect.objectContaining({ questionAnswer }) }),
    ]);
  });

  it("keeps other forms pending when one of several async questions is answered", async () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("item/completed", question("question-2", "Which platform?"));

    await h.session.steerTurn("Which scope?\nSmall", { model: "gpt-5.4" });
    expect(h.updates.at(-1)).toEqual(needsReply);
    h.notify("thread/status/changed", {
      threadId: "provider-thread",
      status: { type: "active", activeFlags: [] },
    });
    expect(h.updates.at(-1)).toEqual(needsReply);

    await h.session.steerTurn("Which platform?\nFull", { model: "gpt-5.4" });
    expect(h.updates.at(-1)).toEqual({ status: "working", attention: "working" });
  });

  it("falls back once when the native turn ends before its answer is steered", async () => {
    const h = setup((method) =>
      method === "turn/steer"
        ? new CodexRpcResponseError("no active turn to steer", -32600)
        : undefined,
    );
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("item/completed", question("question-2", "Which platform?"));

    await h.session.steerTurn("Which scope?\nSmall", { model: "gpt-5.4" });

    expect(h.requests.map(({ method }) => method)).toEqual([
      "thread/settings/update",
      "turn/steer",
      "turn/start",
    ]);
    expect(h.updates.at(-1)).toEqual(needsReply);
  });

  it("preserves approval and error priority while a question is pending", () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("thread/status/changed", {
      threadId: "provider-thread",
      status: { type: "active", activeFlags: ["waitingOnApproval"] },
    });
    expect(h.updates.at(-1)).toEqual({ status: "needs_approval", attention: "needs_approval" });
    h.notify("thread/status/changed", {
      threadId: "provider-thread",
      status: { type: "systemError" },
    });
    h.notify("error", { threadId: "provider-thread", error: { message: "Usage limit reached" } });
    expect(h.updates.at(-1)).toMatchObject({ status: "error", attention: "error" });
  });

  it("starts a fresh turn when replying after an error left a stale active turn id", async () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("thread/status/changed", {
      threadId: "provider-thread",
      status: { type: "systemError" },
    });
    h.notify("error", { threadId: "provider-thread", error: { message: "Temporary failure" } });

    await h.session.startTurn("Try again", { model: "gpt-5.4" });

    expect(h.requests.map(({ method }) => method)).toEqual(["turn/start"]);
    expect(h.updates.at(-1)).toEqual({ status: "working", attention: "working" });
  });

  it("keeps the working status used by Stop, native steering and rewind guards", () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/completed", question());

    expect(h.updates.at(-1)).toEqual(needsReply);
    expect(h.requests).toEqual([]);
  });

  it.each(["rollback", "fork"])("retires removed questions after a %s", async (variant) => {
    const h = setup((method) => {
      if (method === "thread/fork") return { thread: { id: "forked-thread" } };
      if (method === "thread/read") return { thread: { status: { type: "idle" } } };
      return undefined;
    });
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("turn/completed", turn("completed"));

    await h.session.restoreToRevertAnchor(
      {
        version: 1,
        data: {
          variant,
          sourceThreadId: "provider-thread",
          lastTurnId: "retained-turn",
          numTurns: 1,
        },
      },
      { model: "gpt-5.4" },
    );

    expect(h.updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
  });

  it("leaves previous-protocol messages without questions and malformed questions working", () => {
    const h = setup();
    h.notify("turn/started", turn());
    for (const questions of [undefined, [], [null, { title: " " }]]) {
      h.notify("item/completed", {
        ...question(),
        item: {
          id: `message-${String(questions)}`,
          type: "agentMessage",
          text: "Working",
          questions,
        },
      });
    }
    expect(h.updates).toEqual([{ status: "working", attention: "working" }]);
    h.notify("turn/completed", turn("completed"));
    expect(h.updates.at(-1)).toEqual({ status: "idle", attention: "none" });
  });

  it("replays pending attention to a newly attached client after completion", () => {
    const h = setup();
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    h.notify("turn/completed", turn("completed"));
    Object.assign(h.session, { activated: true });
    const onUpdate = vi.fn<(update: StructuredSessionUpdate) => void>();
    h.session.setListener({ onUpdate, onClose() {}, onError() {} });
    expect(onUpdate).toHaveBeenCalledWith({
      status: "idle",
      attention: "needs_reply",
      sessionRef: expect.objectContaining({ providerSessionId: "provider-thread" }),
    });
  });

  it("publishes one host attention notification without clients and fans out the same status", () => {
    const h = setup();
    const publish = vi.fn<(notification: UserNotification) => void>();
    const publisher = new ThreadNotificationPublisher({
      getThread: () =>
        ({
          id: "local-thread",
          projectId: "project",
          title: "Async question",
          agentKind: "codex",
          config: { model: "gpt-5.4" },
          status: "working",
          attention: "working",
          canResumeWithConfig: false,
          archived: false,
          done: false,
          starred: false,
          presentationMode: "gui",
          createdAt: "2026-11-10T00:00:00.000Z",
          updatedAt: "2026-11-10T00:00:00.000Z",
        }) satisfies Thread,
      getProjectName: () => "Fixture",
      getSettings: () => ({
        notificationsEnabled: true,
        notificationStatuses: { done: true, needsAttention: true, error: true },
        notifyL2Cli: true,
      }),
      publish,
    });
    const clients: Array<(update: StructuredSessionUpdate) => void> = [];
    h.session.setListener({
      onUpdate(update) {
        publisher.handleSupervisorEvent({
          ...update,
          type: "thread-state",
          threadId: "local-thread",
          canResumeWithConfig: false,
        });
        for (const client of clients) client(update);
      },
      onClose() {},
      onError() {},
    });
    h.notify("turn/started", turn());
    h.notify("item/completed", question());
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      threadId: "local-thread",
      projectName: "Fixture",
      threadTitle: "Async question",
      category: "needsAttention",
      status: "needs_reply",
    });
    const desktop = vi.fn<(update: StructuredSessionUpdate) => void>();
    const phone = vi.fn<(update: StructuredSessionUpdate) => void>();
    clients.push(desktop, phone);
    h.notify("thread/status/changed", {
      threadId: "provider-thread",
      status: { type: "active", activeFlags: [] },
    });
    h.notify("turn/completed", turn("completed"));
    expect(desktop).toHaveBeenLastCalledWith({ status: "idle", attention: "needs_reply" });
    expect(phone).toHaveBeenLastCalledWith({ status: "idle", attention: "needs_reply" });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("ignores subagent questions including metadata sent only at completion", () => {
    const attention = new CodexAsyncQuestionAttention();
    attention.observe([
      {
        type: "item.started",
        threadId: "local",
        itemId: "child-message",
        itemType: "assistant_message",
        parentItemId: "subagent",
        payload: { content: [] },
      },
      {
        type: "item.completed",
        threadId: "local",
        itemId: "child-message",
        payload: {
          replyForm: { questions: [{ id: "q0", question: "Child question?", options: null }] },
        },
      },
    ]);
    expect(attention.needsReply).toBe(false);
  });
});
