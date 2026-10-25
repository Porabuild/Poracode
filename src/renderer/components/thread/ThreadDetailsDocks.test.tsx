import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread, UsageSnapshot } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  ThreadAgentUsageDock as AgentUsageDock,
  ThreadWorkspaceDock,
  useThreadAgentUsage,
} from "./ThreadDetailsDocks";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";

function ThreadAgentUsageDock({ threadId }: { threadId: string }) {
  return <AgentUsageDock usage={useThreadAgentUsage(threadId)} />;
}

const thread: Thread = {
  id: "t1",
  projectId: "p1",
  title: "Chat",
  agentKind: "codex",
  config: { model: "test" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  presentationMode: "gui",
  archived: false,
  done: false,
  starred: false,
  worktreePath: "C:/repo/worktree",
  worktreeBranch: "feature",
  sessionRef: { providerSessionId: "session-one", discoveredAt: "2026-10-19" },
  createdAt: "2026-10-19",
  updatedAt: "2026-10-19",
};

function snapshot(providerId: string, amount: number): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    fetchedAt: Date.now(),
    windows: [],
    cost: { amount, currency: "USD", period: "cycle", estimated: false },
  };
}

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  useAppStore.setState({
    threads: [thread, { ...thread, id: "t2", agentKind: "claude" }],
    projects: [
      {
        id: "p1",
        name: "Repository",
        location: { kind: "windows", path: "C:/repo" },
        createdAt: "2026-10-19",
      },
    ],
    runtimeContextByThread: {},
  });
  useProviderUsageStore.setState({ snapshots: {} });
  useRemoteServersStore.setState({ servers: [], runtime: {} });
  useSharedSettings.setState({
    agentInstances: {},
    usage: { ...useSharedSettings.getState().usage, showEstimatedCost: false },
  });
  useHostUsageStore.setState({ hosts: {} });
});

describe("Thread details", () => {
  it("expands context inline from its compact summary and collapses it independently", () => {
    useAppStore.setState({
      runtimeContextByThread: {
        t1: {
          usedTokens: 20000,
          maxTokens: 100000,
          breakdown: [
            { id: "messages", label: "Messages", tokens: 15000 },
            { id: "tools", label: "Tools", tokens: 5000 },
          ],
        },
      },
    });
    render(
      <AppProvider>
        <ThreadWorkspaceDock threadId="t1" />
      </AppProvider>,
    );
    const context = within(screen.getByRole("region", { name: "Thread context" }));
    const header = context.getByRole("button", { name: "Thread context" });
    expect(header).toHaveTextContent("20K / 100K tokens");
    expect(context.queryByText("Messages")).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(context.getByText("20K used")).toBeInTheDocument();
    expect(context.getByText("100K limit")).toBeInTheDocument();
    expect(context.getByText("15,000")).toBeInTheDocument();
    expect(context.getByText("Tools")).toBeInTheDocument();
    expect(context.getByText("5,000")).toBeInTheDocument();
    fireEvent.click(context.getByRole("button", { name: "Collapse thread context" }));
    expect(context.queryByText("Messages")).not.toBeInTheDocument();
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("allows inspecting a breakdown without reported totals", () => {
    useAppStore.setState({
      runtimeContextByThread: {
        t1: { breakdown: [{ id: "tools", label: "Tools", tokens: 0 }] },
      },
    });
    render(
      <AppProvider>
        <ThreadWorkspaceDock threadId="t1" />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Thread context" }));
    const details = within(screen.getByRole("region", { name: "Thread context" }));
    expect(details.getByText("Tools")).toBeInTheDocument();
    expect(details.getByText("0")).toBeInTheDocument();
    expect(details.getByText("Unknown limit")).toBeInTheDocument();
  });

  it("respects the estimated cost preference while preserving reported tokens", () => {
    useProviderUsageStore.getState().setSnapshots([
      {
        ...snapshot("codex", 12.34),
        tokens: { total: 1000 },
        cost: { amount: 12.34, currency: "USD", period: "cycle", estimated: true },
      },
    ]);
    render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand agent usage" }));
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    expect(screen.getByText(/1\.0K tokens/)).toBeInTheDocument();
    act(() => {
      useSharedSettings.setState({
        usage: { ...useSharedSettings.getState().usage, showEstimatedCost: true },
      });
    });
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    expect(screen.getByText(/1\.0K tokens/)).toBeInTheDocument();
  });

  it("omits the usage section when its only reported value is a hidden estimate", () => {
    useProviderUsageStore.getState().setSnapshots([
      {
        ...snapshot("codex", 12.34),
        cost: { amount: 12.34, currency: "USD", period: "cycle", estimated: true },
      },
    ]);
    render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.queryByLabelText("Agent usage")).not.toBeInTheDocument();
  });

  it("retains reported zero token consumption when cost is also present", () => {
    useProviderUsageStore
      .getState()
      .setSnapshots([{ ...snapshot("codex", 0), tokens: { total: 0 } }]);
    render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand agent usage" }));
    expect(screen.getByText("0 tokens")).toBeInTheDocument();
  });

  it("labels cached remote account usage when its host is offline", () => {
    useAppStore.setState({ threads: [{ ...thread, remoteServerId: "remote" }] });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "remote",
          label: "Host",
          endpoint: "http://127.0.0.1:1234",
          accessToken: "test",
          scopes: ["session:read"],
        },
      ],
      runtime: { remote: { status: "offline", projects: [], threads: [] } },
    });
    const request = useHostUsageStore.getState().begin("remote");
    useHostUsageStore.getState().complete("remote", request, [snapshot("codex", 12.34)]);
    render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand agent usage" }));
    expect(screen.getByText("Host offline. Showing last known usage.")).toBeInTheDocument();
  });
  it("starts context collapsed and exposes the selected thread's workspace, branch and session", () => {
    render(
      <AppProvider>
        <ThreadWorkspaceDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.queryByText("session-one")).not.toBeInTheDocument();
    const header = screen.getByRole("button", { name: "Thread context" });
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    for (const value of ["Repository", "C:/repo", "C:/repo/worktree", "feature", "session-one"])
      expect(screen.getByText(value)).toBeInTheDocument();
    expect(header).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Collapse thread context" }));
    expect(screen.queryByText("session-one")).not.toBeInTheDocument();
  });

  it("does not highlight a hovered section header", () => {
    render(
      <AppProvider>
        <ThreadWorkspaceDock threadId="t1" />
      </AppProvider>,
    );
    const header = screen.getByRole("button", { name: "Thread context" });
    expect(header).toHaveClass(
      "[--button-bg-hover:transparent]",
      "[--button-bg-pressed:transparent]",
    );
    expect(within(header).getByText("Thread context").className).not.toContain("hover:");
  });

  it("cancels the button icon margin so collapsible headers align with static ones", () => {
    render(
      <AppProvider>
        <ThreadWorkspaceDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Thread context" })).toHaveClass("[&_svg]:mx-0");
  });

  it("shows the provider icon and compact usage, then expands account details", () => {
    useProviderUsageStore.getState().setSnapshots([
      {
        ...snapshot("codex", 12.34),
        windows: [{ id: "session", label: "Session", usedPercent: 48 }],
      },
      snapshot("claude", 56.78),
    ]);
    const view = render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    const header = screen.getByRole("button", { name: "Usage" });
    expect(within(header).getByRole("img", { name: "Codex" })).toBeInTheDocument();
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header).toHaveTextContent("Session 48%");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("progressbar", { name: "Session" })).toBeInTheDocument();
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse agent usage" }));
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    view.rerender(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t2" />
      </AppProvider>,
    );
    expect(within(header).getByRole("img", { name: "Claude" })).toBeInTheDocument();
    expect(header).toHaveTextContent("56.78");
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    act(() => useProviderUsageStore.setState({ snapshots: {} }));
    expect(screen.queryByLabelText("Agent usage")).not.toBeInTheDocument();
  });

  it("shows reset countdowns and pace estimates alongside account usage bars", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    useProviderUsageStore.getState().setSnapshots([
      {
        ...snapshot("codex", 0),
        windows: [
          { id: "session-5h", label: "Session (5h)", usedPercent: 19, resetsAt: now + 64 * 60_000 },
          { id: "weekly", label: "Weekly", usedPercent: 6, resetsAt: now + 100 * 60 * 60_000 },
        ],
      },
    ]);
    render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand agent usage" }));
    expect(screen.getByRole("progressbar", { name: "Session (5h)" })).toHaveAttribute(
      "aria-valuenow",
      "19",
    );
    expect(screen.getByRole("progressbar", { name: "Weekly" })).toHaveAttribute(
      "aria-valuenow",
      "6",
    );
    expect(screen.getByText(/1h 4m/)).toBeInTheDocument();
    expect(screen.getByText(/4d 4h/)).toBeInTheDocument();
    expect(screen.getByText("≈24% by reset")).toBeInTheDocument();
    expect(screen.getByText("≈15% by reset")).toBeInTheDocument();
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
  });

  it("shows reported zeros without inventing an unknown context limit or cost", () => {
    useAppStore.setState({ runtimeContextByThread: { t1: { usedTokens: 0 } } });
    render(
      <AppProvider>
        <ThreadWorkspaceDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Thread context" })).toHaveTextContent("0 tokens");
    expect(screen.queryByText(/limit|Unknown|account usage/)).not.toBeInTheDocument();
  });

  it("does not use local account usage for a remote thread or a different agent profile", () => {
    useProviderUsageStore.getState().setSnapshots([snapshot("codex", 12.34)]);
    useAppStore.setState({
      threads: [
        { ...thread, remoteServerId: "remote" },
        { ...thread, id: "profile", agentInstanceId: "work" },
      ],
    });
    const view = render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.queryByLabelText("Agent usage")).not.toBeInTheDocument();
    view.rerender(
      <AppProvider>
        <ThreadAgentUsageDock threadId="profile" />
      </AppProvider>,
    );
    expect(screen.queryByLabelText("Agent usage")).not.toBeInTheDocument();
  });
});
