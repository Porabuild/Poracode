import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { ProviderUsageRail } from "./ProviderUsageRail";

vi.mock("@/renderer/adaptiveLayout", () => ({
  isCompactLayoutViewport: () => false,
  useCompactLayout: () => false,
}));
vi.mock("./useProviderUsageHydration", () => ({
  useProviderUsageHydration: vi.fn<(enabled?: boolean) => void>(),
}));
vi.mock("./hostUsage", () => ({
  fetchHostUsage: vi.fn<(connectionId: string) => Promise<void>>(),
}));

async function browserPage() {
  const { page } = (await import("vitest/browser")) as unknown as {
    page: { viewport: (w: number, h: number) => Promise<void> };
  };
  return page;
}

function measureTextRange(el: HTMLElement) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode();
  if (!textNode) throw new Error("Missing text node");
  const range = document.createRange();
  range.selectNodeContents(textNode);
  return range.getBoundingClientRect();
}

function centerY(rect: DOMRect) {
  return (rect.top + rect.bottom) / 2;
}

beforeEach(() => {
  useUsageScopeStore.setState({ desktopId: null });
  useHostUsageStore.setState({ hosts: {} });
  useProviderUsageStore.setState({
    snapshots: {
      codex: {
        providerId: "codex",
        status: "ok",
        fetchedAt: 1,
        windows: [{ id: "weekly", label: "Weekly", usedPercent: 30 }],
      },
    },
  });
  useSharedSettings.setState((state) => ({
    agentInstances: {},
    usage: {
      ...state.usage,
      showInSidebar: true,
      disabledProviders: [],
      sidebarHiddenProviders: [],
      providerOrder: [],
    },
  }));
  useRemoteServersStore.setState({
    servers: [
      {
        connectionId: "pc",
        desktopId: "pc",
        label: "Gaming PC",
        endpoint: "https://pc.test",
        accessToken: "fixture",
        scopes: ["session:read", "session:operate"],
      },
    ],
    runtime: {
      pc: { status: "online", projects: [], threads: [] },
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("ProviderUsageRail header alignment", () => {
  it("vertically aligns Usage and Local on desktop", async () => {
    const page = await browserPage();
    await page.viewport(1280, 800);
    await document.fonts.ready;

    render(
      <div className="w-[260px] p-2">
        <ProviderUsageRail orientation="row" />
      </div>,
    );

    const usageSpan = screen.getByText("Usage");
    const button = screen.getByRole("button", { name: "Connections" });
    const trigger = button.closest(".popover__trigger") as HTMLElement;
    const labelSpan = screen.getByText("Local");
    const svgs = [...button.querySelectorAll("svg")];

    const uRect = usageSpan.getBoundingClientRect();
    const uTextRect = measureTextRange(usageSpan);
    const tRect = trigger.getBoundingClientRect();
    const bRect = button.getBoundingClientRect();
    const lRect = labelSpan.getBoundingClientRect();
    const lTextRect = measureTextRange(labelSpan);

    expect(tRect.height).toBeCloseTo(bRect.height, 1);
    expect(Math.abs(centerY(uRect) - centerY(bRect))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(centerY(uTextRect) - centerY(lTextRect))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(centerY(lRect) - centerY(uRect))).toBeLessThanOrEqual(0.5);
    for (const svg of svgs) {
      expect(Math.abs(centerY(svg.getBoundingClientRect()) - centerY(uRect))).toBeLessThanOrEqual(
        0.5,
      );
    }
  });

  it("vertically aligns Usage with a remote host and truncates long labels", async () => {
    const page = await browserPage();
    await page.viewport(1280, 800);
    await document.fonts.ready;
    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "pc",
          desktopId: "pc",
          label: "Very Long Remote Workstation Name That Truncates",
          endpoint: "https://pc.test",
          accessToken: "fixture",
          scopes: ["session:read", "session:operate"],
        },
      ],
      runtime: {
        pc: { status: "online", projects: [], threads: [] },
      },
    });
    useUsageScopeStore.setState({ desktopId: "pc" });
    const hostStore = useHostUsageStore.getState();
    hostStore.complete("pc", hostStore.begin("pc"), [
      {
        providerId: "codex",
        status: "ok",
        fetchedAt: Date.now(),
        windows: [{ id: "weekly", label: "Weekly", usedPercent: 30 }],
      },
    ]);

    const { container } = render(
      <div className="w-[240px] p-2">
        <ProviderUsageRail orientation="row" />
      </div>,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    const usageSpan = screen.getByText("Usage");
    const button = screen.getByRole("button", { name: "Connections" });
    const trigger = button.closest(".popover__trigger") as HTMLElement;
    const remoteIcon = button.firstElementChild as HTMLElement;
    const labelSpan = screen.getByText("Very Long Remote Workstation Name That Truncates");
    const chevron = button.lastElementChild as HTMLElement;

    const uRect = usageSpan.getBoundingClientRect();
    const tRect = trigger.getBoundingClientRect();
    const bRect = button.getBoundingClientRect();
    const uTextRect = measureTextRange(usageSpan);
    const lTextRect = measureTextRange(labelSpan);

    expect(tRect.height).toBeCloseTo(bRect.height, 1);
    expect(Math.abs(centerY(uRect) - centerY(bRect))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(centerY(uTextRect) - centerY(lTextRect))).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(centerY(remoteIcon.getBoundingClientRect()) - centerY(uRect)),
    ).toBeLessThanOrEqual(0.5);
    expect(Math.abs(centerY(chevron.getBoundingClientRect()) - centerY(uRect))).toBeLessThanOrEqual(
      0.5,
    );
    expect(labelSpan.scrollWidth).toBeGreaterThan(labelSpan.clientWidth);
    expect(bRect.right).toBeLessThanOrEqual(wrapper.getBoundingClientRect().right);
  });
});
