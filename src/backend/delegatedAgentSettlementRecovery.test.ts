import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimePersistenceHealthListener } from "@/host/db/runtimePersistenceRuntime";
import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
} from "@/host/db/runtimePersistenceTypes";
import type {
  DelegatedAgentBootSettleReport,
  DelegatedAgentSettlementRefusal,
} from "./delegatedAgentBootSettle";

const mocks = vi.hoisted(() => ({
  listener: null as RuntimePersistenceHealthListener | null,
  unsubscribe: vi.fn<() => void>(),
  settle:
    vi.fn<
      (
        threadId: string,
        ids: ReadonlySet<string>,
        isActive: () => boolean,
      ) => Promise<RuntimeEvent[]>
    >(),
}));
vi.mock("@/host/db/runtimePersistenceRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/host/db/runtimePersistenceRuntime")>()),
  addRuntimePersistenceHealthListener: (listener: RuntimePersistenceHealthListener) => {
    mocks.listener = listener;
    return mocks.unsubscribe;
  },
}));
vi.mock("./delegatedAgentBootSettle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./delegatedAgentBootSettle")>()),
  settleDeferredDelegatedAgentRuns: mocks.settle,
}));
import { DelegatedAgentSettlementRecovery } from "./delegatedAgentSettlementRecovery";

const THREAD = "retired-thread";
function report(
  refusal: DelegatedAgentSettlementRefusal,
  itemId = "old",
): DelegatedAgentBootSettleReport {
  return {
    threads: 0,
    items: 0,
    settledBatches: [],
    deferredBatches: [
      {
        threadId: THREAD,
        itemIds: [itemId],
        refusal,
        error: new Error(refusal),
      },
    ],
  };
}
function commit() {
  mocks.listener!.onCapacityChange?.({
    generation: 1,
    revision: 1,
    throughPersistSeq: 1,
    kind: "committed",
    threadId: "unrelated",
  });
}
async function continuations() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

beforeEach(() => {
  mocks.settle.mockReset();
  mocks.unsubscribe.mockReset();
  mocks.listener = null;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("delegated-agent settlement continuation triggers", () => {
  it("leaves gap refusals quiet until explicit acknowledgement", async () => {
    const recovery = new DelegatedAgentSettlementRecovery(() => {});
    mocks.settle.mockResolvedValue([]);
    recovery.capture(report("gap"));
    vi.mocked(console.warn).mockClear();
    for (let index = 0; index < 20; index++) {
      commit();
      mocks.listener!.onThreadAccessAvailable?.("unrelated");
      mocks.listener!.onStateChange?.({
        state: "healthy",
        errorClass: null,
        pendingEvents: 0,
        pendingBytes: 0,
        contaminatedThreads: 1,
      });
      await continuations();
    }
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    await recovery.recoverAfterAcknowledgement(THREAD);
    expect(mocks.settle).toHaveBeenCalledOnce();
    await recovery.dispose();
  });

  it("retries busy captures only on access release and warns once per reason", async () => {
    const recovery = new DelegatedAgentSettlementRecovery(() => {});
    mocks.settle.mockRejectedValue(new RuntimePersistenceBusyError(THREAD, "mutation", 1));
    recovery.capture(report("busy"));
    await continuations();
    expect(mocks.settle).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledOnce();
    for (let index = 0; index < 3; index++) {
      commit();
      await continuations();
    }
    expect(mocks.settle).toHaveBeenCalledOnce();
    mocks.listener!.onThreadAccessAvailable?.("unrelated");
    await continuations();
    expect(mocks.settle).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledOnce();
    mocks.settle.mockResolvedValue([]);
    mocks.listener!.onThreadAccessAvailable?.(THREAD);
    await continuations();
    expect(mocks.settle).toHaveBeenCalledTimes(3);
    await recovery.dispose();
  });

  it("retries storage refusals on commits while keeping gap contamination quiet", async () => {
    const recovery = new DelegatedAgentSettlementRecovery(() => {});
    mocks.settle
      .mockRejectedValueOnce(new RuntimePersistenceDegradedError(THREAD, 1, 1, "storage", 1))
      .mockRejectedValueOnce(
        new RuntimePersistenceContaminatedError(THREAD, "unclean-epoch", 0, 0, 1),
      );
    recovery.capture(report("storage"));
    await continuations();
    mocks.listener!.onThreadAccessAvailable?.(THREAD);
    await continuations();
    expect(mocks.settle).toHaveBeenCalledOnce();
    commit();
    await continuations();
    expect(mocks.settle).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 5; index++) {
      commit();
      await continuations();
    }
    expect(mocks.settle).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(2);
    mocks.settle.mockResolvedValue([]);
    await recovery.recoverAfterAcknowledgement(THREAD);
    expect(mocks.settle).toHaveBeenCalledTimes(3);
    await recovery.dispose();
  });

  it("resumes a storage-refused capture when persistence becomes healthy", async () => {
    const recovery = new DelegatedAgentSettlementRecovery(() => {});
    mocks.settle
      .mockRejectedValueOnce(new RuntimePersistenceDegradedError(THREAD, 1, 1, "storage", 1))
      .mockResolvedValue([]);
    recovery.capture(report("storage"));
    await continuations();
    mocks.listener!.onStateChange?.({
      state: "healthy",
      errorClass: null,
      pendingEvents: 0,
      pendingBytes: 0,
      contaminatedThreads: 0,
    });
    await continuations();
    expect(mocks.settle).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledOnce();
    await recovery.dispose();
  });

  it("contains synchronous scheduling failures after an applied acknowledgement", async () => {
    const recovery = new DelegatedAgentSettlementRecovery(() => {});
    recovery.capture(report("gap"));
    mocks.settle.mockImplementation(() => {
      throw new Error("connection closed");
    });
    await expect(recovery.recoverAfterAcknowledgement(THREAD)).resolves.toBeUndefined();
    expect(mocks.settle).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledTimes(2);
    await recovery.dispose();
  });

  it("continues a new capture after reset forgets an in-flight capture", async () => {
    const recovery = new DelegatedAgentSettlementRecovery(() => {});
    let resolve!: (events: RuntimeEvent[]) => void;
    let active!: () => boolean;
    mocks.settle
      .mockImplementationOnce((_thread, _ids, isActive) => {
        active = isActive;
        return new Promise((done) => {
          resolve = done;
        });
      })
      .mockResolvedValue([]);
    recovery.capture(report("busy", "first-generation"));
    await continuations();
    recovery.forget(THREAD);
    expect(active()).toBe(false);
    recovery.capture(report("busy", "second-generation"));
    resolve([]);
    await continuations();
    expect(mocks.settle).toHaveBeenCalledTimes(2);
    expect([...mocks.settle.mock.calls[1]![1]]).toEqual(["second-generation"]);
    await recovery.dispose();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
