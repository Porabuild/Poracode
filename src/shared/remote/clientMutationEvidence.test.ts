import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRemoteTransportFailure,
  remoteMutationMayHaveCommitted,
  RemoteClientError,
  RemoteDesktopClient,
  type RemoteFetch,
} from "./client";
import { isAmbiguousRemoteMutationFailure } from "./clientErrors";

/**
 * Transport-side phase evidence for mutation ambiguity. These tests drive the
 * real `RemoteClientTransport` through public client methods so the evidence
 * (requestPhase / requestMayHaveCommitted) and the shared mutation rule are
 * exercised together, never constructed by hand.
 */

const endpoint = "http://127.0.0.1:38987/";

function neverRespondingFetch(): { fetchImpl: RemoteFetch; signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  return {
    signals,
    fetchImpl: (_url, init) => {
      const signal = init?.signal;
      if (signal) signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        );
      });
    },
  };
}

/**
 * A response whose body never completes; aborting the request errors the
 * stream the way a real transport aborts an in-flight body read.
 */
function pendingBodyFetch(): { fetchImpl: RemoteFetch; signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  return {
    signals,
    fetchImpl: (_url, init) => {
      const signal = init?.signal;
      if (signal) signals.push(signal);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener(
            "abort",
            () => controller.error(new DOMException("The operation was aborted.", "AbortError")),
            { once: true },
          );
        },
      });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
      );
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sendMutation(client: RemoteDesktopClient): Promise<void> {
  return client.sendThreadInput({ threadId: "t1", prompt: "hello", config: { model: "m" } });
}

/**
 * No public mutation method accepts a caller signal yet (`RemoteJsonRequestInit.signal`
 * is threaded only through the `threadHistory` read), so the abort contract of a
 * declared mutation is exercised through the real protected transport entry
 * point. This is the latent path the shared rule must classify correctly.
 */
class SignalCapableClient extends RemoteDesktopClient {
  callMutation(path: string, signal: AbortSignal): Promise<unknown> {
    return this.requestJson(path, {
      method: "POST",
      mutation: true,
      body: { prompt: "hi" },
      signal,
    });
  }
}

describe("remote transport mutation phase evidence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a dispatched mutation timeout as may-have-committed", async () => {
    vi.useFakeTimers();
    const { fetchImpl, signals } = neverRespondingFetch();
    const client = new RemoteDesktopClient(endpoint, "token", fetchImpl, { requestTimeoutMs: 10 });

    const pending = sendMutation(client).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    const error = await pending;

    expect(error).toBeInstanceOf(RemoteClientError);
    expect(error).toMatchObject({
      status: 0,
      code: "timeout",
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
    expect(signals[0]?.aborted).toBe(true);
  });

  it("keeps a dispatched read timeout definite: reads are never mutations", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = neverRespondingFetch();
    const client = new RemoteDesktopClient(endpoint, "token", fetchImpl, { requestTimeoutMs: 10 });

    const pending = client.threadHistory("t1").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    const error = await pending;

    expect(error).toMatchObject({
      status: 0,
      code: "timeout",
      requestPhase: "dispatched",
      requestMayHaveCommitted: false,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
  });

  it("wraps a raw transport drop with dispatch evidence and keeps the cause", async () => {
    const transportError = new TypeError("Failed to fetch");
    const client = new RemoteDesktopClient(endpoint, "token", async () => {
      throw transportError;
    });

    const error = await sendMutation(client).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(RemoteClientError);
    expect(error).toMatchObject({
      status: 0,
      code: "network",
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    expect((error as RemoteClientError).cause).toBe(transportError);
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
  });

  it("treats an HTTP 5xx after dispatch as ambiguous for a mutation but not for a read", async () => {
    const mutationClient = new RemoteDesktopClient(endpoint, "token", async () =>
      jsonResponse(500, { error: { code: "internal_error", message: "boom" } }),
    );
    const mutationError = await sendMutation(mutationClient).catch((value: unknown) => value);
    expect(mutationError).toMatchObject({
      status: 500,
      code: "internal_error",
      requestMayHaveCommitted: true,
    });
    expect(remoteMutationMayHaveCommitted(mutationError)).toBe(true);

    const readClient = new RemoteDesktopClient(endpoint, "token", async () =>
      jsonResponse(500, { error: { code: "internal_error", message: "boom" } }),
    );
    const readError = await readClient.threadHistory("t1").catch((value: unknown) => value);
    expect(readError).toMatchObject({ status: 500, requestMayHaveCommitted: false });
    expect(remoteMutationMayHaveCommitted(readError)).toBe(false);
  });

  it("keeps ordinary defined 4xx rejections definite", async () => {
    const client = new RemoteDesktopClient(endpoint, "token", async () =>
      jsonResponse(409, { error: { code: "command_id_conflict", message: "conflict" } }),
    );

    const error = await sendMutation(client).catch((value: unknown) => value);

    expect(error).toMatchObject({
      status: 409,
      code: "command_id_conflict",
      requestPhase: "dispatched",
      requestMayHaveCommitted: false,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
  });

  it("preserves the host's explicit uncertain 409 through the transport", async () => {
    const client = new RemoteDesktopClient(endpoint, "token", async () =>
      jsonResponse(409, {
        error: { code: "command_outcome_uncertain", message: "outcome uncertain" },
      }),
    );

    const error = await sendMutation(client).catch((value: unknown) => value);

    expect(error).toMatchObject({ status: 409, code: "command_outcome_uncertain" });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
  });

  it("refuses a pinned-certificate mismatch before dispatch without ambiguity", async () => {
    let fetchCalls = 0;
    const fetchImpl: RemoteFetch = async () => {
      fetchCalls += 1;
      return jsonResponse(200, { ok: true });
    };
    const client = new RemoteDesktopClient(endpoint, "token", fetchImpl, {
      certFingerprint: "aa",
      certFingerprintProbe: async () => "bb",
    });

    const error = await sendMutation(client).catch((value: unknown) => value);

    expect(fetchCalls).toBe(0);
    expect(error).toMatchObject({
      status: 502,
      code: "certificate_fingerprint_mismatch",
      requestPhase: "presend",
      requestMayHaveCommitted: false,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
  });

  it("keeps a pre-aborted caller signal presend and never dispatches", async () => {
    let fetchCalls = 0;
    const controller = new AbortController();
    controller.abort();
    const client = new RemoteDesktopClient(endpoint, "token", async () => {
      fetchCalls += 1;
      return jsonResponse(200, {});
    });

    const error = await client
      .threadHistory("t1", { signal: controller.signal })
      .catch((value: unknown) => value);

    expect(fetchCalls).toBe(0);
    expect(error).toMatchObject({
      status: 499,
      code: "cancelled",
      requestPhase: "presend",
      requestMayHaveCommitted: false,
    });
  });

  it("keeps a dispatched read cancellation definite and out of connection health", async () => {
    const { fetchImpl, signals } = neverRespondingFetch();
    const client = new RemoteDesktopClient(endpoint, "token", fetchImpl);
    const controller = new AbortController();

    const pending = client
      .threadHistory("t1", { signal: controller.signal })
      .catch((error: unknown) => error);
    controller.abort();
    const error = await pending;

    expect(signals[0]?.aborted).toBe(true);
    expect(error).toMatchObject({
      status: 499,
      code: "cancelled",
      requestPhase: "dispatched",
      requestMayHaveCommitted: false,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
    expect(isRemoteTransportFailure(error)).toBe(false);
  });

  it("keeps a pre-aborted caller signal on a declared mutation presend and definite", async () => {
    let fetchCalls = 0;
    const controller = new AbortController();
    controller.abort();
    const client = new SignalCapableClient(endpoint, "token", async () => {
      fetchCalls += 1;
      return jsonResponse(200, {});
    });

    const error = await client
      .callMutation("/api/threads/t1/send", controller.signal)
      .catch((value: unknown) => value);

    expect(fetchCalls).toBe(0);
    expect(error).toMatchObject({
      status: 499,
      code: "cancelled",
      requestPhase: "presend",
      requestMayHaveCommitted: false,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
  });

  it("classifies a dispatched caller abort of a declared mutation as may-have-committed", async () => {
    const { fetchImpl, signals } = neverRespondingFetch();
    const client = new SignalCapableClient(endpoint, "token", fetchImpl);
    const controller = new AbortController();

    const pending = client
      .callMutation("/api/threads/t1/send", controller.signal)
      .catch((error: unknown) => error);
    controller.abort();
    const error = await pending;

    expect(signals[0]?.aborted).toBe(true);
    expect(error).toMatchObject({
      status: 499,
      code: "cancelled",
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
    // A caller cancellation is still not a connection-health signal.
    expect(isRemoteTransportFailure(error)).toBe(false);
  });

  it("classifies an abort while awaiting a mutation response body as may-have-committed", async () => {
    const { fetchImpl, signals } = pendingBodyFetch();
    const client = new SignalCapableClient(endpoint, "token", fetchImpl);
    const controller = new AbortController();

    const pending = client
      .callMutation("/api/threads/t1/send", controller.signal)
      .catch((error: unknown) => error);
    // Drain the dispatch (and stream setup) before aborting mid-body.
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const error = await pending;

    expect(signals[0]?.aborted).toBe(true);
    expect(error).toMatchObject({
      status: 499,
      code: "cancelled",
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
  });

  it.each([401, 403, 429])(
    "keeps an HTTP %i rejection of a declared mutation definite",
    async (status) => {
      const client = new RemoteDesktopClient(endpoint, "token", async () =>
        jsonResponse(status, { error: { code: "rejected", message: "no" } }),
      );

      const error = await sendMutation(client).catch((value: unknown) => value);

      expect(error).toMatchObject({
        status,
        requestPhase: "dispatched",
        requestMayHaveCommitted: false,
      });
      expect(remoteMutationMayHaveCommitted(error)).toBe(false);
    },
  );
});

describe("shared mutation ambiguity rule", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats a dispatched cancellation as ambiguous even without a composed verdict", () => {
    const dispatched = new RemoteClientError("cancelled", 499, "cancelled", {
      requestPhase: "dispatched",
    });
    expect(isAmbiguousRemoteMutationFailure(499, "cancelled", "dispatched")).toBe(true);
    expect(remoteMutationMayHaveCommitted(dispatched)).toBe(true);
  });

  it("treats a presend cancellation as definite", () => {
    const presend = new RemoteClientError("cancelled", 499, "cancelled", {
      requestPhase: "presend",
    });
    expect(isAmbiguousRemoteMutationFailure(499, "cancelled", "presend")).toBe(false);
    expect(remoteMutationMayHaveCommitted(presend)).toBe(false);
    expect(
      remoteMutationMayHaveCommitted(new RemoteClientError("cancelled", 499, "cancelled")),
    ).toBe(false);
  });

  it("preserves explicitly trusted verdicts over the status rule", () => {
    const presendRefusal = new RemoteClientError(
      "pinned TLS refusal",
      502,
      "certificate_fingerprint_mismatch",
      {
        requestPhase: "presend",
        requestMayHaveCommitted: false,
      },
    );
    expect(remoteMutationMayHaveCommitted(presendRefusal)).toBe(false);

    const explicitAmbiguity = new RemoteClientError("response lost", 400, "bad_request", {
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    expect(remoteMutationMayHaveCommitted(explicitAmbiguity)).toBe(true);
  });

  it("follows a wrapper cause to the dispatched mutation evidence", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = neverRespondingFetch();
    const client = new RemoteDesktopClient(endpoint, "token", fetchImpl, { requestTimeoutMs: 10 });

    const pending = sendMutation(client).catch((value: unknown) => value);
    await vi.advanceTimersByTimeAsync(10);
    const error = await pending;
    const wrapper = new Error("The remote server is unreachable.", { cause: error });

    expect(remoteMutationMayHaveCommitted(wrapper)).toBe(true);
  });
});
