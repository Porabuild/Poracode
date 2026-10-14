import type { ChildProcess } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
import { AcpStructuredSession } from "./session";

vi.mock("@/shared/awaitProcessTermination", () => ({
  awaitProcessTermination: vi.fn<typeof awaitProcessTermination>(),
}));

function fixture() {
  const child = { pid: 1234, killed: true, exitCode: null, signalCode: null } as ChildProcess;
  const closeSession = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const cancelPending = vi.fn<() => void>();
  const session = Object.assign(Object.create(AcpStructuredSession.prototype), {
    child,
    connection: { closeSession },
    sessionId: "session",
    agentSessionCapabilities: { close: {} },
    reportedBackgroundTasks: [],
    _sessionRequests: { cancelPending },
  }) as AcpStructuredSession;
  return { session, child, closeSession, cancelPending };
}

describe("ACP confirmed disposal", () => {
  beforeEach(() => {
    vi.mocked(awaitProcessTermination).mockReset().mockResolvedValue(undefined);
  });

  it("shares disposal and waits for a previously signalled child to actually stop", async () => {
    const { session, child, closeSession } = fixture();
    const terminated = Promise.withResolvers<void>();
    vi.mocked(awaitProcessTermination).mockReturnValue(terminated.promise);
    const pending = session.dispose();
    expect(session.dispose()).toBe(pending);
    let finished = false;
    void pending.then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(awaitProcessTermination).toHaveBeenCalledOnce());
    expect(awaitProcessTermination).toHaveBeenCalledWith(child, {
      ownedProcessGroup: process.platform !== "win32",
    });
    expect(closeSession).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    terminated.resolve();
    await pending;
    expect(session.dispose()).toBe(pending);
  });

  it("retries unconfirmed termination without repeating session cleanup", async () => {
    const { session, child, cancelPending } = fixture();
    vi.mocked(awaitProcessTermination).mockRejectedValueOnce(new Error("Process still alive"));
    await expect(session.dispose()).rejects.toThrow("Process still alive");
    await session.dispose();
    expect(awaitProcessTermination).toHaveBeenCalledTimes(2);
    expect(vi.mocked(awaitProcessTermination).mock.calls[1]?.[0]).toBe(child);
    expect(cancelPending).toHaveBeenCalledOnce();
  });

  it("does not let an unanswered optional close RPC prevent process termination", async () => {
    const { session, closeSession } = fixture();
    closeSession.mockReturnValue(new Promise(() => {}));
    await session.dispose();
    expect(closeSession).toHaveBeenCalledOnce();
    expect(awaitProcessTermination).toHaveBeenCalledOnce();
  });
});
