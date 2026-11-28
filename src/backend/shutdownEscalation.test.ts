import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShutdownEscalation, LATE_SHUTDOWN_EXIT_MS } from "./shutdownEscalation";

function createHarness() {
  let stopping = false;
  const stop = vi.fn<() => void>(() => {
    stopping = true;
  });
  const onGraceElapsed = vi.fn<() => void>();
  const escalation = createShutdownEscalation({ isStopping: () => stopping, stop, onGraceElapsed });
  return { escalation, onGraceElapsed, stop };
}

describe("createShutdownEscalation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the graceful stop and leaves it to finish when the process was idle", () => {
    const { escalation, onGraceElapsed, stop } = createHarness();

    escalation.receive();
    vi.advanceTimersByTime(LATE_SHUTDOWN_EXIT_MS * 3);

    expect(stop).toHaveBeenCalledOnce();
    expect(escalation.isLate()).toBe(false);
    expect(onGraceElapsed).not.toHaveBeenCalled();
  });

  it("raises the elapsed grace one grace after a signal reaches a stop already in flight", () => {
    const { escalation, onGraceElapsed } = createHarness();

    escalation.receive();
    escalation.receive();
    expect(escalation.isLate()).toBe(true);

    vi.advanceTimersByTime(LATE_SHUTDOWN_EXIT_MS - 1);
    expect(onGraceElapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onGraceElapsed).toHaveBeenCalledOnce();
  });

  it("never restarts or shortens the grace for a repeated signal", () => {
    const { escalation, onGraceElapsed } = createHarness();

    escalation.receive();
    escalation.receive();
    vi.advanceTimersByTime(LATE_SHUTDOWN_EXIT_MS / 2);
    escalation.receive();
    vi.advanceTimersByTime(LATE_SHUTDOWN_EXIT_MS / 2 - 1);

    expect(onGraceElapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onGraceElapsed).toHaveBeenCalledOnce();
  });
});
