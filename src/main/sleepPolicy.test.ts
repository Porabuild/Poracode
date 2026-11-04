import { describe, expect, it } from "vitest";
import type { KeepAwakeCondition } from "@/shared/settings";
import {
  shouldPreventScreenLock,
  shouldPreventSystemSleep,
  type KeepAwakeActivity,
} from "./sleepPolicy";

const idle: KeepAwakeActivity = { workingThreadCount: 0, computerUseActive: false };
const working: KeepAwakeActivity = { workingThreadCount: 2, computerUseActive: false };
const computerUse: KeepAwakeActivity = { workingThreadCount: 0, computerUseActive: true };

function policy(conditions: KeepAwakeCondition[], remoteAccessEnabled = false) {
  return {
    sleep: { preventSleepWhen: conditions, preventScreenLockWhen: [], remoteAccessEnabled },
    lock: { preventSleepWhen: [], preventScreenLockWhen: conditions, remoteAccessEnabled },
  };
}

describe.each([
  ["shouldPreventSystemSleep", shouldPreventSystemSleep, "sleep"],
  ["shouldPreventScreenLock", shouldPreventScreenLock, "lock"],
] as const)("%s", (_name, evaluate, key) => {
  it("never prevents anything with no conditions", () => {
    const settings = policy([], true)[key];
    expect(evaluate(settings, idle)).toBe(false);
    expect(evaluate(settings, working)).toBe(false);
    expect(evaluate(settings, computerUse)).toBe(false);
  });

  it("always applies regardless of activity or remote access", () => {
    expect(evaluate(policy(["always"])[key], idle)).toBe(true);
    expect(evaluate(policy(["always"], true)[key], working)).toBe(true);
  });

  it("applies the working condition only while a thread works", () => {
    expect(evaluate(policy(["working"])[key], idle)).toBe(false);
    expect(evaluate(policy(["working"])[key], working)).toBe(true);
    // Remote access alone does not satisfy the working condition.
    expect(evaluate(policy(["working"], true)[key], idle)).toBe(false);
  });

  it("applies the computer-use condition only while a session is active", () => {
    expect(evaluate(policy(["computer-use"])[key], idle)).toBe(false);
    expect(evaluate(policy(["computer-use"])[key], working)).toBe(false);
    expect(evaluate(policy(["computer-use"])[key], computerUse)).toBe(true);
  });

  it("applies the remote-access condition only while remote access is enabled", () => {
    expect(evaluate(policy(["remote-access"])[key], working)).toBe(false);
    expect(evaluate(policy(["remote-access"], true)[key], idle)).toBe(true);
  });

  it("matches when any selected condition holds", () => {
    const settings = policy(["working", "remote-access"])[key];
    expect(evaluate(settings, idle)).toBe(false);
    expect(evaluate(settings, working)).toBe(true);
    expect(evaluate(policy(["working", "remote-access"], true)[key], idle)).toBe(true);
  });
});

describe("independent channels", () => {
  it("evaluates system sleep and screen lock from their own settings", () => {
    const settings = {
      preventSleepWhen: ["working"] as KeepAwakeCondition[],
      preventScreenLockWhen: ["computer-use"] as KeepAwakeCondition[],
      remoteAccessEnabled: false,
    };
    expect(shouldPreventSystemSleep(settings, working)).toBe(true);
    expect(shouldPreventScreenLock(settings, working)).toBe(false);
    expect(shouldPreventSystemSleep(settings, computerUse)).toBe(false);
    expect(shouldPreventScreenLock(settings, computerUse)).toBe(true);
  });
});
