import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { SavedCrew, ThreadCrewBinding } from "@/shared/crew";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
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
        renderRun={(id) => (
          <div key={id} data-testid={`run-${id}`}>
            {id}
          </div>
        )}
        showPlacementToggle={false}
      />,
    );
    const builderRuns = view.container.querySelector('[data-crew-role-runs="builder"]');
    expect(within(builderRuns as HTMLElement).getByTestId("run-run-trimmed")).toBeInTheDocument();
    expect(within(builderRuns as HTMLElement).getByTestId("run-run-case")).toBeInTheDocument();
    const other = screen.getByText("Other agents").parentElement;
    expect(within(other as HTMLElement).getByTestId("run-run-other")).toBeInTheDocument();

    const member = view.container.querySelector('[data-crew-member-row="Builder"]');
    expect(member?.querySelector('[data-crew-member-line="text"]')).toHaveClass("truncate");
    expect(member?.querySelector('[data-crew-member-line="meta"]')).toHaveClass("truncate");
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
