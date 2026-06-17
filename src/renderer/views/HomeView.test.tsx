import { screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentStatus, Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { HomeView } from "./HomeView";

describe("HomeView", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ homeScopeEnabled: true });
    useAppStore.setState((state) => ({
      ...state,
      projects: [makeProject()],
      threads: [],
      view: { kind: "home" },
    }));
    useAgentStatusesStore.setState({
      agentStatuses: [],
      wslAgentStatuses: [],
      windowsLoaded: false,
      wslLoaded: false,
      inFirstLaunchDiscovery: false,
      discoveryScope: undefined,
      discoveredAgents: [],
    });
  });

  it("does not show archived threads in recent threads", () => {
    useAppStore.setState({
      threads: [
        makeThread({ id: "active", title: "Keep me visible", archived: false }),
        makeThread({ id: "archived", title: "Archived thread", archived: true }),
      ],
    });

    render(<HomeView />);

    expect(screen.getByText("Keep me visible")).toBeInTheDocument();
    expect(screen.queryByText("Archived thread")).not.toBeInTheDocument();
  });

  it("uses the installed ACP agent icon in recent threads", () => {
    useAgentStatusesStore.setState({
      agentStatuses: [
        makeAgentStatus({
          kind: "acp-generic:factory-droid",
          label: "Factory Droid",
          icon: "https://example.com/factory-droid.svg",
        }),
      ],
    });
    useAppStore.setState({
      threads: [
        makeThread({
          title: "ACP thread",
          agentKind: "acp-generic:factory-droid",
        }),
      ],
    });

    const { container } = render(<HomeView />);

    expect(screen.getByText("ACP thread")).toBeInTheDocument();
    expect(container.querySelector(".lightcode-provider-icon--external")).toBeInTheDocument();
    expect(container.querySelector(".lightcode-provider-icon__generic")).not.toBeInTheDocument();
  });
});

function makeProject(): Project {
  return {
    id: "project-1",
    name: "todo-app",
    location: { kind: "windows", path: "C:\\repo" },
    createdAt: "2026-05-26T00:00:00.000Z",
  };
}

function makeThread(overrides: Partial<Thread>): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}

function makeAgentStatus(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gpt-5", label: "GPT-5" }],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
    ...overrides,
  };
}
