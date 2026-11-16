import { describe, expect, it, vi } from "vitest";
import type { Logger } from "@/shared/logger";
import { createEventInterestFailureReporter } from "./eventInterestFailures";

function logger() {
  return {
    debug: vi.fn<Logger["debug"]>(),
    info: vi.fn<Logger["info"]>(),
    warn: vi.fn<Logger["warn"]>(),
    error: vi.fn<Logger["error"]>(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createEventInterestFailureReporter", () => {
  it("ignores successful and synchronous results", async () => {
    const log = logger();
    const report = createEventInterestFailureReporter({ log });
    report(undefined);
    report(Promise.resolve());
    await settle();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("reports a failure, then at most once a minute with a suppressed count", async () => {
    const log = logger();
    let now = 0;
    const report = createEventInterestFailureReporter({ log, now: () => now });
    const failure = new Error("supervisor link down");

    report(Promise.reject(failure));
    await settle();
    expect(log.warn).toHaveBeenCalledExactlyOnceWith("event-interest update failed", failure);

    now = 30_000;
    report(Promise.reject(failure));
    report(Promise.reject(failure));
    await settle();
    expect(log.warn).toHaveBeenCalledOnce();

    now = 61_000;
    report(Promise.reject(failure));
    await settle();
    expect(log.warn).toHaveBeenLastCalledWith(
      "event-interest update failed (2 more since the last report)",
      failure,
    );
  });
});
