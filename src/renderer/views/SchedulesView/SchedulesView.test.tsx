// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, ScheduledTask, ScheduledTaskRun } from "@/shared/contracts";
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
  scheduledFor: "2026-07-10T09:00:00.000Z",
  trigger: "scheduled",
  attempt: 1,
  iteration: 1,
  startedAt: "2026-07-10T09:00:00.000Z",
  completedAt: "2026-07-10T09:01:00.000Z",
  status: "succeeded",
  summary: "Reviewed priorities for today.",
  error: null,
  result: {
    outcome: "findings",
    summary: "Reviewed priorities for today.",
    severity: "warning",
    unread: true,
    archivedAt: null,
    changedFiles: [],
    stopReason: null,
  },
  automationSnapshot: {
    version: 1,
    mode: { kind: "new-thread" },
    maxRuntimeSeconds: 3_600,
    maxIterations: null,
    stopOnError: false,
    misfirePolicy: "coalesce",
    retryPolicy: { kind: "none" },
    completionPolicy: { kind: "none" },
  },
};

const bridge = vi.hoisted(() => ({
  getSchedules: vi.fn<() => Promise<ScheduledTask[]>>(),
  getAutomationsSnapshot: vi.fn<
    (input: { filter: "unread" | "all" | "archived"; limit?: number }) => Promise<{
      schedules: ScheduledTask[];
      runs: ScheduledTaskRun[];
      unreadCount: number;
    }>
  >(),
  createSchedule: vi.fn<(input: unknown) => Promise<ScheduledTask>>(),
  updateSchedule: vi.fn<(input: { id: string; task: unknown }) => Promise<ScheduledTask>>(),
  deleteSchedule: vi.fn<() => Promise<void>>(),
  runScheduleNow: vi.fn<() => Promise<ScheduledTask>>(),
  getScheduleRuns: vi.fn<(input: { id: string }) => Promise<ScheduledTaskRun[]>>(),
  getScheduleRunInbox:
    vi.fn<
      (input: {
        filter: "unread" | "all" | "archived";
        limit?: number;
      }) => Promise<ScheduledTaskRun[]>
    >(),
  updateScheduleRunState:
    vi.fn<
      (input: {
        id: string;
        unread?: boolean;
        archived?: boolean;
      }) => Promise<ScheduledTaskRun | null>
    >(),
  cancelScheduleRun: vi.fn<(input: { id: string }) => Promise<boolean>>(),
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
  projects: [] as { id: string; name: string }[],
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
    settingDefs: [],
  },
};

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
}));
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: { agentStatuses: AgentStatus[] }) => unknown) =>
    selector({ agentStatuses: [status] }),
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
import { deviceTimeZone } from "./scheduleDraft";

describe("SchedulesView", () => {
  beforeEach(() => {
    bridge.getSchedules.mockReset().mockResolvedValue([task]);
    bridge.createSchedule.mockReset().mockResolvedValue(task);
    bridge.updateSchedule.mockReset().mockImplementation(async ({ task: input }) => ({
      ...task,
      ...(input as ScheduledTask),
    }));
    bridge.deleteSchedule.mockReset().mockResolvedValue(undefined);
    bridge.runScheduleNow.mockReset().mockResolvedValue({ ...task, lastStatus: "running" });
    bridge.getScheduleRuns.mockReset().mockResolvedValue([run]);
    bridge.getScheduleRunInbox.mockReset().mockResolvedValue([run]);
    bridge.getAutomationsSnapshot.mockReset().mockImplementation(async (input) => {
      const schedules = await bridge.getSchedules();
      const runs = await bridge.getScheduleRunInbox(input);
      const unreadRuns =
        input.filter === "unread"
          ? runs
          : await bridge.getScheduleRunInbox({ filter: "unread", limit: 100 });
      return { schedules, runs, unreadCount: unreadRuns.length };
    });
    bridge.updateScheduleRunState.mockReset().mockImplementation(async (input) => ({
      ...run,
      result: run.result
        ? {
            ...run.result,
            ...(input.unread !== undefined ? { unread: input.unread } : {}),
            ...(input.archived !== undefined
              ? { archivedAt: input.archived ? "2026-07-10T10:00:00.000Z" : null }
              : {}),
          }
        : null,
    }));
    bridge.cancelScheduleRun.mockReset().mockResolvedValue(true);
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

  it("uses an explicit time zone when a legacy local schedule changes to cron", async () => {
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
    fireEvent.click(await screen.findByLabelText("Repeat"));
    fireEvent.click(await screen.findByRole("option", { name: "Cron" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(bridge.updateSchedule).toHaveBeenCalledTimes(1));
    expect(bridge.updateSchedule.mock.calls[0]?.[0]).toEqual({
      id: task.id,
      task: expect.objectContaining({
        recurrence: {
          kind: "cron",
          expression: "0 9 * * 1-5",
          timeZone: deviceTimeZone(),
        },
      }),
    });
  });

  it("preserves legacy local time when cron selection is toggled back", async () => {
    render(<SchedulesView />);

    await screen.findByText("Daily brief");
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
    fireEvent.click(await screen.findByLabelText("Repeat"));
    fireEvent.click(await screen.findByRole("option", { name: "Cron" }));
    fireEvent.click(screen.getByLabelText("Repeat"));
    fireEvent.click(await screen.findByRole("option", { name: "Weekdays" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(bridge.updateSchedule).toHaveBeenCalledTimes(1));
    expect(bridge.updateSchedule.mock.calls[0]?.[0]).toEqual({
      id: task.id,
      task: expect.objectContaining({ recurrence: task.recurrence }),
    });
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

  it("creates a preset with one click", async () => {
    bridge.getSchedules.mockResolvedValueOnce([]);
    render(<SchedulesView />);

    fireEvent.click(await screen.findByRole("button", { name: /Daily brief/ }));

    await waitFor(() => expect(bridge.createSchedule).toHaveBeenCalledTimes(1));
    expect(bridge.createSchedule.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        name: "Daily brief",
        recurrence: {
          kind: "weekly",
          days: [1, 2, 3, 4, 5],
          time: "08:00",
          timeZone: deviceTimeZone(),
        },
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
    expect(screen.getByText("Reviewed priorities for today.")).toBeInTheDocument();
    expect(screen.queryByText("Daily brief run thread")).not.toBeInTheDocument();
  });

  it("shows unread findings in triage and marks one read before opening its conversation", async () => {
    bridge.getScheduleRunInbox
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([]);
    render(<SchedulesView />);

    const triageTab = await screen.findByRole("tab", { name: /Triage/ });
    expect(triageTab).toHaveTextContent("1");
    fireEvent.click(triageTab);

    expect(await screen.findByText("Reviewed priorities for today.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Open conversation for ${task.name}` }));

    await waitFor(() =>
      expect(bridge.updateScheduleRunState).toHaveBeenCalledWith({ id: run.id, unread: false }),
    );
    expect(nav.openThread).toHaveBeenCalledWith(run.threadId);
  });

  it("archives a triage finding", async () => {
    render(<SchedulesView />);
    fireEvent.click(await screen.findByRole("tab", { name: /Triage/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Archive finding" }));

    await waitFor(() =>
      expect(bridge.updateScheduleRunState).toHaveBeenCalledWith({
        id: run.id,
        archived: true,
      }),
    );
  });

  it("restores an archived triage finding", async () => {
    const archivedRun: ScheduledTaskRun = {
      ...run,
      result: {
        ...run.result!,
        unread: false,
        archivedAt: "2026-07-10T10:00:00.000Z",
      },
    };
    bridge.getScheduleRunInbox.mockImplementation(async ({ filter }) =>
      filter === "archived" ? [archivedRun] : [run],
    );
    render(<SchedulesView />);
    fireEvent.click(await screen.findByRole("tab", { name: /Triage/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "Archived" }));

    fireEvent.click(await screen.findByRole("button", { name: "Restore finding" }));

    await waitFor(() =>
      expect(bridge.updateScheduleRunState).toHaveBeenCalledWith({
        id: run.id,
        archived: false,
      }),
    );
  });

  it("cancels an active run from triage", async () => {
    const runningTask: ScheduledTask = { ...task, lastStatus: "running" };
    const runningRun: ScheduledTaskRun = {
      ...run,
      completedAt: null,
      status: "running",
      summary: null,
      result: null,
    };
    bridge.getSchedules.mockResolvedValue([runningTask]);
    bridge.getScheduleRunInbox.mockImplementation(async ({ filter }) =>
      filter === "all" ? [runningRun] : [],
    );
    render(<SchedulesView />);
    fireEvent.click(await screen.findByRole("tab", { name: /Triage/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "All" }));

    fireEvent.click(await screen.findByRole("button", { name: "Cancel run" }));

    await waitFor(() => expect(bridge.cancelScheduleRun).toHaveBeenCalledWith({ id: run.id }));
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
});
