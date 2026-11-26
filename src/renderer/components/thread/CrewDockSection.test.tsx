import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project, Thread } from "@/shared/contracts";
import type { SavedCrew, ThreadCrewBinding } from "@/shared/crew";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { ActiveSubAgentRow } from "./ChatPane/parts/items/ActiveSubAgentTile";
import { CrewDockSection } from "./CrewDockSection";

const bridge = {
  cancelCrossagentRun: vi
    .fn<(payload: { threadId: string; runId: string }) => Promise<void>>()
    .mockResolvedValue(undefined),
};
let remoteSession = false;
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => remoteSession,
}));

const role = {
  id: "builder",
  label: "Builder",
  selection: { agentKind: "codex", model: "gpt-5.5" },
};
const binding: ThreadCrewBinding = {
  version: 1,
  crewId: "crew-1",
  name: "Night shift",
  policy: "crew-first",
  roles: [role],
};
const savedCrew: SavedCrew = {
  id: "crew-1",
  name: "Night shift",
  lead: { agentKind: "codex", model: "gpt-5.5" },
  roles: [role],
  policy: "crew-first",
  updatedAt: 1,
};
const thread = {
  id: "thread-1",
  projectId: "project-1",
  agentKind: "codex",
  title: "Thread",
  config: { model: "gpt-5.5", crew: binding },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
} as unknown as Thread;

const localProject = {
  id: "project-1",
  name: "Local repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-10-01T00:00:00.000Z",
} as Project;

function seedRuns() {
  const ids = ["run-trimmed", "run-case", "run-other"];
  useAppStore.setState({
    runtimeItemIdsByThread: { "thread-1": ids },
    runtimeItemsByIdByThread: {
      "thread-1": Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            id,
            type: "tool_call",
            state: "started",
            payload: {
              name: "Codex · GPT-5.5",
              title: `Task ${index + 1}`,
              status: "running",
              isCrossagent: true,
              subAgentType: [" builder ", "BUILDER", "Reviewer"][index],
            },
            streams: {},
          },
        ]),
      ),
    },
    runtimeStructuralVersionByThread: { "thread-1": 1 },
  } as never);
}

describe("CrewDockSection", () => {
  const originalProjects = useAppStore.getState().projects;
  const originalAgentStatuses = useAgentStatusesStore.getState().agentStatuses;
  const originalWslAgentStatuses = useAgentStatusesStore.getState().wslAgentStatuses;
  const originalRuntime = useRemoteServersStore.getState().runtime;
  const studioRuntime = { status: "online" as const, projects: [], threads: [] };
  const pairedThread = { ...thread, remoteServerId: "studio" } as Thread;
  const reviewerBinding: ThreadCrewBinding = {
    version: 1,
    name: "Review crew",
    policy: "crew-first",
    roles: [
      {
        id: "reviewer",
        label: "Reviewer",
        selection: { agentKind: "claude:z-ai", model: "glm-5.4[1m]", effort: "max" },
      },
    ],
  };

  function claudeStatus(label: string, modelLabel: string): AgentStatus {
    return {
      kind: "claude:z-ai",
      label,
      installed: true,
      authState: "authenticated",
      envKind: "windows",
      capabilities: {
        models: [{ id: "glm-5.4[1m]", label: modelLabel }],
      },
    } as unknown as AgentStatus;
  }

  afterEach(() => {
    cleanup();
    useAppStore.setState({ projects: originalProjects });
    useAgentStatusesStore.setState({
      agentStatuses: originalAgentStatuses,
      wslAgentStatuses: originalWslAgentStatuses,
    });
    useRemoteServersStore.setState({ runtime: originalRuntime });
  });

  it("nests trimmed case-insensitive role runs and puts unmatched runs under Other agents", () => {
    seedRuns();
    useAgentStatusesStore.setState({ agentStatuses: [] });
    useSharedSettings.setState({ crews: [savedCrew] });
    const view = renderWithI18n(
      <CrewDockSection
        threadId="thread-1"
        thread={thread}
        binding={binding}
        runIds={["run-trimmed", "run-case", "run-other"]}
        renderRun={(id, taskOnly) => (
          <div key={id} data-testid={`run-${id}`} data-task-only={taskOnly}>
            {id}
          </div>
        )}
        showPlacementToggle={false}
      />,
    );
    const builderRuns = view.container.querySelector('[data-crew-role-runs="builder"]');
    expect(within(builderRuns as HTMLElement).getByTestId("run-run-trimmed")).toBeInTheDocument();
    expect(within(builderRuns as HTMLElement).getByTestId("run-run-case")).toBeInTheDocument();
    expect(screen.getByTestId("run-run-case")).toHaveAttribute("data-task-only", "true");
    expect(screen.getByTestId("run-run-other")).toHaveAttribute("data-task-only", "false");
    const other = screen.getByText("Other agents").parentElement;
    expect(within(other as HTMLElement).getByTestId("run-run-other")).toBeInTheDocument();

    const member = view.container.querySelector('[data-crew-member-row="Builder"]');
    expect(member?.querySelector('[data-crew-member-line="text"]')).toHaveClass("truncate");
    expect(member?.querySelector('[data-crew-member-line="meta"]')).toHaveClass("truncate");
    expect(member?.querySelector(".poracode-provider-icon")).toHaveClass(
      "poracode-provider-icon--active",
    );
  });

  it("shows the helper subprovider alongside provider and effort", () => {
    useAppStore.setState({ projects: [localProject] });
    useAgentStatusesStore.setState({
      agentStatuses: [
        {
          kind: "codex",
          label: "Provider",
          installed: true,
          capabilities: {
            models: [{ id: "gpt-5.5", label: "Model" }],
            modelSubProvider: { "gpt-5.5": "route" },
            subProviders: [{ id: "route", label: "Route" }],
          },
        } as unknown as AgentStatus,
      ],
    });
    const view = renderWithI18n(
      <CrewDockSection
        threadId="thread-1"
        thread={thread}
        binding={{
          ...binding,
          roles: [{ ...role, selection: { ...role.selection, effort: "high" } }],
        }}
        runIds={[]}
        renderRun={() => null}
        showPlacementToggle={false}
      />,
    );
    const row = view.container.querySelector('[data-crew-member-row="Builder"]');
    expect(row?.querySelector('[data-crew-member-line="text"]')).toHaveTextContent("Model");
    expect(row?.querySelector('[data-crew-member-line="meta"]')).toHaveTextContent(
      "Provider · Route · High",
    );
  });

  it("shows the paired host's profile and model labels instead of the client catalog", () => {
    useAppStore.setState({ projects: [localProject] });
    useAgentStatusesStore.setState({
      agentStatuses: [claudeStatus("Claude", "Client GLM 5.4")],
      wslAgentStatuses: [],
    });
    useRemoteServersStore.setState({ runtime: { studio: studioRuntime } });
    const view = renderWithI18n(
      <CrewDockSection
        threadId="thread-1"
        thread={pairedThread}
        binding={reviewerBinding}
        runIds={[]}
        renderRun={() => null}
        showPlacementToggle={false}
      />,
    );
    const row = () => view.container.querySelector('[data-crew-member-row="Reviewer"]');
    const text = () => row()?.querySelector('[data-crew-member-line="text"]');
    const meta = () => row()?.querySelector('[data-crew-member-line="meta"]');

    expect(text()).toHaveTextContent("glm-5.4[1m]");
    expect(text()).not.toHaveTextContent("Client GLM 5.4");
    expect(meta()).toHaveTextContent("claude:z-ai · Max");

    act(() => {
      useRemoteServersStore.setState({
        runtime: {
          studio: {
            ...studioRuntime,
            agentStatuses: {
              windows: [claudeStatus("Z.AI", "GLM 5.4")],
              wsl: [],
              updatedAt: "2026-11-04T00:00:00.000Z",
            },
          },
        },
      });
    });

    expect(text()).toHaveTextContent("GLM 5.4");
    expect(text()).not.toHaveTextContent("glm-5.4[1m]");
    expect(text()).not.toHaveTextContent("Client GLM 5.4");
    expect(meta()).toHaveTextContent("Z.AI · Max");
  });

  it("routes runs to Other agents after the role is renamed", () => {
    seedRuns();
    useAgentStatusesStore.setState({ agentStatuses: [] });
    useSharedSettings.setState({
      crews: [{ ...savedCrew, roles: [{ ...role, label: "Builder QA" }] }],
    });
    const renamedBinding: ThreadCrewBinding = {
      ...binding,
      roles: [{ ...role, label: "Builder QA" }],
    };
    const view = renderWithI18n(
      <CrewDockSection
        threadId="thread-1"
        thread={thread}
        binding={renamedBinding}
        runIds={["run-case"]}
        renderRun={(id) => (
          <div key={id} data-testid={`run-${id}`}>
            {id}
          </div>
        )}
        showPlacementToggle={false}
      />,
    );
    expect(view.container.querySelector('[data-crew-role-runs="builder"]')).toBeNull();
    expect(screen.getByText("Other agents")).toBeInTheDocument();
    expect(screen.getByTestId("run-run-case")).toBeInTheDocument();
  });
});

describe("Crew follow-up rows", () => {
  const sidekickRole = {
    id: "sidekick",
    label: "Sidekick",
    selection: {
      agentKind: "opencode",
      model: "opencode-go/deepseek-v4.1-flash",
      effort: "max",
    },
  };
  const sidekickBinding: ThreadCrewBinding = {
    version: 1,
    name: "Work Crew",
    policy: "crew-only",
    roles: [sidekickRole],
  };

  function seedFollowUpRuns() {
    const rows = [
      { id: "sub:run-first", title: "Reproduce paired thread delete flicker", isFollowUp: false },
      { id: "sub:run-follow", title: "Fence stale shell pages", isFollowUp: true },
    ];
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-1": rows.map((row) => row.id) },
      runtimeItemsByIdByThread: {
        "thread-1": Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              id: row.id,
              type: "tool_call",
              state: "started",
              payload: {
                name: "OpenCode · DeepSeek V4.1 Flash · Max",
                title: row.title,
                status: "running",
                isCrossagent: true,
                crossagentStatus: "running",
                subAgentType: "Sidekick",
                progress: { stepCount: 40 },
                ...(row.isFollowUp ? { isSubAgentResume: true } : {}),
              },
              streams: {},
            },
          ]),
        ),
      },
      runtimeStructuralVersionByThread: { "thread-1": 1 },
    } as never);
  }

  function renderDock(runIds: string[]) {
    return renderWithI18n(
      <CrewDockSection
        threadId="thread-1"
        thread={thread}
        binding={sidekickBinding}
        runIds={runIds}
        renderRun={(id, taskOnly) => (
          <ActiveSubAgentRow
            key={id}
            threadId="thread-1"
            itemId={id}
            placement="right"
            taskOnly={taskOnly}
          />
        )}
        showPlacementToggle={false}
      />,
    );
  }

  it("marks a resumed Sidekick run row as a follow-up in the same session", () => {
    seedFollowUpRuns();
    useAgentStatusesStore.setState({ agentStatuses: [] });
    useSharedSettings.setState({ crews: [] });
    const view = renderDock(["sub:run-first", "sub:run-follow"]);
    expect(screen.getByText("Fence stale shell pages")).toBeInTheDocument();
    expect(
      view.container.querySelectorAll('[aria-label="Follow-up in the same session"]'),
    ).toHaveLength(1);
    const icon = view.container.querySelector('[aria-label="Follow-up in the same session"]');
    expect(icon?.closest("button")?.textContent).toContain("Fence stale shell pages");
  });

  it("does not mark a first run as a follow-up", () => {
    seedFollowUpRuns();
    useAgentStatusesStore.setState({ agentStatuses: [] });
    useSharedSettings.setState({ crews: [] });
    const view = renderDock(["sub:run-first"]);
    expect(screen.getByText("Reproduce paired thread delete flicker")).toBeInTheDocument();
    expect(view.container.querySelector('[aria-label="Follow-up in the same session"]')).toBeNull();
  });
});

describe("Stop role runs", () => {
  function seedRoleRuns(items: { id: string; status: string; state: string }[]) {
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-1": items.map((i) => i.id) },
      runtimeItemsByIdByThread: {
        "thread-1": Object.fromEntries(
          items.map((i) => [
            i.id,
            {
              id: i.id,
              type: "tool_call",
              state: i.state,
              payload: {
                name: "Codex · GPT-5.5",
                title: "Task",
                status: i.status,
                isCrossagent: true,
                subAgentType: "Builder",
              },
              streams: {},
            },
          ]),
        ),
      },
      runtimeStructuralVersionByThread: { "thread-1": 1 },
    } as never);
  }

  const section = (ids: string[]) => (
    <CrewDockSection
      threadId="thread-1"
      thread={thread}
      binding={binding}
      runIds={ids}
      renderRun={(id) => <div key={id}>{id}</div>}
      showPlacementToggle={false}
    />
  );

  it("cancels each running run of the role, stripping the sub: item prefix", () => {
    remoteSession = false;
    bridge.cancelCrossagentRun.mockClear();
    seedRoleRuns([
      { id: "sub:run-1", status: "running", state: "started" },
      { id: "sub:run-2", status: "running", state: "started" },
    ]);
    useSharedSettings.setState({ crews: [savedCrew] });
    renderWithI18n(section(["sub:run-1", "sub:run-2"]));
    fireEvent.click(screen.getByRole("button", { name: "Stop Builder runs" }));
    expect(bridge.cancelCrossagentRun).toHaveBeenCalledTimes(2);
    expect(bridge.cancelCrossagentRun).toHaveBeenCalledWith({
      threadId: "thread-1",
      runId: "run-1",
    });
    expect(bridge.cancelCrossagentRun).toHaveBeenCalledWith({
      threadId: "thread-1",
      runId: "run-2",
    });
  });

  it("hides the Stop action when the role has no running runs", () => {
    remoteSession = false;
    seedRoleRuns([{ id: "sub:run-1", status: "completed", state: "completed" }]);
    useSharedSettings.setState({ crews: [savedCrew] });
    renderWithI18n(section(["sub:run-1"]));
    expect(screen.queryByRole("button", { name: "Stop Builder runs" })).toBeNull();
  });

  it("hides the Stop action on remote clients", () => {
    remoteSession = true;
    seedRoleRuns([{ id: "sub:run-1", status: "running", state: "started" }]);
    useSharedSettings.setState({ crews: [savedCrew] });
    renderWithI18n(section(["sub:run-1"]));
    expect(screen.queryByRole("button", { name: "Stop Builder runs" })).toBeNull();
    remoteSession = false;
  });
});
