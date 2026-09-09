import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexStructuredSession } from "./acp";

// As in codex.test.ts, construct the session around a controllable app-server
// transport without spawning a real provider process or spending model tokens.
function setup(active = true) {
  const release = vi.fn<() => void>();
  const rpcDispose = vi.fn<() => void>();
  const request = vi
    .fn<(method: string) => Promise<unknown>>()
    .mockImplementation(async (method) =>
      method === "thread/read" ? { thread: { status: { type: "idle" }, turns: [] } } : {},
    );
  const session = Object.assign(Object.create(CodexStructuredSession.prototype), {
    threadId: "local-child",
    remoteThreadId: "provider-child",
    isDisposed: false,
    currentThreadStatus: { type: "idle" },
    activeTurnId: active ? "turn-child" : undefined,
    activeTurnIds: new Set(active ? ["turn-child"] : []),
    releaseAppServer: release,
    rpc: { ownsThread: () => true, request, dispose: rpcDispose },
  }) as CodexStructuredSession;
  return { session, request, release, rpcDispose };
}

afterEach(() => vi.useRealTimers());

describe("Codex pooled session disposal", () => {
  it("shares concurrent disposal and waits beyond interrupt acknowledgement for idle", async () => {
    vi.useFakeTimers();
    const h = setup();
    let stopped = false;
    h.request.mockImplementation(async (method) =>
      method === "thread/read"
        ? {
            thread: {
              status: { type: stopped ? "idle" : "active" },
              turns: [{ id: "turn-child", status: stopped ? "interrupted" : "inProgress" }],
            },
          }
        : {},
    );
    const disposal = h.session.dispose();
    expect(h.session.dispose()).toBe(disposal);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.request.mock.calls.map(([method]) => method)).toEqual([
      "turn/interrupt",
      "thread/read",
    ]);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.rpcDispose).not.toHaveBeenCalled();
    stopped = true;
    await vi.advanceTimersByTimeAsync(100);
    await disposal;
    expect(h.request.mock.calls.map(([method]) => method)).toEqual([
      "turn/interrupt",
      "thread/read",
      "thread/read",
      "thread/unsubscribe",
    ]);
    expect(h.release).toHaveBeenCalledOnce();
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("retains its lease after a failed interrupt and permits retry", async () => {
    const h = setup();
    h.request.mockRejectedValueOnce(new Error("interrupt unavailable")).mockResolvedValueOnce({
      thread: { status: { type: "active" }, turns: [{ id: "turn-child", status: "inProgress" }] },
    });
    await expect(h.session.dispose()).rejects.toThrow("interrupt unavailable");
    expect(h.release).not.toHaveBeenCalled();
    expect(h.rpcDispose).not.toHaveBeenCalled();
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("accepts confirmed idle when completion races the interrupt request", async () => {
    const h = setup();
    h.request.mockRejectedValueOnce(new Error("turn already completed"));
    await h.session.dispose();
    expect(h.request.mock.calls.map(([method]) => method)).toEqual([
      "turn/interrupt",
      "thread/read",
      "thread/unsubscribe",
    ]);
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("does not mistake missing shutdown status for an idle thread", async () => {
    const h = setup();
    h.request.mockResolvedValue({});
    await expect(h.session.dispose()).rejects.toThrow("shutdown status");
    expect(h.release).not.toHaveBeenCalled();
    expect(h.rpcDispose).not.toHaveBeenCalled();
  });

  it("fails a bounded stop confirmation without releasing the shared lease", async () => {
    vi.useFakeTimers();
    const h = setup();
    h.request.mockImplementation(async (method) =>
      method === "thread/read"
        ? {
            thread: {
              status: { type: "active" },
              turns: [{ id: "turn-child", status: "inProgress" }],
            },
          }
        : {},
    );
    await Promise.all([
      expect(h.session.dispose()).rejects.toThrow("disposal deadline"),
      vi.advanceTimersByTimeAsync(10_000),
    ]);
    expect(h.release).not.toHaveBeenCalled();
    h.request.mockImplementation(async (method) =>
      method === "thread/read"
        ? {
            thread: { status: { type: "idle" }, turns: [] },
          }
        : {},
    );
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("retains its lease when shutdown status cannot be read", async () => {
    const h = setup();
    h.request.mockImplementation(async (method) => {
      if (method === "thread/read") throw new Error("read unavailable");
      return {};
    });
    await expect(h.session.dispose()).rejects.toThrow("read unavailable");
    expect(h.release).not.toHaveBeenCalled();
  });

  it("releases an idle session without interrupting or polling", async () => {
    const h = setup(false);
    await h.session.dispose();
    expect(h.request.mock.calls.map(([method]) => method)).toEqual(["thread/unsubscribe"]);
    expect(h.release).toHaveBeenCalledOnce();
  });
});
