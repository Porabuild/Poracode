// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProductAnalyticsEventName,
  ProductAnalyticsProperties,
} from "@/shared/analytics/posthogPrivacy";
import { createProductViewTracker } from "./productViewTracker";

describe("product view tracker", () => {
  const capture =
    vi.fn<(event: ProductAnalyticsEventName, properties: ProductAnalyticsProperties) => void>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    capture.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createTracker() {
    return createProductViewTracker({
      capture,
      clearTimeout,
      now: Date.now,
      setTimeout,
    });
  }

  const homeView = {
    key: "app:home",
    seenEvent: "app.view_seen",
    durationEvent: "app.view_duration",
    properties: { view_kind: "home" },
  } as const;

  it("captures a seen event only after one continuous visible second", () => {
    const tracker = createTracker();
    tracker.setVisible(true);
    tracker.setView(homeView);

    vi.advanceTimersByTime(999);
    expect(capture).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(capture).toHaveBeenCalledWith("app.view_seen", { view_kind: "home" });

    vi.advanceTimersByTime(1_500);
    tracker.finish();
    expect(capture).toHaveBeenLastCalledWith("app.view_duration", {
      duration_bucket: "lt_10s",
      duration_ms: 2_500,
      view_kind: "home",
    });
  });

  it("drops views replaced before the threshold", () => {
    const tracker = createTracker();
    tracker.setVisible(true);
    tracker.setView(homeView);
    vi.advanceTimersByTime(800);
    tracker.setView({
      ...homeView,
      key: "app:schedules",
      properties: { view_kind: "schedules" },
    });
    vi.advanceTimersByTime(999);

    expect(capture).not.toHaveBeenCalled();
  });

  it("restarts the threshold when an unseen view is hidden", () => {
    const tracker = createTracker();
    tracker.setVisible(true);
    tracker.setView(homeView);
    vi.advanceTimersByTime(800);
    tracker.setVisible(false);
    vi.advanceTimersByTime(5_000);
    tracker.setVisible(true);
    vi.advanceTimersByTime(999);
    expect(capture).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("excludes hidden time from a seen view's duration", () => {
    const tracker = createTracker();
    tracker.setVisible(true);
    tracker.setView(homeView);
    vi.advanceTimersByTime(1_500);
    tracker.setVisible(false);
    vi.advanceTimersByTime(10_000);
    tracker.setVisible(true);
    vi.advanceTimersByTime(500);
    tracker.finish();

    expect(capture).toHaveBeenLastCalledWith("app.view_duration", {
      duration_bucket: "lt_10s",
      duration_ms: 2_000,
      view_kind: "home",
    });
  });
});
