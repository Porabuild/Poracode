import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCode2Client, V2Event } from "./clientTypes";
import { subscribeOpenCode2ServerEvents, waitForOpenCode2ServerEvents } from "./eventHub";

function streamHarness() {
  let deliver: ((event: V2Event) => void) | undefined;
  const queued: V2Event[] = [];
  let activity: (() => void) | undefined;
  const signals: AbortSignal[] = [];
  const client = {
    event: {
      async *subscribe({ signal, onActivity }: { signal: AbortSignal; onActivity: () => void }) {
        signals.push(signal);
        activity = onActivity;
        while (!signal.aborted) {
          const event =
            queued.shift() ??
            (await new Promise<V2Event>((resolve) => {
              deliver = resolve;
              signal.addEventListener(
                "abort",
                () => resolve({ type: "server.connected" } as V2Event),
                { once: true },
              );
            }));
          deliver = undefined;
          if (signal.aborted) return;
          yield event;
        }
      },
    },
  } as unknown as OpenCode2Client;
  return {
    client,
    signals,
    heartbeat: () => activity?.(),
    push(event: V2Event) {
      if (deliver) deliver(event);
      else queued.push(event);
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("OpenCode 2 event stream readiness", () => {
  it("waits for server.connected and shares readiness with later sessions", async () => {
    const { client, push } = streamHarness();
    const stop = subscribeOpenCode2ServerEvents({
      client,
      subscription: { sessionId: () => "s", onEvent: () => {} },
    });
    try {
      let ready = false;
      const waiting = waitForOpenCode2ServerEvents(client).then(() => {
        ready = true;
      });
      await Promise.resolve();
      expect(ready).toBe(false);
      push({ id: "connected", created: 1, type: "server.connected", data: {} } as V2Event);
      await waiting;
      await expect(waitForOpenCode2ServerEvents(client)).resolves.toBeUndefined();
    } finally {
      stop();
    }
  });

  it("rejects pending admission when disposed", async () => {
    const { client } = streamHarness();
    const stop = subscribeOpenCode2ServerEvents({
      client,
      subscription: { sessionId: () => "s", onEvent: () => {} },
    });
    const waiting = waitForOpenCode2ServerEvents(client);
    stop();
    await expect(waiting).rejects.toThrow("closed");
  });

  it("bounds the wait when a connection never opens", async () => {
    vi.useFakeTimers();
    const { client } = streamHarness();
    const stop = subscribeOpenCode2ServerEvents({
      client,
      subscription: { sessionId: () => "s", onEvent: () => {} },
    });
    await Promise.all([
      expect(waitForOpenCode2ServerEvents(client)).rejects.toThrow("timed out"),
      vi.advanceTimersByTimeAsync(15_000),
    ]);
    stop();
  });
});

it("keeps native 15-second keepalives connected and gates reconnection on recovery", async () => {
  vi.useFakeTimers();
  const { client, push, signals, heartbeat } = streamHarness();
  let finishRecovery: (() => void) | undefined;
  const onReconnect = vi.fn<() => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        finishRecovery = resolve;
      }),
  );
  const stop = subscribeOpenCode2ServerEvents({
    client,
    subscription: { sessionId: () => "s", onEvent: () => {}, onReconnect },
  });
  try {
    push({ type: "server.connected" } as V2Event);
    await waitForOpenCode2ServerEvents(client);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(15_001);
      heartbeat();
      expect(signals[0]!.aborted).toBe(false);
    }
    expect(signals).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(45_250);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals).toHaveLength(2);
    let ready = false;
    const waiting = waitForOpenCode2ServerEvents(client).then(() => {
      ready = true;
    });
    push({ type: "server.connected" } as V2Event);
    await vi.advanceTimersByTimeAsync(0);
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(ready).toBe(false);
    finishRecovery!();
    await waiting;
    expect(ready).toBe(true);
  } finally {
    stop();
  }
});

it("admits the stream when one session's recovery fails", async () => {
  const { client, push } = streamHarness();
  const goodReconnect = vi.fn<() => Promise<void>>(async () => {});
  const badReconnect = vi.fn<() => Promise<void>>(async () => {
    throw new Error("session deleted");
  });
  const stopGood = subscribeOpenCode2ServerEvents({
    client,
    subscription: { sessionId: () => "good", onEvent: () => {}, onReconnect: goodReconnect },
  });
  const stopBad = subscribeOpenCode2ServerEvents({
    client,
    subscription: { sessionId: () => "bad", onEvent: () => {}, onReconnect: badReconnect },
  });
  try {
    push({ type: "server.connected" } as V2Event);
    await waitForOpenCode2ServerEvents(client);
    // Second connection triggers per-session reconcile; the failing session
    // must not wedge admission for the healthy one.
    push({ type: "server.connected" } as V2Event);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await waitForOpenCode2ServerEvents(client);
    expect(goodReconnect).toHaveBeenCalled();
    expect(badReconnect).toHaveBeenCalled();
  } finally {
    stopGood();
    stopBad();
  }
});
