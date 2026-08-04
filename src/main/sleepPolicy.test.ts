import { describe, expect, it } from "vitest";
import { shouldPreventSystemSleep } from "./sleepPolicy";

describe("shouldPreventSystemSleep", () => {
  it("keeps the system awake for a working thread when enabled", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleepWhileWorking: true,
          remoteAccessPreventSleep: false,
          remoteAccessEnabled: false,
        },
        1,
      ),
    ).toBe(true);
  });

  it("keeps the system awake for enabled remote access independently of thread activity", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleepWhileWorking: false,
          remoteAccessPreventSleep: true,
          remoteAccessEnabled: true,
        },
        0,
      ),
    ).toBe(true);
  });

  it("allows sleep when each active reason is opted out", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleepWhileWorking: false,
          remoteAccessPreventSleep: false,
          remoteAccessEnabled: true,
        },
        1,
      ),
    ).toBe(false);
  });
});
