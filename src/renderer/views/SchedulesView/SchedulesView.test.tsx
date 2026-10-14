// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project, ScheduledTask, ScheduledTaskRun } from "@/shared/contracts";
import { DEFAULT_SCHEDULE_AUTOMATION } from "@/shared/contracts";
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
  getAutomationsSnapshot:
    vi.fn<
      (
        query: import("@/shared/contracts").ScheduleRunInboxQuery,
      ) => Promise<import("@/shared/contracts").AutomationsSnapshot>
    >(),
  getScheduleRunInbox:
    vi.fn<
      (query: import("@/shared/contracts").ScheduleRunInboxQuery) => Promise<ScheduledTaskRun[]>
    >(),
  updateScheduleRunState:
    vi.fn<
      (
        payload: import("@/shared/contracts").UpdateScheduleRunStatePayload,
      ) => Promise<ScheduledTaskRun | null>
    >(),
  cancelScheduleRun: vi.fn<(payload: { id: string }) => Promise<boolean>>(),
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
    remoteServerId?: string;
    remoteId?: string;
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
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServersState } from "@/renderer/state/remoteServers/types";

const originalRemoteState = {
  servers: useRemoteServersStore.getState().servers,
  runtime: useRemoteServersStore.getState().runtime,
  withClient: useRemoteServersStore.getState().withClient,
};

describe("SchedulesView", () => {
  beforeEach(() => {
    layout.compact = false;
    agentState.statuses = [status];
    useRemoteServersStore.setState({
      servers: originalRemoteState.servers,
      runtime: originalRemoteState.runtime,
      withClient: originalRemoteState.withClient,
    });
    bridge.getSchedules.mockReset().mockResolvedValue([task]);
    bridge.getAutomationsSnapshot.mockReset().mockImplementation(async () => ({
      schedules: await bridge.getSchedules(),
      runs: [run],
      unreadCount: 0,
    }));
    bridge.getScheduleRunInbox.mockReset().mockResolvedValue([]);
    bridge.updateScheduleRunState.mockReset().mockResolvedValue(run);
    bridge.cancelScheduleRun.mockReset().mockResolvedValue(true);
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

  it("allows an unsupported AI heartbeat to be saved as a single pass", async () => {
    bridge.getSchedules.mockResolvedValue([
      {
        ...task,
        automation: {
          ...DEFAULT_SCHEDULE_AUTOMATION,
          mode: { kind: "heartbeat", targetThreadId: run.threadId },
          completionPolicy: { kind: "ai-evaluated", stopWhen: "Done", confidenceThreshold: 0.9 },
        },
      },
    ]);
    render(<SchedulesView />);
    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
    fireEvent.click(screen.getByLabelText("Execution mode"));
    fireEvent.click(await screen.findByRole("option", { name: "Single pass" }));
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(bridge.updateSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.objectContaining({
            automation: expect.objectContaining({
              mode: { kind: "new-thread" },
              completionPolicy: { kind: "none" },
            }),
          }),
        }),
      ),
    );
  });

  it("discloses removal of all results and refreshes the inbox after deleting", async () => {
    bridge.getAutomationsSnapshot.mockImplementation(async () => ({
      schedules: await bridge.getSchedules(),
      runs: bridge.deleteSchedule.mock.calls.length ? [] : [run],
      unreadCount: bridge.deleteSchedule.mock.calls.length ? 0 : 1,
    }));
    render(<SchedulesView />);
    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Delete schedule" }));
    expect(
      await screen.findByText("This removes the schedule and all its saved run results."),
    ).toBeInTheDocument();
    bridge.getSchedules.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(bridge.getAutomationsSnapshot).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Edit schedule" })).not.toBeInTheDocument();
  });

  it("identifies an explicitly different weekly time zone", async () => {
    bridge.getSchedules.mockResolvedValue([
      {
        ...task,
        recurrence: {
          kind: "weekly",
          days: [1, 2, 3, 4, 5],
          time: "08:00",
          timeZone:
            Intl.DateTimeFormat().resolvedOptions().timeZone === "America/New_York"
              ? "Europe/Malta"
              : "America/New_York",
        },
      },
    ]);
    render(<SchedulesView />);
    expect(
      await screen.findByText(/Weekdays at .*\((America\/New_York|Europe\/Malta)\)/),
    ).toBeInTheDocument();
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

  it("allows structured GUI runs without requiring a one-shot helper", async () => {
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

    expect(await screen.findByText("Daily brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New schedule" })).toBeEnabled();
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
        recurrence: expect.objectContaining({
          kind: "weekly",
          days: [1, 2, 3, 4, 5],
          time: "08:00",
        }),
      }),
    );
  });

  it("opens the editor from the primary split button", async () => {
    render(<SchedulesView />);
    fireEvent.click(await screen.findByRole("button", { name: "New schedule" }));
    expect(await screen.findByLabelText("Schedule name")).toBeInTheDocument();
    expect(agentCreation.openDraft).not.toHaveBeenCalled();
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

  it("opens a remote machine's run through its mirrored thread", async () => {
    const mirroredThreadId = `remote:desktop-1:thread:${run.threadId}`;
    appState.threads = [
      {
        id: mirroredThreadId,
        title: "Host run thread",
        agentKind: "claude:home",
        projectId: "home",
        config: { model: "claude-fable-5", effort: "high" },
        remoteServerId: "desktop-1",
        remoteId: run.threadId,
      },
    ];
    installRemoteHost([hostTask]);
    render(<SchedulesView />);

    expect(await screen.findByText("Daily brief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schedule machine" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Studio" }));

    expect(await screen.findByText("Host nightly deploy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous runs" }));

    // The run row must resolve the HOST thread id to the mirrored id and open
    // that thread — not render as a dead "deleted thread" row.
    const runRow = await screen.findByLabelText("Succeeded");
    fireEvent.click(runRow.closest("button")!);
    expect(await screen.findByText("Reviewed priorities for today.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(nav.openThread).toHaveBeenCalledWith(mirroredThreadId);
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

    expect(await screen.findByText("Reviewed priorities for today.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    await waitFor(() => expect(nav.openThread).toHaveBeenCalledWith(run.threadId));
  });

  it("opens saved details when the conversation was deleted", async () => {
    appState.threads = [];
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Previous runs" }));
    const statusIcon = await screen.findByLabelText("Succeeded");

    expect(statusIcon.closest("button")).not.toBeNull();
    fireEvent.click(statusIcon.closest("button")!);
    expect(await screen.findByText("Reviewed priorities for today.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open conversation" })).toBeDisabled();
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

  const hostTask: ScheduledTask = {
    ...task,
    id: "3f9b1c2d-8888-4a7b-9c0d-1e2f3a4b5c6d",
    name: "Host nightly deploy",
  };

  function installRemoteHost(schedules: ScheduledTask[]): {
    readonly schedules: ReturnType<typeof vi.fn>;
    readonly runScheduleNow: ReturnType<typeof vi.fn>;
  } {
    const schedulesMock = vi.fn<() => Promise<ScheduledTask[]>>(async () => schedules);
    const runNowMock = vi.fn<(id: string) => Promise<ScheduledTask>>(async (id: string) => ({
      ...hostTask,
      id,
      lastStatus: "running",
    }));
    const withClient: RemoteServersState["withClient"] = async (_desktopId, invoke) =>
      invoke({
        automationsSnapshot: vi.fn<() => Promise<import("@/shared/contracts").AutomationsSnapshot>>(
          async () => ({
            schedules: await schedulesMock(),
            runs: [run],
            unreadCount: 0,
          }),
        ),
        scheduleRunInbox: vi.fn<() => Promise<ScheduledTaskRun[]>>(async () => []),
        updateScheduleRunState: vi.fn<() => Promise<ScheduledTaskRun>>(async () => run),
        cancelScheduleRun: vi.fn<() => Promise<boolean>>(async () => true),
        schedules: schedulesMock,
        runScheduleNow: runNowMock,
        scheduleRuns: vi.fn<() => Promise<ScheduledTaskRun[]>>(async () => [run]),
      } as unknown as Parameters<typeof invoke>[0]);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "http://192.168.1.10:3200",
          accessToken: "token",
          scopes: ["session:read", "session:operate"],
        },
      ],
      runtime: {
        "desktop-1": {
          status: "online",
          projects: [],
          threads: [],
          agentStatuses: {
            windows: [status],
            wsl: [],
            updatedAt: "2026-09-11T00:00:00.000Z",
          },
        },
      },
      withClient,
    });
    return { schedules: schedulesMock, runScheduleNow: runNowMock };
  }

  it("lists a remote environment's schedules through its host client", async () => {
    const host = installRemoteHost([hostTask]);
    render(<SchedulesView />);

    // Local machine first: the device schedule loads through the bridge.
    expect(await screen.findByText("Daily brief")).toBeInTheDocument();

    // Switch to the connected remote environment. (The "Daily brief" text that
    // remains is the preset suggestion card — no local schedule row survives.)
    fireEvent.click(screen.getByRole("button", { name: "Schedule machine" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Studio" }));

    expect(await screen.findByText("Host nightly deploy")).toBeInTheDocument();
    expect(host.schedules).toHaveBeenCalledTimes(1);
    expect(bridge.getSchedules).toHaveBeenCalledTimes(1);
  });

  it("runs a remote environment's schedule on its host", async () => {
    const host = installRemoteHost([hostTask]);
    render(<SchedulesView />);

    expect(await screen.findByText("Daily brief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schedule machine" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Studio" }));

    expect(await screen.findByText("Host nightly deploy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(host.runScheduleNow).toHaveBeenCalledWith(hostTask.id));
    expect(bridge.runScheduleNow).not.toHaveBeenCalled();
  });
});
