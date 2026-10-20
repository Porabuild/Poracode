import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderUsageResponse, Thread, UsageSnapshot } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadUsageBubble, ThreadUsageDock } from "../../thread/ThreadUsageBubble";
import { ThreadAgentUsageDock, useThreadAgentUsage } from "../../thread/ThreadDetailsDocks";
import {
  resolveDisplayedProviders,
  separateCurrentUsageProvider,
  usageProviderIdForAgent,
} from "../usageProviders";

const bridge = vi.hoisted(() => ({
  getProviderUsage: vi.fn<() => Promise<ProviderUsageResponse>>(async () => ({
    snapshots: [],
    fromCache: true,
  })),
  openUsagePanelForProvider: vi.fn<(providerId: string) => void>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@/renderer/actions/panelActions", () => ({
  openUsagePanelForProvider: bridge.openUsagePanelForProvider,
}));

const snapshot: UsageSnapshot = {
  providerId: "opencode",
  status: "ok",
  plan: "Go",
  fetchedAt: 1,
  windows: [
    { id: "session-5h", label: "Rolling", usedPercent: 0 },
    { id: "weekly", label: "Weekly", usedPercent: 20 },
    { id: "monthly", label: "Monthly", usedPercent: 30 },
  ],
};

function DesktopUsage({ threadId }: { threadId: string }) {
  return <ThreadAgentUsageDock usage={useThreadAgentUsage(threadId)} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  useProviderUsageStore.getState().setSnapshots([snapshot]);
  useSharedSettings.setState({ agentInstances: {} });
  useAppStore.setState({ threads: [], projects: [], runtimeContextByThread: {} });
});

describe.each(["opencode", "opencode2"])("%s usage", (agentKind) => {
  it("selects the shared billing card as the current provider", () => {
    const providerId = usageProviderIdForAgent(agentKind, undefined, undefined);
    const current = separateCurrentUsageProvider(resolveDisplayedProviders([], []), providerId);
    expect(providerId).toBe("opencode");
    expect(current.current?.id).toBe("opencode");
  });

  it("shows the same quota in mobile and desktop thread details and opens the billing card", () => {
    const thread: Thread = {
      id: "thread",
      projectId: "project",
      title: "Quota check",
      agentKind,
      config: { model: "default" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      presentationMode: "gui",
      archived: false,
      done: false,
      starred: false,
      createdAt: "2026-10-20",
      updatedAt: "2026-10-20",
    };
    useAppStore.setState({ threads: [thread] });
    render(
      <>
        <ThreadUsageBubble thread={thread} onUsageToggle={() => {}} />
        <ThreadUsageDock thread={thread} onClose={() => {}} />
        <DesktopUsage threadId={thread.id} />
      </>,
    );
    expect(screen.getByRole("button", { name: "OpenCode usage" })).toBeInTheDocument();
    for (const label of ["OpenCode usage", "Agent usage"]) {
      const section = within(screen.getByRole("region", { name: label }));
      expect(section.getByRole("progressbar", { name: "Session (5h)" })).toHaveAttribute(
        "aria-valuenow",
        "0",
      );
      expect(section.getByRole("progressbar", { name: "Weekly" })).toHaveAttribute(
        "aria-valuenow",
        "20",
      );
      expect(section.getByRole("progressbar", { name: "Monthly" })).toHaveAttribute(
        "aria-valuenow",
        "30",
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "OpenCode usage — open usage panel" }));
    expect(bridge.openUsagePanelForProvider).toHaveBeenCalledWith("opencode");
  });
});

it("keeps scoped credentials separate from the default billing account", () => {
  expect(usageProviderIdForAgent("opencode2", "work", undefined)).toBe("opencode2:work");
});
