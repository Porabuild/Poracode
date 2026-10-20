import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
    expect(screen.getByText("Host offline. Showing last known usage.")).toBeInTheDocument();
  });
  it("starts context collapsed and exposes the selected thread's workspace, branch and session", () => {
    render(
      <AppProvider>
        <ThreadWorkspaceDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.queryByText("session-one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand thread context" }));
    for (const value of ["Repository", "C:/repo", "C:/repo/worktree", "feature", "session-one"])
      expect(screen.getByText(value)).toBeInTheDocument();
  });

  it("switches usage with the selected agent and hides missing fields", () => {
    useProviderUsageStore
      .getState()
      .setSnapshots([snapshot("codex", 12.34), snapshot("claude", 56.78)]);
    useAppStore.setState({
      runtimeContextByThread: { t1: { usedTokens: 20000, maxTokens: 100000 } },
    });
    const view = render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.getByText("Codex account usage")).toBeInTheDocument();
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    expect(screen.queryByText(/56\.78/)).not.toBeInTheDocument();
    expect(screen.getByText(/20\.0K/)).toBeInTheDocument();
    view.rerender(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t2" />
      </AppProvider>,
    );
    expect(screen.getByText("Claude account usage")).toBeInTheDocument();
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    expect(screen.queryByText("Thread context")).not.toBeInTheDocument();
    act(() => useProviderUsageStore.setState({ snapshots: {} }));
    expect(screen.queryByLabelText("Agent usage")).not.toBeInTheDocument();
  });

  it("shows reported zeros without inventing an unknown context limit or cost", () => {
    useAppStore.setState({ runtimeContextByThread: { t1: { usedTokens: 0 } } });
    render(
      <AppProvider>
        <ThreadAgentUsageDock threadId="t1" />
      </AppProvider>,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
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
