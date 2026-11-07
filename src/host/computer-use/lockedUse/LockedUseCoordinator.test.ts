import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ComputerUseLockedUseBeginResult,
  ComputerUseLockedUseStatus,
} from "@/shared/contracts/computerUse";
import type { ComputerUseDriver } from "../mcp/types";
import { LOCKED_USE_AUDIT_FILE_NAME } from "./constants";
import { createLockedUseAuditWriter, type LockedUseAuditEntry } from "./lockedUseAudit";
import {
  LOCKED_USE_IDLE_MS,
  LOCKED_USE_OVERLAY_SUBTITLE,
  LOCKED_USE_OVERLAY_TITLE,
  LockedUseCoordinator,
  type LockedUseCoordinatorOptions,
} from "./LockedUseCoordinator";

const LOCKED: ComputerUseLockedUseStatus = {
  supported: true,
  signed: true,
  paused: false,
  active: false,
  screenLocked: true,
};

function createHarness(
  overrides: Partial<Omit<LockedUseCoordinatorOptions, "driver">> & {
    begin?: ComputerUseLockedUseBeginResult;
  } = {},
) {
  let helper: ComputerUseLockedUseStatus = { ...LOCKED };
  const driver = {
    lockedUseBegin: vi.fn<NonNullable<ComputerUseDriver["lockedUseBegin"]>>(async () => {
      const result = overrides.begin ?? { outcome: "unlocked", approvalId: "a".repeat(64) };
      if (result.outcome === "unlocked" || result.outcome === "already_active") {
        helper = { ...helper, active: true, screenLocked: false };
      }
      return result;
    }),
    lockedUseEnd: vi.fn<NonNullable<ComputerUseDriver["lockedUseEnd"]>>(async () => {
      const wasActive = helper.active;
      helper = { ...helper, active: false, screenLocked: true };
      return { outcome: wasActive ? "relocked" : "inactive" };
    }),
    lockedUseStatus: vi.fn<NonNullable<ComputerUseDriver["lockedUseStatus"]>>(async () => helper),
  };
  const audit: LockedUseAuditEntry[] = [];
  const timers: Array<{ run: () => void; delayMs: number; cleared: boolean }> = [];
  const coordinator = new LockedUseCoordinator({
    driver,
    isSettingEnabled: () => true,
    isInstalled: async () => true,
    audit: (entry) => audit.push(entry),
    platform: "darwin",
    now: () => new Date("2026-11-04T12:00:00.000Z"),
    setTimer: (run, delayMs) => {
      const timer = { run, delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    ...overrides,
  });
  return {
    coordinator,
    driver,
    audit,
    timers,
    setHelper: (next: Partial<ComputerUseLockedUseStatus>) => {
      helper = { ...helper, ...next };
    },
  };
}

function startTurn(coordinator: LockedUseCoordinator, threadId = "t1"): void {
  coordinator.setTurnActive(threadId, true);
  coordinator.setSessionEnabled(threadId, true);
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("LockedUseCoordinator gating", () => {
  it("unlocks a locked Mac once for an eligible thread", async () => {
    const { coordinator, driver, audit } = createHarness();
    startTurn(coordinator);
    await expect(coordinator.prepare("t1", "list_windows")).resolves.toBeNull();
    expect(coordinator.ownerThreadId).toBe("t1");
    await coordinator.prepare("t1", "click");
    await coordinator.prepare("t1", "get_window_state");
    expect(driver.lockedUseBegin).toHaveBeenCalledExactlyOnceWith({
      threadId: "t1",
      overlayTitle: LOCKED_USE_OVERLAY_TITLE,
      overlaySubtitle: LOCKED_USE_OVERLAY_SUBTITLE,
      dimDisplay: false,
    });
    expect(audit).toEqual([
      { at: "2026-11-04T12:00:00.000Z", threadId: "t1", event: "begin", outcome: "unlocked" },
    ]);
  });

  it("passes the separate dimming opt-in to the native guard", async () => {
    const { coordinator, driver } = createHarness({ shouldDimDisplay: () => true });
    startTurn(coordinator);
    await coordinator.prepare("t1", "list_windows");
    expect(driver.lockedUseBegin).toHaveBeenCalledWith(
      expect.objectContaining({ dimDisplay: true }),
    );
  });

  it.each([
    ["the setting is off", { isSettingEnabled: () => false }],
    ["the plug-in is not installed", { isInstalled: async () => false }],
    ["the host is not macOS", { platform: "win32" as const }],
  ])("does nothing when %s", async (_label, overrides) => {
    const { coordinator, driver } = createHarness(overrides);
    startTurn(coordinator);
    await expect(coordinator.prepare("t1", "click")).resolves.toBeNull();
    expect(driver.lockedUseBegin).not.toHaveBeenCalled();
  });

  it("never starts an unlock after stop during the readiness read", async () => {
    const installed = Promise.withResolvers<boolean>();
    const { coordinator, driver } = createHarness({ isInstalled: () => installed.promise });
    startTurn(coordinator);
    const work = coordinator.prepare("t1", "click");
    await Promise.resolve();
    coordinator.setTurnActive("t1", false);
    installed.resolve(true);
    await work;
    expect(driver.lockedUseBegin).not.toHaveBeenCalled();
  });

  it("does not cancel readiness when an unrelated thread finishes", async () => {
    const installed = Promise.withResolvers<boolean>();
    const { coordinator, driver } = createHarness({ isInstalled: () => installed.promise });
    startTurn(coordinator);
    const work = coordinator.prepare("t1", "click");
    await Promise.resolve();
    coordinator.setTurnActive("unrelated", false);
    installed.resolve(true);
    await work;
    expect(driver.lockedUseBegin).toHaveBeenCalledOnce();
  });

  it.each(["stop", "disable", "setting", "reset"])(
    "cancels a pending native begin promptly on %s",
    async (reason) => {
      const began = Promise.withResolvers<ComputerUseLockedUseBeginResult>();
      const { coordinator, driver } = createHarness();
      driver.lockedUseBegin.mockReturnValue(began.promise);
      startTurn(coordinator);
      const work = coordinator.prepare("t1", "click");
      await vi.waitFor(() => expect(driver.lockedUseBegin).toHaveBeenCalledOnce());
      if (reason === "stop") coordinator.setTurnActive("t1", false);
      if (reason === "disable") coordinator.setSessionEnabled("t1", false);
      if (reason === "setting") await coordinator.settingChanged(false);
      if (reason === "reset") coordinator.resetTurns();
      expect(driver.lockedUseEnd).toHaveBeenCalledOnce();
      began.resolve({ outcome: "unlocked", approvalId: "a".repeat(64) });
      await work;
      expect(coordinator.ownerThreadId).toBeNull();
    },
  );

  it("requires a running turn and Computer Use enabled for the thread", async () => {
    const { coordinator, driver } = createHarness();
    coordinator.setSessionEnabled("t1", true);
    await coordinator.prepare("t1", "click");
    coordinator.setSessionEnabled("t1", false);
    coordinator.setTurnActive("t1", true);
    await coordinator.prepare("t1", "click");
    expect(driver.lockedUseBegin).not.toHaveBeenCalled();
  });

  it("never unlocks for api or disable, or when the screen is not locked", async () => {
    const { coordinator, driver, setHelper } = createHarness();
    startTurn(coordinator);
    await coordinator.prepare("t1", "api");
    await coordinator.prepare("t1", "disable");
    expect(driver.lockedUseStatus).not.toHaveBeenCalled();
    setHelper({ screenLocked: false });
    await coordinator.prepare("t1", "click");
    expect(driver.lockedUseBegin).not.toHaveBeenCalled();
  });

  it("lets only one thread own the session", async () => {
    const { coordinator, driver } = createHarness();
    startTurn(coordinator, "t1");
    startTurn(coordinator, "t2");
    await coordinator.prepare("t1", "click");
    await expect(coordinator.prepare("t2", "click")).resolves.toBeNull();
    expect(driver.lockedUseBegin).toHaveBeenCalledOnce();
    expect(coordinator.ownerThreadId).toBe("t1");
  });

  it("serializes concurrent first calls into one begin", async () => {
    const { coordinator, driver } = createHarness();
    startTurn(coordinator);
    await Promise.all([
      coordinator.prepare("t1", "click"),
      coordinator.prepare("t1", "list_windows"),
      coordinator.prepare("t1", "get_window_state"),
    ]);
    expect(driver.lockedUseBegin).toHaveBeenCalledOnce();
  });

  it.each([
    [{ outcome: "paused" as const }, "locked_use_paused"],
    [
      { outcome: "unavailable" as const, stage: "unsigned_build" },
      "locked_use_unavailable:unsigned_build",
    ],
    [{ outcome: "failed" as const, stage: "still_locked" }, "locked_use_failed:still_locked"],
  ])("returns a note for %o and does not retry this turn", async (begin, token) => {
    const { coordinator, driver, audit } = createHarness({ begin });
    startTurn(coordinator);
    const note = await coordinator.prepare("t1", "click");
    expect(note?.startsWith(`${token}:`)).toBe(true);
    await expect(coordinator.prepare("t1", "click")).resolves.toBe(note);
    expect(driver.lockedUseBegin).toHaveBeenCalledOnce();
    expect(coordinator.ownerThreadId).toBeNull();
    expect(audit).toEqual([
      expect.objectContaining({ event: "begin", threadId: "t1", outcome: begin.outcome }),
    ]);
    // A new turn may try again.
    coordinator.setTurnActive("t1", false);
    coordinator.setTurnActive("t1", true);
    await coordinator.prepare("t1", "click");
    expect(driver.lockedUseBegin).toHaveBeenCalledTimes(2);
  });

  it("refuses a thread id the helper would reject without calling it", async () => {
    const { coordinator, driver, audit } = createHarness();
    startTurn(coordinator, "thread with spaces");
    const note = await coordinator.prepare("thread with spaces", "click");
    expect(note?.startsWith("locked_use_unavailable:invalid_thread_id:")).toBe(true);
    expect(driver.lockedUseBegin).not.toHaveBeenCalled();
    expect(audit).toEqual([
      expect.objectContaining({ outcome: "unavailable", stage: "invalid_thread_id" }),
    ]);
  });

  it("reports a begin cancelled by the helper with its transport code", async () => {
    const { coordinator, driver } = createHarness();
    driver.lockedUseBegin.mockRejectedValueOnce(
      Object.assign(new Error("cancelled"), { code: "cancelled" }),
    );
    startTurn(coordinator);
    const note = await coordinator.prepare("t1", "click");
    expect(note?.startsWith("locked_use_failed:cancelled:")).toBe(true);
  });

  it("returns no note when the Mac turned out not to be locked", async () => {
    const { coordinator } = createHarness({ begin: { outcome: "not_locked" } });
    startTurn(coordinator);
    await expect(coordinator.prepare("t1", "click")).resolves.toBeNull();
    expect(coordinator.ownerThreadId).toBeNull();
  });
});

describe("LockedUseCoordinator end triggers", () => {
  it("relocks when the turn ends (stop and interrupt report the same)", async () => {
    const { coordinator, driver, audit } = createHarness();
    startTurn(coordinator);
    await coordinator.prepare("t1", "click");
    coordinator.setTurnActive("t1", false);
    await vi.waitFor(() =>
      expect(driver.lockedUseEnd).toHaveBeenCalledWith({ reason: "turn_end" }),
    );
    await vi.waitFor(() =>
      expect(audit.at(-1)).toEqual({
        at: "2026-11-04T12:00:00.000Z",
        threadId: "t1",
        event: "end",
        outcome: "relocked",
        reason: "turn_end",
      }),
    );
    expect(coordinator.ownerThreadId).toBeNull();
  });

  it("relocks on disable but ignores a thread that does not own the session", async () => {
    const { coordinator, driver } = createHarness();
    startTurn(coordinator, "t1");
    startTurn(coordinator, "t2");
    await coordinator.prepare("t1", "click");
    await coordinator.end("t2", "disabled");
    expect(driver.lockedUseEnd).not.toHaveBeenCalled();
    await coordinator.end("t1", "disabled");
    expect(driver.lockedUseEnd).toHaveBeenCalledWith({ reason: "disabled" });
  });

  it("relocks after five idle minutes and re-arms the timer on every owner call", async () => {
    const { coordinator, driver, timers } = createHarness();
    startTurn(coordinator);
    await coordinator.prepare("t1", "click");
    await coordinator.prepare("t1", "click");
    expect(timers).toHaveLength(2);
    expect(timers[0]).toMatchObject({ delayMs: LOCKED_USE_IDLE_MS, cleared: true });
    timers[1]?.run();
    await vi.waitFor(() => expect(driver.lockedUseEnd).toHaveBeenCalledWith({ reason: "idle" }));
  });

  it("records the user's exit without respawning the helper", async () => {
    const { coordinator, driver, audit } = createHarness();
    startTurn(coordinator);
    await coordinator.prepare("t1", "click");
    coordinator.revokeThreads(["t1"]);
    expect(driver.lockedUseEnd).not.toHaveBeenCalled();
    expect(coordinator.ownerThreadId).toBeNull();
    expect(audit.at(-1)).toMatchObject({
      event: "end",
      outcome: "helper_stopped",
      reason: "disabled",
    });
    await coordinator.prepare("t1", "click");
    expect(driver.lockedUseBegin).toHaveBeenCalledOnce();
  });

  it("audits a failed relock as relock_failed", async () => {
    const { coordinator, driver, audit } = createHarness();
    driver.lockedUseEnd.mockRejectedValueOnce(
      Object.assign(new Error("relock failed"), { code: "internal" }),
    );
    startTurn(coordinator);
    await coordinator.prepare("t1", "click");
    await coordinator.end("t1", "disabled");
    expect(audit.at(-1)).toMatchObject({ event: "end", outcome: "relock_failed" });
  });

  it("relocks on shutdown and admits nothing afterwards", async () => {
    const { coordinator, driver } = createHarness();
    startTurn(coordinator);
    await coordinator.prepare("t1", "click");
    await coordinator.shutdown();
    expect(driver.lockedUseEnd).toHaveBeenCalledWith({ reason: "shutdown" });
    await coordinator.prepare("t1", "click");
    expect(driver.lockedUseBegin).toHaveBeenCalledOnce();
  });

  it("relocks at once when the turn ends while the helper is unlocking", async () => {
    const { coordinator, driver } = createHarness();
    const gate = Promise.withResolvers<ComputerUseLockedUseBeginResult>();
    driver.lockedUseBegin.mockImplementationOnce(() => gate.promise);
    startTurn(coordinator);
    const pending = coordinator.prepare("t1", "click");
    await vi.waitFor(() => expect(driver.lockedUseBegin).toHaveBeenCalledOnce());
    coordinator.setTurnActive("t1", false);
    gate.resolve({ outcome: "unlocked" });
    await pending;
    expect(driver.lockedUseEnd).toHaveBeenCalledWith({ reason: "turn_end" });
    expect(coordinator.ownerThreadId).toBeNull();
  });

  it("notices a session the helper ended on its own and lets another thread begin", async () => {
    const { coordinator, driver, audit, setHelper } = createHarness();
    startTurn(coordinator, "t1");
    startTurn(coordinator, "t2");
    await coordinator.prepare("t1", "click");
    setHelper({ active: false, screenLocked: true, lastEnd: { reason: "local_input", atMs: 1 } });
    await coordinator.prepare("t2", "click");
    expect(audit).toContainEqual(
      expect.objectContaining({ threadId: "t1", event: "end", reason: "local_input" }),
    );
    expect(driver.lockedUseBegin).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: "t2" }),
    );
    expect(coordinator.ownerThreadId).toBe("t2");
  });
});

describe("locked use audit log", () => {
  it("appends private JSONL lines without secrets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "poracode-locked-use-audit-"));
    tempDirs.push(dir);
    const errors: unknown[] = [];
    const write = createLockedUseAuditWriter(join(dir, "computer-use"), (error) =>
      errors.push(error),
    );
    const { coordinator } = createHarness({ audit: write });
    startTurn(coordinator);
    await coordinator.prepare("t1", "type_text");
    await coordinator.end("t1", "disabled");
    const path = join(dir, "computer-use", LOCKED_USE_AUDIT_FILE_NAME);
    await vi.waitFor(() => expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2));
    const lines = readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([
      { at: "2026-11-04T12:00:00.000Z", threadId: "t1", event: "begin", outcome: "unlocked" },
      {
        at: "2026-11-04T12:00:00.000Z",
        threadId: "t1",
        event: "end",
        outcome: "relocked",
        reason: "disabled",
      },
    ]);
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(
        expect.arrayContaining(["at", "event", "outcome", "threadId"]),
      );
      expect(JSON.stringify(line)).not.toMatch(/approval|password|aaaa/iu);
    }
    const privateFile = process.platform === "win32" || (statSync(path).mode & 0o777) === 0o600;
    expect(privateFile).toBe(true);
    expect(errors).toEqual([]);
  });
});
