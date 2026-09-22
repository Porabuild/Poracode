import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { CodexStructuredSession } from "./acp";
import { CodexRpcResponseError, type CodexAppServerRpc } from "./appServerRpc";
import { isCodexCompactCommand } from "./compactCommand";
import { CodexLiveVoice } from "./liveVoice";

interface Harness {
  session: CodexStructuredSession;
  requests: Array<{ method: string; params: unknown }>;
  events: RuntimeEvent[];
  updates: Array<{ status: string }>;
  notify(method: string, params: Record<string, unknown>): void;
}

/** Session shell around a scripted app-server, as in codex.test.ts. */
function setup(respond?: (method: string) => unknown): Harness {
  const requests: Harness["requests"] = [];
  const events: RuntimeEvent[] = [];
  const updates: Harness["updates"] = [];
  const shell = Object.create(CodexStructuredSession.prototype) as Record<string, unknown>;
  const rpc = {
    claimThread: () => {},
    ownsThread: (threadId: string) => threadId === "provider-thread",
    request: async (method: string, params: unknown) => {
      requests.push({ method, params });
      const result = respond?.(method);
      if (result instanceof Error) throw result;
      if (method === "turn/start") return { turn: { id: "turn-user", status: "inProgress" } };
      if (method === "turn/steer") return { turnId: "turn-user" };
      return result ?? {};
    },
  };
  Object.assign(shell, {
    rpc,
    liveVoice: new CodexLiveVoice(
      rpc as unknown as Pick<CodexAppServerRpc, "request">,
      "local-thread",
      () => {},
      () => {},
    ),
    threadId: "local-thread",
    remoteThreadId: "provider-thread",
    launchOptions: {},
    bufferedRuntimeEvents: [],
    isDisposed: false,
    currentThreadStatus: { type: "idle" },
    seenErrorMessages: new Set<string>(),
    activeTurnIds: new Set<string>(),
    resumeActiveStatusSuppressionUntil: new Map(),
    listener: {
      onRuntimeEvent: (event: RuntimeEvent) => events.push(event),
      onUpdate: (update: { status: string }) => updates.push(update),
      onClose: () => {},
      onError: () => {},
    },
  });
  const session = shell as unknown as CodexStructuredSession;
  const notify = (method: string, params: Record<string, unknown>) =>
    (
      session as unknown as {
        handleNotification(method: string, params: Record<string, unknown>): void;
      }
    ).handleNotification(method, params);
  return { session, requests, events, updates, notify };
}

const turnParams = (turnId: string, status = "inProgress") => ({
  threadId: "provider-thread",
  turn: { id: turnId, status, items: [] },
});

describe("isCodexCompactCommand", () => {
  it("matches only the bare command", () => {
    expect(isCodexCompactCommand("/compact")).toBe(true);
    expect(isCodexCompactCommand("  /compact \n")).toBe(true);
    expect(isCodexCompactCommand("/compact keep the API notes")).toBe(false);
    expect(isCodexCompactCommand("/compacting")).toBe(false);
    expect(isCodexCompactCommand("please /compact")).toBe(false);
  });
});

describe("Codex /compact in GUI threads", () => {
  it("runs thread/compact/start and follows the server's compact turn to idle", async () => {
    const h = setup();

    const result = await h.session.startTurn("/compact", { model: "gpt-5.4" });

    expect(result).toBeUndefined();
    expect(h.requests).toEqual([
      { method: "thread/compact/start", params: { threadId: "provider-thread" } },
    ]);
    expect(h.events.map((event) => event.type)).toEqual(["item.started", "item.completed"]);
    expect(h.events[0]).toMatchObject({ itemType: "user_message" });
    expect(h.updates.at(-1)).toEqual({ status: "working", attention: "working" });

    // Sequence observed from app-server 0.155.1 for a manual compaction.
    h.notify("thread/status/changed", {
      threadId: "provider-thread",
      status: { type: "active", activeFlags: [] },
    });
    h.notify("turn/started", turnParams("turn-compact"));
    h.notify("item/started", {
      threadId: "provider-thread",
      turnId: "turn-compact",
      item: { type: "contextCompaction", id: "cc-1" },
    });
    h.notify("item/completed", {
      threadId: "provider-thread",
      turnId: "turn-compact",
      item: { type: "contextCompaction", id: "cc-1" },
    });
    h.notify("thread/status/changed", { threadId: "provider-thread", status: { type: "idle" } });
    h.notify("turn/completed", turnParams("turn-compact", "completed"));

    const compactionRows = h.events.filter(
      (event) =>
        event.type === "item.started" &&
        event.itemType === "tool_call" &&
        (event.payload as { name?: string }).name === "ContextCompaction",
    );
    expect(compactionRows).toHaveLength(1);
    expect(h.events).toContainEqual(
      expect.objectContaining({ type: "turn.completed", turnId: "turn-compact" }),
    );
    expect(h.updates.at(-1)).toEqual({ status: "idle", attention: "none" });
    expect(h.requests.map((request) => request.method)).not.toContain("turn/start");
  });

  it("refuses to compact while a turn is running instead of interrupting it", async () => {
    const h = setup();
    h.notify("turn/started", turnParams("turn-user"));
    const updatesBefore = h.updates.length;

    const result = await h.session.startTurn("/compact", { model: "gpt-5.4" });

    expect(result).toEqual({ outcome: "completed-without-turn" });
    expect(h.requests).toEqual([]);
    expect(h.events).toContainEqual({
      type: "error",
      threadId: "local-thread",
      message: msg("codex.compactUnavailableDuringTurn"),
    });
    // The running turn keeps its working status.
    expect(h.updates.slice(updatesBefore)).toEqual([]);
  });

  it("does not steer /compact into a running turn as literal text", async () => {
    const h = setup();
    h.notify("turn/started", turnParams("turn-user"));

    const result = await h.session.steerTurn("/compact", { model: "gpt-5.4" });

    expect(result).toEqual({ outcome: "completed-without-turn" });
    expect(h.requests.map((request) => request.method)).toEqual([]);
    expect(h.events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: msg("codex.compactUnavailableDuringTurn"),
      }),
    );
  });

  it("routes an idle steer of /compact through compaction", async () => {
    const h = setup();

    await h.session.steerTurn("/compact", { model: "gpt-5.4" });

    expect(h.requests.map((request) => request.method)).toEqual(["thread/compact/start"]);
  });

  it("surfaces a failed compaction request and settles idle", async () => {
    const h = setup((method) =>
      method === "thread/compact/start"
        ? new CodexRpcResponseError("thread not loaded", -32600)
        : undefined,
    );

    const result = await h.session.startTurn("/compact", { model: "gpt-5.4" });

    expect(result).toEqual({ outcome: "completed-without-turn" });
    expect(h.events).toContainEqual({
      type: "error",
      threadId: "local-thread",
      message: msg("codex.compactFailed", { detail: "thread not loaded" }),
    });
    expect(h.updates.at(-1)).toEqual({ status: "idle", attention: "none" });
  });

  it("sends /compact with arguments to the model as an ordinary prompt", async () => {
    const h = setup();

    await h.session.startTurn("/compact keep the API notes", { model: "gpt-5.4" });

    expect(h.requests.map((request) => request.method)).toEqual(["turn/start"]);
  });
});
