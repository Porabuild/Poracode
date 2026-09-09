import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { type RealHostHandle } from "../harness/realHost.ts";
import { ProfileClient } from "./concurrencyProfileClient.ts";
import { summarizeLatencies } from "./profileMetrics.ts";
import { renameProjectAndAwaitFanout, type WorkloadProject } from "./sharedHostWorkload.ts";

vi.mock("./testClient.ts", () => ({
  issueTicket: vi.fn<() => Promise<{ status: number; ticket: string }>>(async () => ({
    status: 200,
    ticket: "ticket-1",
  })),
}));

/** Instances land here as ProfileClient.create constructs them, so tests can
 * inject frames and read the wire payload the way the real socket would. */
const sockets = vi.hoisted(() => ({
  list: [] as Array<{
    sent: string[];
    emit: (event: string, ...args: unknown[]) => void;
    receive: (payload: Buffer) => void;
  }>,
}));

vi.mock("ws", () => {
  class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    readyState = FakeWebSocket.OPEN;
    readonly sent: string[] = [];
    private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    constructor(public url: URL) {
      sockets.list.push(this);
      // Defer past ProfileClient's constructor so observers attach first, then
      // complete the ready handshake the real server delivers.
      queueMicrotask(() => {
        this.emit("open");
        queueMicrotask(() => this.receive(Buffer.from(JSON.stringify({ type: "ready", seq: 41 }))));
      });
    }
    on(event: string, handler: (...args: unknown[]) => void): void {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }
    once(event: string, handler: (...args: unknown[]) => void): void {
      const wrapped = (...args: unknown[]): void => {
        this.off(event, wrapped);
        handler(...args);
      };
      this.on(event, wrapped);
    }
    private off(event: string, handler: (...args: unknown[]) => void): void {
      const list = this.handlers.get(event) ?? [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    }
    send(payload: string): void {
      this.sent.push(payload);
    }
    close(): void {
      this.readyState = 3;
      this.emit("close");
    }
    terminate(): void {
      this.close();
    }
    emit(event: string, ...args: unknown[]): void {
      for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
    }
    receive(payload: Buffer): void {
      this.emit("message", payload);
    }
  }
  return { WebSocket: FakeWebSocket };
});

const handle = {
  httpBaseUrl: "http://127.0.0.1:9",
  wsBaseUrl: "ws://127.0.0.1:9",
} as RealHostHandle;
const project: WorkloadProject = { projectId: "p1", locationPath: "/tmp/p1" };

let client: ProfileClient;
let socket: (typeof sockets.list)[number];
let nowSpy: MockInstance | undefined;

async function receiveJson(message: Record<string, unknown>): Promise<void> {
  socket.receive(Buffer.from(JSON.stringify(message)));
}

beforeEach(async () => {
  client = await ProfileClient.create({ handle, label: "c1", accessToken: "token" });
  socket = sockets.list.at(-1)!;
});

afterEach(async () => {
  vi.useRealTimers();
  nowSpy?.mockRestore();
  nowSpy = undefined;
  vi.unstubAllGlobals();
  await client.close();
});

describe("ProfileClient timing clocks", () => {
  it("stamps event arrivals on the monotonic clock, never wall-clock epoch", async () => {
    await receiveJson({ type: "event", seq: 42, event: { type: "remote-projects-changed" } });
    const arrival = client.receivedEvents()[0]!.arrivedAtMs;
    expect(Number.isFinite(arrival)).toBe(true);
    expect(arrival).toBeLessThanOrEqual(performance.now());
    expect(arrival).toBeGreaterThan(performance.now() - 60_000);
    // Epoch now is ~1.7e12; a Date.now() regression lands far above this bound.
    expect(arrival).toBeLessThan(1e11);
  });

  it("keeps wire ping sentAt epoch while RTT stays monotonic", async () => {
    // ping() stays pending until the pong lands; the frame is on the wire
    // synchronously, so it can be read before answering.
    const pending = client.ping();
    const sent = JSON.parse(socket.sent.at(-1)!) as { type: string; id: string; sentAt: number };
    expect(sent.type).toBe("ping");
    // The server echoes sentAt opaquely (wsConnections.ts) — it must stay epoch.
    expect(sent.sentAt).toBeGreaterThan(1_700_000_000_000);
    expect(Math.abs(sent.sentAt - Date.now())).toBeLessThan(5_000);
    await receiveJson({ type: "pong", id: sent.id });
    await pending;
    const rtt = client.metrics.wsPingRttMs.at(-1)!;
    expect(rtt).toBeGreaterThanOrEqual(0);
    expect(rtt).toBeLessThan(1_000);
    expect(rtt).toBeLessThan(1e11);
  });

  it("keeps fetch durations sub-millisecond-precise on the monotonic clock", async () => {
    const clock = { value: 0 };
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock.value);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        clock.value = 5001.0; // stamp set when the response actually completes
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    clock.value = 5000.25;
    const result = await client.fetchJson("snapshot-read", "/api/snapshot");
    expect(result.elapsedMs).toBe(0.75);
    expect(client.metrics.controlLatenciesMs["snapshot-read"]).toEqual([0.75]);
  });

  it("settles an in-flight ping on server close and clears its monotonic stamp", async () => {
    const pending = client.ping();
    // Attach the rejection handler synchronously: the close below settles the
    // waiter mid-task, and the handler must exist before that runs.
    const settled = pending.then(
      () => {
        throw new Error("ping resolved despite server close");
      },
      (error: unknown) => {
        expect(String(error)).toContain("websocket closed while observers were pending");
      },
    );
    // Server-initiated close while the pong is outstanding: the ping waiter is
    // rejected through settleWaitersAndPongs, which must also clear every
    // monotonic send stamp without throwing (this path used to reference the
    // removed Date.now-based map and raised TypeError on teardown).
    socket.emit("close");
    await settled;
    await client.close();
    expect(client.metrics.wsPingRttMs).toHaveLength(0);
  });

  it("drops the monotonic stamp when the pong never arrives", async () => {
    vi.useFakeTimers();
    const pending = client.ping();
    const settled = pending.then(
      () => {
        throw new Error("ping resolved despite pong timeout");
      },
      (error: unknown) => {
        expect(String(error)).toContain("ping was never answered");
      },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    // The stamp left with the waiter: a late pong must record nothing.
    const sent = JSON.parse(socket.sent.at(-1)!) as { id: string };
    await receiveJson({ type: "pong", id: sent.id });
    expect(client.metrics.wsPingRttMs).toHaveLength(0);
  });
});

describe("renameProjectAndAwaitFanout propagation timing", () => {
  it("yields exact fractional negative propagation when the stream beats the response", async () => {
    const clock = { value: 0 };
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock.value);
    let release!: (body: unknown) => void;
    const gate = new Promise<Response>((resolve) => {
      release = (body: unknown) => {
        clock.value = 1002.25; // response-completion phase
        resolve(new Response(JSON.stringify(body), { status: 200 }));
      };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => gate),
    );

    clock.value = 1000.5; // request-start phase (helper + fetchJson entry)
    const pending = renameProjectAndAwaitFanout(client, [client], project, "unique-name-1");
    clock.value = 1001.125; // arrival phase: event lands before the response
    await receiveJson({
      type: "event",
      seq: 42,
      event: { type: "remote-projects-changed", projects: [{ id: "p1", name: "unique-name-1" }] },
    });
    release({ projects: [{ id: "p1", name: "unique-name-1" }] });
    const timings = await pending;

    // All dyadic fractions — exact in float64, no tolerance needed.
    expect(timings.propagationMs).toEqual([-1.125]);
    expect(timings.endToEndMs).toBe(0.625);
    expect(timings.responseMs).toBe(1.75);

    // The suite pushes these samples into metrics verbatim; the summary must
    // carry the negative sample through as a measurement, not clamp it.
    client.metrics.eventPropagationMs.push(...timings.propagationMs);
    expect(summarizeLatencies(client.metrics.eventPropagationMs).negativeCount).toBe(1);
    expect(summarizeLatencies(client.metrics.eventPropagationMs).p50Ms).toBe(-1.125);
  });
});
