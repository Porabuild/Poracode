import { describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  OUTBOUND_RECONCILE_SLACK_BYTES,
  OutboundByteBudget,
  outboundFrameBytes,
  type OutboundBudgetLimits,
  type OutboundBudgetSocket,
} from "./outboundBudget";

/**
 * Minimal transport double with the real ws lifecycle: `terminate()` flips to
 * "closing" without releasing anything, and `receiveClose()` fires the
 * transport close event that actually releases the retained bytes. Tests can
 * also close synchronously inside the eviction hook to cover transports whose
 * close lands inline.
 */
class FakeSocket implements OutboundBudgetSocket {
  bufferedAmount = 0;
  terminated = false;
  private closeListeners: Array<() => void> = [];
  private closeReceived = false;

  once(event: "close", listener: () => void): this {
    if (event === "close") {
      if (this.closeReceived) listener();
      else this.closeListeners.push(listener);
    }
    return this;
  }

  /** `ws.terminate()`: synchronous CLOSING; bytes stay retained until close. */
  terminate(): void {
    this.terminated = true;
  }

  /** The transport `close` event (asynchronous in ws). Idempotent. */
  receiveClose(): void {
    if (this.closeReceived) return;
    this.closeReceived = true;
    for (const listener of this.closeListeners.splice(0)) listener();
  }
}

function createBudget(
  limits: OutboundBudgetLimits,
  options: { readonly closeOnEvict?: boolean } = {},
): { budget: OutboundByteBudget; evicted: FakeSocket[] } {
  const evicted: FakeSocket[] = [];
  const budget = new OutboundByteBudget(limits, (socket) => {
    const fake = socket as FakeSocket;
    fake.terminate();
    evicted.push(fake);
    if (options.closeOnEvict) fake.receiveClose();
  });
  return { budget, evicted };
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Condition not met in time.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("outbound frame size accounting", () => {
  it("charges the RFC 6455 header and the worst-case deflate expansion", () => {
    expect(outboundFrameBytes(0)).toBe(0);
    // 2-byte header and one stored-block + sync-flush allowance for small frames.
    expect(outboundFrameBytes(100)).toBe(100 + 2 + 10);
    // 126..65535 payloads carry a 4-byte header.
    expect(outboundFrameBytes(126)).toBe(126 + 4 + 10);
    expect(outboundFrameBytes(65_535)).toBe(65_535 + 4 + 10);
    // 64 KiB and up carries the 8-byte extended length (10-byte header total).
    expect(outboundFrameBytes(65_536)).toBe(65_536 + 10 + 15);
    expect(outboundFrameBytes(2 * 65_535)).toBe(2 * 65_535 + 10 + 15);
    // One stored-block allowance per 64 KiB of payload.
    expect(outboundFrameBytes(3 * 65_535)).toBe(3 * 65_535 + 10 + 20);
  });
});

describe("outbound byte budget accounting", () => {
  it("reserves and releases per principal and in total, exactly once", () => {
    const { budget } = createBudget({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 1_000,
    });
    const aliceSocket = new FakeSocket();
    const reservation = budget.tryReserve(aliceSocket, "alice", 100);
    expect(reservation).not.toBeNull();
    expect(budget.queuedBytesFor("alice")).toBe(100);
    expect(budget.queuedBytesFor("bob")).toBe(0);
    expect(budget.totalQueuedBytes).toBe(100);

    reservation!.release();
    reservation!.release();
    expect(budget.queuedBytesFor("alice")).toBe(0);
    expect(budget.totalQueuedBytes).toBe(0);
  });

  it("releases a socket's pending reservations on close, and late callbacks are no-ops", () => {
    const { budget } = createBudget({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 1_000,
    });
    const socket = new FakeSocket();
    const first = budget.tryReserve(socket, "alice", 100);
    const second = budget.tryReserve(socket, "alice", 50);
    expect(budget.totalQueuedBytes).toBe(150);

    socket.receiveClose();
    expect(budget.queuedBytesFor("alice")).toBe(0);
    expect(budget.totalQueuedBytes).toBe(0);

    first!.release();
    second!.release();
    expect(budget.totalQueuedBytes).toBe(0);
  });
});

describe("outbound byte budget enforcement", () => {
  it("evicts the offending principal's most congested socket but keeps its bytes reserved until close", () => {
    const { budget, evicted } = createBudget({
      maxQueuedBytesPerPrincipal: 100,
      maxTotalQueuedBytes: 1_000,
    });
    const congested = new FakeSocket();
    const recipient = new FakeSocket();
    const bobSocket = new FakeSocket();
    budget.tryReserve(congested, "alice", 60);
    budget.tryReserve(recipient, "alice", 30);
    budget.tryReserve(bobSocket, "bob", 80);

    // 60 + 30 + 20 would cross Alice's 100-byte budget: her most congested
    // socket is terminated, but its 60 bytes are still retained by the
    // transport, so the frame itself is refused rather than over-admitting.
    const reservation = budget.tryReserve(recipient, "alice", 20);
    expect(reservation).toBeNull();
    expect(evicted).toEqual([congested]);
    expect(congested.terminated).toBe(true);
    expect(recipient.terminated).toBe(false);
    expect(budget.queuedBytesFor("alice")).toBe(90);
    expect(budget.totalQueuedBytes).toBe(170);

    // Only the transport close releases the retained bytes, and then the
    // recipient can be admitted again.
    congested.receiveClose();
    expect(budget.queuedBytesFor("alice")).toBe(30);
    expect(budget.totalQueuedBytes).toBe(110);
    const retry = budget.tryReserve(recipient, "alice", 20);
    expect(retry).not.toBeNull();
    expect(budget.queuedBytesFor("alice")).toBe(50);
  });

  it("frees the evicted bytes inline when the transport closes synchronously", () => {
    const { budget, evicted } = createBudget(
      { maxQueuedBytesPerPrincipal: 100, maxTotalQueuedBytes: 1_000 },
      { closeOnEvict: true },
    );
    const congested = new FakeSocket();
    const recipient = new FakeSocket();
    budget.tryReserve(congested, "alice", 60);
    budget.tryReserve(recipient, "alice", 30);

    const reservation = budget.tryReserve(recipient, "alice", 20);
    expect(reservation).not.toBeNull();
    expect(evicted).toEqual([congested]);
    expect(recipient.terminated).toBe(false);
    expect(budget.queuedBytesFor("alice")).toBe(50);
  });

  it("evicts the largest contributor, never the healthy recipient, under global pressure", () => {
    const { budget, evicted } = createBudget({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 150,
    });
    const aliceSocket = new FakeSocket();
    const carolSocket = new FakeSocket();
    const bobSocket = new FakeSocket();
    budget.tryReserve(aliceSocket, "alice", 120);
    budget.tryReserve(carolSocket, "carol", 20);

    // 120 + 20 + 40 crosses the global budget; Alice is the largest
    // contributor and is shed. Carol survives and Bob is only refused while
    // Alice's retained bytes fill the global budget.
    const reservation = budget.tryReserve(bobSocket, "bob", 40);
    expect(reservation).toBeNull();
    expect(evicted).toEqual([aliceSocket]);
    expect(aliceSocket.terminated).toBe(true);
    expect(carolSocket.terminated).toBe(false);
    expect(bobSocket.terminated).toBe(false);
    expect(budget.totalQueuedBytes).toBe(140);

    aliceSocket.receiveClose();
    expect(budget.totalQueuedBytes).toBe(20);
    const retry = budget.tryReserve(bobSocket, "bob", 40);
    expect(retry).not.toBeNull();
    expect(budget.queuedBytesFor("bob")).toBe(40);
    expect(budget.totalQueuedBytes).toBe(60);
  });

  it("never evicts anyone for a frame that cannot fit under a budget by itself", () => {
    const { budget, evicted } = createBudget({
      maxQueuedBytesPerPrincipal: 100,
      maxTotalQueuedBytes: 1_000,
    });
    const existing = new FakeSocket();
    budget.tryReserve(existing, "alice", 50);
    const tooLarge = budget.tryReserve(new FakeSocket(), "alice", 120);
    expect(tooLarge).toBeNull();
    expect(evicted).toEqual([]);
    expect(existing.terminated).toBe(false);
    expect(budget.queuedBytesFor("alice")).toBe(50);

    const { budget: globalBudget, evicted: globalEvicted } = createBudget({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 100,
    });
    expect(globalBudget.tryReserve(new FakeSocket(), "alice", 101)).toBeNull();
    expect(globalEvicted).toEqual([]);
  });

  it("marks each victim once under repeated eviction and refuses when nothing is left to shed", () => {
    const { budget, evicted } = createBudget({
      maxQueuedBytesPerPrincipal: 100,
      maxTotalQueuedBytes: 1_000,
    });
    const sockets = [new FakeSocket(), new FakeSocket(), new FakeSocket(), new FakeSocket()];
    for (const socket of sockets.slice(0, 3)) budget.tryReserve(socket, "alice", 30);
    expect(budget.queuedBytesFor("alice")).toBe(90);

    // Each crossing attempt sheds exactly the most congested non-evicting
    // socket once (its bytes stay retained), then refuses the frame.
    for (const victim of sockets.slice(0, 3)) {
      expect(budget.tryReserve(sockets[3]!, "alice", 30)).toBeNull();
      expect(evicted).toContain(victim);
    }
    expect(evicted).toEqual([sockets[0], sockets[1], sockets[2]]);
    expect(new Set(evicted).size).toBe(3);
    // Nothing non-evicting is left to shed: refused without a fourth victim.
    expect(budget.tryReserve(sockets[3]!, "alice", 30)).toBeNull();
    expect(evicted).toHaveLength(3);
    expect(sockets[3]!.terminated).toBe(false);
    expect(budget.queuedBytesFor("alice")).toBe(90);

    // Close by close, the retained reservations drain and the socket recovers.
    sockets[0]!.receiveClose();
    expect(budget.queuedBytesFor("alice")).toBe(60);
    sockets[1]!.receiveClose();
    expect(budget.queuedBytesFor("alice")).toBe(30);
    sockets[2]!.receiveClose();
    expect(budget.queuedBytesFor("alice")).toBe(0);
    const retry = budget.tryReserve(sockets[3]!, "alice", 30);
    expect(retry).not.toBeNull();
    expect(budget.queuedBytesFor("alice")).toBe(30);
  });
});

describe("outbound byte budget ground-truth audit", () => {
  it("evicts a socket whose real queue exceeds accounted bytes beyond protocol slack", () => {
    const { budget, evicted } = createBudget({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 1_000,
    });
    const drifted = new FakeSocket();
    const healthy = new FakeSocket();
    budget.tryReserve(drifted, "alice", 10);
    budget.tryReserve(healthy, "bob", 10);

    // Unaccounted protocol frames (ping/pong/close) are tolerated...
    healthy.bufferedAmount = 10 + OUTBOUND_RECONCILE_SLACK_BYTES;
    drifted.bufferedAmount = 10 + OUTBOUND_RECONCILE_SLACK_BYTES + 1;
    budget.reconcile(OUTBOUND_RECONCILE_SLACK_BYTES);

    expect(evicted).toEqual([drifted]);
    expect(healthy.terminated).toBe(false);
    // The drifted socket's bytes stay reserved until its close, not at audit.
    expect(budget.queuedBytesFor("alice")).toBe(10);
    expect(budget.queuedBytesFor("bob")).toBe(10);
  });

  it("is conservative about over-accounting the transport cannot see", () => {
    const { budget, evicted } = createBudget({
      maxQueuedBytesPerPrincipal: 1_000,
      maxTotalQueuedBytes: 1_000,
    });
    const socket = new FakeSocket();
    budget.tryReserve(socket, "alice", 500);
    // Deflate-pipeline frames are charged at their framed, unfrozen size,
    // which is at least what `bufferedAmount` can report; a small reported
    // queue must never be treated as drift.
    socket.bufferedAmount = 0;
    budget.reconcile(OUTBOUND_RECONCILE_SLACK_BYTES);
    expect(evicted).toEqual([]);
    expect(socket.terminated).toBe(false);
  });

  it("releases an evicted account once its transport reports nothing retained", () => {
    const { budget } = createBudget({
      maxQueuedBytesPerPrincipal: 100,
      maxTotalQueuedBytes: 1_000,
    });
    const congested = new FakeSocket();
    const recipient = new FakeSocket();
    budget.tryReserve(congested, "alice", 60);
    budget.tryReserve(recipient, "alice", 30);
    expect(budget.tryReserve(recipient, "alice", 20)).toBeNull();
    expect(budget.queuedBytesFor("alice")).toBe(90);

    // The transport drained/destroyed without a close event yet: the account
    // is released from the audit because nothing is retained any more.
    congested.bufferedAmount = 0;
    budget.reconcile(OUTBOUND_RECONCILE_SLACK_BYTES);
    expect(budget.queuedBytesFor("alice")).toBe(30);
    congested.receiveClose();
    expect(budget.queuedBytesFor("alice")).toBe(30);
  });
});

describe("real ws transport release", () => {
  it("keeps an evicted socket's reservation until close, then frees it exactly once", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const address = wss.address() as AddressInfo;
    const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
    client.on("error", () => {});
    const serverWs = await new Promise<WebSocket>((resolve) => {
      wss.once("connection", (socket) => resolve(socket));
    });
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });
    // Freeze the peer so the server-side socket accumulates a real queue.
    (client as unknown as { _socket: { pause(): void } })._socket.pause();

    const payload = "w".repeat(4 * 1024 * 1024);
    const frameBytes = outboundFrameBytes(Buffer.byteLength(payload, "utf8"));
    const { budget, evicted } = createBudget({
      maxQueuedBytesPerPrincipal: frameBytes * 2 + 1_024,
      maxTotalQueuedBytes: frameBytes * 2 + 1_024,
    });

    let callbacks = 0;
    const first = budget.tryReserve(serverWs, "p", frameBytes);
    const second = budget.tryReserve(serverWs, "p", frameBytes);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    serverWs.send(payload, () => {
      callbacks += 1;
      first!.release();
    });
    serverWs.send(payload, () => {
      callbacks += 1;
      second!.release();
    });
    await waitForCondition(() => serverWs.bufferedAmount > 0);
    const accountedBeforeEviction = budget.queuedBytesFor("p");
    expect(accountedBeforeEviction).toBeGreaterThanOrEqual(serverWs.bufferedAmount);

    // A crossing reservation runs the real eviction path: the socket is
    // terminated for real, yet its queued bytes remain retained and reserved.
    const trigger = new FakeSocket();
    expect(budget.tryReserve(trigger, "p", frameBytes)).toBeNull();
    expect(evicted).toHaveLength(1);
    expect(evicted[0]).toBe(serverWs);
    expect(serverWs.readyState).toBe(WebSocket.CLOSING);
    expect(serverWs.bufferedAmount).toBeGreaterThan(0);
    expect(budget.queuedBytesFor("p")).toBe(accountedBeforeEviction);
    expect(callbacks).toBe(0);

    await new Promise<void>((resolve) => serverWs.once("close", () => resolve()));
    expect(budget.queuedBytesFor("p")).toBe(0);
    expect(budget.totalQueuedBytes).toBe(0);
    expect(callbacks).toBe(2);
    // Late releases from the write callbacks cannot free the bytes twice.
    first!.release();
    second!.release();
    expect(budget.queuedBytesFor("p")).toBe(0);

    // Capacity is reusable only because the transport actually released it.
    const after = budget.tryReserve(trigger, "p", frameBytes);
    expect(after).not.toBeNull();
    after!.release();

    trigger.receiveClose();
    client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
});
