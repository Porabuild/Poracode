import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionStatus } from "./legacySdk";
import { createKnownSessionRef } from "../base";
import { OpencodeSdkSession } from "./sdkSession";

const mocks = vi.hoisted(() => ({ acquire: vi.fn<() => Promise<unknown>>() }));
vi.mock("./sdkClient", async (importActual) => ({
  ...(await importActual<typeof import("./sdkClient")>()),
  acquireOpenCodeServer: mocks.acquire,
}));

afterEach(() => vi.useRealTimers());

async function setup(startTurn = true) {
  const promptAsync = vi.fn<() => Promise<unknown>>().mockResolvedValue({});
  const update = vi.fn<() => Promise<unknown>>().mockResolvedValue({});
  const abort = vi.fn<() => Promise<{ data: boolean }>>().mockResolvedValue({ data: true });
  const status = vi
    .fn<() => Promise<{ data: Record<string, SessionStatus> }>>()
    .mockResolvedValue({ data: {} });
  const release = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const unsubscribe = vi.fn<() => void>();
  const onClose = vi.fn<() => void>();
  mocks.acquire.mockResolvedValue({
    client: {
      session: {
        create: async () => ({ data: { id: "ses_child" } }),
        get: async () => ({ data: { id: "ses_child" } }),
        promptAsync,
        update,
        abort,
        status,
      },
      command: { list: async () => ({ data: [] }) },
    },
    eventClient: { global: { event: async () => ({ stream: (async function* () {})() }) } },
    onServerExit: () => unsubscribe,
    dispose: release,
    handle: {},
  });
  const session = await OpencodeSdkSession.create({
    threadId: "local-child",
    projectLocation: { kind: "posix", path: "/repo" },
    config: { model: "opencode/test" },
    presentationMode: "gui",
  });
  session.setListener({ onClose, onUpdate: () => {}, onError: () => {} });
  await session.activate();
  await session.openThread({ model: "opencode/test" });
  if (startTurn) await session.startTurn("Work", { model: "opencode/test" });
  return { session, abort, status, release, unsubscribe, onClose, promptAsync, update };
}

describe("OpenCode pooled session disposal", () => {
  it("does not dispatch a turn after disposal while permission synchronization is pending", async () => {
    const h = await setup(false);
    let releaseUpdate!: () => void;
    h.update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseUpdate = resolve;
        }),
    );
    const turn = h.session.startTurn("Work", {
      model: "opencode/test",
      approvalPolicy: "never",
    });
    expect(h.update).toHaveBeenCalledOnce();
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledOnce();
    releaseUpdate();
    await expect(turn).rejects.toThrow("not active");
    expect(h.promptAsync).not.toHaveBeenCalled();
  });

  it("shares concurrent disposal and retains its lease until the aborted turn is idle", async () => {
    vi.useFakeTimers();
    const h = await setup();
    h.status.mockResolvedValueOnce({ data: { ses_child: { type: "busy" } } });
    const disposal = h.session.dispose();
    expect(h.session.dispose()).toBe(disposal);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.abort).toHaveBeenCalledOnce();
    expect(h.release).not.toHaveBeenCalled();
    expect(h.unsubscribe).not.toHaveBeenCalled();
    expect(h.onClose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await disposal;
    expect(h.status).toHaveBeenCalledTimes(2);
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(h.onClose).toHaveBeenCalledOnce();
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("does not treat local force-completion as provider shutdown", async () => {
    const h = await setup();
    h.session.forceCompleteTurn();
    await h.session.dispose();
    expect(h.abort).toHaveBeenCalledOnce();
    expect(h.status).toHaveBeenCalledOnce();
  });

  it("confirms shutdown for a resumed GUI session that may already be working", async () => {
    const h = await setup(false);
    await h.session.openThread({ model: "opencode/test" }, createKnownSessionRef("ses_child"));
    await h.session.dispose();
    expect(h.abort).toHaveBeenCalledOnce();
    expect(h.status).toHaveBeenCalledOnce();
  });

  it("retries a failed lease release instead of forgetting the acquired server", async () => {
    const h = await setup();
    h.release.mockRejectedValueOnce(new Error("release unavailable"));
    await expect(h.session.dispose()).rejects.toThrow("release unavailable");
    expect(h.onClose).not.toHaveBeenCalled();
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledTimes(2);
    expect(h.abort).toHaveBeenCalledOnce();
    expect(h.onClose).toHaveBeenCalledOnce();
  });

  it("retains the session and retries after an abort failure", async () => {
    const h = await setup();
    h.abort.mockRejectedValueOnce(new Error("abort unavailable"));
    await expect(h.session.dispose()).rejects.toThrow("abort unavailable");
    expect(h.release).not.toHaveBeenCalled();
    expect(h.unsubscribe).not.toHaveBeenCalled();
    await h.session.dispose();
    expect(h.abort).toHaveBeenCalledTimes(2);
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("rejects an unconfirmed stop after the deadline and permits retry", async () => {
    vi.useFakeTimers();
    const h = await setup();
    h.status.mockResolvedValue({ data: { ses_child: { type: "busy" } } });
    await Promise.all([
      expect(h.session.dispose()).rejects.toThrow("disposal deadline"),
      vi.advanceTimersByTimeAsync(10_000),
    ]);
    expect(h.release).not.toHaveBeenCalled();
    h.status.mockResolvedValue({ data: {} });
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("bounds an abort request that never acknowledges cancellation", async () => {
    vi.useFakeTimers();
    const h = await setup();
    h.abort.mockReturnValue(new Promise(() => {}));
    await Promise.all([
      expect(h.session.dispose()).rejects.toThrow("disposal deadline"),
      vi.advanceTimersByTimeAsync(10_000),
    ]);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
  });

  it("does not release the lease when status confirmation fails", async () => {
    const h = await setup();
    h.status.mockRejectedValueOnce(new Error("status unavailable"));
    await expect(h.session.dispose()).rejects.toThrow("status unavailable");
    expect(h.release).not.toHaveBeenCalled();
    await h.session.dispose();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("releases an unused idle session without aborting or polling the shared server", async () => {
    const h = await setup(false);
    await h.session.dispose();
    expect(h.abort).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });
});
