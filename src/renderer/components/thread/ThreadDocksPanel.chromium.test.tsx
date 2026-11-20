import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import type { Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadGoalDockStore } from "@/renderer/state/threadGoalDockStore";
import { ThreadDocksPanel } from "./ThreadDocksPanel";

async function browserPage() {
  const { page } = (await import("vitest/browser")) as unknown as {
    page: {
      viewport: (w: number, h: number) => Promise<void>;
    };
  };
  return page;
}

const sampleImageSvg = (label: string, accent: string, bg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="192" viewBox="0 0 320 192"><rect width="320" height="192" fill="${bg}"/><circle cx="96" cy="96" r="44" fill="${accent}" opacity="0.35"/><rect x="148" y="64" width="128" height="16" rx="4" fill="${accent}" opacity="0.75"/><rect x="148" y="92" width="96" height="10" rx="4" fill="${accent}" opacity="0.45"/><text x="148" y="132" fill="${accent}" font-family="sans-serif" font-size="14" font-weight="600">${label}</text></svg>`,
  )}`;

const sampleThread: Thread = {
  id: "thread-cards",
  projectId: "project-1",
  title: "Redesign thread info cards",
  agentKind: "codex",
  config: { model: "gpt-5.5" },
  status: "working",
  attention: "none",
  canResumeWithConfig: true,
  presentationMode: "gui",
  archived: false,
  done: false,
  starred: false,
  worktreePath: "/Users/dev/work/Poracode/.poracode/worktrees/poracode-calm-badger-499fc664",
  worktreeBranch: "poracode/calm-badger-499fc664",
  sessionRef: { providerSessionId: "magic-count", discoveredAt: "2026-11-20" },
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

beforeEach(() => {
  usePanelStore.setState({ threadDocksPanelOpen: true, rightPanelTab: "docks" });
  useThreadGoalDockStore.setState({ dismissedByThread: {} });
  useSharedSettings.setState({
    threadDocksPlacement: "right",
    threadDocksOrder: ["goal", "plan", "info", "context", "usage", "images", "files", "artifacts"],
  });
  useProviderUsageStore.getState().setSnapshots([
    {
      providerId: "codex",
      status: "ok",
      plan: "Pro",
      fetchedAt: Date.now(),
      windows: [
        { id: "session-5h", label: "Session", usedPercent: 24, resetsAt: Date.now() + 95 * 60_000 },
        {
          id: "weekly",
          label: "Weekly",
          usedPercent: 38,
          resetsAt: Date.now() + 38 * 60 * 60_000,
        },
      ],
    },
  ]);
  useAppStore.setState({
    projects: [
      {
        id: "project-1",
        name: "Pora.code",
        location: { kind: "posix", path: "/Users/dev/work/Poracode" },
        createdAt: "2026-11-20",
      },
    ],
    threads: [sampleThread],
    runtimeContextByThread: {
      "thread-cards": {
        usedTokens: 267_334,
        maxTokens: 1_000_000,
        breakdown: [
          { id: "input", label: "Input", tokens: 265_575 },
          { id: "output", label: "Output", tokens: 1_759 },
        ],
      },
    },
    runtimeItemIdsByThread: {
      "thread-cards": [
        "goal-1",
        "plan-1",
        "img-1",
        "img-2",
        "img-3",
        "vid-1",
        "file-1",
        "doc-1",
        "doc-2",
      ],
    },
    runtimeItemsByIdByThread: {
      "thread-cards": {
        "goal-1": {
          id: "goal-1",
          type: "goal",
          state: "completed",
          payload: {
            action: "set",
            objective:
              "Finalize thread info cards into Soft hairline surfaces with circular meters when collapsed and structured details when opened.",
            status: "active",
            timeUsedSeconds: 365,
            iterations: 2,
          },
          streams: {},
        },
        "plan-1": {
          id: "plan-1",
          type: "plan",
          state: "updated",
          payload: {
            steps: [
              { step: "Unify Soft hairline card chrome", status: "completed" },
              { step: "Add circular meters for collapsed cards", status: "in_progress" },
              { step: "Verify layout in Chromium", status: "pending" },
            ],
          },
          streams: {},
        },
        "img-1": {
          id: "img-1",
          type: "image_view",
          state: "completed",
          payload: {
            name: "imageGeneration",
            status: "success",
            result: { image: sampleImageSvg("Dark cards", "#a78bfa", "#1e1b2e") },
          },
          streams: {},
        },
        "img-2": {
          id: "img-2",
          type: "image_view",
          state: "completed",
          payload: {
            name: "imageGeneration",
            status: "success",
            result: { image: sampleImageSvg("Light theme", "#2563eb", "#e2e8f0") },
          },
          streams: {},
        },
        "img-3": {
          id: "img-3",
          type: "image_view",
          state: "completed",
          payload: {
            name: "imageGeneration",
            status: "success",
            result: { image: sampleImageSvg("Usage rings", "#34d399", "#132a23") },
          },
          streams: {},
        },
        "vid-1": {
          id: "vid-1",
          type: "user_message",
          state: "completed",
          payload: {
            content: [
              { kind: "file", path: "/tmp/demo.mp4", name: "demo.mp4", mimeType: "video/mp4" },
            ],
          },
          streams: {},
        },
        "file-1": {
          id: "file-1",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [{ kind: "text", text: "[Summary](output/summary.pdf)" }],
          },
          streams: {},
        },
        "doc-1": {
          id: "doc-1",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [
              { kind: "text", text: "[ThreadDocksPanel.tsx](src/renderer/ThreadDocksPanel.tsx)" },
            ],
          },
          streams: {},
        },
        "doc-2": {
          id: "doc-2",
          type: "assistant_message",
          state: "completed",
          payload: {
            content: [
              {
                kind: "text",
                text: "[ThreadDetailsDocks.tsx](src/renderer/ThreadDetailsDocks.tsx)",
              },
            ],
          },
          streams: {},
        },
      },
    },
    runtimeStructuralVersionByThread: { "thread-cards": 1 },
    runtimeBackgroundTasksByThread: {},
  });
});

afterEach(() => {
  cleanup();
});

describe("ThreadDocksPanel cards", () => {
  it.each(["dark", "light"] as const)(
    "renders distinct Soft hairline cards with inner drag handles and circular meters in %s mode",
    async (themeMode) => {
      const page = await browserPage();
      await page.viewport(360, 1080);
      const previousThemeMode = useSharedSettings.getState().themeMode;
      useSharedSettings.setState({ themeMode });
      try {
        const { container } = render(
          <AppProvider>
            <div style={{ width: 340, height: 1060 }}>
              <ThreadDocksPanel threadId="thread-cards" />
            </div>
          </AppProvider>,
        );

        expect(document.documentElement.getAttribute("data-theme")).toBe(themeMode);
        const cards = [...container.querySelectorAll<HTMLElement>('[data-placement="right"]')];
        expect(cards.length).toBe(8);
        const filesRegion = screen.getByRole("region", { name: "Files" });
        const artifactsRegion = screen.getByRole("region", { name: "Artifacts" });
        const mediaRegion = screen.getByRole("region", { name: "Media" });
        expect(within(filesRegion).getByText("summary.pdf")).toBeVisible();
        expect(within(artifactsRegion).getByText("ThreadDocksPanel.tsx")).toBeVisible();

        // Compact/media body padding overrides must apply in CSS without being shadowed.
        const filesBody = filesRegion.querySelector<HTMLElement>(
          "[data-files-dock] > div.border-t",
        )!;
        const mediaBody = mediaRegion.querySelector<HTMLElement>(
          "[data-images-dock] > div.border-t",
        )!;
        expect(getComputedStyle(filesBody).paddingLeft).toBe("6px");
        expect(getComputedStyle(filesBody).paddingTop).toBe("8px");
        expect(getComputedStyle(mediaBody).paddingLeft).toBe("10px");
        expect(getComputedStyle(mediaBody).paddingTop).toBe("10px");

        // Active goal icon inherits the theme foreground (not hardcoded white in light mode).
        const goalTarget = container.querySelector<SVGElement>(".poracode-goal-active-icon svg")!;
        expect(getComputedStyle(goalTarget).color).toBe(
          getComputedStyle(screen.getByText("Goal")).color,
        );

        for (const card of cards) {
          const computed = getComputedStyle(card);
          expect(computed.borderRadius).toBe("8px");
          expect(computed.borderTopWidth).toBe("1px");
          expect(computed.boxShadow).toBe("none");
        }
        for (let i = 1; i < cards.length; i++) {
          const prevRect = cards[i - 1]!.getBoundingClientRect();
          const curRect = cards[i]!.getBoundingClientRect();
          expect(curRect.top - prevRect.bottom).toBeGreaterThanOrEqual(7);
        }

        // Every drag handle sits inside its card header, and header icons, titles,
        // drag handles, and chevrons share exact vertical centering and columns.
        const iconLefts: number[] = [];
        const chevronRights: number[] = [];
        const centerY = (rect: DOMRect) => (rect.top + rect.bottom) / 2;
        for (const dock of container.querySelectorAll<HTMLElement>("[data-dock-kind]")) {
          const handle = dock.querySelector<HTMLButtonElement>('button[aria-label^="Reorder "]')!;
          const card = dock.querySelector<HTMLElement>('[data-placement="right"]')!;
          const headerRow = card.querySelector<HTMLElement>("div.h-9")!;
          const toggle = headerRow.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
          const iconSlot = toggle.firstElementChild as HTMLElement;
          const titleEl = toggle.querySelector<HTMLElement>("span.font-semibold")!;
          const actions = headerRow.lastElementChild as HTMLElement;
          const chevron = actions.lastElementChild as HTMLElement;

          const handleRect = handle.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          const headerMid = centerY(headerRow.getBoundingClientRect());
          expect(handleRect.left).toBeGreaterThan(cardRect.left);
          expect(handleRect.top).toBeGreaterThanOrEqual(cardRect.top);
          expect(Math.abs(centerY(handleRect) - headerMid)).toBeLessThanOrEqual(1);
          expect(
            Math.abs(centerY(iconSlot.getBoundingClientRect()) - headerMid),
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(centerY(titleEl.getBoundingClientRect()) - headerMid),
          ).toBeLessThanOrEqual(1.5);
          expect(
            Math.abs(centerY(chevron.getBoundingClientRect()) - headerMid),
          ).toBeLessThanOrEqual(1);

          // Native header button has no HeroUI press-scale click effect.
          expect(toggle.classList.contains("button")).toBe(false);
          expect(getComputedStyle(toggle).transform).toBe("none");
          // Collapse action button is not nested inside an extra interactive Tooltip trigger.
          expect(chevron.closest('[role="button"]')).toBeNull();

          iconLefts.push(iconSlot.getBoundingClientRect().left);
          chevronRights.push(chevron.getBoundingClientRect().right);
        }
        for (const left of iconLefts) {
          expect(Math.abs(left - iconLefts[0]!)).toBeLessThanOrEqual(0.5);
        }
        for (const right of chevronRights) {
          expect(Math.abs(right - chevronRights[0]!)).toBeLessThanOrEqual(0.5);
        }

        // Collapsed Context window and Usage cards display circular SVG rings.
        const contextCard = screen.getByRole("region", { name: "Context window" });
        const usageCard = screen.getByRole("region", { name: "Agent usage" });
        expect(contextCard.querySelector('[data-context-ring="true"]')).not.toBeNull();
        expect(usageCard.querySelectorAll("svg circle").length).toBeGreaterThanOrEqual(4);

        // Expanding Thread info, Context window, and Usage adds a hairline body divider.
        fireEvent.click(screen.getByRole("button", { name: "Thread info" }));
        fireEvent.click(screen.getByRole("button", { name: "Context window" }));
        fireEvent.click(screen.getByRole("button", { name: "Usage" }));
        expect(screen.getByText("magic-count")).toBeVisible();
        expect(screen.getByText("267K used")).toBeVisible();
        expect(screen.getByText("Pro")).toBeVisible();
      } finally {
        useSharedSettings.setState({ themeMode: previousThemeMode });
      }
    },
  );
});
