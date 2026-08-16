// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project, ScheduledTask, ScheduledTaskRun } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const task: ScheduledTask = {
  id: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
  name: "Daily brief",
  prompt: "Summarize my priorities.",
  agentKind: "claude:home",
  config: { model: "claude-fable-5", effort: "high" },
  recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
  enabled: true,
  nextRunAt: "2026-07-13T15:00:00.000Z",
  lastRunAt: null,
  lastCompletedAt: null,
  lastStatus: "never",
  lastResult: null,
  lastError: null,
  createdAt: "2026-07-10T12:00:00.000Z",
  updatedAt: "2026-07-10T12:00:00.000Z",
};

const run: ScheduledTaskRun = {
  id: "6f3b1a2c-1111-4d5e-8a9b-0c1d2e3f4a5b",
  scheduleId: task.id,
  threadId: "aa11bb22-cc33-4d44-9e55-6f77aa88bb99",
  startedAt: "2026-07-10T09:00:00.000Z",
  completedAt: "2026-07-10T09:01:00.000Z",
  status: "succeeded",
  summary: "Reviewed priorities for today.",
  error: null,
};

const bridge = vi.hoisted(() => ({
  getSchedules: vi.fn<() => Promise<ScheduledTask[]>>(),
  createSchedule: vi.fn<(input: unknown) => Promise<ScheduledTask>>(),
  updateSchedule: vi.fn<(input: { id: string; task: unknown }) => Promise<ScheduledTask>>(),
  deleteSchedule: vi.fn<() => Promise<void>>(),
  runScheduleNow: vi.fn<() => Promise<ScheduledTask>>(),
  getScheduleRuns: vi.fn<(input: { id: string }) => Promise<ScheduledTaskRun[]>>(),
}));

const agentCreation = vi.hoisted(() => ({
  ensureHomeScopeProject: vi.fn<() => Promise<{ id: string }>>(),
  setComposerSeed: vi.fn<(projectId: string, text: string) => void>(),
  openDraft: vi.fn<(projectId: string) => void>(),
}));

const nav = vi.hoisted(() => ({
  openThread: vi.fn<(threadId: string) => void>(),
}));

const appState = vi.hoisted(() => ({
  threads: [] as {
    id: string;
    title: string;
    agentKind: string;
    projectId: string;
    config: { model: string; effort?: string };
  }[],
  projects: [] as Project[],
}));

const agentState = vi.hoisted(() => ({
  statuses: [] as AgentStatus[],
}));

const status: AgentStatus = {
  kind: "claude:home",
  label: "Claude Personal",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "claude-fable-5", label: "Fable 5" }],
    efforts: ["high"],
    modelEfforts: { "claude-fable-5": ["high"] },
    defaultEffort: "high",
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    supportsOneShot: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal", "gui"],
    settingDefs: [],
  },
};

function makeStatus(
  overrides: Partial<Omit<AgentStatus, "capabilities">> & {
    capabilities?: Partial<AgentStatus["capabilities"]>;
  },
): AgentStatus {
  return {
    ...status,
    ...overrides,
    capabilities: {
      ...status.capabilities,
      ...overrides.capabilities,
    },
  };
}

const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isCompactClientSurface: () => false,
}));
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: { agentStatuses: AgentStatus[] }) => unknown) =>
    selector({ agentStatuses: agentState.statuses }),
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  ensureHomeScopeProject: agentCreation.ensureHomeScopeProject,
}));
vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: nav.openThread,
}));
// The run rows render the linked thread's provider icon; the icon itself is
// covered by ThreadProviderIcon/ProviderIcon tests.
vi.mock("@/renderer/components/providers/ThreadProviderIcon", () => ({
  ThreadProviderIcon: () => null,
}));
vi.mock("@/renderer/state/appStore", () => {
  const getState = () => ({
    setComposerSeed: agentCreation.setComposerSeed,
    openDraft: agentCreation.openDraft,
    threads: appState.threads,
    projects: appState.projects,
    view: { kind: "home" as const },
    focusedPaneId: null,
  });
  const useAppStore = ((selector: (state: ReturnType<typeof getState>) => unknown) =>
    selector(getState())) as unknown as {
    (selector: (state: ReturnType<typeof getState>) => unknown): unknown;
    getState: typeof getState;
  };
  useAppStore.getState = getState;
  return { useAppStore };
});

import { SchedulesView } from "./SchedulesView";

describe("SchedulesView", () => {
  beforeEach(() => {
    layout.compact = false;
    agentState.statuses = [status];
    bridge.getSchedules.mockReset().mockResolvedValue([task]);
    bridge.createSchedule.mockReset().mockResolvedValue(task);
    bridge.updateSchedule.mockReset().mockImplementation(async ({ task: input }) => ({
      ...task,
      ...(input as ScheduledTask),
    }));
    bridge.deleteSchedule.mockReset().mockResolvedValue(undefined);
    bridge.runScheduleNow.mockReset().mockResolvedValue({ ...task, lastStatus: "running" });
    bridge.getScheduleRuns.mockReset().mockResolvedValue([run]);
    agentCreation.ensureHomeScopeProject.mockReset().mockResolvedValue({ id: "home" });
    agentCreation.setComposerSeed.mockReset();
    agentCreation.openDraft.mockReset();
    nav.openThread.mockReset();
    appState.threads = [
      {
        id: run.threadId,
        title: "Daily brief run thread",
        agentKind: "claude:home",
        projectId: "home",
        config: { model: "claude-fable-5", effort: "high" },
      },
    ];
    appState.projects = [];
  });

  it("excludes Cursor when its GUI SDK authentication is missing", async () => {
    agentState.statuses = [
      makeStatus({
        kind: "cursor",
        label: "Cursor",
        authState: "authenticated",
        presentationAuthStates: {
          terminal: "authenticated",
          gui: "missing",
        },
        capabilities: {
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
          presentationCapabilities: {
            gui: {
              models: [{ id: "sdk-model", label: "SDK Model" }],
              presentationMode: "gui",
            },
          },
        },
      }),
    ];

    render(<SchedulesView />);

    expect(await screen.findByText("Connect an agent to create schedules.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New schedule" })).toBeDisabled();
  });

  it("excludes terminal-only agents, including Cursor when its GUI SDK is unavailable", async () => {
    agentState.statuses = [
      makeStatus({
        kind: "cursor",
        label: "Cursor",
        authState: "authenticated",
        presentationAuthStates: { terminal: "authenticated" },
        capabilities: {
          presentationMode: "terminal",
          presentationModes: ["terminal"],
        },
      }),
      makeStatus({
        kind: "qoder",
        label: "Terminal only",
        capabilities: {
          presentationMode: "terminal",
          presentationModes: ["terminal"],
        },
      }),
    ];

    render(<SchedulesView />);

    expect(await screen.findByText("Connect an agent to create schedules.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New schedule" })).toBeDisabled();
  });

  it("keeps the one-shot capability gate for GUI agents", async () => {
    agentState.statuses = [
      makeStatus({
        capabilities: {
          presentationMode: "gui",
          presentationModes: ["gui"],
          supportsOneShot: false,
        },
      }),
    ];

    render(<SchedulesView />);

    expect(await screen.findByText("Connect an agent to create schedules.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New schedule" })).toBeDisabled();
  });

  it("loads a device schedule and exposes run and pause actions", async () => {
    render(<SchedulesView />);

    expect(await screen.findByText("Daily brief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(bridge.runScheduleNow).toHaveBeenCalledWith({ id: task.id }));

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(bridge.updateSchedule).toHaveBeenCalledWith({
        id: task.id,
        task: expect.objectContaining({ enabled: false, prompt: task.prompt }),
      }),
    );
  });

  it("creates a Home-scoped schedule from the shared editor", async () => {
    bridge.getSchedules.mockResolvedValueOnce([]);
    render(<SchedulesView />);

    fireEvent.click(await screen.findByRole("button", { name: "More schedule options" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Create schedule" }));
    fireEvent.change(screen.getByLabelText("Schedule name"), {
      target: { value: "Weekly review" },
    });
    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "Review the week." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() => expect(bridge.createSchedule).toHaveBeenCalledTimes(1));
    expect(bridge.createSchedule.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        name: "Weekly review",
        prompt: "Review the week.",
        agentKind: "claude:home",
        // Defaults to the built-in Home scope (null), not a project.
        projectId: null,
      }),
    );
  });

  it("does not offer remote projects to device-owned schedules", async () => {
    appState.projects = [
      {
        id: "local-project",
        name: "Local project",
        location: { kind: "windows", path: "C:\\local-project" },
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "remote-project",
        name: "Remote project",
        location: { kind: "windows", path: "C:\\remote-project", remoteServerId: "d1" },
        remoteServerId: "d1",
        remoteId: "remote-project",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ];
    bridge.getSchedules.mockResolvedValueOnce([]);
    render(<SchedulesView />);

    fireEvent.click(await screen.findByRole("button", { name: "More schedule options" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Create schedule" }));
    fireEvent.click(screen.getByLabelText("Project"));

    expect((await screen.findAllByText("Local project")).length).toBeGreaterThan(0);
    const location = screen.getByText("C:\\local-project");
    expect(location.closest('[role="option"]')?.querySelector(".lucide-monitor")).not.toBeNull();
    expect(screen.queryByText("Remote project")).not.toBeInTheDocument();
  });

  it("creates a preset with one click", async () => {
    bridge.getSchedules.mockResolvedValueOnce([]);
    render(<SchedulesView />);

    fireEvent.click(await screen.findByRole("button", { name: /Daily brief/ }));

    await waitFor(() => expect(bridge.createSchedule).toHaveBeenCalledTimes(1));
    expect(bridge.createSchedule.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        name: "Daily brief",
        recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
      }),
    );
  });

  it("runs create-with-agent directly from the primary split button without opening the menu", async () => {
    render(<SchedulesView />);

    fireEvent.click(await screen.findByRole("button", { name: "New schedule" }));

    // The primary segment must act immediately, not reveal the dropdown menu.
    expect(screen.queryByRole("menuitem", { name: "Create schedule" })).not.toBeInTheDocument();
    await waitFor(() => expect(agentCreation.openDraft).toHaveBeenCalledWith("home"));
    expect(agentCreation.setComposerSeed).toHaveBeenCalledWith(
      "home",
      expect.stringContaining("Poracode schedule controls"),
    );
  });

  it("starts a home chat from the split-button dropdown", async () => {
    render(<SchedulesView />);

    fireEvent.click(await screen.findByRole("button", { name: "More schedule options" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Create with Agent" }));

    await waitFor(() => expect(agentCreation.openDraft).toHaveBeenCalledWith("home"));
  });

  it("hides a suggestion whose schedule already exists and keeps the rest", async () => {
    render(<SchedulesView />);

    // A schedule named "Daily brief" exists, so that suggestion is suppressed…
    // (the name still appears once as the schedule row itself).
    expect(await screen.findByText("Suggestions")).toBeInTheDocument();
    expect(
      screen.queryByText("Start each day with priorities and next steps."),
    ).not.toBeInTheDocument();
    // …while unused presets stay available as suggestions.
    expect(screen.getByRole("button", { name: /Weekly review/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Keep me on track/ })).toBeInTheDocument();
  });

  it("shows every suggestion when no schedules exist", async () => {
    bridge.getSchedules.mockResolvedValueOnce([]);
    render(<SchedulesView />);

    expect(await screen.findByRole("button", { name: /Daily brief/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Weekly review/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Keep me on track/ })).toBeInTheDocument();
  });

  it("fetches and shows previous runs in the modal opened from the row action", async () => {
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Previous runs" }));

    await waitFor(() => expect(bridge.getScheduleRuns).toHaveBeenCalledWith({ id: task.id }));
    // Each run renders as a single row: provider icon + model/effort meta +
    // status icon + start time. The thread title is omitted — it always
    // duplicates the schedule name.
    expect(await screen.findByLabelText("Succeeded")).toBeInTheDocument();
    expect(screen.getByText("Fable 5 · High")).toBeInTheDocument();
    expect(screen.queryByText("Daily brief run thread")).not.toBeInTheDocument();
  });

  it("shows an empty state when a schedule has no runs", async () => {
    bridge.getScheduleRuns.mockResolvedValue([]);
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Previous runs" }));

    expect(await screen.findByText("No runs yet.")).toBeInTheDocument();
  });

  it("opens the linked thread when a run row in the modal is clicked", async () => {
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Previous runs" }));
    const statusIcon = await screen.findByLabelText("Succeeded");
    fireEvent.click(statusIcon.closest("button")!);

    await waitFor(() => expect(nav.openThread).toHaveBeenCalledWith(run.threadId));
  });

  it("renders a deleted thread's run as non-interactive without its title", async () => {
    appState.threads = [];
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Previous runs" }));
    const statusIcon = await screen.findByLabelText("Succeeded");

    // No thread to navigate to: the row keeps the time-only presentation and
    // is not a button, so clicking it never routes anywhere.
    expect(screen.queryByText("Daily brief run thread")).not.toBeInTheDocument();
    expect(statusIcon.closest("button")).toBeNull();
    fireEvent.click(statusIcon);
    expect(nav.openThread).not.toHaveBeenCalled();
  });

  it("stacks schedule editor field rows on compact", async () => {
    layout.compact = true;
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));

    const projectLabel = screen.getByText("Project", { selector: "p" });
    expect(projectLabel.closest(".flex-col")).not.toBeNull();
    expect(screen.getByLabelText("Project").closest(".w-full")).not.toBeNull();
    expect(document.querySelector(".w-\\[280px\\]")).toBeNull();
  });
});
