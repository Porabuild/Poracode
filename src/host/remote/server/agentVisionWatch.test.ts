import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { dbGetThread } from "@/host/db";
import type { AgentVision } from "@/shared/agentVision";
import type { AuthenticatedRemoteSession } from "../auth";
import type { RemoteServerContext } from "./context";
import { watchAgentVision } from "./agentVisionWatch";

vi.mock("@/host/db", () => ({
  dbGetThread: vi.fn<() => { id: string }>(() => ({ id: "thread" })),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function fixture() {
  const socket = { readyState: WebSocket.OPEN, bufferedAmount: 0 } as WebSocket;
  const scopes: AuthenticatedRemoteSession["scopes"][number][] = ["session:read"];
  const session = {
    scopes,
    expiresAtMs: Date.now() + 10000,
  } as unknown as AuthenticatedRemoteSession;
  const read = vi.fn<() => Promise<AgentVision | null>>(async () => null);
  const send = vi.fn<RemoteServerContext["sendRaw"]>();
  const ctx = {
    stopping: false,
    clients: new Map([[socket, session]]),
    options: { readAgentVision: read },
    runIngressWork: (operation: () => unknown) => Promise.resolve(operation()),
    sendRaw: send,
  } as unknown as RemoteServerContext;
  return { socket, session, scopes, read, send, ctx };
}

describe("Agent Vision watch lifecycle", () => {
  it("rejects missing permission and drops a frame if the connection is revoked during capture", async () => {
    vi.useFakeTimers();
    const { socket, session, scopes, read, send, ctx } = fixture();
    scopes.length = 0;
    watchAgentVision(ctx, socket, session, "thread", "watch")();
    expect(read).not.toHaveBeenCalled();
    scopes.push("session:read");
    const pending = Promise.withResolvers<AgentVision | null>();
    read.mockReturnValue(pending.promise);
    const stop = watchAgentVision(ctx, socket, session, "thread", "watch");
    ctx.clients.delete(socket);
    pending.resolve(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
    stop();
  });

  it("skips congested sockets before and after capture without queuing frames", async () => {
    vi.useFakeTimers();
    const { socket, session, read, send, ctx } = fixture();
    Object.defineProperty(socket, "bufferedAmount", { value: 2000000, writable: true });
    const stop = watchAgentVision(ctx, socket, session, "thread", "watch");
    await vi.advanceTimersByTimeAsync(67);
    expect(read).not.toHaveBeenCalled();
    const pending = Promise.withResolvers<AgentVision | null>();
    read.mockReturnValue(pending.promise);
    Object.defineProperty(socket, "bufferedAmount", { value: 0 });
    await vi.advanceTimersByTimeAsync(67);
    Object.defineProperty(socket, "bufferedAmount", { value: 2000000 });
    pending.resolve(null);
    await vi.advanceTimersByTimeAsync(67);
    expect(send).not.toHaveBeenCalled();
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(dbGetThread).toHaveBeenCalledWith("thread");
  });
});
