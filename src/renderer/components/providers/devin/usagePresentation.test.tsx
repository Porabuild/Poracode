import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, Thread, UsageSnapshot } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadUsageBubble, ThreadUsageDock } from "../../thread/ThreadUsageBubble";
import { usageProvidersForAgentInstances } from "../usageProviders";

const { openUsagePanelForProvider } = vi.hoisted(() => ({
  openUsagePanelForProvider: vi.fn<(providerId: string) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    getProviderUsage: async () => ({ snapshots: [], fromCache: true }),
  }),
}));
vi.mock("@/renderer/actions/panelActions", () => ({ openUsagePanelForProvider }));

const profile = (id: string, auth: unknown): AgentInstanceConfig => ({
  id,
  driver: "devin",
  displayName: id,
  config: { format: 1, auth },
});
const owner = profile("work", { kind: "isolated-owner" });
const native = profile("native-config", { kind: "native-default" });
const reference = profile("review", { kind: "owner-reference", ownerId: owner.id });

function thread(instanceId: string): Thread {
  return {
    id: "usage-thread",
    projectId: "project",
    title: "Usage",
    agentKind: "devin",
    agentInstanceId: instanceId,
    config: { model: "test-model" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    presentationMode: "gui",
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
  };
}

function snapshot(providerId: string, percent: number): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    fetchedAt: 1,
    windows: [{ id: "daily", label: "Daily", usedPercent: percent }],
  };
}

describe("Devin shared usage presentation", () => {
  beforeEach(() => {
    openUsagePanelForProvider.mockClear();
    useSharedSettings.setState({
      agentInstances: { work: owner, review: reference, "native-config": native },
    });
    useProviderUsageStore.setState({
      snapshots: { devin: snapshot("devin", 13), "devin:work": snapshot("devin:work", 72) },
    });
  });

  it.each([
    ["native-config", "devin", "Devin usage", 13],
    ["work", "devin:work", "Devin work usage", 72],
    ["review", "devin:work", "Devin work usage", 72],
  ] as const)("opens the same quota owner from %s bubble and dock", (id, meter, label, percent) => {
    const toggle = vi.fn<() => void>();
    const close = vi.fn<() => void>();
    render(
      <>
        <ThreadUsageBubble thread={thread(id)} onUsageToggle={toggle} />
        <ThreadUsageDock thread={thread(id)} onClose={close} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(screen.getByRole("progressbar", { name: "Daily" })).toHaveAttribute(
      "aria-valuenow",
      String(percent),
    );
    fireEvent.click(screen.getByRole("button", { name: /open usage panel/i }));
    expect(close).toHaveBeenCalledOnce();
    expect(openUsagePanelForProvider).toHaveBeenCalledWith(meter);
    expect(
      usageProvidersForAgentInstances(useSharedSettings.getState().agentInstances)
        .filter((entry) => entry.id.startsWith("devin"))
        .map((entry) => entry.id),
    ).toEqual(["devin", "devin:work"]);
  });

  it.each(["missing", "disabled"] as const)("does not show native quota for a %s owner", (kind) => {
    useSharedSettings.setState({
      agentInstances:
        kind === "missing"
          ? { review: reference }
          : { review: reference, work: { ...owner, enabled: false } },
    });
    render(<ThreadUsageDock thread={thread("review")} onClose={() => undefined} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("13%")).not.toBeInTheDocument();
    expect(screen.queryByText("72%")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open usage panel/i }));
    expect(openUsagePanelForProvider).toHaveBeenCalledWith("devin:review");
  });
});
