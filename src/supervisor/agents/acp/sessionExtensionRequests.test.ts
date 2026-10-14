import { RequestError } from "@agentclientprotocol/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpExtensionRequestContext } from "../base/types";
import {
  ACP_EXTENSION_REQUEST_DEFAULT_TIMEOUT_MS,
  AcpExtensionRequestError,
  AcpExtensionRequests,
  type AcpExtensionRequestsOptions,
} from "./sessionExtensionRequests";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeRequests(overrides: Partial<AcpExtensionRequestsOptions> = {}) {
  return new AcpExtensionRequests({
    threadId: "thread-1",
    getSessionId: () => "session-1",
    ...overrides,
  });
}

const handled = (result: Record<string, unknown>) => ({ handled: true as const, result });
const unhandled = { handled: false as const };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AcpExtensionRequests", () => {
  it("resolves a claimed request with the handler's typed result", async () => {
    const requests = makeRequests({
      handler: (_method, params) => handled({ echo: params.value }),
    });

    await expect(requests.handleRequest("fixture/ping", { value: 7 })).resolves.toEqual({
      handled: true,
      result: { echo: 7 },
    });
    expect(requests.pendingCount).toBe(0);
  });

  it("passes thread identity, live session id, and a live signal in the handler context", async () => {
    const contexts: AcpExtensionRequestContext[] = [];
    const requests = makeRequests({
      handler: (_method, _params, ctx) => {
        contexts.push(ctx);
        return handled({});
      },
    });

    await requests.handleRequest("fixture/ping", {});
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.threadId).toBe("thread-1");
    expect(contexts[0]?.sessionId).toBe("session-1");
    expect(contexts[0]?.signal.aborted).toBe(false);
  });

  it("reports an unclaimed request without keeping a pending entry", async () => {
    const requests = makeRequests({ handler: () => unhandled });

    await expect(requests.handleRequest("fixture/other", {})).resolves.toEqual({
      handled: false,
    });
    expect(requests.pendingCount).toBe(0);
  });

  it("answers without a handler as unhandled", async () => {
    const requests = makeRequests();
    await expect(requests.handleRequest("fixture/other", {})).resolves.toEqual({
      handled: false,
    });
  });

  it("rejects a request scoped to an unknown session", async () => {
    const requests = makeRequests({ handler: () => handled({}) });
    await expect(
      requests.handleRequest("fixture/ping", { sessionId: "other-session" }),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("rejects a session-scoped request while no session is open", async () => {
    const requests = makeRequests({
      getSessionId: () => undefined,
      handler: () => handled({}),
    });
    await expect(
      requests.handleRequest("fixture/ping", { sessionId: "session-1" }),
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("accepts a session-scoped request that matches the live session", async () => {
    const requests = makeRequests({ handler: () => handled({ ok: true }) });
    await expect(
      requests.handleRequest("fixture/ping", { sessionId: "session-1" }),
    ).resolves.toEqual({ handled: true, result: { ok: true } });
  });

  it("replays a typed handler error with its code and bounded data", async () => {
    const requests = makeRequests({
      handler: () => {
        throw new AcpExtensionRequestError(-32001, "fixture refusal", { detail: "why" });
      },
    });

    await expect(requests.handleRequest("fixture/ping", {})).rejects.toMatchObject({
      code: -32001,
      message: "fixture refusal",
      data: { detail: "why" },
    });
  });

  it("drops non-object data from a typed handler error", async () => {
    const requests = makeRequests({
      handler: () => {
        throw new AcpExtensionRequestError(-32001, "fixture refusal", "not-an-object" as never);
      },
    });

    const error = await requests.handleRequest("fixture/ping", {}).catch((e: unknown) => e);
    expect((error as RequestError).code).toBe(-32001);
    expect((error as RequestError).data).toBeUndefined();
  });

  it("maps an arbitrary handler throw to an internal error with a bounded message", async () => {
    const long = "x".repeat(1_000);
    const requests = makeRequests({
      handler: () => {
        throw new Error(long);
      },
    });

    const error = (await requests
      .handleRequest("fixture/ping", {})
      .catch((e: unknown) => e)) as RequestError;
    expect(error.code).toBe(-32603);
    // The SDK's internal-error shape carries the bounded detail in `data`.
    const detail = (error.data as { message?: string } | undefined)?.message ?? "";
    expect(detail.length).toBeLessThanOrEqual(301);
    expect(detail.startsWith("x")).toBe(true);
  });

  it("rejects a non-object handler result as a contract violation", async () => {
    const requests = makeRequests({
      handler: () => ({ handled: true, result: 42 as never }),
    });
    await expect(requests.handleRequest("fixture/ping", {})).rejects.toMatchObject({
      code: -32603,
    });
  });

  it("rejects a malformed handler outcome as a contract violation", async () => {
    const requests = makeRequests({
      handler: () => ({ handled: "yes" }) as never,
    });
    await expect(requests.handleRequest("fixture/ping", {})).rejects.toMatchObject({
      code: -32603,
    });
  });

  it("times out at the default bound and discards the late handler resolution", async () => {
    const settle = deferred<ReturnType<typeof handled>>();
    const contexts: AcpExtensionRequestContext[] = [];
    const requests = makeRequests({
      handler: (_method, _params, ctx) => {
        contexts.push(ctx);
        return settle.promise;
      },
    });

    const pending = requests.handleRequest("fixture/slow", {}).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(ACP_EXTENSION_REQUEST_DEFAULT_TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({
      code: -32800,
      data: { method: "fixture/slow", reason: "timeout" },
    });

    // The agent was answered exactly once (cancelled); a resolution that
    // arrives afterwards must be dropped, not delivered or thrown again.
    settle.resolve(handled({ late: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(contexts[0]?.signal.aborted).toBe(true);
    expect(requests.pendingCount).toBe(0);
  });

  it("honors the declared timeout override", async () => {
    const settle = deferred<ReturnType<typeof handled>>();
    const requests = makeRequests({
      requestTimeoutMs: 50,
      handler: () => settle.promise,
    });

    const pending = requests.handleRequest("fixture/slow", {}).catch((error: unknown) => error);
    // Just inside the overridden bound the resolution still lands.
    await vi.advanceTimersByTimeAsync(49);
    settle.resolve(handled({}));
    await expect(pending).resolves.toEqual({ handled: true, result: {} });
  });

  it("cancels every pending request exactly once and aborts its handlers", async () => {
    const first = deferred<ReturnType<typeof handled>>();
    const second = deferred<ReturnType<typeof handled>>();
    const contexts: AcpExtensionRequestContext[] = [];
    const requests = makeRequests({
      handler: (_method, _params, ctx) => {
        contexts.push(ctx);
        return contexts.length === 1 ? first.promise : second.promise;
      },
    });

    const settledFirst = requests.handleRequest("fixture/a", {}).catch((error: unknown) => error);
    const settledSecond = requests.handleRequest("fixture/b", {}).catch((error: unknown) => error);
    requests.cancelPending();
    await expect(settledFirst).resolves.toMatchObject({ code: -32800 });
    await expect(settledSecond).resolves.toMatchObject({ code: -32800 });
    expect(requests.pendingCount).toBe(0);
    expect(contexts.map((ctx) => ctx.signal.aborted)).toEqual([true, true]);

    // Late resolutions after cancellation are dropped without surfacing.
    first.resolve(handled({}));
    second.resolve(handled({}));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("refuses new requests after dispose", async () => {
    const requests = makeRequests({ handler: () => handled({}) });
    requests.dispose();
    await expect(requests.handleRequest("fixture/ping", {})).rejects.toMatchObject({
      code: -32601,
    });
  });

  it("cancels pending requests on dispose and ignores their late resolutions", async () => {
    const settle = deferred<ReturnType<typeof handled>>();
    const requests = makeRequests({ handler: () => settle.promise });

    const settled = requests.handleRequest("fixture/slow", {}).catch((error: unknown) => error);
    requests.dispose();
    await expect(settled).resolves.toMatchObject({ code: -32800 });

    settle.resolve(handled({}));
    await vi.advanceTimersByTimeAsync(0);
    expect(requests.pendingCount).toBe(0);
  });

  it("discards late resolutions from a previous session generation after reset", async () => {
    const stale = deferred<ReturnType<typeof handled>>();
    const requests = makeRequests({ handler: () => stale.promise });

    const settled = requests.handleRequest("fixture/slow", {}).catch((error: unknown) => error);
    requests.reset();
    await expect(settled).resolves.toMatchObject({ code: -32800 });

    stale.resolve(handled({ oldGeneration: true }));
    await vi.advanceTimersByTimeAsync(0);

    // The registry keeps serving the new generation.
    const fresh = makeRequests({ handler: () => handled({ fresh: true }) });
    await expect(fresh.handleRequest("fixture/ping", {})).resolves.toEqual({
      handled: true,
      result: { fresh: true },
    });
  });

  it("rejects an invalid timeout declaration at construction", () => {
    expect(() => makeRequests({ requestTimeoutMs: 0 })).toThrow(RangeError);
    expect(() => makeRequests({ requestTimeoutMs: -5 })).toThrow(RangeError);
    expect(() => makeRequests({ requestTimeoutMs: Number.NaN })).toThrow(RangeError);
    expect(() => makeRequests({ requestTimeoutMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});

describe("extension response boundary", () => {
  it("rejects results from a session whose identity changed during the handler", async () => {
    let sessionId = "session-1";
    const requests = makeRequests({
      getSessionId: () => sessionId,
      handler: () => {
        sessionId = "session-2";
        return handled({ stale: true });
      },
    });
    await expect(requests.handleRequest("fixture/ping", {})).rejects.toMatchObject({
      code: -32800,
    });
  });

  it("bounds params, results and typed error data without echoing them", async () => {
    const handler = vi.fn<() => ReturnType<typeof handled>>(() => handled({}));
    const requests = makeRequests({ handler });
    await expect(
      requests.handleRequest("fixture/ping", { huge: "x".repeat(1048576) }),
    ).rejects.toMatchObject({ code: -32602 });
    expect(handler).not.toHaveBeenCalled();
    const oversized = makeRequests({ handler: () => handled({ huge: "x".repeat(1048576) }) });
    await expect(oversized.handleRequest("fixture/ping", {})).rejects.toMatchObject({
      code: -32603,
    });
    const typed = makeRequests({
      handler: () => {
        throw new AcpExtensionRequestError(-32001, "refused", { huge: "x".repeat(65536) });
      },
    });
    const error = await typed.handleRequest("fixture/ping", {}).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: -32001, message: "refused" });
    expect(JSON.stringify(error)).not.toContain("xxxxx");
  });
});
