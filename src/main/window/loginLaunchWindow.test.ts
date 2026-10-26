import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_LAUNCH_WINDOW_DELAY_MS, deferLoginLaunchWindow } from "./loginLaunchWindow";

describe("deferLoginLaunchWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates nothing before the delay and one window once it passes", () => {
    const create = vi.fn<() => void>();
    deferLoginLaunchWindow(create, () => false);

    vi.advanceTimersByTime(LOGIN_LAUNCH_WINDOW_DELAY_MS - 1);
    expect(create).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(create).toHaveBeenCalledOnce();
  });

  it("does not create the window when the app is quitting", () => {
    const create = vi.fn<() => void>();
    deferLoginLaunchWindow(create, () => true);

    vi.advanceTimersByTime(LOGIN_LAUNCH_WINDOW_DELAY_MS);
    expect(create).not.toHaveBeenCalled();
  });
});
