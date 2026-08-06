import { describe, expect, it } from "vitest";
import { shouldPreventSystemSleep } from "./sleepPolicy";

describe("shouldPreventSystemSleep", () => {
  it("always keeps the system awake regardless of remote access or thread activity", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleep: "always",
          remoteAccessEnabled: false,
        },
        0,
      ),
    ).toBe(true);
    expect(
      shouldPreventSystemSleep(
        {
          preventSleep: "always",
          remoteAccessEnabled: true,
        },
        2,
      ),
    ).toBe(true);
  });

  it("while-remote-access keeps awake when remote access is enabled even with zero threads", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleep: "while-remote-access",
          remoteAccessEnabled: true,
        },
        0,
      ),
    ).toBe(true);
  });

  it("while-remote-access keeps awake when threads are working even if remote access is off", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleep: "while-remote-access",
          remoteAccessEnabled: false,
        },
        1,
      ),
    ).toBe(true);
  });

  it("while-remote-access allows sleep when remote access is off and no threads are working", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleep: "while-remote-access",
          remoteAccessEnabled: false,
        },
        0,
      ),
    ).toBe(false);
  });

  it("while-working only keeps awake when threads are working", () => {
    expect(
      shouldPreventSystemSleep(
        {
          preventSleep: "while-working",
          remoteAccessEnabled: true,
        },
        0,
      ),
    ).toBe(false);
    expect(
      shouldPreventSystemSleep(
        {
          preventSleep: "while-working",
          remoteAccessEnabled: false,
        },
        1,
      ),
    ).toBe(true);
  });
});
