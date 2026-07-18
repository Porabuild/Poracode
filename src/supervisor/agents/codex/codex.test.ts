import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createCodexAdapter,
  deriveCodexStructuredState,
  detectCodexReadyForInitialPrompt,
  detectCodexUpdatePrompt,
  parseCodexSocketMessage,
} from "./index";
import {
  codexDefaultCapabilities,
  formatCodexPlanLabel,
  parseCodexLoginStatusOutput,
} from "./detection";
import { CodexStructuredSession } from "./acp";
import { CodexRpcResponseError, type CodexAppServerRpcListener } from "./appServerRpc";
import type { CodexThreadStatus } from "./acpProtocol";
import type { OscNotification, OscTitle } from "@/shared/osc";
import type { RuntimeEvent, ToolCallPayload } from "@/shared/contracts";
import { codexIntentFor } from "./plugin/intentMap";
import {
  mapCodexModels,
  mapCodexDisabledSkillNames,
  mapCodexRequirements,
  mapCodexSkillsToSlashCommands,
  mapCodexSlashCommands,
} from "./probe";
import { buildCodexTurnInput } from "./acpTurn";
import { CodexStdioTransport } from "./stdioTransport";
import { CodexSubAgentRouter } from "./subAgentRouting";
import type { StructuredSessionUpdate } from "../base";

describe("deriveCodexStructuredState", () => {
  it("maps active approval state to needs_approval", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: ["waitingOnApproval"],
      }),
    ).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
    });
  });

  it("maps active user input state to needs_reply", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: ["waitingOnUserInput"],
      }),
    ).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
    });
  });

  it("maps active work with no flags to working", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: [],
      }),
    ).toEqual({
      status: "working",
      attention: "working",
    });
  });

  it("ignores unknown active flags from newer app-server versions", () => {
    const status = {
      type: "active",
      activeFlags: ["newerUnknownFlag"],
    } as unknown as CodexThreadStatus;

    expect(deriveCodexStructuredState(status)).toEqual({
      status: "working",
      attention: "working",
    });
  });

  it("maps idle state to idle", () => {
    expect(deriveCodexStructuredState({ type: "idle" })).toEqual({
      status: "idle",
      attention: "none",
    });
  });

  it("maps system errors to error", () => {
    expect(deriveCodexStructuredState({ type: "systemError" })).toEqual({
      status: "error",
      attention: "error",
    });
  });

  it("treats method messages with ids as server requests, not client responses", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: "req-1",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "provider-thread",
          turnId: "turn-1",
          itemId: "item-1",
          questions: [],
          autoResolutionMs: null,
        },
      }),
    ).toEqual({
      kind: "request",
      id: "req-1",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "provider-thread",
        turnId: "turn-1",
        itemId: "item-1",
        questions: [],
        autoResolutionMs: null,
      },
    });
  });

  it("preserves numeric server request ids", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: 0,
        method: "item/commandExecution/requestApproval",
        params: {
          command: "pnpm test",
        },
      }),
    ).toEqual({
      kind: "request",
      id: 0,
      method: "item/commandExecution/requestApproval",
      params: {
        command: "pnpm test",
      },
    });
  });

  it("treats id-only messages as JSON-RPC responses", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: "poracode-1",
        result: {
          ok: true,
        },
      }),
    ).toEqual({
      kind: "response",
      id: "poracode-1",
      result: {
        ok: true,
      },
    });
  });
});

function createTransportHarness() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();

  const writes: string[] = [];
  child.stdin.on("data", (chunk) => writes.push(String(chunk)));

  const messages: unknown[] = [];
  const errors: Error[] = [];
  let closed = false;
  const transport = new CodexStdioTransport(
    child as unknown as import("node:child_process").ChildProcess,
  );
  transport.setListener({
    onMessage: (message) => messages.push(message),
    onClose: () => {
      closed = true;
    },
    onError: (error) => errors.push(error),
  });

  return {
    child,
    transport,
    messages,
    errors,
    writes,
    get closed() {
      return closed;
    },
  };
}

describe("CodexStdioTransport", () => {
  it("parses newline-delimited JSON-RPC messages across split stdout chunks", () => {
    const { child, messages } = createTransportHarness();

    child.stdout.write('{"jsonrpc":"2.0","id":"1",');
    expect(messages).toEqual([]);

    child.stdout.write('"result":{"ok":true}}\n{"jsonrpc":"2.0","method":"turn/started"}\r\n');

    expect(messages).toEqual([
      { jsonrpc: "2.0", id: "1", result: { ok: true } },
      { jsonrpc: "2.0", method: "turn/started" },
    ]);
  });

  it("keeps stderr out of protocol parsing and records it for diagnostics", () => {
    const { child, messages, transport } = createTransportHarness();

    child.stderr.write("warning from app-server\n");
    child.stdout.write('{"jsonrpc":"2.0","id":"1","result":null}\n');

    expect(messages).toEqual([{ jsonrpc: "2.0", id: "1", result: null }]);
    expect(transport.formatOutput()).toContain("warning from app-server");
  });

  it("writes outgoing JSON-RPC messages as newline-delimited JSON", () => {
    const { transport, writes } = createTransportHarness();

    transport.write({ jsonrpc: "2.0", method: "initialized" });

    expect(writes).toEqual(['{"jsonrpc":"2.0","method":"initialized"}\n']);
  });
});

describe("CodexSubAgentRouter", () => {
  it("creates the subagent parent from app-server activity and flushes buffered child output", () => {
    const router = new CodexSubAgentRouter("local-thread");
    router.setDefaultModelSettings("gpt-5.6-sol", "medium");

    expect(
      router.routeChildNotification(
        "thread/started",
        {
          thread: {
            id: "child-thread",
            parentThreadId: "provider-thread",
            status: { type: "active", activeFlags: [] },
          },
        },
        "provider-thread",
      ),
    ).toEqual([]);
    expect(
      router.routeChildNotification(
        "item/started",
        {
          threadId: "child-thread",
          item: { id: "child-message", type: "agentMessage", text: "Found a race." },
        },
        "provider-thread",
      ),
    ).toEqual([]);

    const events = router.observeMainNotification(
      "item/completed",
      {
        threadId: "provider-thread",
        item: {
          id: "spawn-call",
          type: "subAgentActivity",
          kind: "started",
          agentThreadId: "child-thread",
          agentPath: "/root/game_logic",
        },
      },
      [
        {
          type: "item.started",
          threadId: "local-thread",
          itemId: "generic-activity",
          itemType: "tool_call",
          payload: { name: "subAgentActivity", status: "running" },
        },
        {
          type: "item.completed",
          threadId: "local-thread",
          itemId: "generic-activity",
          payload: { status: "success" },
        },
      ],
    );
    const parent = events.find(
      (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
        event.type === "item.started" &&
        event.itemType === "tool_call" &&
        (event.payload as ToolCallPayload | undefined)?.isSubAgent === true,
    );

    expect(parent?.payload).toMatchObject({
      name: "spawnAgent",
      status: "running",
      isSubAgent: true,
      args: {
        description: "game logic",
        agentPath: "/root/game_logic",
        receiverThreadIds: ["child-thread"],
      },
      progress: {
        description: "game logic",
        model: "gpt-5.6-sol",
        effort: "medium",
        stepCount: 0,
      },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parent?.itemId,
        payload: expect.objectContaining({
          progress: expect.objectContaining({ stepCount: 1 }),
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: parent?.itemId,
      }),
    );
    expect(events).not.toContainEqual(expect.objectContaining({ itemId: "generic-activity" }));

    const completionEvents = router.routeChildNotification(
      "turn/completed",
      { threadId: "child-thread", turn: { id: "child-turn", status: "completed" } },
      "provider-thread",
    );
    expect(
      completionEvents?.some(
        (event) => event.type === "item.completed" && event.itemId !== parent?.itemId,
      ),
    ).toBe(true);
    expect(completionEvents).toContainEqual({
      type: "item.completed",
      threadId: "local-thread",
      itemId: parent?.itemId,
      payload: { status: "success", result: "Found a race." },
    });
  });

  it("suppresses wait coordination items instead of presenting them as subagents", () => {
    const router = new CodexSubAgentRouter("local-thread");
    const waitItem = {
      id: "wait-call",
      type: "collabAgentToolCall",
      tool: "wait",
      status: "completed",
      senderThreadId: "provider-thread",
      receiverThreadIds: [],
      agentsStates: {},
    };

    expect(
      router.observeMainNotification(
        "item/completed",
        { threadId: "provider-thread", item: waitItem },
        [
          {
            type: "item.started",
            threadId: "local-thread",
            itemId: "wait-item",
            itemType: "tool_call",
            payload: { name: "wait", status: "running" },
          },
          {
            type: "item.completed",
            threadId: "local-thread",
            itemId: "wait-item",
            payload: { status: "success" },
          },
        ],
      ),
    ).toEqual([]);
  });

  it("routes child-thread items under the parent and keeps the composer tile active", () => {
    const router = new CodexSubAgentRouter("local-thread");
    router.setDefaultModelSettings("gpt-5.4", "medium");
    const collabItem = {
      id: "collab-1",
      type: "collabAgentToolCall",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "provider-thread",
      receiverThreadIds: [],
      prompt: "Inspect the protocol",
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "child-thread": { status: "running", message: null },
      },
    };
    const parentEvents = router.observeMainNotification(
      "item/started",
      { threadId: "provider-thread", item: collabItem },
      [
        {
          type: "item.started",
          threadId: "local-thread",
          itemId: "parent-item",
          itemType: "tool_call",
          payload: {
            name: "spawnAgent",
            status: "running",
            isSubAgent: true,
            progress: {},
          },
        },
      ],
    );

    expect(parentEvents[0]).toMatchObject({
      type: "item.started",
      itemId: "parent-item",
      payload: {
        status: "running",
        isSubAgent: true,
        progress: { model: "gpt-5.4", effort: "medium" },
      },
    });

    expect(
      router.routeChildNotification(
        "thread/started",
        {
          thread: {
            id: "child-thread",
            parentThreadId: "provider-thread",
            status: { type: "active", activeFlags: [] },
          },
        },
        "provider-thread",
      ),
    ).toEqual([]);
    expect(
      router.routeChildNotification(
        "item/started",
        {
          threadId: "child-thread",
          turnId: "child-turn",
          item: { id: "child-message", type: "agentMessage", text: "Child result" },
        },
        "provider-thread",
      ),
    ).toEqual([]);

    const completedCollabItem = {
      ...collabItem,
      status: "completed",
      receiverThreadIds: ["child-thread"],
    };
    const prematureCompletion = router.observeMainNotification(
      "item/completed",
      { threadId: "provider-thread", item: completedCollabItem },
      [
        {
          type: "item.completed",
          threadId: "local-thread",
          itemId: "parent-item",
          payload: { status: "success" },
        },
      ],
    );
    expect(prematureCompletion).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "parent-item",
        payload: expect.objectContaining({ status: "running", isSubAgent: true }),
      }),
    );
    expect(prematureCompletion).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        threadId: "local-thread",
        parentItemId: "parent-item",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "Inspect the protocol" }] },
      }),
    );
    expect(prematureCompletion).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        threadId: "local-thread",
        parentItemId: "parent-item",
        itemType: "assistant_message",
      }),
    );
    expect(prematureCompletion).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "parent-item",
        payload: expect.objectContaining({
          progress: expect.objectContaining({ stepCount: 1 }),
        }),
      }),
    );

    expect(
      router.observeMainNotification(
        "item/started",
        {
          threadId: "provider-thread",
          item: {
            id: "activity-1",
            type: "subAgentActivity",
            kind: "interacted",
            agentThreadId: "child-thread",
            agentPath: "/root/audit",
          },
        },
        [
          {
            type: "item.started",
            threadId: "local-thread",
            itemId: "generic-activity",
            itemType: "tool_call",
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        type: "item.updated",
        itemId: "parent-item",
        payload: expect.objectContaining({ status: "running", isSubAgent: true }),
      }),
    ]);

    expect(
      router.routeChildNotification(
        "thread/settings/updated",
        {
          threadId: "child-thread",
          threadSettings: { model: "gpt-5.4", effort: "medium" },
        },
        "provider-thread",
      ),
    ).toEqual([
      expect.objectContaining({
        type: "item.updated",
        itemId: "parent-item",
        payload: expect.objectContaining({
          progress: expect.objectContaining({ model: "gpt-5.4", effort: "medium" }),
        }),
      }),
    ]);

    const completionEvents = router.routeChildNotification(
      "turn/completed",
      { threadId: "child-thread", turn: { id: "child-turn", status: "completed" } },
      "provider-thread",
    );
    expect(
      completionEvents?.some(
        (event) => event.type === "item.completed" && event.itemId !== "parent-item",
      ),
    ).toBe(true);
    expect(completionEvents).toContainEqual({
      type: "item.completed",
      threadId: "local-thread",
      itemId: "parent-item",
      payload: { status: "success", result: "Child result" },
    });

    const lateEvents = router.routeChildNotification(
      "item/started",
      {
        threadId: "child-thread",
        turnId: "late-child-turn",
        item: { id: "late-child-message", type: "agentMessage", text: "Late output" },
      },
      "provider-thread",
    );
    expect(lateEvents).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "parent-item",
        payload: expect.objectContaining({ status: "success", result: "Child result" }),
      }),
    );
    expect(lateEvents).not.toContainEqual(
      expect.objectContaining({
        itemId: "parent-item",
        payload: expect.objectContaining({ status: "running" }),
      }),
    );
  });

  it("suppresses notifications from unrelated app-server threads", () => {
    const router = new CodexSubAgentRouter("local-thread");
    expect(
      router.routeChildNotification(
        "item/started",
        { threadId: "unrelated-thread", item: { id: "wrong", type: "agentMessage" } },
        "provider-thread",
      ),
    ).toEqual([]);
  });

  it("routes turn notifications whose thread id is nested under turn", () => {
    const router = createRouterWithChild();

    expect(
      router.routeChildNotification(
        "turn/started",
        { turn: { id: "child-turn", threadId: "child-thread" } },
        "provider-thread",
      ),
    ).toEqual([
      expect.objectContaining({
        type: "item.updated",
        itemId: "parent-item",
        payload: expect.objectContaining({ status: "running" }),
      }),
    ]);
  });

  it("shows the parent delegation prompt as the first child user message", () => {
    const router = createRouterWithChild();

    expect(
      router.routeChildNotification(
        "item/started",
        {
          threadId: "child-thread",
          item: { id: "child-prompt", type: "userMessage", text: "Inspect the renderer." },
        },
        "provider-thread",
      ),
    ).toEqual([
      expect.objectContaining({
        type: "item.started",
        threadId: "local-thread",
        itemType: "user_message",
        parentItemId: "parent-item",
        payload: { content: [{ kind: "text", text: "Inspect the renderer." }] },
      }),
    ]);
  });

  it("copies streamed child assistant text into the parent result", () => {
    const router = createRouterWithChild();
    router.routeChildNotification(
      "item/started",
      {
        threadId: "child-thread",
        item: { id: "child-message", type: "agentMessage", text: "" },
      },
      "provider-thread",
    );
    router.routeChildNotification(
      "item/agentMessage/delta",
      { threadId: "child-thread", itemId: "child-message", delta: "Final child report" },
      "provider-thread",
    );

    expect(
      router.routeChildNotification(
        "turn/completed",
        { turn: { id: "child-turn", threadId: "child-thread", status: "completed" } },
        "provider-thread",
      ),
    ).toContainEqual({
      type: "item.completed",
      threadId: "local-thread",
      itemId: "parent-item",
      payload: { status: "success", result: "Final child report" },
    });
  });

  it("marks a status-less child turn/aborted notification as an error", () => {
    const router = createRouterWithChild();

    expect(
      router.routeChildNotification(
        "turn/aborted",
        { turn: { id: "child-turn", threadId: "child-thread" } },
        "provider-thread",
      ),
    ).toContainEqual({
      type: "item.completed",
      threadId: "local-thread",
      itemId: "parent-item",
      payload: { status: "error" },
    });
  });

  it("completes the subagent parent when the child thread reports an error", () => {
    const router = createRouterWithChild();

    expect(
      router.routeChildNotification(
        "thread/error",
        { threadId: "child-thread", error: { message: "Child failed" } },
        "provider-thread",
      ),
    ).toEqual([
      {
        type: "item.completed",
        threadId: "local-thread",
        itemId: "parent-item",
        payload: { status: "error", result: "Child failed" },
      },
    ]);
  });

  it("replays child output that completed before the parent spawn item arrived", () => {
    const router = new CodexSubAgentRouter("local-thread");

    expect(
      router.routeChildNotification(
        "thread/started",
        {
          thread: {
            id: "child-thread",
            parentThreadId: "provider-thread",
            status: { type: "active", activeFlags: [] },
          },
        },
        "provider-thread",
      ),
    ).toEqual([]);
    expect(
      router.routeChildNotification(
        "item/started",
        {
          threadId: "child-thread",
          item: { id: "child-message", type: "agentMessage", text: "Finished early" },
        },
        "provider-thread",
      ),
    ).toEqual([]);
    expect(
      router.routeChildNotification(
        "turn/completed",
        { turn: { id: "child-turn", threadId: "child-thread", status: "completed" } },
        "provider-thread",
      ),
    ).toEqual([]);

    const events = router.observeMainNotification(
      "item/completed",
      {
        threadId: "provider-thread",
        item: {
          id: "spawn-call",
          type: "subAgentActivity",
          kind: "started",
          agentThreadId: "child-thread",
          agentPath: "/root/early",
        },
      },
      [
        {
          type: "item.started",
          threadId: "local-thread",
          itemId: "activity-item",
          itemType: "tool_call",
        },
      ],
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: expect.any(String),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: { status: "success", result: "Finished early" },
      }),
    );
  });
});

function createRouterWithChild(): CodexSubAgentRouter {
  const router = new CodexSubAgentRouter("local-thread");
  router.observeMainNotification(
    "item/started",
    {
      threadId: "provider-thread",
      item: {
        id: "spawn-call",
        type: "collabAgentToolCall",
        tool: "spawnAgent",
        status: "inProgress",
        receiverThreadIds: ["child-thread"],
        agentsStates: { "child-thread": { status: "running" } },
      },
    },
    [
      {
        type: "item.started",
        threadId: "local-thread",
        itemId: "parent-item",
        itemType: "tool_call",
        payload: { name: "spawnAgent", status: "running", isSubAgent: true },
      },
    ],
  );
  return router;
}

describe("CodexStructuredSession", () => {
  type CodexRequestRecord = {
    method: string;
    params: Record<string, unknown> | null;
    timeoutMs?: number;
  };

  function makeStructuredSession(requests: CodexRequestRecord[]): CodexStructuredSession {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["launchOptions"] = {};
    session["bufferedRuntimeEvents"] = [];
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["currentConfig"] = { model: "gpt-5.4" };
    session["seenErrorMessages"] = new Set<string>();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["rpc"] = {
      request: async (
        method: string,
        params: Record<string, unknown> | null,
        timeoutMs?: number,
      ) => {
        requests.push({
          method,
          params,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });
        if (method === "turn/start") {
          return { turn: { id: "turn-1", items: [], status: "inProgress" } };
        }
        if (method === "thread/start") {
          return { thread: { id: "provider-thread" } };
        }
        return {};
      },
    };

    return session as unknown as CodexStructuredSession;
  }

  function dispatchNotification(session: CodexStructuredSession, payload: unknown): void {
    const message = parseCodexSocketMessage(payload);
    if (message.kind !== "notification") {
      throw new Error("Expected a Codex notification payload.");
    }
    (
      session as unknown as {
        handleNotification(method: string, params: Record<string, unknown> | undefined): void;
      }
    ).handleNotification(message.method, message.params);
  }

  it("interrupts the active Codex app-server turn", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("hello", { model: "gpt-5.4" });
    await structuredSession.interruptTurn();

    expect(requests.at(-1)).toEqual({
      method: "turn/interrupt",
      params: {
        threadId: "provider-thread",
        turnId: "turn-1",
      },
    });
  });

  it("interrupts after turn/start when stop was requested before the turn id arrived", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.interruptTurn();
    await structuredSession.startTurn("hello", { model: "gpt-5.4" });

    expect(requests.map((request) => request.method)).toEqual(["turn/start", "turn/interrupt"]);
    expect(requests.at(-1)?.params).toEqual({
      threadId: "provider-thread",
      turnId: "turn-1",
    });
  });

  it("forks Codex app-server threads with the current rollback config", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    (structuredSession as unknown as Record<string, unknown>)["currentConfig"] = {
      model: "gpt-5.4",
      effort: "low",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    };
    const rollbackConfig = {
      model: "gpt-5.6-terra",
      effort: "high",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandboxMode: "workspace-write",
    };
    const runtimeEvents: RuntimeEvent[] = [];
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
    };
    (structuredSession as unknown as Record<string, unknown>)["rpc"] = {
      request: (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        if (method === "thread/read" && params.includeTurns === true) {
          return Promise.resolve({
            thread: {
              turns: ["turn-1", "turn-2", "turn-3", "turn-4"].map((id) => ({ id })),
            },
          });
        }
        if (method === "thread/fork") {
          const response = Promise.resolve({ thread: { id: "forked-thread" } });
          dispatchNotification(structuredSession, {
            jsonrpc: "2.0",
            method: "thread/tokenUsage/updated",
            params: {
              threadId: "forked-thread",
              turnId: "turn-2",
              tokenUsage: {
                total: {
                  inputTokens: 100,
                  cachedInputTokens: 0,
                  outputTokens: 20,
                  reasoningOutputTokens: 5,
                  totalTokens: 120,
                },
                last: {
                  inputTokens: 80,
                  cachedInputTokens: 0,
                  outputTokens: 15,
                  reasoningOutputTokens: 5,
                  totalTokens: 100,
                },
                modelContextWindow: 258_400,
              },
            },
          });
          return response;
        }
        return Promise.resolve({ thread: { status: { type: "idle" } } });
      },
    };

    const history = await structuredSession.rollbackThread(2, rollbackConfig);

    expect(requests.slice(0, 2)).toEqual([
      {
        method: "thread/read",
        params: {
          threadId: "provider-thread",
          includeTurns: true,
        },
      },
      {
        method: "thread/fork",
        params: {
          model: "gpt-5.6-terra",
          approvalPolicy: "on-request",
          approvalsReviewer: "user",
          sandbox: "workspace-write",
          config: {
            model_reasoning_effort: "high",
            model_reasoning_summary: "auto",
          },
          threadId: "provider-thread",
          lastTurnId: "turn-2",
        },
      },
    ]);
    expect(requests[2]).toEqual({
      method: "thread/unsubscribe",
      params: { threadId: "provider-thread" },
    });
    expect(history).toEqual({ providerSessionId: "forked-thread", messages: [] });
    expect((structuredSession as unknown as { remoteThreadId: string }).remoteThreadId).toBe(
      "forked-thread",
    );
    expect(structuredSession.launchOptions.resumeThreadId).toBe("forked-thread");
    expect(runtimeEvents).toContainEqual({
      type: "context.updated",
      threadId: "local-thread",
      usage: {
        usedTokens: 100,
        maxTokens: 258_400,
        breakdown: [
          { id: "input", label: "Input", tokens: 80 },
          { id: "output", label: "Output", tokens: 15 },
          { id: "reasoning", label: "Reasoning", tokens: 5 },
        ],
      },
    });
  });

  it("falls back to thread/rollback when thread/fork is unavailable", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    (structuredSession as unknown as Record<string, unknown>)["rpc"] = {
      request: async (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        if (method === "thread/read" && params.includeTurns === true) {
          return { thread: { turns: [{ id: "turn-1" }, { id: "turn-2" }] } };
        }
        if (method === "thread/fork") {
          throw new CodexRpcResponseError("Method not found", -32601);
        }
        return { thread: { status: { type: "idle" } } };
      },
    };

    const history = await structuredSession.rollbackThread(1);

    expect(requests.map((request) => request.method)).toEqual([
      "thread/read",
      "thread/fork",
      "thread/rollback",
      "thread/read",
    ]);
    expect(requests[2]).toEqual({
      method: "thread/rollback",
      params: {
        threadId: "provider-thread",
        numTurns: 1,
      },
    });
    expect(requests.map((request) => request.method)).not.toContain("thread/unsubscribe");
    expect(history).toEqual({ providerSessionId: "provider-thread", messages: [] });
  });

  it("clears buffered notifications when thread/fork fails", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const runtimeEvents: RuntimeEvent[] = [];
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
    };
    (structuredSession as unknown as Record<string, unknown>)["rpc"] = {
      request: async (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        if (method === "thread/read") {
          return { thread: { turns: [{ id: "turn-1" }, { id: "turn-2" }] } };
        }
        dispatchNotification(structuredSession, {
          jsonrpc: "2.0",
          method: "thread/tokenUsage/updated",
          params: {
            threadId: "failed-fork-thread",
            turnId: "turn-1",
            tokenUsage: {
              total: {},
              last: { totalTokens: 25 },
              modelContextWindow: 258_400,
            },
          },
        });
        throw new Error("fork failed");
      },
    };

    await expect(structuredSession.rollbackThread(1)).rejects.toThrow("fork failed");

    expect(
      (structuredSession as unknown as { forkNotificationBuffer?: unknown }).forkNotificationBuffer,
    ).toBeUndefined();
    expect(runtimeEvents).toEqual([]);
    expect(requests.map((request) => request.method)).not.toContain("thread/unsubscribe");
  });

  it("uses legacy rollback when dropping every turn leaves nothing to fork through", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    (structuredSession as unknown as Record<string, unknown>)["rpc"] = {
      request: async (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        if (method === "thread/read" && params.includeTurns === true) {
          return { thread: { turns: [{ id: "turn-1" }, { id: "turn-2" }] } };
        }
        return { thread: { status: { type: "idle" } } };
      },
    };

    const history = await structuredSession.rollbackThread(2);

    expect(requests.map((request) => request.method)).toEqual([
      "thread/read",
      "thread/rollback",
      "thread/read",
    ]);
    expect(history).toEqual({ providerSessionId: "provider-thread", messages: [] });
  });

  it("requests Codex reasoning summaries for GUI turns", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("hello", { model: "gpt-5.4", effort: "high" });

    expect(requests[0]).toMatchObject({
      method: "turn/start",
      params: {
        effort: "high",
        summary: "auto",
      },
    });
  });

  it("passes the approvals reviewer override to Codex app-server threads and turns", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const config = {
      model: "gpt-5.4",
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      sandboxMode: "workspace-write",
    };

    await structuredSession.openThread(config);
    await structuredSession.startTurn("hello", config);

    expect(requests[0]).toMatchObject({
      method: "thread/start",
      params: {
        approvalPolicy: "on-request",
        approvalsReviewer: "auto_review",
        sandbox: "workspace-write",
      },
    });
    expect(requests[0]?.params).not.toHaveProperty("persistExtendedHistory");
    expect(requests[0]?.params).not.toHaveProperty("experimentalRawEvents");
    expect(requests[1]).toMatchObject({
      method: "turn/start",
      params: {
        approvalPolicy: "on-request",
        approvalsReviewer: "auto_review",
      },
    });
  });

  it("forces serviceTier each turn: null when Fast is off (incl. the first turn), 'fast' when on", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    // Off on the first turn → force null rather than preserving a config.toml tier.
    await structuredSession.startTurn("normal", { model: "gpt-5.4", fast: false });
    expect(requests[0]?.method).toBe("turn/start");
    expect(requests[0]?.params?.serviceTier).toBeNull();

    // On → force "fast".
    await structuredSession.startTurn("go fast", { model: "gpt-5.4", fast: true });
    expect(requests[1]?.params?.serviceTier).toBe("fast");

    // Back off → force null again to clear the sticky server-side override.
    await structuredSession.startTurn("back to normal", { model: "gpt-5.4", fast: false });
    expect(requests[2]?.params?.serviceTier).toBeNull();
  });

  it("keeps /goal <objective> working until the model turn completes", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: unknown[] = [];
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
      onUpdate: (update: unknown) => updates.push(update),
    };
    (structuredSession as unknown as Record<string, unknown>)["rpc"] = {
      request: async (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        dispatchNotification(structuredSession, {
          jsonrpc: "2.0",
          method: "turn/started",
          params: {
            threadId: "provider-thread",
            turn: { id: "goal-turn", threadId: "provider-thread" },
          },
        });
        return {};
      },
    };

    await structuredSession.startTurn("/goal ship unified GUI goal support", { model: "gpt-5.4" });

    expect(requests).toEqual([
      {
        method: "thread/goal/set",
        params: {
          threadId: "provider-thread",
          objective: "ship unified GUI goal support",
          status: "active",
        },
      },
    ]);
    // The goal item itself is produced by the canonical mapper from the
    // `thread/goal/updated` notification. `thread/goal/set` starts a real
    // model turn, so its native completion notification must settle the turn.
    expect(runtimeEvents.map((event) => event.type)).toEqual([
      "turn.started",
      "item.started",
      "item.completed",
      "turn.started",
    ]);
    expect(updates.at(-1)).toEqual({ status: "working", attention: "working" });
  });

  it("does not settle /goal <objective> before a delayed model turn starts", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: unknown[] = [];
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
      onUpdate: (update: unknown) => updates.push(update),
    };

    await structuredSession.startTurn("/goal continue when idle", { model: "gpt-5.4" });

    expect(runtimeEvents).not.toContainEqual(expect.objectContaining({ type: "turn.completed" }));
    expect(updates).not.toContainEqual({ status: "idle", attention: "none" });
  });

  it("settles /goal <objective> when Codex does not start a model turn", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const runtimeEvents: RuntimeEvent[] = [];
    const updates: unknown[] = [];
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
      onUpdate: (update: unknown) => updates.push(update),
    };

    await structuredSession.startTurn("/goal plan without continuing", {
      model: "gpt-5.4",
      mode: "plan",
    });

    expect(runtimeEvents.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "completed",
    });
    expect(updates.at(-1)).toEqual({ status: "idle", attention: "none" });
  });

  it("maps /goal clear to thread/goal/clear", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("/goal clear", { model: "gpt-5.4" });

    expect(requests).toEqual([
      {
        method: "thread/goal/clear",
        params: { threadId: "provider-thread" },
      },
    ]);
  });

  it("maps /goal pause and /goal resume to thread/goal/set status changes", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("/goal pause", { model: "gpt-5.4" });
    await structuredSession.startTurn("/goal resume", { model: "gpt-5.4" });

    expect(requests).toEqual([
      {
        method: "thread/goal/set",
        params: { threadId: "provider-thread", status: "paused" },
      },
      {
        method: "thread/goal/set",
        params: { threadId: "provider-thread", status: "active" },
      },
    ]);
  });

  it("treats /goal with no args as a no-op acknowledgement", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);

    await structuredSession.startTurn("/goal", { model: "gpt-5.4" });

    expect(requests).toEqual([]);
  });

  it("surfaces Codex app-server commands as slash commands during initialize", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const structuredSession = makeStructuredSession(requests);
    const updates: unknown[] = [];
    (structuredSession as unknown as Record<string, unknown>)["listener"] = {
      onUpdate: (update: unknown) => updates.push(update),
    };
    (structuredSession as unknown as Record<string, unknown>)["rpc"] = {
      request: async (method: string, params: Record<string, unknown>) => {
        requests.push({ method, params });
        return {
          commands: [
            {
              name: "review",
              description: "Review changes",
              argumentHint: "<scope>",
            },
          ],
        };
      },
      notify: () => {},
    };

    await (structuredSession as unknown as { initialize(): Promise<void> }).initialize();

    expect(requests[0]).toMatchObject({
      method: "initialize",
      params: {
        capabilities: { experimentalApi: true, requestAttestation: false },
      },
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        slashCommands: [
          {
            id: "review",
            label: "review — Review changes",
            description: "Review changes",
            argumentHint: "<scope>",
          },
        ],
      }),
    );
  });

  it("reloads configured MCP servers at the turn boundary without delaying thread creation", async () => {
    const requests: CodexRequestRecord[] = [];
    const structuredSession = makeStructuredSession(requests);
    (structuredSession as unknown as Record<string, unknown>)["hasUserMcpServers"] = true;
    (structuredSession as unknown as Record<string, unknown>)["rpc"] = {
      request: async (
        method: string,
        params: Record<string, unknown> | null,
        timeoutMs?: number,
      ) => {
        requests.push({
          method,
          params,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });
        if (method === "thread/start") {
          return { thread: { id: "provider-thread" } };
        }
        return {};
      },
      notify: () => {},
    };

    await structuredSession.openThread({ model: "gpt-5.5" });

    expect(requests).toEqual([expect.objectContaining({ method: "thread/start" })]);

    await structuredSession.startTurn("hello", { model: "gpt-5.5" });

    expect(requests).toEqual([
      expect.objectContaining({ method: "thread/start" }),
      {
        method: "config/mcpServer/reload",
        params: undefined,
      },
      expect.objectContaining({ method: "turn/start" }),
    ]);
  });

  it("wires RPC notifications and transport lifecycle callbacks into the session", () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    let rpcListener: CodexAppServerRpcListener | undefined;
    const handleNotification =
      vi.fn<(method: string, params: Record<string, unknown> | undefined) => void>();
    const emitRuntimeEvents = vi.fn<(events: RuntimeEvent[]) => void>();
    const logCodexEventDebug = vi.fn<(direction: string, payload: unknown) => void>();
    const onClose = vi.fn<() => void>();
    const onError = vi.fn<(message: string) => void>();
    session["rpc"] = {
      setListener: (listener: CodexAppServerRpcListener) => {
        rpcListener = listener;
      },
    };
    session["isDisposed"] = false;
    session["handleNotification"] = handleNotification;
    session["emitRuntimeEvents"] = emitRuntimeEvents;
    session["logCodexEventDebug"] = logCodexEventDebug;
    session["listener"] = { onClose, onError };

    (session["attachRpcHandlers"] as () => void).call(session);
    if (!rpcListener) throw new Error("RPC listener was not attached.");

    rpcListener.onNotification("turn/started", { threadId: "provider-thread" });
    rpcListener.onRuntimeEvents([{ type: "error", threadId: "local-thread", message: "boom" }]);
    rpcListener.onDebug?.("transport", { event: "close" });
    rpcListener.onClose();
    rpcListener.onError(new Error("stdio failed"));

    expect(handleNotification).toHaveBeenCalledWith("turn/started", {
      threadId: "provider-thread",
    });
    expect(emitRuntimeEvents).toHaveBeenCalledWith([
      { type: "error", threadId: "local-thread", message: "boom" },
    ]);
    expect(logCodexEventDebug).toHaveBeenCalledWith("transport", { event: "close" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledExactlyOnceWith("Codex app-server connection failed.");

    session["isDisposed"] = true;
    rpcListener.onClose();
    rpcListener.onError(new Error("ignored after dispose"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  function makeNotificationSession(): {
    onMessage: (message: unknown) => void;
    runtimeEvents: RuntimeEvent[];
  } {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const runtimeEvents: RuntimeEvent[] = [];
    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["seenErrorMessages"] = new Set<string>();
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["bufferedRuntimeEvents"] = [];
    const subAgentRouter = new CodexSubAgentRouter("local-thread");
    subAgentRouter.setDefaultModelSettings("gpt-5.6-sol", "medium");
    session["subAgentRouter"] = subAgentRouter;
    session["listener"] = {
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
      onUpdate: () => {},
    };
    const structuredSession = session as unknown as CodexStructuredSession;
    return {
      onMessage: (message) => dispatchNotification(structuredSession, message),
      runtimeEvents,
    };
  }

  it("keeps Codex child-thread messages out of the main timeline", () => {
    const { onMessage, runtimeEvents } = makeNotificationSession();

    onMessage({
      jsonrpc: "2.0",
      method: "item/started",
      params: {
        threadId: "provider-thread",
        turnId: "main-turn",
        item: {
          id: "collab-1",
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "inProgress",
          senderThreadId: "provider-thread",
          receiverThreadIds: ["child-thread"],
          prompt: "Inspect the protocol",
          model: "gpt-5.4-mini",
          reasoningEffort: "high",
          agentsStates: { "child-thread": { status: "running", message: null } },
        },
      },
    });
    const parent = runtimeEvents.find(
      (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
        event.type === "item.started" && event.itemType === "tool_call",
    );
    expect(parent?.payload).toMatchObject({
      isSubAgent: true,
      progress: { model: "gpt-5.4-mini", effort: "high" },
    });

    onMessage({
      jsonrpc: "2.0",
      method: "item/started",
      params: {
        threadId: "child-thread",
        turnId: "child-turn",
        item: { id: "child-message", type: "agentMessage", text: "Child-only message" },
      },
    });

    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: parent?.itemId,
      }),
    );
    expect(
      runtimeEvents
        .filter(
          (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
            event.type === "item.started" && event.itemType === "assistant_message",
        )
        .every((event) => event.parentItemId === parent?.itemId),
    ).toBe(true);
  });

  it("builds Codex subagents from activity events and hides wait coordination", () => {
    const { onMessage, runtimeEvents } = makeNotificationSession();

    onMessage({
      jsonrpc: "2.0",
      method: "thread/started",
      params: {
        thread: {
          id: "child-thread",
          parentThreadId: "provider-thread",
          status: { type: "active", activeFlags: [] },
        },
      },
    });
    onMessage({
      jsonrpc: "2.0",
      method: "item/started",
      params: {
        threadId: "child-thread",
        turnId: "child-turn",
        item: { id: "child-message", type: "agentMessage", text: "Found a race." },
      },
    });
    onMessage({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        threadId: "provider-thread",
        turnId: "main-turn",
        item: {
          id: "spawn-activity",
          type: "subAgentActivity",
          kind: "started",
          agentThreadId: "child-thread",
          agentPath: "/root/game_logic",
        },
      },
    });
    onMessage({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        threadId: "provider-thread",
        turnId: "main-turn",
        item: {
          id: "wait-call",
          type: "collabAgentToolCall",
          tool: "wait",
          status: "completed",
          senderThreadId: "provider-thread",
          agentsStates: {},
        },
      },
    });

    const parent = runtimeEvents.find(
      (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
        event.type === "item.started" &&
        event.itemType === "tool_call" &&
        (event.payload as ToolCallPayload | undefined)?.isSubAgent === true,
    );
    expect(parent?.payload).toMatchObject({
      name: "spawnAgent",
      args: { description: "game logic", receiverThreadIds: ["child-thread"] },
      progress: {
        description: "game logic",
        model: "gpt-5.6-sol",
        effort: "medium",
      },
    });
    expect(runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: parent?.itemId,
      }),
    );
    expect(runtimeEvents).not.toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ name: "wait" }),
      }),
    );
  });

  it("does not surface resume-time active status as new work", async () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    const runtimeEvents: RuntimeEvent[] = [];
    const requests: CodexRequestRecord[] = [];
    const onMessage = (message: unknown) =>
      dispatchNotification(session as unknown as CodexStructuredSession, message);
    let resolveThreadRead: (value: unknown) => void = () => {};
    const threadRead = new Promise<unknown>((resolve) => {
      resolveThreadRead = resolve;
    });

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = undefined;
    session["launchOptions"] = {};
    session["activated"] = true;
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["rpc"] = {
      request: async (method: string, params: Record<string, unknown>, timeoutMs?: number) => {
        requests.push({
          method,
          params,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });
        if (method === "thread/resume") {
          onMessage({
            jsonrpc: "2.0",
            method: "thread/started",
            params: {
              thread: {
                id: "provider-thread",
                status: { type: "active", activeFlags: [] },
              },
            },
          });
          return {};
        }
        if (method === "thread/read") {
          return threadRead;
        }
        return {};
      },
    };

    await (session as unknown as CodexStructuredSession).openThread(
      { model: "gpt-5.4" },
      {
        providerSessionId: "provider-thread",
        discoveredAt: "2026-05-10T12:00:00.000Z",
      },
    );
    (session as unknown as CodexStructuredSession).setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update) => updates.push(update),
      onRuntimeEvent: (event) => runtimeEvents.push(event),
    });

    expect(updates).toEqual([]);

    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/started",
      params: {
        threadId: "provider-thread",
        turn: { id: "old-turn", threadId: "provider-thread" },
      },
    });
    onMessage?.({
      jsonrpc: "2.0",
      method: "item/started",
      params: {
        threadId: "provider-thread",
        item: {
          id: "old-assistant",
          type: "assistant_message",
          text: "history",
        },
      },
    });

    resolveThreadRead({ thread: { status: { type: "idle" } } });
    await Promise.resolve();
    await Promise.resolve();

    onMessage?.({
      jsonrpc: "2.0",
      method: "thread/started",
      params: {
        thread: {
          id: "provider-thread",
          status: { type: "active", activeFlags: [] },
        },
      },
    });
    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/started",
      params: {
        threadId: "provider-thread",
        turn: { id: "late-old-turn", threadId: "provider-thread" },
      },
    });

    expect(requests.map((request) => request.method)).toContain("thread/read");
    expect(runtimeEvents).toEqual([]);
    expect(updates).not.toContainEqual(
      expect.objectContaining({
        status: "working",
        attention: "working",
      }),
    );
  });

  it("keeps live status on lifecycle notifications instead of startup thread/read", async () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    const runtimeEvents: RuntimeEvent[] = [];
    const requests: CodexRequestRecord[] = [];
    const onMessage = (message: unknown) =>
      dispatchNotification(session as unknown as CodexStructuredSession, message);
    let resolveTurnStart: (value: unknown) => void = () => {};
    const turnStart = new Promise<unknown>((resolve) => {
      resolveTurnStart = resolve;
    });

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "idle" };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["rpc"] = {
      request: async (method: string, params: Record<string, unknown>, timeoutMs?: number) => {
        requests.push({
          method,
          params,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });
        if (method === "turn/start") {
          return turnStart;
        }
        return {};
      },
    };

    (session as unknown as CodexStructuredSession).setListener({
      onClose: () => {},
      onError: () => {},
      onUpdate: (update) => updates.push(update),
      onRuntimeEvent: (event) => runtimeEvents.push(event),
    });

    onMessage?.({
      jsonrpc: "2.0",
      method: "thread/started",
      params: {
        thread: {
          id: "provider-thread",
          status: { type: "idle" },
        },
      },
    });

    expect(updates).toEqual([]);
    expect(requests).toEqual([]);

    const initialTurn = (session as unknown as CodexStructuredSession).startTurn("hi", {
      model: "gpt-5.4",
    });
    await Promise.resolve();

    expect(updates.at(-1)).toEqual({ status: "working", attention: "working" });
    expect(requests.map((request) => request.method)).toEqual(["turn/start"]);

    resolveTurnStart({ turn: { id: "turn-1", status: "inProgress" } });
    await initialTurn;

    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "provider-thread",
        turn: { id: "turn-1", status: "completed" },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(requests.map((request) => request.method)).toEqual(["turn/start"]);
    expect(runtimeEvents).toContainEqual({
      type: "turn.completed",
      threadId: "local-thread",
      turnId: "turn-1",
      state: "completed",
    });
    expect(updates.at(-1)).toEqual({ status: "idle", attention: "none" });
  });

  it("emits completion idle even when a status idle already arrived", () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    const runtimeEvents: RuntimeEvent[] = [];
    const onMessage = (message: unknown) =>
      dispatchNotification(session as unknown as CodexStructuredSession, message);

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "active", activeFlags: [] };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["listener"] = {
      onClose: () => {},
      onError: () => {},
      onUpdate: (update: StructuredSessionUpdate) => updates.push(update),
      onRuntimeEvent: (event: RuntimeEvent) => runtimeEvents.push(event),
    };

    onMessage?.({
      jsonrpc: "2.0",
      method: "thread/status/changed",
      params: { threadId: "provider-thread", status: { type: "idle" } },
    });
    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "provider-thread",
        turn: { id: "turn-1", status: "completed" },
      },
    });

    expect(runtimeEvents).toContainEqual({
      type: "turn.completed",
      threadId: "local-thread",
      turnId: "turn-1",
      state: "completed",
    });
    expect(updates).toEqual([
      { status: "idle", attention: "none" },
      { status: "idle", attention: "none" },
    ]);
  });

  it("emits completion idle for Codex turn completion notifications without params", () => {
    const session = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
    const updates: StructuredSessionUpdate[] = [];
    const onMessage = (message: unknown) =>
      dispatchNotification(session as unknown as CodexStructuredSession, message);

    session["threadId"] = "local-thread";
    session["remoteThreadId"] = "provider-thread";
    session["isDisposed"] = false;
    session["currentThreadStatus"] = { type: "active", activeFlags: [] };
    session["seenErrorMessages"] = new Set<string>();
    session["bufferedRuntimeEvents"] = [];
    session["resumeActiveStatusSuppressionUntil"] = new Map();
    session["listener"] = {
      onClose: () => {},
      onError: () => {},
      onUpdate: (update: StructuredSessionUpdate) => updates.push(update),
      onRuntimeEvent: () => {},
    };

    onMessage?.({
      jsonrpc: "2.0",
      method: "turn/completed",
    });

    expect(updates).toEqual([{ status: "idle", attention: "none" }]);
  });

  it("collapses a single usage-limit failure into one error event", () => {
    vi.useFakeTimers();
    try {
      const { onMessage, runtimeEvents } = makeNotificationSession();
      const usageLimit =
        "Error running remote compact task You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.";

      // Observed ordering: the bare systemError status change lands first, then
      // Codex reports the real reason via turn/completed(failed) and a
      // duplicate thread/error notification. The specific message must preempt
      // the generic system-error fallback, and the duplicate must be dropped.
      onMessage({
        jsonrpc: "2.0",
        method: "thread/status/changed",
        params: { threadId: "provider-thread", status: { type: "systemError" } },
      });
      onMessage({
        jsonrpc: "2.0",
        method: "turn/completed",
        params: {
          threadId: "provider-thread",
          turn: { id: "turn-1", status: "failed", error: { message: usageLimit } },
        },
      });
      onMessage({
        jsonrpc: "2.0",
        method: "thread/error",
        params: { message: usageLimit },
      });

      vi.advanceTimersByTime(1000);

      expect(runtimeEvents.filter((event) => event.type === "error")).toEqual([
        { type: "error", threadId: "local-thread", message: usageLimit },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still surfaces the generic system-error fallback when no specific error follows", () => {
    vi.useFakeTimers();
    try {
      const { onMessage, runtimeEvents } = makeNotificationSession();

      onMessage({
        jsonrpc: "2.0",
        method: "thread/status/changed",
        params: { threadId: "provider-thread", status: { type: "systemError" } },
      });

      // The fallback is deferred — nothing is emitted synchronously.
      expect(runtimeEvents.filter((event) => event.type === "error")).toEqual([]);

      vi.advanceTimersByTime(1000);

      expect(runtimeEvents.filter((event) => event.type === "error")).toEqual([
        {
          type: "error",
          threadId: "local-thread",
          message:
            "Codex reported a system error. The session may be out of usage or otherwise unable to continue.",
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("mapCodexSlashCommands", () => {
  it("keeps built-in Codex slash commands available when app-server init omits commands", () => {
    expect(codexDefaultCapabilities.slashCommands?.map((cmd) => cmd.id)).toEqual(
      expect.arrayContaining(["status", "model", "review", "compact", "permissions"]),
    );
  });

  it("normalizes Codex app-server command metadata", () => {
    expect(
      mapCodexSlashCommands([
        { name: "review", description: "Review changes", argumentHint: " <scope> " },
        { id: "  " },
      ]),
    ).toEqual([
      {
        id: "review",
        label: "review — Review changes",
        description: "Review changes",
        argumentHint: "<scope>",
      },
    ]);
  });
});

describe("Codex skills", () => {
  it("normalizes enabled app-server skills into composer commands", () => {
    const result = {
      data: [
        {
          skills: [
            {
              name: "review-code",
              path: "/home/me/.agents/skills/review-code/SKILL.md",
              shortDescription: "Review a patch",
              enabled: true,
              scope: "repo",
            },
            {
              name: "disabled-skill",
              path: "/tmp/disabled/SKILL.md",
              enabled: false,
            },
          ],
        },
      ],
    };
    expect(mapCodexSkillsToSlashCommands(result)).toEqual([
      {
        id: "review-code",
        label: "review-code — Review a patch",
        description: "Review a patch",
        section: "skills",
        skillName: "review-code",
        skillPath: "/home/me/.agents/skills/review-code/SKILL.md",
        skillInvocation: "$review-code",
        skillProvider: "Codex",
        skillScope: "project",
      },
    ]);
    expect(mapCodexDisabledSkillNames(result)).toEqual(["disabled-skill"]);
  });

  it("sends structured skill input without duplicating its display invocation", () => {
    expect(
      buildCodexTurnInput("$review-code focus on security", [
        {
          kind: "skill",
          name: "review-code",
          path: "/home/me/.agents/skills/review-code/SKILL.md",
          invocation: "$review-code",
          provider: "Codex",
          scope: "global",
        },
        { kind: "text", content: " focus on security" },
      ]),
    ).toEqual([
      {
        type: "skill",
        name: "review-code",
        path: "/home/me/.agents/skills/review-code/SKILL.md",
      },
      { type: "text", text: "focus on security", text_elements: [] },
    ]);
  });

  it("keeps an MCP mention directive in the text when a skill segment is also present", () => {
    expect(
      buildCodexTurnInput("$review-code @Browser check the page", [
        {
          kind: "skill",
          name: "review-code",
          path: "/home/me/.agents/skills/review-code/SKILL.md",
          invocation: "$review-code",
          provider: "Codex",
          scope: "global",
        },
        { kind: "text", content: " " },
        { kind: "mcp", id: "browser", name: "Browser" },
        { kind: "text", content: " check the page" },
      ]),
    ).toEqual([
      {
        type: "skill",
        name: "review-code",
        path: "/home/me/.agents/skills/review-code/SKILL.md",
      },
      { type: "text", text: "@Browser check the page", text_elements: [] },
    ]);
  });
});

describe("mapCodexRequirements", () => {
  it("only offers approval policies accepted by the current app-server schema", () => {
    expect(mapCodexRequirements(null).approvalPolicies?.map((policy) => policy.id)).toEqual([
      "on-request",
      "never",
      "untrusted",
    ]);
  });
});

describe("parseCodexLoginStatusOutput", () => {
  it("extracts the login method when Codex reports it", () => {
    expect(parseCodexLoginStatusOutput("Logged in using ChatGPT")).toEqual({
      authState: "authenticated",
      providerMetadata: {
        authMethod: "ChatGPT",
      },
    });
  });

  // A confirmed "Not logged in" CLI message must report `missing`, not
  // `unknown` — the composer's Sign-in dock gate is `authState === "missing"`,
  // so reporting `unknown` here would hide the dock until the user hit a
  // runtime 401.
  it("reports missing when Codex explicitly says the user is not logged in", () => {
    expect(parseCodexLoginStatusOutput("Not logged in")).toEqual({ authState: "missing" });
  });
});

describe("createCodexAdapter buildAcpLogoutCommand", () => {
  it("returns `codex logout` so the Settings logout button can drive it", async () => {
    const adapter = createCodexAdapter();
    const command = await adapter.buildAcpLogoutCommand?.();
    expect(command).toBeDefined();
    const args = command?.args ?? [];
    // Include the resolved command itself: when the binary resolves to an
    // absolute path it is direct-spawned (`command` = /…/codex, `args` =
    // ["logout"]); when unresolved it is shell-wrapped (`exec 'codex' 'logout'`
    // lives in args). Inspecting both keeps the assertion correct either way.
    const rendered = args.includes("-EncodedCommand")
      ? Buffer.from(args.at(-1) ?? "", "base64").toString("utf16le")
      : `${command?.command ?? ""} ${args.join(" ")}`;
    expect(rendered).toMatch(/codex/i);
    expect(rendered).toContain("logout");
  });
});

describe("formatCodexPlanLabel", () => {
  it.each([
    ["free", "ChatGPT Free"],
    ["go", "ChatGPT Go"],
    ["plus", "ChatGPT Plus"],
    ["pro", "ChatGPT Pro 20x"],
    ["prolite", "ChatGPT Pro 5x"],
    ["team", "ChatGPT Team"],
    ["business", "ChatGPT Business"],
    ["self_serve_business_usage_based", "ChatGPT Business"],
    ["enterprise", "ChatGPT Enterprise"],
    ["enterprise_cbp_usage_based", "ChatGPT Enterprise"],
    ["edu", "ChatGPT Edu"],
    ["unknown", "ChatGPT"],
  ])("maps known plan token %s to %s", (token, label) => {
    expect(formatCodexPlanLabel(token)).toBe(label);
  });

  it("falls back to a title-cased label for unrecognised plan tokens", () => {
    expect(formatCodexPlanLabel("atlas")).toBe("Atlas");
  });
});

describe("detectCodexUpdatePrompt", () => {
  const SAMPLE_TEXT = [
    "🎉Update available! 0.116.0 -> 0.117.0",
    "",
    "Release notes: https://github.com/openai/codex/releases/latest",
    "",
    "> 1. Update now (runs `npm install -g @openai/codex`)",
    "  2. Skip",
    "  3. Skip until next version",
    "",
    "Press enter to continue",
  ].join("\n");

  it("detects the update prompt", () => {
    expect(detectCodexUpdatePrompt(SAMPLE_TEXT)).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(detectCodexUpdatePrompt("hello world")).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(detectCodexUpdatePrompt("")).toBe(false);
  });

  it("detects without emoji prefix", () => {
    expect(detectCodexUpdatePrompt("Update available! 0.116.0 -> 0.117.0")).toBe(true);
  });
});

describe("detectCodexReadyForInitialPrompt", () => {
  it("returns true for the normal Codex home screen", () => {
    const text = [
      "OpenAI Codex (v0.116.0)",
      "model: gpt-5.4-mini high /model to change",
      "directory: ~/work/site-search-ui",
    ].join("\n");

    expect(detectCodexReadyForInitialPrompt(text)).toBe(true);
  });

  it("returns false while the update prompt is visible", () => {
    const text = [
      "Update available! 0.116.0 -> 0.117.0",
      "OpenAI Codex (v0.116.0)",
      "directory: ~/work/site-search-ui",
      "model: gpt-5.4-mini high /model to change",
    ].join("\n");

    expect(detectCodexReadyForInitialPrompt(text)).toBe(false);
  });
});

function oscTitle(text: string, code: 0 | 1 | 2 = 0): OscTitle {
  return { code, text };
}

describe("createCodexAdapter handleOscTitle", () => {
  const adapter = createCodexAdapter();

  it("maps braille-prefixed titles to working (Codex spinner glyphs)", () => {
    expect(adapter.handleOscTitle?.(oscTitle("⠋ Working (5s • esc to interrupt)"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
    expect(adapter.handleOscTitle?.(oscTitle("⠸ Thinking"))).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("accepts any glyph in the braille range (U+2800–U+28FF)", () => {
    for (const glyph of ["⠀", "⠁", "⠂", "⠐", "⣾", "⣿"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} anything`))?.status).toBe("working");
    }
  });

  it("returns null for the idle title with no spinner prefix", () => {
    expect(adapter.handleOscTitle?.(oscTitle("codex"))).toBeNull();
    expect(adapter.handleOscTitle?.(oscTitle("Codex"))).toBeNull();
  });

  it("returns null when the braille glyph is not leading", () => {
    // A braille glyph mid-string is not Codex's working spinner — don't match.
    expect(adapter.handleOscTitle?.(oscTitle("codex ⠸"))).toBeNull();
  });

  it("returns null for OSC 1 (icon name) with a plain app name", () => {
    expect(adapter.handleOscTitle?.(oscTitle("codex", 1))).toBeNull();
  });
});

function osc(body: string, title = ""): OscNotification {
  return { code: 9, title, body, payload: undefined };
}

describe("createCodexAdapter handleOscNotification", () => {
  const adapter = createCodexAdapter();

  it("maps approval notifications to needs_approval", () => {
    expect(adapter.handleOscNotification?.(osc("approval-requested"))).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("maps agent-turn-complete to idle", () => {
    expect(adapter.handleOscNotification?.(osc("agent-turn-complete"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("maps generic turn complete phrasing to idle", () => {
    expect(adapter.handleOscNotification?.(osc("Turn complete"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("maps plan-mode prompt OSC notify to needs_approval", () => {
    // Codex emits OSC 9 with body "Plan mode prompt: <title>" when it has
    // presented a plan and is waiting on the user to approve / edit / reject.
    expect(adapter.handleOscNotification?.(osc("Plan mode prompt: Plan Target"))).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("maps non-approval OSC notify (notify-as-turn-complete) to idle", () => {
    // Codex 0.122+ emits OSC 9 per Growl/notify semantics: the body is the
    // assistant's response text (e.g. "Hi."), not a lifecycle keyword. Any
    // such notification corresponds to turn-complete → idle.
    expect(adapter.handleOscNotification?.(osc("Hi."))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
    expect(adapter.handleOscNotification?.(osc("Hi! What should we work on?"))).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("returns null for empty OSC bodies", () => {
    expect(adapter.handleOscNotification?.(osc(""))).toBeNull();
  });

  it("maps status from JSON payload slugs in OSC body", () => {
    const n9: OscNotification = {
      code: 9,
      title: "",
      body: '{"type":"agent_turn_complete","v":1}',
      payload: { type: "agent_turn_complete", v: 1 },
    };
    expect(adapter.handleOscNotification?.(n9)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
    const nOk: OscNotification = {
      code: 9,
      title: "",
      body: '{"event":"exec_approval_requested"}',
      payload: { event: "exec_approval_requested" },
    };
    expect(adapter.handleOscNotification?.(nOk)?.status).toBe("needs_approval");
  });
});

describe("codexIntentFor", () => {
  it("maps hook events to Poracode intents", () => {
    expect(codexIntentFor("SessionStart", { hook_event_name: "SessionStart" }, false)).toBe(
      "session.started",
    );
    expect(codexIntentFor("UserPromptSubmit", { hook_event_name: "UserPromptSubmit" }, false)).toBe(
      "session.turn_started",
    );
    expect(
      codexIntentFor("PermissionRequest", { hook_event_name: "PermissionRequest" }, false),
    ).toBe("session.needs_approval");
    expect(codexIntentFor("Stop", { hook_event_name: "Stop" }, false)).toBe(
      "session.turn_finished",
    );
    expect(codexIntentFor("PreToolUse", { hook_event_name: "PreToolUse" }, false)).toBeUndefined();
    expect(codexIntentFor("PreToolUse", { hook_event_name: "PreToolUse" }, true)).toBe(
      "session.turn_started",
    );
  });
});

describe("mapCodexModels", () => {
  it("promotes GPT-5.5 to the Codex default model when available", () => {
    expect(
      mapCodexModels([
        {
          id: "gpt-5.4",
          model: "gpt-5.4",
          displayName: "gpt-5.4",
          hidden: false,
          isDefault: true,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "Low" },
            { reasoningEffort: "medium", description: "Medium" },
          ],
        },
        {
          id: "gpt-5.5",
          model: "gpt-5.5",
          displayName: "gpt-5.5",
          hidden: false,
          isDefault: false,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "medium", description: "Medium" },
            { reasoningEffort: "high", description: "High" },
          ],
        },
      ]),
    ).toMatchObject({
      models: [
        { id: "gpt-5.5", label: "5.5" },
        { id: "gpt-5.4", label: "5.4" },
      ],
      defaultEffort: "high",
    });
  });

  it("prefers high as the default effort when the default model supports it", () => {
    expect(
      mapCodexModels([
        {
          id: "gpt-5.4",
          model: "gpt-5.4",
          displayName: "gpt-5.4",
          hidden: false,
          isDefault: true,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "Low" },
            { reasoningEffort: "medium", description: "Medium" },
            { reasoningEffort: "high", description: "High" },
          ],
        },
      ]),
    ).toMatchObject({
      defaultEffort: "high",
      efforts: ["low", "medium", "high"],
    });
  });

  it("advertises Fast only for models whose additionalSpeedTiers include 'fast'", () => {
    const result = mapCodexModels([
      {
        id: "gpt-5.5",
        model: "gpt-5.5",
        displayName: "gpt-5.5",
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
        additionalSpeedTiers: ["fast"],
        serviceTiers: [{ id: "priority" }],
      },
      {
        id: "gpt-5.4",
        model: "gpt-5.4",
        displayName: "gpt-5.4",
        hidden: false,
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
        additionalSpeedTiers: ["fast"],
        serviceTiers: [{ id: "priority" }],
      },
      {
        id: "gpt-5.4-mini",
        model: "gpt-5.4-mini",
        displayName: "gpt-5.4-mini",
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
        additionalSpeedTiers: [],
        serviceTiers: [],
      },
      {
        id: "gpt-5.3-codex-spark",
        model: "gpt-5.3-codex-spark",
        displayName: "gpt-5.3-codex-spark",
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
        additionalSpeedTiers: [],
        serviceTiers: [],
      },
    ]);
    expect(result.fastModels).toEqual(["gpt-5.5", "gpt-5.4"]);
  });

  it("treats every visible model as fast-capable when the CLI omits tier fields", () => {
    const result = mapCodexModels([
      {
        id: "gpt-5.4",
        model: "gpt-5.4",
        displayName: "gpt-5.4",
        hidden: false,
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
      },
      {
        id: "gpt-5.4-mini",
        model: "gpt-5.4-mini",
        displayName: "gpt-5.4-mini",
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
      },
    ]);
    expect(result.fastModels).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
  });

  it("falls back to serviceTiers presence when additionalSpeedTiers is missing", () => {
    const result = mapCodexModels([
      {
        id: "gpt-5.5",
        model: "gpt-5.5",
        displayName: "gpt-5.5",
        hidden: false,
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
        serviceTiers: [{ id: "priority" }],
      },
      {
        id: "gpt-5.4-mini",
        model: "gpt-5.4-mini",
        displayName: "gpt-5.4-mini",
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Medium" }],
        serviceTiers: [],
      },
    ]);
    expect(result.fastModels).toEqual(["gpt-5.5"]);
  });
});
