import { describe, expect, it } from "vitest";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { runIngressWork } from "./remoteAccessServerIngress";
import type { RemoteAccessServerHost } from "./remoteAccessServerTypes";

/**
 * The transport semaphore's internal early return (D4): a proxied upgrade
 * gives its ingress slot back at the relayed 101 while the operation keeps
 * running in `host.work`. These pin the counter arithmetic the real-server
 * suites cannot observe directly: one release, never negative, no double
 * release from the settling `finally`.
 */

const ADDRESS = "127.0.0.1";

type IngressHost = RemoteAccessServerHost & { ingressWorkCount: number };

function makeHost(
  overrides: Partial<
    Pick<
      RemoteAccessServerHost,
      | "maxConcurrentIngressWork"
      | "reservedIngressControlCapacity"
      | "maxConcurrentIngressWorkPerSource"
      | "reservedIngressControlCapacityPerSource"
      | "maxConcurrentIngressWorkPerAddress"
    >
  > = {},
): IngressHost {
  return {
    stopping: false,
    principalAdmission: { limits: { retryAfterMs: 1_000 } },
    maxConcurrentIngressWork: 8,
    reservedIngressControlCapacity: 1,
    maxConcurrentIngressWorkPerSource: 8,
    reservedIngressControlCapacityPerSource: 1,
    maxConcurrentIngressWorkPerAddress: 8,
    ingressWorkCount: 0,
    ingressWorkBySource: new WeakMap<object, number>(),
    ingressWorkByAddress: new Map<string, number>(),
    work: new AsyncWorkTracker(),
    ...overrides,
  } as unknown as IngressHost;
}

function counters(host: IngressHost, source: object) {
  return {
    total: host.ingressWorkCount,
    source: host.ingressWorkBySource.get(source),
    address: host.ingressWorkByAddress.get(ADDRESS),
  };
}

/** An admitted operation that stays pending until `settle`/`fail`. */
function admitHeld(host: IngressHost, source: object, workClass: "bulk" | "control" = "bulk") {
  const held = Promise.withResolvers<void>();
  let releaseIngress!: () => void;
  const operation = runIngressWork(
    host,
    (release) => {
      releaseIngress = release;
      return held.promise;
    },
    source,
    workClass,
    ADDRESS,
  );
  return {
    operation,
    releaseIngress: () => releaseIngress(),
    settle: () => held.resolve(),
    fail: () => held.reject(new Error("handshake failed")),
  };
}

async function expectHostBusy(operation: Promise<unknown>, message: string): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    code: "host_busy",
    status: 503,
    retryAfterMs: 1_000,
    message: expect.stringContaining(message),
  });
}

describe("runIngressWork early ingress release", () => {
  it("returns the slot once while the operation stays owned by host.work", async () => {
    const host = makeHost();
    const source = {};
    const held = admitHeld(host, source);
    expect(counters(host, source)).toEqual({ total: 1, source: 1, address: 1 });

    held.releaseIngress();
    held.releaseIngress();
    expect(counters(host, source)).toEqual({ total: 0, source: undefined, address: undefined });

    // Shutdown still joins the operation: the drain waits for it.
    let drained = false;
    const drain = host.work.drain().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(drained).toBe(false);

    held.settle();
    await held.operation;
    await drain;
    expect(drained).toBe(true);
    // The settling `finally` does not release a second time.
    expect(counters(host, source)).toEqual({ total: 0, source: undefined, address: undefined });
  });

  it("lets new work in on the returned slot while the released operation still runs", async () => {
    const host = makeHost({ maxConcurrentIngressWorkPerAddress: 1 });
    const upgrade = admitHeld(host, {});
    await expectHostBusy(
      runIngressWork(host, () => "request", {}, "bulk", ADDRESS),
      "This client address has too much work in flight",
    );

    upgrade.releaseIngress();
    await expect(runIngressWork(host, () => "request", {}, "bulk", ADDRESS)).resolves.toBe(
      "request",
    );
    expect(host.ingressWorkCount).toBe(0);

    upgrade.settle();
    await upgrade.operation;
    expect(host.ingressWorkCount).toBe(0);
  });

  it("releases an operation that never returns early exactly once when it settles or fails", async () => {
    const host = makeHost();
    const source = {};
    const ordinary = admitHeld(host, source);
    const failed = admitHeld(host, source);
    expect(counters(host, source)).toEqual({ total: 2, source: 2, address: 2 });

    ordinary.settle();
    await ordinary.operation;
    expect(counters(host, source)).toEqual({ total: 1, source: 1, address: 1 });
    failed.fail();
    await expect(failed.operation).rejects.toThrow("handshake failed");
    expect(counters(host, source)).toEqual({ total: 0, source: undefined, address: undefined });

    // A synchronous throw, and a release followed by a failure, also return
    // exactly one slot.
    await expect(
      runIngressWork(
        host,
        () => {
          throw new Error("invalid upgrade");
        },
        source,
        "bulk",
        ADDRESS,
      ),
    ).rejects.toThrow("invalid upgrade");
    const releasedThenFailed = admitHeld(host, source);
    releasedThenFailed.releaseIngress();
    releasedThenFailed.fail();
    await expect(releasedThenFailed.operation).rejects.toThrow("handshake failed");
    expect(counters(host, source)).toEqual({ total: 0, source: undefined, address: undefined });
  });

  it("keeps the per-source bound, the bulk ceiling, and the control reserve", async () => {
    // Bulk may use 2 of 3 global slots and 1 of a source's 2.
    const host = makeHost({
      maxConcurrentIngressWork: 3,
      reservedIngressControlCapacity: 1,
      maxConcurrentIngressWorkPerSource: 2,
      reservedIngressControlCapacityPerSource: 1,
    });
    const first = {};
    const second = {};
    const held = [admitHeld(host, first)];
    await expectHostBusy(
      runIngressWork(host, () => "bulk", first, "bulk", ADDRESS),
      "This client has too much work in flight",
    );
    held.push(admitHeld(host, second));
    await expectHostBusy(
      runIngressWork(host, () => "bulk", {}, "bulk", ADDRESS),
      "The host is busy",
    );
    // A Stop still lands on the reserved control slot, up to the absolute max.
    held.push(admitHeld(host, first, "control"));
    expect(host.ingressWorkCount).toBe(3);
    await expectHostBusy(
      runIngressWork(host, () => "control", {}, "control", ADDRESS),
      "The host is busy",
    );

    for (const operation of held) {
      operation.settle();
      await operation.operation;
    }
    expect(counters(host, first)).toEqual({ total: 0, source: undefined, address: undefined });
    expect(host.ingressWorkBySource.get(second)).toBeUndefined();
  });
});
