import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAppServerRpc } from "./appServerRpc";
import type { CodexStdioTransportListener } from "./stdioTransport";
import { setupCodexStructuredSession } from "./structuredSessionTestHarness";
import { resumeCodexThread } from "./threadResume";

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

describe("Codex metadata-only resume", () => {
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
