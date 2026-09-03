import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput, StructuredSessionUpdate } from "../../base";

const request = vi.hoisted(() =>
  vi.fn<(method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>>(),
);
const initialize = vi.hoisted(() =>
  vi
    .fn<() => Promise<{ schema: { version: number; fingerprint: string } }>>()
    .mockResolvedValue({ schema: { version: 1, fingerprint: "fixture" } }),
);
const disposeClient = vi.hoisted(() => vi.fn<() => void>());
const terminate = vi.hoisted(() =>
  vi.fn<(child: EventEmitter, options: { ownedProcessGroup: boolean }) => void>(),
);
const spawnMuseServeHost = vi.hoisted(() =>
  vi.fn<() => Promise<{ child: EventEmitter; transport: Record<string, never> }>>(),
);
let notificationHandler: ((method: string, params: Record<string, unknown>) => void) | undefined;
let clientErrorHandler: ((error: Error) => void) | undefined;
let serverRequestHandler:
  | ((request: {
      id: number;
      method: string;
      params: Record<string, unknown>;
    }) => Record<string, unknown>)
  | undefined;

vi.mock("@/shared/processTree", () => ({ terminateChildProcessTree: terminate }));
vi.mock("./client", () => ({
  spawnMuseServeHost,
  MuseMspClient: class {
    initialize = initialize;
    request = request;
    dispose = disposeClient;
    onNotification(handler: (method: string, params: Record<string, unknown>) => void) {
      notificationHandler = handler;
    }
    onError(handler: (error: Error) => void) {
      clientErrorHandler = handler;
    }
    onServerRequest(
      handler: (request: {
        id: number;
        method: string;
        params: Record<string, unknown>;
      }) => Record<string, unknown>,
    ) {
      serverRequestHandler = handler;
    }
  },
}));

import { MuseMspStructuredSession } from "./session";

const projectLocation: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/mnt/c/project",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\project",
};
const config: ThreadConfig = {
  model: "muse-spark-1.3",
  effort: "high",
  approvalPolicy: "on-request",
};

function input(
  overrides: Partial<CreateStructuredSessionInput> = {},
): CreateStructuredSessionInput {
  return {
    threadId: "thread-1",
    projectLocation,
    config,
    presentationMode: "gui",
    ...overrides,
  };
}

function sessionRecord(sessionId = "session-1"): Record<string, unknown> {
  return { sessionId, activeTurnId: null };
}

async function createSession(overrides: Partial<CreateStructuredSessionInput> = {}) {
  const runtimeEvents: RuntimeEvent[] = [];
  const updates: StructuredSessionUpdate[] = [];
  const errors: string[] = [];
  const closes: string[] = [];
  const child = new EventEmitter();
  spawnMuseServeHost.mockResolvedValue({ child, transport: {} });
  request.mockImplementation(async (method) => {
    if (method === "session/start" || method === "session/resume") {
      return { session: sessionRecord() };
    }
    if (method === "turn/start") {
      return { turnId: "turn-1", status: "accepted", disposition: "started" };
    }
    return { status: "accepted" };
  });
  const session = await MuseMspStructuredSession.create(input(overrides));
  session.setListener({
    onClose() {
      closes.push("close");
    },
    onError(message) {
      errors.push(message);
    },
    onUpdate(update) {
      updates.push(update);
    },
    onRuntimeEvent(event) {
      runtimeEvents.push(event);
    },
  });
  await session.activate();
  return { session, child, runtimeEvents, updates, errors, closes };
}

beforeEach(() => {
  vi.clearAllMocks();
  notificationHandler = undefined;
  clientErrorHandler = undefined;
  serverRequestHandler = undefined;
});

describe("MuseMspStructuredSession", () => {
  it("starts a durable GUI session and streams a turn", async () => {
    const { session, runtimeEvents, updates } = await createSession();
    await expect(session.openThread(config)).resolves.toBe("session-1");
    expect(request).toHaveBeenCalledWith(
      "session/start",
      expect.objectContaining({
        workspaceRoot: "/mnt/c/project",
        modelId: "muse-spark-1.3",
        approvalMode: "onRequest",
      }),
    );

    await session.startTurn("hello", config, undefined, { userMessageItemId: "user-1" });
    const turnStart = request.mock.calls.find(([method]) => method === "turn/start");
    const commandId = turnStart?.[1]?.["commandId"];
    notificationHandler?.("item/completed", {
      sessionId: "session-1",
      item: {
        itemId: "provider-user-1",
        commandId,
        kind: "userMessage",
        status: "completed",
        text: "hello",
      },
    });
    notificationHandler?.("item/started", {
      sessionId: "session-1",
      item: { itemId: "assistant-1", kind: "agentMessage", status: "inProgress", text: "" },
    });
    notificationHandler?.("item/delta", {
      sessionId: "session-1",
      itemId: "assistant-1",
      field: "text",
      delta: "hello back",
    });
    notificationHandler?.("item/completed", {
      sessionId: "session-1",
      item: {
        itemId: "assistant-1",
        kind: "agentMessage",
        status: "completed",
        text: "hello back",
      },
    });
    notificationHandler?.("turn/completed", {
      sessionId: "session-1",
      turnId: "turn-1",
      terminal: "completed",
    });

    expect(runtimeEvents).toContainEqual({
      type: "content.delta",
      threadId: "thread-1",
      itemId: "assistant-1",
      stream: "assistant_text",
      delta: "hello back",
    });
    expect(
      runtimeEvents.filter(
        (event) => event.type === "item.started" && event.itemType === "user_message",
      ),
    ).toHaveLength(0);
    expect(runtimeEvents).toContainEqual({
      type: "turn.completed",
      threadId: "thread-1",
      turnId: "turn-1",
      state: "completed",
    });
    expect(updates.at(-1)).toMatchObject({
      status: "idle",
      sessionRef: { providerSessionId: "session-1" },
    });
  });

  it("resumes only the supplied Poracode session without replaying history", async () => {
    const { session } = await createSession({
      sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-01-01T00:00:00Z" },
    });
    await session.openThread(config);
    expect(request).toHaveBeenCalledWith(
      "session/resume",
      expect.objectContaining({ sessionId: "session-1", excludeItems: true }),
    );
  });

  it("acknowledges re-issued server requests and restores resumed active turns", async () => {
    const { session, runtimeEvents, updates } = await createSession({
      sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-01-01T00:00:00Z" },
    });
    request.mockImplementation(async (method) => {
      if (method === "session/resume") {
        return { session: { sessionId: "session-1", activeTurnId: "turn-resumed" } };
      }
      return { status: "accepted" };
    });
    await session.openThread(config);
    expect(
      serverRequestHandler?.({
        id: 18,
        method: "userInput/request",
        params: {
          sessionId: "session-1",
          userInputId: "input-resumed",
          questions: [
            {
              id: "database",
              header: "Database",
              question: "Choose a database",
              selection: { mode: "single" },
              options: [{ label: "Postgres" }],
            },
          ],
        },
      }),
    ).toEqual({});
    expect(runtimeEvents).toContainEqual({
      type: "turn.started",
      threadId: "thread-1",
      turnId: "turn-resumed",
    });
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({ type: "request.opened", requestId: "input-resumed" }),
    );
    expect(updates.at(-1)).toMatchObject({ status: "needs_reply", attention: "needs_reply" });
  });

  it("preserves re-issued request attention when it arrives with the resume response", async () => {
    const { session, updates } = await createSession({
      sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-01-01T00:00:00Z" },
    });
    request.mockImplementation(async (method) => {
      if (method === "session/resume") {
        serverRequestHandler?.({
          id: 18,
          method: "userInput/request",
          params: {
            sessionId: "session-1",
            userInputId: "input-resumed",
            questions: [{ id: "q", question: "Continue?", options: [{ label: "Yes" }] }],
          },
        });
        return { session: { sessionId: "session-1", activeTurnId: "turn-resumed" } };
      }
      return { status: "accepted" };
    });

    await session.openThread(config);

    expect(updates.at(-1)).toMatchObject({ status: "needs_reply", attention: "needs_reply" });
  });

  it("applies model and approval changes before the next turn", async () => {
    const { session } = await createSession();
    request.mockImplementation(async (method) => {
      if (method === "session/start") return { session: sessionRecord() };
      if (method === "turn/start") {
        return { turnId: "turn-1", status: "accepted", disposition: "started" };
      }
      return method === "model/list"
        ? {
            models: [
              {
                modelId: "muse-spark-1.3-contributor",
                displayLabel: "Muse Spark 1.3 Contributor",
                providerId: "meta",
              },
            ],
            providerId: "meta",
            profileId: "tbh",
          }
        : { status: "accepted" };
    });
    await session.openThread(config);
    await session.startTurn("next", {
      ...config,
      model: "muse-spark-1.3-contributor",
      approvalPolicy: "never",
    });
    expect(request).toHaveBeenCalledWith(
      "session/setModel",
      expect.objectContaining({
        model: {
          modelId: "muse-spark-1.3-contributor",
          providerId: "meta",
          profileId: "tbh",
        },
      }),
    );
    expect(request).toHaveBeenCalledWith(
      "session/setApprovalMode",
      expect.objectContaining({ mode: "allowAll" }),
    );
  });

  it("reconciles requested configuration when a resumed Muse session differs", async () => {
    const { session } = await createSession({
      sessionRef: { providerSessionId: "session-1", discoveredAt: "2026-01-01T00:00:00Z" },
    });
    request.mockImplementation(async (method) => {
      if (method === "session/resume") {
        return {
          session: {
            sessionId: "session-1",
            activeTurnId: null,
            modelId: "muse-old",
            approvalMode: { mode: "promptUnmatched" },
          },
        };
      }
      return { status: "accepted" };
    });
    await session.openThread(config);
    expect(request).toHaveBeenCalledWith(
      "session/setModel",
      expect.objectContaining({ model: { modelId: config.model } }),
    );
    expect(request).toHaveBeenCalledWith(
      "session/setApprovalMode",
      expect.objectContaining({ mode: "onRequest" }),
    );
  });

  it("maps approvals and structured questions to canonical requests", async () => {
    const { session, runtimeEvents } = await createSession();
    await session.openThread(config);
    notificationHandler?.("approval/requested", {
      sessionId: "session-1",
      approvalId: "approval-1",
      currentRequirementId: { approvalId: "approval-1", sourceIndex: 0 },
      availableChoices: [
        { choiceId: "allow", decision: "approved", label: "Allow", scope: "once" },
        { choiceId: "deny", decision: "denied", label: "Deny", scope: "once" },
      ],
      subject: { kind: "shell", command: "pwd" },
      toolName: "shell",
    });
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "request.opened",
        requestId: "approval-1",
        requestType: "command_execution_approval",
      }),
    );
    await session.resolveServerRequest("approval-1", { optionId: "deny" });
    expect(request).toHaveBeenCalledWith(
      "approval/decide",
      expect.objectContaining({ approvalId: "approval-1", choiceId: "deny" }),
    );
    expect(runtimeEvents).not.toContainEqual(
      expect.objectContaining({ type: "request.resolved", requestId: "approval-1" }),
    );
    notificationHandler?.("approval/resolved", {
      sessionId: "session-1",
      approvalId: "approval-1",
      decision: "approvedPolicyAmendment",
    });
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "request.resolved",
        requestId: "approval-1",
        outcome: "accepted",
      }),
    );

    notificationHandler?.("userInput/requested", {
      sessionId: "session-1",
      userInputId: "input-1",
      questions: [
        {
          id: "color",
          header: "Color",
          question: "Choose a color",
          selection: { mode: "single" },
          options: [{ label: "Blue", description: "Calm" }],
        },
      ],
    });
    await session.resolveServerRequest("input-1", { answers: { color: "Blue" } });
    expect(request).toHaveBeenCalledWith(
      "userInput/answer",
      expect.objectContaining({
        userInputId: "input-1",
        answers: [{ questionId: "color", selectedLabel: "Blue" }],
      }),
    );
    expect(runtimeEvents).not.toContainEqual(
      expect.objectContaining({ type: "request.resolved", requestId: "input-1" }),
    );
    notificationHandler?.("userInput/settled", {
      sessionId: "session-1",
      userInputId: "input-1",
      outcome: "answered",
      answers: [{ questionId: "color", freeText: "Red" }],
    });
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "question_answer",
        payload: {
          questions: [expect.objectContaining({ question: "Choose a color", customAnswer: "Red" })],
        },
      }),
    );

    notificationHandler?.("userInput/requested", {
      sessionId: "session-1",
      userInputId: "input-multiple",
      questions: [
        {
          id: "tags",
          question: "Choose tags",
          selection: { mode: "multiple" },
          options: [{ label: "Known" }],
        },
      ],
    });
    await session.resolveServerRequest("input-multiple", {
      answers: { tags: "Custom tag" },
    });
    expect(request).toHaveBeenCalledWith(
      "userInput/answer",
      expect.objectContaining({
        userInputId: "input-multiple",
        answers: [{ questionId: "tags", freeText: "Custom tag" }],
      }),
    );
    notificationHandler?.("userInput/settled", {
      sessionId: "session-1",
      userInputId: "input-multiple",
      outcome: "interrupted",
    });
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "request.resolved",
        requestId: "input-multiple",
        outcome: "cancelled",
      }),
    );
  });

  it("keeps a replacement approval stage pending across the decide acknowledgement", async () => {
    let releaseDecision!: (value: Record<string, unknown>) => void;
    const decision = new Promise<Record<string, unknown>>((resolve) => {
      releaseDecision = resolve;
    });
    const { session, runtimeEvents } = await createSession();
    await session.openThread(config);
    request.mockImplementation(async (method) => {
      if (method === "approval/decide") return decision;
      return { status: "accepted" };
    });
    const first = {
      sessionId: "session-1",
      approvalId: "approval-1",
      currentRequirementId: { approvalId: "approval-1", sourceIndex: 0 },
      availableChoices: [{ choiceId: "allow-1", decision: "approved", label: "Allow" }],
      subject: { kind: "shell", command: "pwd" },
    };
    notificationHandler?.("approval/requested", first);
    const resolving = session.resolveServerRequest("approval-1", { optionId: "allow-1" });
    notificationHandler?.("approval/updated", {
      ...first,
      currentRequirementId: { approvalId: "approval-1", sourceIndex: 1 },
      availableChoices: [{ choiceId: "allow-2", decision: "approved", label: "Allow next" }],
    });
    releaseDecision({ status: "accepted", terminal: false });
    await resolving;
    expect(runtimeEvents.filter((event) => event.type === "request.resolved")).toHaveLength(0);
    await session.resolveServerRequest("approval-1", { optionId: "allow-2" });
    expect(request).toHaveBeenLastCalledWith(
      "approval/decide",
      expect.objectContaining({
        requirementId: { approvalId: "approval-1", sourceIndex: 1 },
        choiceId: "allow-2",
      }),
    );
  });

  it("preserves attention for other pending requests", async () => {
    const { session, updates } = await createSession();
    await session.openThread(config);
    notificationHandler?.("approval/requested", {
      sessionId: "session-1",
      approvalId: "approval-1",
      currentRequirementId: { approvalId: "approval-1", sourceIndex: 0 },
      availableChoices: [{ choiceId: "deny", decision: "denied", label: "Deny" }],
      subject: { kind: "shell", command: "pwd" },
    });
    notificationHandler?.("userInput/requested", {
      sessionId: "session-1",
      userInputId: "input-1",
      questions: [{ id: "q", question: "Continue?", options: [{ label: "Yes" }] }],
    });
    await session.resolveServerRequest("input-1", { optionId: "Yes" });
    notificationHandler?.("userInput/settled", {
      sessionId: "session-1",
      userInputId: "input-1",
      outcome: "answered",
      answers: [{ questionId: "q", selectedLabel: "Yes" }],
    });
    expect(updates.at(-1)).toMatchObject({
      status: "needs_approval",
      attention: "needs_approval",
    });
  });

  it("prioritizes a pending question regardless of request arrival order", async () => {
    const { session, updates } = await createSession();
    await session.openThread(config);
    notificationHandler?.("userInput/requested", {
      sessionId: "session-1",
      userInputId: "input-1",
      questions: [{ id: "q", question: "Continue?", options: [{ label: "Yes" }] }],
    });
    notificationHandler?.("approval/requested", {
      sessionId: "session-1",
      approvalId: "approval-1",
      currentRequirementId: { approvalId: "approval-1", sourceIndex: 0 },
      availableChoices: [{ choiceId: "deny", decision: "denied", label: "Deny" }],
      subject: { kind: "shell", command: "pwd" },
    });
    expect(updates.at(-1)).toMatchObject({ status: "needs_reply", attention: "needs_reply" });
  });

  it("waits for turn/started when Muse queues a start acknowledgement", async () => {
    const { session, runtimeEvents } = await createSession();
    await session.openThread(config);
    request.mockImplementation(async (method) =>
      method === "turn/start"
        ? { turnId: "turn-queued", status: "accepted", disposition: "queued" }
        : { status: "accepted" },
    );
    await session.startTurn("queued", config);
    expect(runtimeEvents).not.toContainEqual(
      expect.objectContaining({ type: "turn.started", turnId: "turn-queued" }),
    );
    notificationHandler?.("turn/started", { sessionId: "session-1", turnId: "turn-queued" });
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({ type: "turn.started", turnId: "turn-queued" }),
    );
  });

  it("steers the turn returned by an in-flight start instead of queueing another start", async () => {
    let releaseStart!: (value: Record<string, unknown>) => void;
    const startResult = new Promise<Record<string, unknown>>((resolve) => {
      releaseStart = resolve;
    });
    const { session } = await createSession();
    await session.openThread(config);
    request.mockImplementation(async (method) => {
      if (method === "turn/start") return startResult;
      return { status: "accepted" };
    });

    const starting = session.startTurn("first", config);
    const steering = session.steerTurn("follow-up", config);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request.mock.calls.filter(([method]) => method === "turn/start")).toHaveLength(1);
    releaseStart({ turnId: "turn-delayed", status: "accepted", disposition: "started" });
    await Promise.all([starting, steering]);

    expect(request.mock.calls.filter(([method]) => method === "turn/start")).toHaveLength(1);
    expect(request).toHaveBeenCalledWith(
      "turn/steer",
      expect.objectContaining({ expectedTurnId: "turn-delayed" }),
    );
  });

  it("falls back to a fresh turn when a steer loses the completion race", async () => {
    const { MspRpcError } = await import("./protocol");
    const { session } = await createSession();
    await session.openThread(config);
    await session.startTurn("first", config);
    request.mockImplementation(async (method) => {
      if (method === "turn/steer") {
        throw new MspRpcError("turn is no longer active", {
          code: -32030,
          kind: "commandRejected",
        });
      }
      if (method === "turn/start") {
        return { turnId: "turn-2", status: "accepted", disposition: "started" };
      }
      return { status: "accepted" };
    });
    await session.steerTurn("follow-up", config, undefined, { userMessageItemId: "user-2" });
    expect(request.mock.calls.map(([method]) => method)).toContain("turn/steer");
    expect(request.mock.calls.map(([method]) => method)).toContain("turn/start");
  });

  it("retargets a steer when a newer turn starts before the stale rejection", async () => {
    const { MspRpcError } = await import("./protocol");
    const { session } = await createSession();
    await session.openThread(config);
    await session.startTurn("first", config);
    let steerCount = 0;
    request.mockImplementation(async (method) => {
      if (method === "turn/steer" && steerCount++ === 0) {
        notificationHandler?.("turn/started", { sessionId: "session-1", turnId: "turn-2" });
        throw new MspRpcError("old turn completed", {
          code: -32030,
          kind: "commandRejected",
        });
      }
      return { status: "accepted" };
    });
    await session.steerTurn("redirect", config);
    const steerCalls = request.mock.calls.filter(([method]) => method === "turn/steer");
    expect(steerCalls).toHaveLength(2);
    expect(steerCalls[1]?.[1]).toMatchObject({ expectedTurnId: "turn-2" });
    expect(request.mock.calls.filter(([method]) => method === "turn/start")).toHaveLength(1);
  });

  it("aliases Muse steer user messages to the optimistic item", async () => {
    const { session, runtimeEvents } = await createSession();
    await session.openThread(config);
    await session.startTurn("first", config);
    await session.steerTurn("redirect", config, undefined, { userMessageItemId: "user-steer" });
    const steer = request.mock.calls.find(([method]) => method === "turn/steer");
    notificationHandler?.("item/completed", {
      sessionId: "session-1",
      item: {
        itemId: "provider-steer",
        commandId: steer?.[1]?.["commandId"],
        kind: "userMessage",
        status: "completed",
        text: "redirect",
        steered: true,
      },
    });
    expect(
      runtimeEvents.filter(
        (event) => event.type === "item.started" && event.itemType === "user_message",
      ),
    ).toHaveLength(0);
  });

  it("interrupts the exact active turn and terminates its owned host on dispose", async () => {
    const { session, child } = await createSession();
    await session.openThread(config);
    await session.startTurn("long", config);
    await session.interruptTurn();
    expect(request).toHaveBeenCalledWith(
      "turn/interrupt",
      expect.objectContaining({ sessionId: "session-1", turnId: "turn-1", retract: false }),
    );
    await session.dispose();
    expect(disposeClient).toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledWith(child, {
      ownedProcessGroup: process.platform !== "win32",
    });
  });

  it("owns child Muse sessions announced by subagent items", async () => {
    const { session } = await createSession();
    await session.openThread(config);
    notificationHandler?.("item/started", {
      sessionId: "session-1",
      item: {
        itemId: "subagent-1",
        kind: "subagent",
        status: "inProgress",
        childSessionId: "session-child",
      },
    });
    expect(session.ownsProviderSession("session-1")).toBe(true);
    expect(session.ownsProviderSession("session-child")).toBe(true);
  });

  it("closes the runtime after a transport error followed by process close", async () => {
    const { child, errors, closes, runtimeEvents } = await createSession();
    child.emit("error", new Error("EPIPE"));
    child.emit("close", 1, null);
    expect(errors).toEqual(["EPIPE", "Muse MSP server exited unexpectedly (code 1)."]);
    expect(closes).toEqual(["close"]);
    expect(runtimeEvents).toContainEqual({
      type: "session.exited",
      threadId: "thread-1",
      reason: "exited",
    });
  });

  it("reports a failed write channel while the server process remains open", async () => {
    const { errors } = await createSession();

    clientErrorHandler?.(new Error("EPIPE"));

    expect(errors).toEqual(["EPIPE"]);
  });

  it("maps session/goalChanged notifications into canonical goal items", async () => {
    const { session, runtimeEvents } = await createSession();
    await session.openThread(config);

    notificationHandler?.("session/goalChanged", {
      sessionId: "session-1",
      goal: {
        objective: "Deploy to staging",
        status: "active",
        percentComplete: 0,
      },
    });

    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "goal",
        payload: expect.objectContaining({
          action: "set",
          objective: "Deploy to staging",
          status: "active",
        }),
      }),
    );
  });

  it("maps session/todoListChanged notifications into canonical plan items and closes on dispose", async () => {
    const { session, runtimeEvents } = await createSession();
    await session.openThread(config);

    notificationHandler?.("session/todoListChanged", {
      sessionId: "session-1",
      items: [
        { text: "Check credentials", status: "completed" },
        { text: "Verify endpoints", status: "inProgress", activeForm: "Verifying endpoints..." },
        { text: "Deploy release", status: "pending" },
      ],
      revision: 1,
    });

    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "plan",
        payload: {
          steps: [
            { step: "Check credentials", status: "completed" },
            { step: "Verifying endpoints...", status: "in_progress" },
            { step: "Deploy release", status: "pending" },
          ],
        },
      }),
    );

    await session.dispose();

    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: "muse-plan",
      }),
    );
  });
});
