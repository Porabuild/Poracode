import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../appStore";
import {
  __resetTruncateRecoveryForTest,
  finishTruncateReload,
  getAuthoritativeHistorySeq,
  getTruncateNeededSeq,
  isTruncateCheckpointLoaded,
  isTruncateReloadBudgetExhausted,
  isTruncateReloadInFlight,
  isTruncateReloadLeaseCurrent,
  noteTruncateNeeded,
  recordAuthoritativeHistoryInstall,
  resetTruncateRecoveryEpoch,
  resetTruncateReloadBackoff,
  shouldSuppressTruncatedReplay,
  tryBeginTruncateReload,
} from "./truncateRecovery";

describe("truncateRecovery authoritative baseline", () => {
  beforeEach(() => {
    __resetTruncateRecoveryForTest();
  });

  it("suppresses a replayed truncation at or before the installed seq", () => {
    recordAuthoritativeHistoryInstall("d1", "rt-1", 10);
    expect(getAuthoritativeHistorySeq("d1", "rt-1")).toBe(10);
    expect(shouldSuppressTruncatedReplay("d1", "rt-1", 10)).toBe(true);
    expect(shouldSuppressTruncatedReplay("d1", "rt-1", 7)).toBe(true);
    expect(shouldSuppressTruncatedReplay("d1", "rt-1", 11)).toBe(false);
  });

  it("isolates baselines per thread, not per server", () => {
    recordAuthoritativeHistoryInstall("d1", "rt-1", 10);
    expect(shouldSuppressTruncatedReplay("d1", "rt-2", 5)).toBe(false);
    expect(shouldSuppressTruncatedReplay("d1", "rt-1", 5)).toBe(true);
  });

  it("keeps the newest baseline and ignores older installs", () => {
    recordAuthoritativeHistoryInstall("d1", "rt-1", 8);
    recordAuthoritativeHistoryInstall("d1", "rt-1", 5);
    expect(getAuthoritativeHistorySeq("d1", "rt-1")).toBe(8);
    recordAuthoritativeHistoryInstall("d1", "rt-1", 12);
    expect(getAuthoritativeHistorySeq("d1", "rt-1")).toBe(12);
  });

  it("clears baselines on full epoch reset but preserves them on backoff-only reset", () => {
    recordAuthoritativeHistoryInstall("d1", "rt-1", 10);
    resetTruncateReloadBackoff("d1");
    expect(shouldSuppressTruncatedReplay("d1", "rt-1", 9)).toBe(true);
    resetTruncateRecoveryEpoch("d1");
    expect(shouldSuppressTruncatedReplay("d1", "rt-1", 9)).toBe(false);
    expect(getAuthoritativeHistorySeq("d1", "rt-1")).toBeUndefined();
  });
});

describe("truncateRecovery reload gate", () => {
  beforeEach(() => {
    __resetTruncateRecoveryForTest();
  });

  it("dedupes concurrent reloads for the same thread", () => {
    noteTruncateNeeded("d1", "rt-1", 30);
    const first = tryBeginTruncateReload("d1", "rt-1");
    expect(first).not.toBeNull();
    expect(tryBeginTruncateReload("d1", "rt-1")).toBeNull();
    expect(isTruncateReloadInFlight("d1", "rt-1")).toBe(true);
    const done = finishTruncateReload(first!, { installed: true, snapshotSeq: 30 });
    expect(done).toEqual({ stale: false, covered: true });
    expect(isTruncateReloadInFlight("d1", "rt-1")).toBe(false);
    noteTruncateNeeded("d1", "rt-1", 31);
    const second = tryBeginTruncateReload("d1", "rt-1");
    expect(second).not.toBeNull();
    finishTruncateReload(second!, { installed: true, snapshotSeq: 31 });
  });

  it("bounds failures per epoch and re-arms after covering success or epoch reset", () => {
    for (let i = 0; i < 3; i += 1) {
      noteTruncateNeeded("d1", "rt-1", 30);
      const lease = tryBeginTruncateReload("d1", "rt-1");
      expect(lease).not.toBeNull();
      finishTruncateReload(lease!, null);
    }
    expect(tryBeginTruncateReload("d1", "rt-1")).toBeNull();
    resetTruncateReloadBackoff("d1");
    noteTruncateNeeded("d1", "rt-1", 30);
    const retry = tryBeginTruncateReload("d1", "rt-1");
    expect(retry).not.toBeNull();
    const done = finishTruncateReload(retry!, { installed: true, snapshotSeq: 30 });
    expect(done.covered).toBe(true);
    noteTruncateNeeded("d1", "rt-1", 31);
    const again = tryBeginTruncateReload("d1", "rt-1");
    expect(again).not.toBeNull();
    finishTruncateReload(again!, { installed: true, snapshotSeq: 31 });
  });

  it("surfaces the exhaustion banner flag and clears it when recovery is re-armed", () => {
    const key = `d1\u0000rt-1`;
    noteTruncateNeeded("d1", "rt-1", 30);
    for (let i = 0; i < 3; i += 1) {
      const lease = tryBeginTruncateReload("d1", "rt-1");
      finishTruncateReload(lease!, null);
    }
    expect(isTruncateReloadBudgetExhausted("d1", "rt-1")).toBe(true);
    expect(useAppStore.getState().truncateReloadExhausted[key]).toBe(true);

    // Re-arming the budget (offline backoff reset) clears the banner.
    resetTruncateReloadBackoff("d1");
    expect(useAppStore.getState().truncateReloadExhausted[key]).toBeUndefined();

    // Exhausting again, then covering the pending truncation, clears it too.
    noteTruncateNeeded("d1", "rt-1", 30);
    for (let i = 0; i < 3; i += 1) {
      const lease = tryBeginTruncateReload("d1", "rt-1");
      finishTruncateReload(lease!, null);
    }
    expect(useAppStore.getState().truncateReloadExhausted[key]).toBe(true);
    const lease = tryBeginTruncateReload("d1", "rt-1");
    expect(lease).toBeNull();
  });

  it("tracks reloads per thread independently", () => {
    noteTruncateNeeded("d1", "rt-1", 10);
    noteTruncateNeeded("d1", "rt-2", 10);
    const first = tryBeginTruncateReload("d1", "rt-1");
    const second = tryBeginTruncateReload("d1", "rt-2");
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    finishTruncateReload(first!, { installed: true, snapshotSeq: 10 });
    finishTruncateReload(second!, null);
  });

  it("does not count a stale or additive snapshot as success", () => {
    noteTruncateNeeded("d1", "rt-1", 30);
    const first = tryBeginTruncateReload("d1", "rt-1");
    expect(first).not.toBeNull();
    const stale = finishTruncateReload(first!, { installed: false, snapshotSeq: 30 });
    expect(stale).toEqual({ stale: false, covered: false });
    expect(getTruncateNeededSeq("d1", "rt-1")).toBe(30);
    const second = tryBeginTruncateReload("d1", "rt-1");
    expect(second).not.toBeNull();
    const covered = finishTruncateReload(second!, { installed: true, snapshotSeq: 30 });
    expect(covered.covered).toBe(true);
    expect(getTruncateNeededSeq("d1", "rt-1")).toBeUndefined();
  });

  it("keeps pending when an installed snapshot predates a newer truncation", () => {
    noteTruncateNeeded("d1", "rt-1", 30);
    const first = tryBeginTruncateReload("d1", "rt-1");
    expect(first).not.toBeNull();
    noteTruncateNeeded("d1", "rt-1", 35);
    expect(getTruncateNeededSeq("d1", "rt-1")).toBe(35);
    const outdated = finishTruncateReload(first!, { installed: true, snapshotSeq: 32 });
    expect(outdated).toEqual({ stale: false, covered: false });
    const followUp = tryBeginTruncateReload("d1", "rt-1");
    expect(followUp).not.toBeNull();
    const done = finishTruncateReload(followUp!, { installed: true, snapshotSeq: 35 });
    expect(done.covered).toBe(true);
  });

  it("ignores a stale lease after an epoch bump so it never clears its replacement", () => {
    noteTruncateNeeded("d1", "rt-1", 30);
    const old = tryBeginTruncateReload("d1", "rt-1");
    expect(old).not.toBeNull();
    resetTruncateReloadBackoff("d1");
    expect(isTruncateReloadLeaseCurrent(old!)).toBe(false);
    noteTruncateNeeded("d1", "rt-1", 30);
    const next = tryBeginTruncateReload("d1", "rt-1");
    expect(next).not.toBeNull();
    expect(isTruncateReloadLeaseCurrent(next!)).toBe(true);
    const staleFinish = finishTruncateReload(old!, { installed: true, snapshotSeq: 30 });
    expect(staleFinish).toEqual({ stale: true, covered: false });
    expect(isTruncateReloadInFlight("d1", "rt-1")).toBe(true);
    expect(isTruncateReloadLeaseCurrent(next!)).toBe(true);
    const done = finishTruncateReload(next!, { installed: true, snapshotSeq: 30 });
    expect(done).toEqual({ stale: false, covered: true });
  });

  it("preserves pending across backoff resets but drops it on full epoch resets", () => {
    noteTruncateNeeded("d1", "rt-1", 30);
    resetTruncateReloadBackoff("d1");
    expect(getTruncateNeededSeq("d1", "rt-1")).toBe(30);
    resetTruncateRecoveryEpoch("d1");
    expect(getTruncateNeededSeq("d1", "rt-1")).toBeUndefined();
  });
});

describe("truncateRecovery checkpoint probe", () => {
  const original = useAppStore.getState();

  beforeEach(() => {
    __resetTruncateRecoveryForTest();
    useAppStore.setState({
      runtimeItemIdsByThread: { "proj-thread": ["a", "checkpoint", "b"] },
    });
  });

  it("reports loaded vs unknown checkpoints", () => {
    expect(isTruncateCheckpointLoaded("proj-thread", "checkpoint")).toBe(true);
    expect(isTruncateCheckpointLoaded("proj-thread", "missing")).toBe(false);
    expect(isTruncateCheckpointLoaded("other-thread", "checkpoint")).toBe(false);
    useAppStore.setState(original, true);
  });
});
