import { afterEach, describe, expect, it, vi } from "vitest";
import type { AcpSessionActionContext, AcpSessionActionDescriptor } from "../base/types";
import {
  AcpSessionActionError,
  AcpSessionActionRegistry,
  type AcpSessionActionRegistryOptions,
} from "./sessionActions";

function action(overrides: Partial<AcpSessionActionDescriptor> = {}): AcpSessionActionDescriptor {
  return {
    id: "fixture.action",
    invoke: vi.fn<(payload: Record<string, unknown>) => Promise<Record<string, unknown>>>(
      async () => ({ ok: true }),
    ),
    ...overrides,
  };
}

function makeRegistry(
  actions: AcpSessionActionDescriptor[] = [action()],
  overrides: Partial<AcpSessionActionRegistryOptions> = {},
) {
  return new AcpSessionActionRegistry({
    threadId: "thread-1",
    getSessionId: () => "session-1",
    actions,
    ...overrides,
  });
}

describe("AcpSessionActionRegistry", () => {
  it("lists declared actions as metadata-only ids", () => {
    const registry = makeRegistry([
      action({ id: "fixture.rename" }),
      action({ id: "fixture.refresh" }),
    ]);

    expect(registry.listActions()).toEqual([{ id: "fixture.rename" }, { id: "fixture.refresh" }]);
  });

  it("rejects duplicate, empty, or callback-less descriptors at registration", () => {
    expect(() => makeRegistry([action(), action()])).toThrow(RangeError);
    expect(() => makeRegistry([action({ id: "" })])).toThrow(RangeError);
    expect(() => makeRegistry([action({ invoke: undefined as never })])).toThrow(RangeError);
  });

  it("invokes a declared action with a validated payload and live context", async () => {
    const invoke = vi.fn<
      (
        payload: Record<string, unknown>,
        ctx: AcpSessionActionContext,
      ) => Promise<Record<string, unknown>>
    >(async (payload) => ({ received: payload.name }));
    const validatePayload = vi.fn<(payload: unknown) => Record<string, unknown>>((payload) => {
      const record = payload as { name?: unknown };
      if (typeof record?.name !== "string") throw new Error("name is required");
      return { name: record.name.trim() };
    });
    const registry = makeRegistry([action({ invoke, validatePayload })]);

    await expect(registry.invoke("fixture.action", { name: " value " })).resolves.toEqual({
      received: "value",
    });
    expect(validatePayload).toHaveBeenCalledWith({ name: " value " });
    const [, ctx] = invoke.mock.calls[0]!;
    expect(ctx.threadId).toBe("thread-1");
    expect(ctx.sessionId).toBe("session-1");
    expect(ctx.signal.aborted).toBe(false);
  });

  it("applies the default object-shape validation when no validator is declared", async () => {
    const registry = makeRegistry();

    await expect(registry.invoke("fixture.action", null)).rejects.toMatchObject({
      reason: "invalid_payload",
    });
    await expect(registry.invoke("fixture.action", "scalar")).rejects.toMatchObject({
      reason: "invalid_payload",
    });
    await expect(registry.invoke("fixture.action", 42)).rejects.toMatchObject({
      reason: "invalid_payload",
    });
    await expect(registry.invoke("fixture.action", ["array"])).rejects.toMatchObject({
      reason: "invalid_payload",
    });
    await expect(registry.invoke("fixture.action", {})).resolves.toEqual({ ok: true });
  });

  it("maps a validator rejection to an invalid_payload failure", async () => {
    const registry = makeRegistry([
      action({
        validatePayload: () => {
          throw new Error("title must be a string");
        },
      }),
    ]);

    const error = await registry.invoke("fixture.action", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AcpSessionActionError);
    expect((error as AcpSessionActionError).reason).toBe("invalid_payload");
    expect((error as AcpSessionActionError).message).toBe("title must be a string");
    expect((error as AcpSessionActionError).data).toEqual({ actionId: "fixture.action" });
  });

  it("rejects a validator that returns a non-object", async () => {
    const registry = makeRegistry([action({ validatePayload: () => "normalized" as never })]);

    await expect(registry.invoke("fixture.action", {})).rejects.toMatchObject({
      reason: "invalid_payload",
    });
  });

  it("maps an invocation throw to a typed failed error with a bounded message", async () => {
    const long = "y".repeat(1_000);
    const registry = makeRegistry([
      action({
        invoke: () => {
          throw new Error(long);
        },
      }),
    ]);

    const error = (await registry
      .invoke("fixture.action", {})
      .catch((e: unknown) => e)) as AcpSessionActionError;
    expect(error.reason).toBe("failed");
    expect(error.message.length).toBeLessThanOrEqual(301);
    expect(error.data).toEqual({ actionId: "fixture.action" });
  });

  it("preserves typed errors thrown by the invocation", async () => {
    const registry = makeRegistry([
      action({
        invoke: () => {
          throw new AcpSessionActionError("failed", "fixture refused", { code: 7 });
        },
      }),
    ]);

    const error = (await registry
      .invoke("fixture.action", {})
      .catch((e: unknown) => e)) as AcpSessionActionError;
    expect(error.reason).toBe("failed");
    expect(error.message).toBe("fixture refused");
    expect(error.data).toEqual({ code: 7 });
  });

  it("rejects a non-object invocation result", async () => {
    const registry = makeRegistry([action({ invoke: async () => 5 as never })]);

    await expect(registry.invoke("fixture.action", {})).rejects.toMatchObject({
      reason: "failed",
    });
  });

  it("reports unknown action ids", async () => {
    const registry = makeRegistry();
    const error = (await registry
      .invoke("fixture.missing", {})
      .catch((e: unknown) => e)) as AcpSessionActionError;
    expect(error.reason).toBe("unknown_action");
    expect(error.data).toEqual({ actionId: "fixture.missing" });
  });

  it("aborts in-flight handlers on dispose and refuses further invocations", async () => {
    const contexts: AcpSessionActionContext[] = [];
    const registry = makeRegistry([
      action({
        invoke: async (_payload, ctx) => {
          contexts.push(ctx);
          return {};
        },
      }),
    ]);

    await registry.invoke("fixture.action", {});
    registry.dispose();
    expect(contexts[0]?.signal.aborted).toBe(false);

    const error = (await registry
      .invoke("fixture.action", {})
      .catch((e: unknown) => e)) as AcpSessionActionError;
    expect(error.reason).toBe("unavailable");
  });

  it("abortPending aborts in-flight handlers but keeps the registry usable", async () => {
    const contexts: AcpSessionActionContext[] = [];
    const registry = makeRegistry([
      action({
        invoke: async (_payload, ctx) => {
          contexts.push(ctx);
          return { ok: true };
        },
      }),
    ]);

    await registry.invoke("fixture.action", {});
    registry.abortPending();
    expect(contexts[0]?.signal.aborted).toBe(false);

    await expect(registry.invoke("fixture.action", {})).resolves.toEqual({ ok: true });
    expect(contexts[1]?.signal.aborted).toBe(false);
  });
});

afterEach(() => vi.useRealTimers());

describe("session action custody", () => {
  it.each(["abortPending", "dispose"] as const)(
    "rejects a late callback after %s even when it ignores cancellation",
    async (method) => {
      let resolve!: (value: Record<string, unknown>) => void;
      let signal!: AbortSignal;
      const registry = makeRegistry([
        action({
          invoke: (_payload, ctx) => {
            signal = ctx.signal;
            return new Promise((done) => {
              resolve = done;
            });
          },
        }),
      ]);
      const outcome = registry.invoke("fixture.action", {}).catch((error: unknown) => error);
      await Promise.resolve();
      registry[method]();
      expect(signal.aborted).toBe(true);
      expect(await outcome).toMatchObject({ reason: "unavailable" });
      resolve({ stale: true });
      await Promise.resolve();
    },
  );

  it("bounds a hung callback without requiring cooperation", async () => {
    vi.useFakeTimers();
    const registry = makeRegistry([action({ invoke: () => new Promise(() => {}) })], {
      actionTimeoutMs: 50,
    });
    const outcome = registry.invoke("fixture.action", {}).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome).toMatchObject({
      reason: "unavailable",
      message: "Session action timed out.",
    });
  });

  it("refuses a result after the live session id changes", async () => {
    let sessionId = "session-1";
    const registry = makeRegistry(
      [
        action({
          invoke: async () => {
            sessionId = "session-2";
            return { stale: true };
          },
        }),
      ],
      { getSessionId: () => sessionId },
    );
    await expect(registry.invoke("fixture.action", {})).rejects.toMatchObject({
      reason: "unavailable",
    });
  });

  it("rejects oversized or lossy data before invocation or delivery", async () => {
    const invoke = vi.fn<() => Promise<Record<string, unknown>>>(async () => ({ ok: true }));
    const registry = makeRegistry([action({ invoke })]);
    await expect(
      registry.invoke("fixture.action", { huge: "x".repeat(65536) }),
    ).rejects.toMatchObject({ reason: "invalid_payload" });
    await expect(registry.invoke("fixture.action", { value: undefined })).rejects.toMatchObject({
      reason: "invalid_payload",
    });
    expect(invoke).not.toHaveBeenCalled();
    const oversized = makeRegistry([
      action({ invoke: async () => ({ huge: "x".repeat(524288) }) }),
    ]);
    await expect(oversized.invoke("fixture.action", {})).rejects.toMatchObject({
      reason: "failed",
    });
  });
});
