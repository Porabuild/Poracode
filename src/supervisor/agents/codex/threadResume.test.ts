import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAppServerRpc } from "./appServerRpc";
import type { CodexStdioTransportListener } from "./stdioTransport";
import { setupCodexStructuredSession } from "./structuredSessionTestHarness";
import { forkCodexThread, resumeCodexThread } from "./threadResume";

function rpcHarness() {
  let listener: CodexStdioTransportListener;
  const writes: Array<Record<string, unknown>> = [];
  const rpc = new CodexAppServerRpc(
    {
      setListener: (value) => {
        listener = value;
      },
      write: (message: Record<string, unknown>) => {
        writes.push(message);
      },
      dispose: () => {},
      formatOutput: () => "",
    },
    "local-thread",
  );
  return {
    rpc,
    writes,
    reply: (payload: unknown) => listener.onMessage(payload),
  };
}

afterEach(() => vi.useRealTimers());

it("forks without history and preserves the absolute anchor on older optional-field rejection", async () => {
  const h = rpcHarness();
  const pending = forkCodexThread(h.rpc, { threadId: "saved-thread", lastTurnId: "retained-turn" });
  expect(h.writes[0]).toMatchObject({
    method: "thread/fork",
    params: {
      threadId: "saved-thread",
      lastTurnId: "retained-turn",
      excludeTurns: true,
    },
  });
  h.reply({ id: "poracode-0", error: { code: -32602, message: "Unknown field `excludeTurns`" } });
  await vi.waitFor(() => expect(h.writes).toHaveLength(2));
  expect(h.writes[1]).toMatchObject({
    method: "thread/fork",
    params: { threadId: "saved-thread", lastTurnId: "retained-turn" },
  });
  expect(h.writes[1]?.params).not.toHaveProperty("excludeTurns");
  h.reply({ id: "poracode-1", result: { thread: { id: "forked-thread", turns: [] } } });
  await expect(pending).resolves.toMatchObject({ thread: { id: "forked-thread" } });
  h.rpc.dispose(new Error("test cleanup"));
});

describe("Codex metadata-only resume", () => {
  it("admits input while optional goal hydration is pending, after the required status snapshot", async () => {
    const goal = Promise.withResolvers<unknown>();
    const snapshot = Promise.withResolvers<unknown>();
    const h = setupCodexStructuredSession((method) => {
      if (method === "thread/goal/get") return goal.promise;
      if (method === "thread/read") return snapshot.promise;
      return undefined;
    });
    let opened = false;
    const opening = h.session
      .openThread(
        { model: "saved-model" },
        { providerSessionId: "provider-thread", discoveredAt: "2026-10-18T00:00:00Z" },
      )
      .then(() => {
        opened = true;
      });
    await vi.waitFor(() =>
      expect(h.requests.some(({ method }) => method === "thread/read")).toBe(true),
    );
    expect(opened).toBe(false);
    snapshot.resolve({ thread: { id: "provider-thread", status: { type: "idle" } } });
    await opening;
    await h.session.startTurn("hello", { model: "saved-model" });
    expect(h.requests.some(({ method }) => method === "turn/start")).toBe(true);
    goal.resolve({ goal: null });
  });

  it.each(["notification", "clear", "reopen", "dispose", "command", "edit"])(
    "ignores a stale goal snapshot after %s",
    async (change) => {
      const hydration = Promise.withResolvers<unknown>();
      let goalReads = 0;
      const h = setupCodexStructuredSession((method) => {
        if (method === "thread/goal/get")
          return ++goalReads === 1 ? hydration.promise : { goal: null };
        if (method === "thread/read")
          return { thread: { id: "provider-thread", status: { type: "idle" } } };
        return undefined;
      });
      const ref = { providerSessionId: "provider-thread", discoveredAt: "2026-10-18T00:00:00Z" };
      await h.session.openThread({ model: "saved-model" }, ref);
      const goal = {
        threadId: "provider-thread",
        objective: "new goal",
        status: "paused",
        tokenBudget: null,
        tokensUsed: 1,
        timeUsedSeconds: 1,
        createdAt: 1778570000,
        updatedAt: 1778570001,
      };
      if (change === "notification")
        h.notify("thread/goal/updated", { threadId: "provider-thread", goal });
      if (change === "clear") h.notify("thread/goal/cleared", { threadId: "provider-thread" });
      if (change === "reopen") await h.session.openThread({ model: "saved-model" }, ref);
      if (change === "dispose") Object.assign(h.session, { isDisposed: true });
      if (change === "command") await h.session.startTurn("/goal pause", { model: "saved-model" });
      if (change === "edit")
        await h.session.controlGoal({ action: "edit", objective: "edited goal" });
      expect(JSON.stringify(h.events).includes("new goal")).toBe(change === "notification");
      const count = h.events.length;
      hydration.resolve({ goal: { ...goal, objective: "stale goal" } });
      await hydration.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(h.events).toHaveLength(count);
      expect(JSON.stringify(h.events)).not.toContain("stale goal");
    },
  );

  it("renders a goal notification received during the required resume snapshot", async () => {
    const hydration = Promise.withResolvers<unknown>();
    const snapshot = Promise.withResolvers<unknown>();
    const h = setupCodexStructuredSession((method) => {
      if (method === "thread/goal/get") return hydration.promise;
      if (method === "thread/read") return snapshot.promise;
      return undefined;
    });
    const opening = h.session.openThread(
      { model: "saved-model" },
      { providerSessionId: "provider-thread", discoveredAt: "2026-10-18T00:00:00Z" },
    );
    await vi.waitFor(() =>
      expect(h.requests.some(({ method }) => method === "thread/read")).toBe(true),
    );
    const goal = {
      threadId: "provider-thread",
      objective: "current goal",
      status: "paused",
      tokenBudget: null,
      tokensUsed: 1,
      timeUsedSeconds: 1,
      createdAt: 1778570000,
      updatedAt: 1778570001,
    };
    h.notify("thread/goal/updated", { threadId: "provider-thread", goal });
    snapshot.resolve({ thread: { id: "provider-thread", status: { type: "idle" } } });
    await opening;
    hydration.resolve({ goal: { ...goal, objective: "stale goal" } });
    await hydration.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(JSON.stringify(h.events)).toContain("current goal");
    expect(JSON.stringify(h.events)).not.toContain("stale goal");
  });

  it.each([true, false])(
    "waits for pending goal discovery before replacement (existing goal: %s)",
    async (existingGoal) => {
      const hydration = Promise.withResolvers<unknown>();
      const h = setupCodexStructuredSession((method) => {
        if (method === "thread/goal/get") return hydration.promise;
        if (method === "thread/read")
          return { thread: { id: "provider-thread", status: { type: "idle" } } };
        return undefined;
      });
      await h.session.openThread(
        { model: "saved-model" },
        { providerSessionId: "provider-thread", discoveredAt: "2026-10-18T00:00:00Z" },
      );
      const turn = h.session.startTurn("/goal replacement", { model: "saved-model" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(h.requests.some(({ method }) => method === "thread/goal/set")).toBe(false);
      hydration.resolve({
        goal: existingGoal
          ? {
              threadId: "provider-thread",
              objective: "previous goal",
              status: "paused",
              tokenBudget: null,
              tokensUsed: 1,
              timeUsedSeconds: 1,
              createdAt: 1778570000,
              updatedAt: 1778570001,
            }
          : null,
      });
      await turn;
      expect(h.requests.filter(({ method }) => /thread\/goal\/(clear|set)/.test(method))).toEqual([
        ...(existingGoal
          ? [{ method: "thread/goal/clear", params: { threadId: "provider-thread" } }]
          : []),
        {
          method: "thread/goal/set",
          params: { threadId: "provider-thread", objective: "replacement", status: "active" },
        },
      ]);
    },
  );

  it("accepts a slow resume after the previous 30s limit without fetching turns", async () => {
    vi.useFakeTimers();
    const h = rpcHarness();
    const pending = resumeCodexThread(h.rpc, { threadId: "saved-thread", model: "saved-model" });
    const settled = vi.fn<(value: unknown) => void>();
    void pending.then(settled, settled);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).not.toHaveBeenCalled();
    expect(h.writes).toEqual([
      {
        id: "poracode-0",
        method: "thread/resume",
        params: { threadId: "saved-thread", model: "saved-model", excludeTurns: true },
      },
    ]);
    h.reply({ id: "poracode-0", result: { thread: { id: "saved-thread", turns: [] } } });
    await expect(pending).resolves.toMatchObject({ thread: { id: "saved-thread" } });
    expect(vi.getTimerCount()).toBe(0);
    h.rpc.dispose(new Error("test cleanup"));
  });

  it("times out at two minutes without retrying or starting a replacement conversation", async () => {
    vi.useFakeTimers();
    const h = rpcHarness();
    const pending = resumeCodexThread(h.rpc, { threadId: "saved-thread" });
    let rejectedError: unknown;
    void pending.catch((error: unknown) => {
      rejectedError = error;
    });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(rejectedError).toBeUndefined();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow(
      "Timed out waiting for Codex app-server response to thread/resume.",
    );
    expect(h.writes).toHaveLength(1);
    h.reply({ id: "poracode-0", result: { thread: { id: "saved-thread" } } });
    expect(vi.getTimerCount()).toBe(0);
    h.rpc.dispose(new Error("test cleanup"));
  });

  it("resumes the same thread on an older server rejecting excludeTurns", async () => {
    const h = rpcHarness();
    const pending = resumeCodexThread(h.rpc, {
      threadId: "saved-thread",
      model: "saved-model",
      config: { model_context_window: 400_000 },
    });
    h.reply({
      id: "poracode-0",
      error: {
        code: -32602,
        message: "Invalid params: unknown field `excludeTurns`",
      },
    });
    await vi.waitFor(() => expect(h.writes).toHaveLength(2));
    expect(h.writes[1]).toMatchObject({
      method: "thread/resume",
      params: {
        threadId: "saved-thread",
        model: "saved-model",
        config: { model_context_window: 400_000 },
      },
    });
    expect(h.writes[1]?.params).not.toHaveProperty("excludeTurns");
    h.reply({ id: "poracode-1", result: { thread: { id: "saved-thread" } } });
    await expect(pending).resolves.toMatchObject({ thread: { id: "saved-thread" } });
    h.rpc.dispose(new Error("test cleanup"));
  });

  it.each([
    { code: -32602, message: "Invalid params: unknown field `permissions`" },
    { code: -32601, message: "Method not found" },
    { code: -32000, message: "failed to restore thread" },
  ])("preserves unrelated resume errors: $message", async (error) => {
    const h = rpcHarness();
    const pending = resumeCodexThread(h.rpc, { threadId: "saved-thread" });
    h.reply({ id: "poracode-0", error });
    await expect(pending).rejects.toThrow(error.message);
    expect(h.writes).toHaveLength(1);
    h.rpc.dispose(new Error("test cleanup"));
  });

  it("opens an existing session without full history and still synchronizes live status", async () => {
    const h = setupCodexStructuredSession((method) => {
      if (method === "thread/read")
        return { thread: { id: "saved-thread", status: { type: "idle" } } };
      return undefined;
    });
    await expect(
      h.session.openThread(
        { model: "saved-model" },
        {
          providerSessionId: "saved-thread",
          discoveredAt: "2026-09-30T21:16:35.353Z",
        },
      ),
    ).resolves.toBe("saved-thread");
    expect(h.requests.map((request) => request.method)).toEqual([
      "thread/resume",
      "thread/goal/get",
      "thread/read",
    ]);
    expect(h.requests[0]).toMatchObject({
      params: { threadId: "saved-thread", excludeTurns: true },
      timeoutMs: 120_000,
    });
    expect(h.requests[2]?.params).toEqual({ threadId: "saved-thread", includeTurns: false });
  });
});
