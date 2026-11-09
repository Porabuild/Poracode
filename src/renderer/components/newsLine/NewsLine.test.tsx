import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ProfileCoreStats } from "@/shared/contracts";
import type { ChangelogRelease } from "@/shared/changelog";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useChangelogStore } from "@/renderer/state/changelogStore";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { NEWS_LINE_STORAGE_KEYS, useNewsLineStore } from "@/renderer/state/newsLineStore";
import { COMMUNITY_PROMOTION_URLS } from "@/shared/communityLinks";
import { NEWS_LONG_DWELL_MS, NEWS_ROTATE_MS, NEWS_TYPING_PAUSE_MS, NewsLine } from "./NewsLine";
import { resetNewsVisit } from "./newsVisit";
import { resetProfileStatsCache } from "./useProfileStats";
import { useFeatureUsageStore } from "@/renderer/state/featureUsageStore";
import { useNewsFeedStore } from "@/renderer/state/newsFeedStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { NEWS_FEED_VERSION, parseNewsFeed } from "@/shared/newsFeed";

const mocks = vi.hoisted(() => ({
  stats: null as unknown,
  browserClient: false,
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  openExternalNative: vi.fn<(url: string) => Promise<void>>(),
  openProfileSettings: vi.fn<() => void>(),
  runPalette: vi.fn<() => void>(),
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({
    appVersion: "1.8.2",
    platform: "win32",
    openExternal: mocks.openExternal,
    openExternalNative: mocks.openExternalNative,
    getSchedules: () => Promise.resolve([]),
    getProfileCoreStats: () =>
      mocks.stats ? Promise.resolve(mocks.stats) : Promise.reject(new Error("unavailable")),
  }),
}));

vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  isBrowserClientRuntime: () => mocks.browserClient,
}));

vi.mock("@/renderer/actions/panelActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/panelActions")>()),
  openProfileSettings: mocks.openProfileSettings,
}));

vi.mock("@/renderer/commands/registry", () => ({
  buildCommandRegistry: () => [{ id: "palette.open", run: mocks.runPalette }],
  buildWhenContext: () => ({}),
  isCommandAvailable: () => true,
}));

const releases: ChangelogRelease[] = [
  {
    version: "1.8.2",
    date: "2026-10-11",
    title: "Steady sessions",
    summary: "Summary.",
    changes: [
      {
        kind: "added",
        label: "Themes",
        text: "Create and edit custom light and dark palettes with live previews.",
        headline: "Create your own light and dark palettes",
      },
      { kind: "improved", label: "Chat", text: "Question forms show numbered answers." },
    ],
  },
];

function streakStats(): ProfileCoreStats {
  return {
    totals: {
      totalThreads: 3,
      totalPrompts: 3,
      messagesSent: 3,
      goalsSet: 0,
      longestTaskMs: 0,
      currentStreakDays: 6,
      longestStreakDays: 11,
      activeDays: 6,
    },
    insights: {
      fastModePercent: 0,
      skillsExplored: 0,
      totalSkillsUsed: 0,
      workflowRuns: 0,
      subagentRuns: 0,
      mcpToolCalls: 0,
    },
    promptHeatmap: { metric: "prompts", windowDays: 7, max: 0, cells: [] },
  } as unknown as ProfileCoreStats;
}

const dismissPromotion = vi.fn<(id: string) => void>((id) =>
  useSharedSettings.setState((state) => ({
    dismissedPromotions: [...state.dismissedPromotions, id],
  })),
);

function currentKind(): string | null {
  return document.querySelector("[data-news-item]")?.getAttribute("data-news-kind") ?? null;
}

function currentId(): string | null {
  return document.querySelector("[data-news-item]")?.getAttribute("data-news-item") ?? null;
}

function advanceTo(kind: string) {
  for (let step = 0; step < 12 && currentKind() !== kind; step++) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  expect(currentKind()).toBe(kind);
}

// jsdom has no Web Animations API; the line skips its entrance without it.
function stubElementAnimate() {
  const animate = vi.fn<(keyframes: unknown, options?: unknown) => void>();
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animate,
  });
  return animate;
}

describe("NewsLine", () => {
  beforeEach(() => {
    localStorage.clear();
    resetNewsVisit();
    resetProfileStatsCache();
    mocks.stats = null;
    mocks.browserClient = false;
    mocks.openExternal.mockReset().mockResolvedValue(undefined);
    mocks.openExternalNative.mockReset().mockResolvedValue(undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    useSharedSettings.setState({
      newsLineEnabled: true,
      newsLineActivity: true,
      dismissedPromotions: [],
      dismissPromotion,
    } as never);
    useChangelogStore.setState({ releases });
    useKeybindingStore.setState({ keybindings: [{ command: "palette.open", key: "ctrl+k" }] });
    useProviderUsageStore.setState({ snapshots: {} });
    useNewsLineStore.setState({
      highlightHistory: { shown: {}, retired: [] },
      discoveryHistory: {},
      hiddenIds: [],
      sessionHiddenIds: [],
    });
    useFeatureUsageStore.setState({ signals: {} });
    // A fresh cache: the line must never reach the real network in tests.
    useNewsFeedStore.setState({ feed: null, fetchedAt: Date.now(), failedAt: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    dismissPromotion.mockClear();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it("shows an activity insight and opens Profile from it", async () => {
    mocks.stats = streakStats();
    render(<NewsLine />);
    await act(async () => {});
    advanceTo("insight");
    expect(screen.getByRole("region", { name: "News" })).toHaveTextContent(
      "6 days in a row · your best is 11",
    );
    fireEvent.click(screen.getByRole("button", { name: /View profile/ }));
    expect(mocks.openProfileSettings).toHaveBeenCalled();
  });

  it("leaves out personal stats when activity highlights are off", async () => {
    mocks.stats = streakStats();
    useSharedSettings.setState({ newsLineActivity: false } as never);
    render(<NewsLine />);
    await act(async () => {});
    advanceTo("changelog");
    for (let step = 0; step < 8; step++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(currentKind()).not.toBe("insight");
    }
  });

  it("rotates on a timer and stops while paused or while the user types", () => {
    vi.useFakeTimers();
    render(<NewsLine />);
    const first = document.querySelector("[data-news-item]")?.getAttribute("data-news-item");
    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
    });
    const second = document.querySelector("[data-news-item]")?.getAttribute("data-news-item");
    expect(second).not.toBe(first);

    fireEvent.click(screen.getByRole("button", { name: "Pause news" }));
    act(() => {
      vi.advanceTimersByTime(NEWS_LONG_DWELL_MS * 2);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).toBe(second);
    fireEvent.click(screen.getByRole("button", { name: "Resume news" }));
    act(() => {
      // The longest dwell, so the assertion holds for any kind in the rotation.
      vi.advanceTimersByTime(NEWS_LONG_DWELL_MS);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).not.toBe(
      second,
    );
  });

  it("pauses for a while after a keystroke in the draft's composer", () => {
    vi.useFakeTimers();
    render(
      <div data-draft-body="">
        <textarea aria-label="Composer" />
        <NewsLine />
      </div>,
    );
    const before = document.querySelector("[data-news-item]")?.getAttribute("data-news-item");
    fireEvent.input(screen.getByLabelText("Composer"), { target: { value: "h" } });
    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS * 2);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).toBe(before);
    act(() => {
      vi.advanceTimersByTime(NEWS_TYPING_PAUSE_MS);
    });
    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).not.toBe(
      before,
    );
  });

  it("keeps star and follow promotions visible longer and restores the regular interval", () => {
    vi.useFakeTimers();
    // Only the star and follow promotions remain, so whichever shows is one of them.
    useSharedSettings.setState({ dismissedPromotions: ["x-creator"] } as never);
    render(<NewsLine />);
    advanceTo("promotion");
    const promotion = currentId();

    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
    });
    expect(currentId()).toBe(promotion);
    act(() => {
      vi.advanceTimersByTime(NEWS_LONG_DWELL_MS - NEWS_ROTATE_MS - 1);
    });
    expect(currentId()).toBe(promotion);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(currentKind()).not.toBe("promotion");

    const next = currentId();
    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
    });
    expect(currentId()).not.toBe(next);
  });

  it("gives the creator promotion the regular interval", () => {
    vi.useFakeTimers();
    useSharedSettings.setState({ dismissedPromotions: ["github-star", "x-poracode"] } as never);
    render(<NewsLine />);
    advanceTo("promotion");
    const promotion = currentId();

    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
    });
    expect(currentId()).not.toBe(promotion);
  });

  it.each([false, true])(
    "opens a promotion in the system browser and hides it everywhere (web=%s)",
    (browserClient) => {
      mocks.browserClient = browserClient;
      render(<NewsLine />);
      advanceTo("promotion");
      const action = screen.getByRole("button", { name: /Star on GitHub|Follow/ });
      const label = action.textContent ?? "";
      fireEvent.click(action);
      const open = browserClient ? mocks.openExternal : mocks.openExternalNative;
      const unused = browserClient ? mocks.openExternalNative : mocks.openExternal;
      expect(open).toHaveBeenCalledTimes(1);
      expect(unused).not.toHaveBeenCalled();
      expect(dismissPromotion).toHaveBeenCalledTimes(1);
      expect(Object.values(COMMUNITY_PROMOTION_URLS)).toContain(open.mock.calls[0]?.[0]);
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    },
  );

  it("shows the short headline and expands the full point with a way to the next one", () => {
    render(<NewsLine />);
    advanceTo("changelog");
    const region = screen.getByRole("region", { name: "News" });
    fireEvent.click(screen.getByRole("button", { name: /Show me/ }));
    const card = screen.getByRole("group", { name: "Release note" });
    expect(card).toHaveTextContent(/Point \d of 2 in 1\.8\.2/);
    const firstText = card.textContent;
    fireEvent.click(screen.getByRole("button", { name: /Next point/ }));
    expect(screen.getByRole("group", { name: "Release note" }).textContent).not.toBe(firstText);
    expect(region).toBeInTheDocument();
    // Opening a point retires it from future rotations on this device.
    expect(useNewsLineStore.getState().highlightHistory.retired.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("group", { name: "Release note" })).not.toBeInTheDocument();
  });

  it("runs a tip's command and remembers a closed tip on this device", () => {
    render(<NewsLine />);
    advanceTo("tip");
    expect(screen.getByRole("region", { name: "News" })).toHaveTextContent("Ctrl+K");
    fireEvent.click(screen.getByRole("button", { name: /Try it/ }));
    expect(mocks.runPalette).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hide this" }));
    expect(JSON.parse(localStorage.getItem(NEWS_LINE_STORAGE_KEYS.hidden) ?? "[]")).toContain(
      "tip:palette.open",
    );
    for (let step = 0; step < 8; step++) {
      expect(currentKind()).not.toBe("tip");
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
  });

  it("suggests a feature the user has not tried and stops once it is opened", async () => {
    render(<NewsLine />);
    await act(async () => {});
    advanceTo("discovery");
    const id = document.querySelector("[data-news-item]")!.getAttribute("data-news-item")!;
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-news-item] button")!);
    expect(useNewsLineStore.getState().hiddenIds).toContain(id);
    for (let step = 0; step < 10; step++) {
      expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).not.toBe(
        id,
      );
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
  });

  it("shows remote announcements, opens their feature, and hides them afterwards", async () => {
    useNewsFeedStore.setState({
      feed: parseNewsFeed({
        version: NEWS_FEED_VERSION,
        items: [
          {
            id: "chrome-extension-store-launch",
            kind: "announcement",
            text: { en: "The Poracode Chrome extension is in the Chrome Web Store" },
            action: { type: "feature", feature: "chrome-extension" },
            unlessUsed: ["chrome-extension"],
          },
          {
            id: "blocked",
            kind: "announcement",
            text: { en: "Never shown" },
            action: { type: "url", url: "https://evil.example/" },
          },
        ],
      }),
    });
    render(<NewsLine />);
    await act(async () => {});
    advanceTo("announcement");
    const region = screen.getByRole("region", { name: "News" });
    expect(region).toHaveTextContent("Chrome Web Store");
    fireEvent.click(screen.getByRole("button", { name: /Get the extension/ }));
    expect(usePanelStore.getState().activeSettingsSection).toBe("plugins");
    expect(useNewsLineStore.getState().hiddenIds).toContain("remote:chrome-extension-store-launch");
    expect(document.body).not.toHaveTextContent("Never shown");
  });

  it.each([false, true])(
    "opens announcement URLs in the system browser and hides them (web=%s)",
    async (browserClient) => {
      mocks.browserClient = browserClient;
      const url = "https://poracode.com/blog";
      useNewsFeedStore.setState({
        feed: parseNewsFeed({
          version: NEWS_FEED_VERSION,
          items: [
            {
              id: "latest-news",
              kind: "announcement",
              text: { en: "Latest Poracode news" },
              action: { type: "url", url, label: { en: "Read more" } },
            },
          ],
        }),
      });
      render(<NewsLine />);
      await act(async () => {});
      advanceTo("announcement");
      fireEvent.click(screen.getByRole("button", { name: "Read more" }));
      const open = browserClient ? mocks.openExternal : mocks.openExternalNative;
      const unused = browserClient ? mocks.openExternalNative : mocks.openExternal;
      expect(open).toHaveBeenCalledExactlyOnceWith(url);
      expect(unused).not.toHaveBeenCalled();
      expect(useNewsLineStore.getState().hiddenIds).toContain("remote:latest-news");
    },
  );

  it("announces items to screen readers only while rotation is stopped", () => {
    render(<NewsLine />);
    const live = () => document.querySelector("[data-news-item]")!.getAttribute("aria-live");
    expect(live()).toBe("off");
    fireEvent.click(screen.getByRole("button", { name: "Pause news" }));
    expect(live()).toBe("polite");
    fireEvent.click(screen.getByRole("button", { name: "Resume news" }));
    expect(live()).toBe("off");
  });

  it("returns focus to the trigger when the release note card closes", () => {
    render(<NewsLine />);
    advanceTo("changelog");
    const trigger = screen.getByRole("button", { name: /Show me/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: /Next point/ }));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    screen.getByRole("button", { name: "Close" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("group", { name: "Release note" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("resumes the item on screen without replaying its entrance when remounted within a visit", () => {
    vi.useFakeTimers();
    const animate = stubElementAnimate();
    const first = render(<NewsLine visitKey={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const id = currentId();
    first.unmount();
    animate.mockClear();

    render(<NewsLine visitKey={1} />);
    expect(currentId()).toBe(id);
    expect(animate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(NEWS_LONG_DWELL_MS);
    });
    expect(currentId()).not.toBe(id);
    expect(animate).toHaveBeenCalled();
  });

  it("starts a fresh rotation for a new visit", () => {
    const animate = stubElementAnimate();
    const first = render(<NewsLine visitKey={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause news" }));
    first.unmount();
    animate.mockClear();

    render(<NewsLine visitKey={2} />);
    expect(animate).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause news" })).toBeInTheDocument();
  });

  it("counts each showing once per visit across remounts", () => {
    const markHighlightShown = vi.fn<(id: string, poolIds: ReadonlySet<string>) => void>();
    const original = useNewsLineStore.getState().markHighlightShown;
    useNewsLineStore.setState({ markHighlightShown });
    try {
      const first = render(<NewsLine visitKey={1} />);
      advanceTo("changelog");
      const itemId = currentId();
      const highlightId = itemId?.slice("changelog:".length);
      expect(markHighlightShown).toHaveBeenCalledTimes(1);
      expect(markHighlightShown.mock.calls[0]?.[0]).toBe(highlightId);
      first.unmount();

      render(<NewsLine visitKey={1} />);
      expect(currentId()).toBe(itemId);
      expect(markHighlightShown).toHaveBeenCalledTimes(1);
    } finally {
      useNewsLineStore.setState({ markHighlightShown: original });
    }
  });

  it("keeps the user's pause across a remount within the visit", () => {
    vi.useFakeTimers();
    const first = render(<NewsLine visitKey={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause news" }));
    const id = currentId();
    first.unmount();

    render(<NewsLine visitKey={1} />);
    expect(screen.getByRole("button", { name: "Resume news" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    act(() => {
      vi.advanceTimersByTime(NEWS_LONG_DWELL_MS * 2);
    });
    expect(currentId()).toBe(id);
  });

  it("shows the next item with one entrance when the resumed item is gone", () => {
    const first = render(<NewsLine visitKey={1} />);
    advanceTo("tip");
    const gone = currentId()!;
    first.unmount();
    useNewsLineStore.getState().hideItem(gone);
    const animate = stubElementAnimate();

    render(<NewsLine visitKey={1} />);
    expect(currentId()).not.toBeNull();
    expect(currentId()).not.toBe(gone);
    expect(animate).toHaveBeenCalledTimes(1);
    act(() => useNewsLineStore.setState({ sessionHiddenIds: ["unrelated"] }));
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
