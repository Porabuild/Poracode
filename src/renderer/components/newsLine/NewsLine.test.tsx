import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
import {
  NEWS_PROMOTION_ROTATE_MS,
  NEWS_ROTATE_MS,
  NEWS_TYPING_PAUSE_MS,
  NewsLine,
} from "./NewsLine";
import { resetProfileStatsCache } from "./useProfileStats";
import { useFeatureUsageStore } from "@/renderer/state/featureUsageStore";
import { useNewsFeedStore } from "@/renderer/state/newsFeedStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { NEWS_FEED_VERSION, parseNewsFeed } from "@/shared/newsFeed";

const mocks = vi.hoisted(() => ({
  stats: null as unknown,
  openExternalUrl: vi.fn<(url: string) => void>(),
  openProfileSettings: vi.fn<() => void>(),
  runPalette: vi.fn<() => void>(),
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({
    appVersion: "1.8.2",
    platform: "win32",
    openExternal: vi.fn<() => Promise<void>>(),
    getSchedules: () => Promise.resolve([]),
    getProfileCoreStats: () =>
      mocks.stats ? Promise.resolve(mocks.stats) : Promise.reject(new Error("unavailable")),
  }),
}));

vi.mock("@/renderer/actions/panelActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/panelActions")>()),
  openExternalUrl: mocks.openExternalUrl,
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

function advanceTo(kind: string) {
  for (let step = 0; step < 12 && currentKind() !== kind; step++) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  expect(currentKind()).toBe(kind);
}

describe("NewsLine", () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileStatsCache();
    mocks.stats = null;
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
  });

  it("leads with an activity insight and opens Profile from it", async () => {
    mocks.stats = streakStats();
    render(<NewsLine />);
    await waitFor(() => expect(currentKind()).toBe("insight"));
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
    expect(currentKind()).toBe("changelog");
    for (let step = 0; step < 6; step++) {
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
      vi.advanceTimersByTime(NEWS_ROTATE_MS * 3);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).toBe(second);
    fireEvent.click(screen.getByRole("button", { name: "Resume news" }));
    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
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

  it("keeps promotions visible longer and restores the regular interval afterwards", () => {
    vi.useFakeTimers();
    render(<NewsLine />);
    advanceTo("promotion");
    const promotion = document.querySelector("[data-news-item]")?.getAttribute("data-news-item");

    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).toBe(
      promotion,
    );
    act(() => {
      vi.advanceTimersByTime(NEWS_PROMOTION_ROTATE_MS - NEWS_ROTATE_MS - 1);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).toBe(
      promotion,
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(currentKind()).not.toBe("promotion");

    const next = document.querySelector("[data-news-item]")?.getAttribute("data-news-item");
    act(() => {
      vi.advanceTimersByTime(NEWS_ROTATE_MS);
    });
    expect(document.querySelector("[data-news-item]")?.getAttribute("data-news-item")).not.toBe(
      next,
    );
  });

  it("opens a promotion's link and hides it everywhere", () => {
    render(<NewsLine />);
    advanceTo("promotion");
    const action = screen.getByRole("button", { name: /Star on GitHub|Follow/ });
    const label = action.textContent ?? "";
    fireEvent.click(action);
    expect(mocks.openExternalUrl).toHaveBeenCalledTimes(1);
    expect(dismissPromotion).toHaveBeenCalledTimes(1);
    expect(Object.values(COMMUNITY_PROMOTION_URLS)).toContain(
      mocks.openExternalUrl.mock.calls[0]?.[0],
    );
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  });

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
});
