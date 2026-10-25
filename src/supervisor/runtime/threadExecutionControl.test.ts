import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ThreadExecutionControl } from "./threadExecutionControl";
import { startThreadPayloadSchema, type StartThreadPayload } from "@/shared/contracts/thread";
import type { ResolveThreadServerRequestPayload } from "@/shared/contracts";
import type { ControlledThreadRequestPayload } from "@/shared/contracts/threadExecution";

async function requestToken(
  control: ThreadExecutionControl,
  target: Pick<ControlledThreadRequestPayload, "version" | "operationId" | "threadId">,
  requestId = "ask",
) {
  const result = await control.request({ ...target, action: "read", requestId });
  if (result.state !== "read" || !result.request) throw new Error("No pending test request");
  return result.request.requestToken;
}

const launch: Omit<StartThreadPayload, "providerSwitch"> & { threadId: string } = {
  threadId: "thread",
  agentKind: "fixture",
  projectLocation: { kind: "posix", path: "/owned" },
  config: { model: "fixture-model" },
  prompt: "Review",
  initialSize: { cols: 80, rows: 24 },
  presentationMode: "gui",
};
function fixture() {
  const ports = {
    assertAvailable: vi.fn<(threadId: string) => void>(),
    start: vi.fn<(payload: StartThreadPayload) => Promise<{ threadId: string }>>(async () => ({
      threadId: "thread",
    })),
    close: vi.fn<(threadId: string) => Promise<{ confirmed: boolean }>>(async () => ({
      confirmed: true,
    })),
    respond: vi.fn<(payload: ResolveThreadServerRequestPayload) => Promise<void>>(async () => {}),
  };
  const control = new ThreadExecutionControl(ports);
  return {
    control,
    ports,
    prepare: (threadId = "thread") => control.control({ version: 1, action: "prepare", threadId }),
  };
}
describe("supervisor-owned execution ids", () => {
  it("qualifies without launch and refuses foreign, stale and duplicate request replies", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    const target = { version: 2 as const, operationId, threadId: "thread" };
    await expect(f.control.request({ ...target, action: "qualify" })).resolves.toMatchObject({
      state: "qualified",
    });
    expect(f.ports.start).not.toHaveBeenCalled();
    await f.control.control({ version: 1, action: "start", operationId, launch });
    const event = {
      type: "request.opened" as const,
      threadId: "thread",
      requestId: "ask",
      requestType: "tool_call_approval" as const,
      payload: { summary: "Allow?" },
    };
    f.control.observe(event);
    const answer = {
      ...target,
      action: "respond" as const,
      requestId: "ask",
      requestToken: await requestToken(f.control, target),
      response: { optionId: "allow" },
    };
    await expect(f.control.request({ ...answer, threadId: "foreign" })).rejects.toThrow("custody");
    await expect(f.control.request({ ...answer, operationId: randomUUID() })).rejects.toThrow(
      "custody",
    );
    await expect(f.control.request({ ...answer, requestId: "unknown" })).rejects.toThrow(
      "no longer pending",
    );
    f.control.observe({
      type: "request.resolved",
      threadId: "thread",
      requestId: "ask",
      outcome: "cancelled",
    });
    await expect(f.control.request(answer)).rejects.toThrow("no longer pending");
    f.control.observe(event);
    await expect(f.control.request(answer)).rejects.toThrow("no longer pending");
    answer.requestToken = await requestToken(f.control, target);
    await expect(f.control.request(answer)).resolves.toMatchObject({ state: "responded" });
    await expect(f.control.request(answer)).rejects.toThrow("no longer pending");
    expect(f.ports.respond).toHaveBeenCalledExactlyOnceWith({
      threadId: "thread",
      requestId: "ask",
      method: "requestPermission",
      response: { optionId: "allow" },
    });
    await f.control.dispose();
    await expect(f.control.request(answer)).rejects.toThrow("custody");
  });

  it("retains execution ownership until a held request reply joins after close", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    await f.control.control({ version: 1, action: "start", operationId, launch });
    f.control.observe({
      type: "request.opened",
      threadId: "thread",
      requestId: "ask",
      requestType: "tool_user_input",
      payload: { summary: "Answer?" },
    });
    const held = Promise.withResolvers<void>();
    f.ports.respond.mockReturnValue(held.promise);
    const reply = f.control.request({
      version: 2,
      operationId,
      threadId: "thread",
      action: "respond",
      requestId: "ask",
      requestToken: await requestToken(f.control, { version: 2, operationId, threadId: "thread" }),
      response: { optionId: "one" },
    });
    await vi.waitFor(() => expect(f.ports.respond).toHaveBeenCalledOnce());
    let retired = false;
    const cancel = f.control
      .control({ version: 1, action: "cancel", operationId })
      .then((result) => {
        retired = true;
        return result;
      });
    await vi.waitFor(() => expect(f.ports.close).toHaveBeenCalledOnce());
    expect(retired).toBe(false);
    expect(f.control.ownsThread("thread")).toBe(true);
    held.resolve();
    await reply;
    await expect(cancel).resolves.toMatchObject({ confirmed: true });
    expect(f.control.ownsThread("thread")).toBe(false);
  });

  it("does not dispatch an answer cancelled before its response microtask", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    await f.control.control({ version: 1, action: "start", operationId, launch });
    f.control.observe({
      type: "request.opened",
      threadId: "thread",
      requestId: "ask",
      requestType: "tool_call_approval",
      payload: { summary: "Allow?" },
    });
    const reply = f.control
      .request({
        version: 2,
        operationId,
        threadId: "thread",
        action: "respond",
        requestId: "ask",
        requestToken: await requestToken(f.control, {
          version: 2,
          operationId,
          threadId: "thread",
        }),
        response: { optionId: "allow" },
      })
      .catch((error: unknown) => error);
    await f.control.control({ version: 1, action: "cancel", operationId });
    expect(await reply).toMatchObject({
      message: "The controlled run was cancelled before its answer was dispatched.",
    });
    expect(f.ports.respond).not.toHaveBeenCalled();
  });

  it.each(["replaced", "resolved"])(
    "refuses a request %s between reply admission and dispatch",
    async (mode) => {
      const f = fixture(),
        { operationId } = await f.prepare();
      await f.control.control({ version: 1, action: "start", operationId, launch });
      const event = {
        type: "request.opened" as const,
        threadId: "thread",
        requestId: "ask",
        requestType: "tool_call_approval" as const,
        payload: { summary: "Original action" },
      };
      f.control.observe(event);
      const target = { version: 2 as const, operationId, threadId: "thread" };
      const answer = {
        ...target,
        action: "respond" as const,
        requestId: "ask",
        requestToken: await requestToken(f.control, target),
        response: { optionId: "allow" },
      };
      const reply = f.control.request(answer);
      if (mode === "replaced")
        f.control.observe({ ...event, payload: { summary: "Different action" } });
      else
        f.control.observe({
          type: "request.resolved",
          threadId: "thread",
          requestId: "ask",
          outcome: "cancelled",
        });
      await expect(reply).rejects.toThrow("no longer pending");
      expect(f.ports.respond).not.toHaveBeenCalled();
      if (mode === "replaced") {
        await f.control.request({ ...answer, requestToken: await requestToken(f.control, target) });
      }
      expect(f.ports.respond).toHaveBeenCalledTimes(mode === "replaced" ? 1 : 0);
      await f.control.dispose();
    },
  );

  it("refuses old and future request versions and unknown tokens without reply effects", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    const target = { operationId, threadId: "thread", action: "qualify" };
    for (const version of [1, 3])
      await expect(f.control.request({ ...target, version } as never)).rejects.toThrow(Error);
    await f.control.control({ version: 1, action: "start", operationId, launch });
    f.control.observe({
      type: "request.opened",
      threadId: "thread",
      requestId: "ask",
      requestType: "tool_call_approval",
      payload: { summary: "Allow?" },
    });
    await expect(
      f.control.request({
        version: 2,
        operationId,
        threadId: "thread",
        action: "respond",
        requestId: "ask",
        requestToken: randomUUID(),
        response: {},
      }),
    ).rejects.toThrow("no longer pending");
    expect(f.ports.respond).not.toHaveBeenCalled();
    await f.control.dispose();
  });

  it("carries only trusted in-process scope while public launch extras remain forbidden", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    const scope = {
      primaryLocation: launch.projectLocation,
      additionalDirectories: [{ kind: "posix" as const, path: "/extra" }],
      revision: 2,
    };
    await expect(
      f.control.control({
        version: 1,
        action: "start",
        operationId,
        launch: { ...launch, workspaceScope: scope },
      } as never),
    ).rejects.toThrow("Unrecognized key");
    await f.control.control({ version: 1, action: "start", operationId, launch }, scope);
    expect(f.ports.start).toHaveBeenCalledExactlyOnceWith({
      ...startThreadPayloadSchema.parse(launch),
      workspaceScope: scope,
    });
    await f.control.dispose();
  });
  it("cancels before start dispatch without invoking either process port", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    const start = f.control
      .control({ version: 1, action: "start", operationId, launch })
      .catch((error: unknown) => error);
    const cancel = f.control.control({ version: 1, action: "cancel", operationId });
    await expect(cancel).resolves.toMatchObject({ state: "cancelled", confirmed: true });
    expect(await start).toMatchObject({ message: "Thread execution was cancelled before launch." });
    expect(f.ports.start).not.toHaveBeenCalled();
    expect(f.ports.close).not.toHaveBeenCalled();
  });

  it("joins start-lock publication when cancel is invoked synchronously by the start port", async () => {
    const f = fixture(),
      { operationId } = await f.prepare(),
      gate = Promise.withResolvers<{ threadId: string }>();
    let cancel: ReturnType<ThreadExecutionControl["control"]> | undefined;
    let published = false;
    f.ports.start.mockImplementation(() => {
      cancel = f.control.control({ version: 1, action: "cancel", operationId });
      published = true;
      return gate.promise;
    });
    f.ports.close.mockImplementation(async () => {
      expect(published).toBe(true);
      gate.resolve({ threadId: "thread" });
      return { confirmed: true };
    });
    await expect(
      f.control.control({ version: 1, action: "start", operationId, launch }),
    ).resolves.toMatchObject({ state: "cancelled", confirmed: true });
    await expect(cancel).resolves.toMatchObject({ confirmed: true });
    expect(f.ports.close).toHaveBeenCalledExactlyOnceWith("thread");
  });

  it("rejects a foreign thread or unknown operation without changing another runtime", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    await expect(
      f.control.control({
        version: 1,
        action: "start",
        operationId,
        launch: { ...launch, threadId: "foreign" },
      }),
    ).rejects.toThrow("does not match");
    await expect(
      f.control.control({
        version: 1,
        action: "cancel",
        operationId: "d41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      }),
    ).rejects.toThrow("Unknown thread execution");
    expect(f.ports.start).not.toHaveBeenCalled();
    expect(f.ports.close).not.toHaveBeenCalled();
    expect(() => f.control.assertUnowned("thread")).toThrow(
      "Another client is running this thread",
    );
    await f.control.dispose();
  });

  it("never replays a duplicate start and retains exclusion until confirmed retirement", async () => {
    const f = fixture(),
      { operationId } = await f.prepare();
    await f.control.control({ version: 1, action: "start", operationId, launch });
    await expect(
      f.control.control({ version: 1, action: "start", operationId, launch }),
    ).rejects.toThrow("already submitted");
    f.ports.close.mockResolvedValueOnce({ confirmed: false });
    await expect(
      f.control.control({ version: 1, action: "cancel", operationId }),
    ).resolves.toMatchObject({ confirmed: false });
    await expect(f.prepare()).rejects.toThrow("Another client is running this thread");
    await expect(
      f.control.control({ version: 1, action: "cancel", operationId }),
    ).resolves.toMatchObject({ confirmed: true });
    expect(() => f.control.assertUnowned("thread")).not.toThrow();
    expect(f.ports.start).toHaveBeenCalledTimes(1);
  });

  it("keeps the original launch error after confirmed cleanup and retains failed-cleanup custody", async () => {
    const f = fixture(),
      { operationId } = await f.prepare(),
      failure = new Error("Provider launch failed");
    f.ports.start.mockRejectedValue(failure);
    f.ports.close.mockResolvedValueOnce({ confirmed: false });
    await expect(
      f.control.control({ version: 1, action: "start", operationId, launch }),
    ).rejects.toMatchObject({ errors: [failure, expect.any(Error)] });
    expect(() => f.control.assertUnowned("thread")).toThrow(
      "Another client is running this thread",
    );
    await f.control.control({ version: 1, action: "cancel", operationId });
    const second = await f.prepare();
    await expect(
      f.control.control({ version: 1, action: "start", operationId: second.operationId, launch }),
    ).rejects.toBe(failure);
    expect(() => f.control.assertUnowned("thread")).not.toThrow();
  });

  it("bounds completed receipts without permitting old start/cancel to affect a successor", async () => {
    const f = fixture(),
      old = await f.prepare();
    await f.control.control({ version: 1, action: "cancel", operationId: old.operationId });
    for (let index = 0; index < 130; index++) {
      const next = await f.prepare();
      expect(next.operationId).not.toBe(old.operationId);
      await f.control.control({ version: 1, action: "cancel", operationId: next.operationId });
    }
    const current = await f.prepare();
    await f.control.control({
      version: 1,
      action: "start",
      operationId: current.operationId,
      launch,
    });
    await expect(
      f.control.control({ version: 1, action: "start", operationId: old.operationId, launch }),
    ).rejects.toThrow("unknown or cancelled");
    await expect(
      f.control.control({ version: 1, action: "cancel", operationId: old.operationId }),
    ).rejects.toThrow("Unknown thread execution");
    expect(f.ports.close).not.toHaveBeenCalled();
    expect(() => f.control.assertUnowned("thread")).toThrow(
      "Another client is running this thread",
    );
    await f.control.dispose();
  });

  it("bounds live reservations and closes prepared-only state without touching providers", async () => {
    const f = fixture();
    for (let index = 0; index < 128; index++) await f.prepare(`thread-${index}`);
    await expect(f.prepare("overflow")).rejects.toThrow("Too many reserved");
    await expect(f.control.dispose()).resolves.toBe(true);
    expect(f.ports.start).not.toHaveBeenCalled();
    expect(f.ports.close).not.toHaveBeenCalled();
    await expect(f.prepare()).rejects.toThrow("shutting down");
  });
});

describe("caller-known thread reservations", () => {
  it("records cancellation before routing and refuses reused or wrong-thread identifiers", async () => {
    const f = fixture(),
      operationId = randomUUID();
    const cancellation = {
      version: 1 as const,
      action: "cancel" as const,
      operationId,
      threadId: "thread",
    };
    await expect(f.control.reserve(cancellation)).resolves.toMatchObject({
      operationId,
      threadId: "thread",
      confirmed: true,
    });
    await expect(f.control.reserve(cancellation)).resolves.toMatchObject({ confirmed: true });
    await expect(f.control.reserve({ ...cancellation, action: "prepare" })).rejects.toThrow(
      "already used or cancelled",
    );
    await expect(f.control.reserve({ ...cancellation, threadId: "foreign" })).rejects.toThrow(
      "does not match",
    );
    expect(f.ports.assertAvailable).not.toHaveBeenCalled();
    expect(f.ports.start).not.toHaveBeenCalled();
    expect(f.ports.close).not.toHaveBeenCalled();
  });

  it("confirms a refused or lost prepare by nonce without closing the incumbent thread", async () => {
    const f = fixture(),
      existing = await f.prepare(),
      operationId = randomUUID();
    await f.control.control({
      version: 1,
      action: "start",
      operationId: existing.operationId,
      launch,
    });
    await expect(
      f.control.reserve({ version: 1, action: "prepare", operationId, threadId: "thread" }),
    ).rejects.toThrow("Another client is running this thread");
    await expect(
      f.control.reserve({ version: 1, action: "cancel", operationId, threadId: "thread" }),
    ).resolves.toMatchObject({ confirmed: true });
    expect(f.ports.close).not.toHaveBeenCalled();
    expect(f.control.ownsThread("thread")).toBe(true);
    await f.control.dispose();
  });

  it("joins a held start and retirement through scoped cancellation and shutdown", async () => {
    const f = fixture(),
      operationId = randomUUID(),
      starting = Promise.withResolvers<{ threadId: string }>(),
      retiring = Promise.withResolvers<{ confirmed: boolean }>();
    await f.control.reserve({ version: 1, action: "prepare", operationId, threadId: "thread" });
    await expect(
      f.control.reserve({ version: 1, action: "prepare", operationId, threadId: "thread" }),
    ).rejects.toThrow("already used");
    await expect(
      f.control.reserve({ version: 1, action: "cancel", operationId, threadId: "foreign" }),
    ).rejects.toThrow("does not match");
    f.ports.start.mockReturnValue(starting.promise);
    f.ports.close.mockReturnValue(retiring.promise);
    const start = f.control.control({ version: 1, action: "start", operationId, launch });
    await vi.waitFor(() => expect(f.ports.start).toHaveBeenCalledOnce());
    let cancelled = false,
      disposed = false;
    const cancel = f.control
      .reserve({ version: 1, action: "cancel", operationId, threadId: "thread" })
      .then((result) => {
        cancelled = true;
        return result;
      });
    const dispose = f.control.dispose().then((result) => {
      disposed = true;
      return result;
    });
    await vi.waitFor(() => expect(f.ports.close).toHaveBeenCalledOnce());
    retiring.resolve({ confirmed: true });
    await Promise.resolve();
    expect(cancelled).toBe(false);
    expect(disposed).toBe(false);
    expect(f.control.ownsThread("thread")).toBe(true);
    starting.resolve({ threadId: "thread" });
    await expect(cancel).resolves.toMatchObject({ state: "cancelled", confirmed: true });
    await expect(start).resolves.toMatchObject({ state: "cancelled", confirmed: true });
    await expect(dispose).resolves.toBe(true);
    expect(f.control.ownsThread("thread")).toBe(false);
    await expect(
      f.control.reserve({ version: 1, action: "cancel", operationId, threadId: "thread" }),
    ).resolves.toMatchObject({ confirmed: true });
    await expect(
      f.control.reserve({
        version: 1,
        action: "prepare",
        operationId: randomUUID(),
        threadId: "thread",
      }),
    ).rejects.toThrow("shutting down");
  });

  it("rejects malformed/future reservations before either process port and never evicts a live reservation", async () => {
    const f = fixture(),
      operationId = randomUUID();
    const request = {
      version: 1 as const,
      action: "prepare" as const,
      operationId,
      threadId: "thread",
    };
    for (const change of [
      { version: 2 },
      { signal: {} },
      { operationId: "invalid" },
      { threadId: "" },
    ])
      await expect(f.control.reserve({ ...request, ...change } as never)).rejects.toThrow(Error);
    expect(f.ports.assertAvailable).not.toHaveBeenCalled();
    await f.control.reserve(request);
    for (let index = 0; index < 130; index++)
      await f.control.reserve({ ...request, action: "cancel", operationId: randomUUID() });
    expect(f.control.ownsThread("thread")).toBe(true);
    await f.control.reserve({ ...request, action: "cancel" });
    expect(f.control.ownsThread("thread")).toBe(false);
    expect(f.ports.start).not.toHaveBeenCalled();
    expect(f.ports.close).not.toHaveBeenCalled();
  });
});
