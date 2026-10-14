import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ButtonGroup, Dropdown, Input, Label, TextField } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  Bot,
  CalendarClock,
  ChevronDown,
  Clock3,
  Loader2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type {
  AgentCapability,
  ScheduledTask,
  ScheduledTaskInput,
  ScheduledTaskRun,
  ScheduleRunInboxQuery,
  UpdateScheduleRunStatePayload,
  AutomationsSnapshot,
} from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";
import { isHomeProject } from "@/shared/homeScope";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import { normalizeAnalyticsProvider } from "@/shared/analytics/posthogPrivacy";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
import { agentConfigProductProperties } from "@/renderer/analytics/threadAnalyticsProperties";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { MobileMachineToolbar } from "@/renderer/components/common/MobileMachineToolbar";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";
import {
  LightballTabs,
  makeLightballCountTrailing,
} from "@/renderer/components/common/LightballTabs";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";
import { getCurrentProjectId } from "@/renderer/actions/currentProject";
import { openThread } from "@/renderer/actions/threadActions";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useProjectIdsHiddenByWorkspace } from "@/renderer/state/workspaceSelectors";
import { SettingsPage } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import { useAutomationSnapshot } from "./useAutomationSnapshot";
import { useScheduleRunDetails } from "./useScheduleRunDetails";
import { TriagePanel } from "./parts/TriagePanel";
import { ScheduleRunDetails } from "./parts/ScheduleRunDetails";
import { ScheduleEditor } from "./ScheduleEditor";
import { PreviousRunsModal } from "./parts/PreviousRunsModal";
import { ScheduleRow } from "./parts/ScheduleRow";
import {
  type ScheduleDraft,
  newScheduleDraft,
  scheduleDraftInput,
  scheduleDraftIsValid,
  schedulePresetDraft,
  taskScheduleDraft,
  weekdayShortNames,
} from "./scheduleDraft";

type FilterMode = "all" | "active" | "paused";

function replaceTask(tasks: ScheduledTask[], next: ScheduledTask): ScheduledTask[] {
  return tasks.map((task) => (task.id === next.id ? next : task));
}

function scheduleAnalyticsProperties(
  task: ScheduledTaskInput,
  capabilities: AgentCapability | undefined,
) {
  return {
    ...agentConfigProductProperties({
      agentKind: task.agentKind,
      config: task.config,
      ...(capabilities ? { capabilities } : {}),
    }),
    enabled: task.enabled,
    has_project: Boolean(task.projectId),
    provider: normalizeAnalyticsProvider(task.agentKind),
    recurrence: task.recurrence.kind,
  };
}

export function SchedulesView(
  props: {
    readonly remoteDesktopId?: string;
    readonly onRemoteDesktopChange?: (desktopId: string | null) => void;
  } = {},
) {
  const { t, i18n } = useLingui();
  const compact = useCompactLayout();
  const [section, setSection] = useState<"schedules" | "results">("schedules");
  const [resultFilter, setResultFilter] = useState<ScheduleRunInboxQuery["filter"]>("unread");
  const [resultQuery, setResultQuery] = useState("");
  const [debouncedResultQuery, setDebouncedResultQuery] = useState("");
  const [selectedRun, setSelectedRun] = useState<ScheduledTaskRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [deleteTask, setDeleteTask] = useState<ScheduledTask | null>(null);
  const [runsTaskId, setRunsTaskId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createActionsOpen, setCreateActionsOpen] = useState(false);
  const createLongPressHandlers = useLongPress(() => {
    setCreateActionsOpen(true);
  });
  /**
   * Only projects the active workspace hides are excluded, which lets both the
   * device-wide schedules (no project) and schedules whose project was deleted
   * stay visible without needing their own special cases.
   */
  const hiddenProjectIds = useProjectIdsHiddenByWorkspace();
  /**
   * WS8 parity: schedules run on the machine that owns the project. The local
   * desktop lists its own; each connected remote environment can be selected
   * and lists ITS schedules through the remote protocol — mirroring the
   * natives' host-scoped schedules surface. Mobile keeps its existing
   * machine flow (the bridge already points at the selected host).
   */
  const [selectedMachineId, setSelectedMachineId] = useState<string>("local");
  const allRemoteServers = useRemoteServersStore((state) => state.servers);
  const remoteServers = allRemoteServers.filter((server) => server.scopes.includes("session:read"));
  // A removed server must not leave a dead machine selected (label would fall
  // back to local while every op still targeted the gone host).
  const machineId = remoteServers.some(
    (server) => remoteConnectionKey(server) === selectedMachineId,
  )
    ? selectedMachineId
    : "local";
  const isRemoteMachine = !compact && machineId !== "local";
  const remoteRuntime = useRemoteServersStore((state) =>
    machineId === "local" ? undefined : state.runtime[machineId],
  );
  const withClient = useRemoteServersStore((state) => state.withClient);
  /** Mutation results may resolve after a machine switch; only the machine
   * the operation was issued on may install them. */
  const machineRef = useRef(machineId);
  useEffect(() => {
    machineRef.current = machineId;
  }, [machineId]);
  const stillOnMachine = (opMachine: string): boolean => machineRef.current === opMachine;

  const scheduleOps = {
    create: (input: ScheduledTaskInput): Promise<ScheduledTask> =>
      isRemoteMachine
        ? withClient(machineId, (client) => client.createSchedule(input))
        : readBridge().createSchedule(input),
    update: (id: string, task: ScheduledTaskInput): Promise<ScheduledTask> =>
      isRemoteMachine
        ? withClient(machineId, (client) => client.updateSchedule(id, task))
        : readBridge().updateSchedule({ id, task }),
    remove: (id: string): Promise<void> =>
      isRemoteMachine
        ? withClient(machineId, (client) => client.deleteSchedule(id))
        : readBridge().deleteSchedule({ id }),
    runNow: (id: string): Promise<ScheduledTask> =>
      isRemoteMachine
        ? withClient(machineId, (client) => client.runScheduleNow(id))
        : readBridge().runScheduleNow({ id }),
  };

  const localAgentStatuses = useAgentStatusesStore((state) => state.agentStatuses);
  const agentStatuses = isRemoteMachine
    ? (remoteRuntime?.agentStatuses?.windows ?? [])
    : localAgentStatuses;
  const agents = agentStatuses
    .filter((agent) => {
      const presentationModes = agent.capabilities.presentationModes ?? [
        agent.capabilities.presentationMode,
      ];
      return presentationModes.includes("gui");
    })
    .map((agent) => agentStatusForPresentation(agent, "gui"))
    .filter(
      (agent) =>
        agent.installed && agent.authState !== "missing" && agent.capabilities.models.length > 0,
    );

  const loadSnapshot = useCallback(
    (inboxQuery: ScheduleRunInboxQuery): Promise<AutomationsSnapshot> => {
      return !compact && machineId !== "local"
        ? withClient(machineId, (client) => client.automationsSnapshot(inboxQuery))
        : readBridge().getAutomationsSnapshot(inboxQuery);
    },
    [compact, machineId, withClient],
  );
  const loadInbox = useCallback(
    (inboxQuery: ScheduleRunInboxQuery) =>
      !compact && machineId !== "local"
        ? withClient(machineId, (client) => client.scheduleRunInbox(inboxQuery))
        : readBridge().getScheduleRunInbox(inboxQuery),
    [compact, machineId, withClient],
  );
  const automation = useAutomationSnapshot(
    `${machineId}:${props.remoteDesktopId ?? ""}`,
    { filter: resultFilter, ...(debouncedResultQuery ? { search: debouncedResultQuery } : {}) },
    loadSnapshot,
    loadInbox,
  );
  const { schedules: tasks, setTasks, loading, loadError, refresh, runs, unreadCount } = automation;
  const resultOps = {
    update: (payload: UpdateScheduleRunStatePayload) =>
      isRemoteMachine
        ? withClient(machineId, (client) => client.updateScheduleRunState(payload))
        : readBridge().updateScheduleRunState(payload),
    cancel: (id: string) =>
      isRemoteMachine
        ? withClient(machineId, (client) => client.cancelScheduleRun(id))
        : readBridge().cancelScheduleRun({ id }),
  };
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedResultQuery(resultQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [resultQuery]);

  const fetchRuns = useCallback(
    (id: string): Promise<ScheduledTaskRun[]> => {
      if (!compact && machineId !== "local") {
        return withClient(machineId, (client) => client.scheduleRuns(id));
      }
      return readBridge().getScheduleRuns({ id });
    },
    [compact, machineId, withClient],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const runDetails = useScheduleRunDetails(
    `${machineId}:${props.remoteDesktopId ?? ""}`,
    selectedRun,
    runs.find((run) => run.id === selectedRun?.id),
    fetchRuns,
  );
  const workspaceTasks = tasks.filter(
    (task) => !task.projectId || !hiddenProjectIds.has(task.projectId),
  );
  const hiddenByWorkspaceCount = tasks.length - workspaceTasks.length;
  const visibleTasks = workspaceTasks.filter((task) => {
    if (filter === "active" && !task.enabled) return false;
    if (filter === "paused" && task.enabled) return false;
    return (
      normalizedQuery === "" ||
      task.name.toLocaleLowerCase().includes(normalizedQuery) ||
      task.prompt.toLocaleLowerCase().includes(normalizedQuery)
    );
  });

  // Derive the runs-modal target from live state so polling keeps its status
  // (and thus the modal's own live-poll cadence) accurate.
  const runsTask = runsTaskId ? (tasks.find((task) => task.id === runsTaskId) ?? null) : null;

  const weekdayNames = weekdayShortNames(i18n.locale);
  const dateTimeFormatter = new Intl.DateTimeFormat(i18n.locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const timeFormatter = new Intl.DateTimeFormat(i18n.locale, {
    hour: "numeric",
    minute: "2-digit",
  });

  function describeRecurrence(task: ScheduledTask): string {
    if (task.recurrence.kind === "once") {
      return t`Once on ${dateTimeFormatter.format(new Date(task.recurrence.runAt))}`;
    }
    if (task.recurrence.kind === "hourly") {
      return task.recurrence.minute === 0
        ? t`Every hour`
        : t`Every hour at ${task.recurrence.minute} minutes past`;
    }
    if (task.recurrence.kind === "interval") {
      const { every, unit } = task.recurrence;
      return unit === "minutes"
        ? t`Every ${every} minutes`
        : unit === "hours"
          ? t`Every ${every} hours`
          : t`Every ${every} days`;
    }
    if (task.recurrence.kind === "cron")
      return t`Cron ${task.recurrence.expression} (${task.recurrence.timeZone})`;
    const [hour, minute] = task.recurrence.time.split(":").map(Number);
    const time = timeFormatter.format(new Date(2026, 0, 1, hour, minute));
    const days = task.recurrence.days;
    const description =
      days.length === 7
        ? t`Every day at ${time}`
        : days.join(",") === "1,2,3,4,5"
          ? t`Weekdays at ${time}`
          : t`${days.map((day) => weekdayNames[day]).join(", ")} at ${time}`;
    const zone = task.recurrence.timeZone;
    return zone && zone !== Intl.DateTimeFormat().resolvedOptions().timeZone
      ? `${description} (${zone})`
      : description;
  }

  function formatNextRun(task: ScheduledTask): string {
    if (task.lastStatus === "running") return t`Running now`;
    if (task.lastStatus === "waiting-for-approval") return t`Waiting for approval`;
    if (!task.enabled || !task.nextRunAt) return t`Paused`;
    return t`Next run ${dateTimeFormatter.format(new Date(task.nextRunAt))}`;
  }

  function updateTask(task: ScheduledTask, input: ScheduledTaskInput) {
    const opMachine = machineId;
    setError("");
    void scheduleOps
      .update(task.id, input)
      .then((next) => {
        if (stillOnMachine(opMachine)) setTasks((current) => replaceTask(current, next));
      })
      .catch((updateError: unknown) => {
        if (stillOnMachine(opMachine)) setError(toErrorMessage(updateError));
      });
  }

  function runNow(task: ScheduledTask) {
    const opMachine = machineId;
    setError("");
    void scheduleOps
      .runNow(task.id)
      .then((next) => {
        if (stillOnMachine(opMachine)) setTasks((current) => replaceTask(current, next));
        captureProductEvent("schedule.run_requested", {
          ...scheduleAnalyticsProperties(
            task,
            agents.find((agent) => agent.kind === task.agentKind)?.capabilities,
          ),
          source: "manual",
        });
      })
      .catch((runError: unknown) => {
        if (stillOnMachine(opMachine)) setError(toErrorMessage(runError));
      });
  }

  function toggleEnabled(task: ScheduledTask) {
    updateTask(task, {
      ...scheduleDraftInput(taskScheduleDraft(task)),
      enabled: !task.enabled,
    });
  }

  /** A remote machine's run carries the HOST's thread id; runs resolve through
   * the mirrored thread (falling back to the raw id for local machines). */
  const resolveRunThreadId = useCallback(
    (hostThreadId: string): string =>
      machineId === "local"
        ? hostThreadId
        : (useAppStore
            .getState()
            .threads.find(
              (thread) => thread.remoteServerId === machineId && thread.remoteId === hostThreadId,
            )?.id ?? hostThreadId),
    [machineId],
  );

  // Opening a run's linked GUI thread switches the app to the "thread" view,
  // which navigates away from this schedules page automatically. Guard against
  // threads that were deleted since the run so we surface an inline error
  // instead of routing to a blank thread.
  function openRunThread(threadId: string) {
    const localThreadId = resolveRunThreadId(threadId);
    if (!useAppStore.getState().threads.some((thread) => thread.id === localThreadId)) {
      setError(t`That conversation is no longer available.`);
      return;
    }
    setError("");
    if (compact) usePanelStore.getState().closeMobileUtilityPage();
    openThread(localThreadId);
  }

  function openResult(run: ScheduledTaskRun) {
    const opMachine = machineId;
    setSelectedRun(run);
    if (run.result?.unread) {
      void resultOps
        .update({ id: run.id, unread: false })
        .then(async (updated) => {
          if (!stillOnMachine(opMachine)) return;
          if (updated)
            setSelectedRun((current) => (current?.id === updated.id ? updated : current));
          await refresh();
        })
        .catch((failure: unknown) => {
          if (stillOnMachine(opMachine)) setError(toErrorMessage(failure));
        });
    }
  }

  async function saveDraft() {
    if (!draft || !scheduleDraftIsValid(draft)) return;
    const opMachine = machineId;
    setBusy(true);
    setError("");
    try {
      const input = scheduleDraftInput(draft);
      if (draft.id) {
        const next = await scheduleOps.update(draft.id, input);
        if (stillOnMachine(opMachine)) setTasks((current) => replaceTask(current, next));
      } else {
        const next = await scheduleOps.create(input);
        if (stillOnMachine(opMachine)) setTasks((current) => [...current, next]);
        captureProductEvent("schedule.created", {
          ...scheduleAnalyticsProperties(
            input,
            agents.find((agent) => agent.kind === input.agentKind)?.capabilities,
          ),
          source: "editor",
        });
      }
      setDraft(null);
    } catch (saveError) {
      if (stillOnMachine(opMachine)) setError(toErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function createPreset(preset: ScheduleDraft) {
    const opMachine = machineId;
    setBusy(true);
    setError("");
    try {
      const input = scheduleDraftInput(preset);
      const next = await scheduleOps.create(input);
      if (stillOnMachine(opMachine)) setTasks((current) => [...current, next]);
      captureProductEvent("schedule.created", {
        ...scheduleAnalyticsProperties(
          input,
          agents.find((agent) => agent.kind === input.agentKind)?.capabilities,
        ),
        source: "preset",
      });
    } catch (presetError) {
      if (stillOnMachine(opMachine)) setError(toErrorMessage(presetError));
    } finally {
      setBusy(false);
    }
  }

  async function createWithAgent() {
    setError("");
    try {
      const store = useAppStore.getState();
      const currentProjectId = getCurrentProjectId();
      if (isRemoteMachine) {
        // The schedule will run on the selected host, so seed the draft with a
        // project mirrored from that host — the composer's thread also runs there.
        const hostProject =
          store.projects.find(
            (project) => project.id === currentProjectId && project.remoteServerId === machineId,
          ) ??
          store.projects.find(
            (project) => project.remoteServerId === machineId && !isHomeProject(project),
          );
        if (!hostProject) {
          setError(t`Add a project on this environment to start`);
          return;
        }
        store.setComposerSeed(
          hostProject.id,
          t`Help me create a schedule. Ask for any missing details, then use the Poracode schedule controls to create it for me.`,
        );
        store.openDraft(hostProject.id);
        return;
      }
      const remoteProject =
        store.projects.find(
          (project) => project.id === currentProjectId && !isHomeProject(project),
        ) ?? store.projects.find((project) => !isHomeProject(project));
      const project = isRemoteSession() ? remoteProject : await ensureHomeScopeProject();
      if (!project) {
        setError(t`Add a project to start`);
        return;
      }
      store.setComposerSeed(
        project.id,
        t`Help me create a schedule. Ask for any missing details, then use the Poracode schedule controls to create it for me.`,
      );
      if (compact) usePanelStore.getState().closeMobileUtilityPage();
      store.openDraft(project.id);
    } catch (agentError) {
      setError(toErrorMessage(agentError));
    }
  }

  const presets = [
    {
      id: "daily-brief",
      title: t`Daily brief`,
      description: t`Start each day with priorities and next steps.`,
      schedule: t`Weekdays at 8:00 AM`,
      draft: schedulePresetDraft(agents[0], {
        name: t`Daily brief`,
        prompt: t`Review my recent work and summarize today's priorities and next steps.`,
        repeatMode: "weekdays",
        days: [1, 2, 3, 4, 5],
        time: "08:00",
      }),
    },
    {
      id: "weekly-review",
      title: t`Weekly review`,
      description: t`Wrap up progress, open items, and risks.`,
      schedule: t`Friday at 4:00 PM`,
      draft: schedulePresetDraft(agents[0], {
        name: t`Weekly review`,
        prompt: t`Summarize this week's progress, unfinished work, and the most important risks for next week.`,
        repeatMode: "weekly",
        days: [5],
        time: "16:00",
      }),
    },
    {
      id: "keep-on-track",
      title: t`Keep me on track`,
      description: t`Get a quick check-in during the workday.`,
      schedule: t`Every day at 1:00 PM`,
      draft: schedulePresetDraft(agents[0], {
        name: t`Keep me on track`,
        prompt: t`Check my recent progress and give me one focused recommendation for what to do next.`,
        repeatMode: "daily",
        days: [0, 1, 2, 3, 4, 5, 6],
        time: "13:00",
      }),
    },
  ];

  // A preset is only hidden while a schedule with the same (localized) name
  // already exists; deleting that schedule brings the suggestion back.
  const availablePresets = presets.filter(
    (preset) => !tasks.some((task) => task.name === preset.title),
  );

  const suggestions =
    availablePresets.length > 0 ? (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">
          <Trans>Suggestions</Trans>
        </p>
        <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
          {availablePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy || agents.length === 0}
              onClick={() => void createPreset(preset.draft)}
              className="group flex w-full items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-default-100/60 focus-visible:bg-default-100/60 disabled:opacity-50"
            >
              <CalendarClock className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{preset.title}</p>
                <p className="truncate text-xs text-muted">{preset.description}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <Clock3 className="size-3.5" /> {preset.schedule}
              </span>
              <Plus className="size-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <SettingsPage
      title={t`Scheduled tasks`}
      description={
        <Trans>
          Run standalone tasks on this device. Schedules run while the device is awake and Poracode
          is open.
        </Trans>
      }
      bodyClassName="space-y-5"
      {...(!compact
        ? {
            actions: (
              <ButtonGroup className="w-full">
                <Button
                  variant="tertiary"
                  size="sm"
                  className="flex-1 text-foreground"
                  isDisabled={agents.length === 0}
                  onPress={() => setDraft(newScheduleDraft(agents[0]))}
                >
                  <Plus className="size-4" />
                  <Trans>New schedule</Trans>
                </Button>
                <Dropdown>
                  <Button
                    isIconOnly
                    variant="tertiary"
                    size="sm"
                    aria-label={t`More schedule options`}
                    isDisabled={agents.length === 0}
                  >
                    <ButtonGroup.Separator />
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu
                      aria-label={t`Create schedule`}
                      onAction={(key) => {
                        if (key === "agent") void createWithAgent();
                        else setDraft(newScheduleDraft(agents[0]));
                      }}
                    >
                      <Dropdown.Item id="manual" textValue={t`Create schedule`}>
                        <CalendarClock className="size-4 text-muted" />
                        <Label>
                          <Trans>Create schedule</Trans>
                        </Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="agent" textValue={t`Create with Agent`}>
                        <Bot className="size-4 text-muted" />
                        <Label>
                          <Trans>Create with Agent</Trans>
                        </Label>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </ButtonGroup>
            ),
          }
        : {})}
    >
      <LightballTabs<"schedules" | "results">
        tabs={[
          { id: "schedules", label: t`Schedules` },
          {
            id: "results",
            label: t`Results`,
            ...(unreadCount > 0 ? { trailing: makeLightballCountTrailing(unreadCount) } : {}),
          },
        ]}
        active={section}
        onChange={setSection}
        ariaLabel={t`Automation sections`}
        className="w-fit"
      />
      <div className="flex flex-wrap items-center gap-3">
        {!compact && remoteServers.length > 0 ? (
          <Dropdown>
            <Dropdown.Trigger
              aria-label={t`Schedule machine`}
              className="flex h-7 shrink-0 items-center gap-1 rounded px-2 text-xs text-muted outline-none transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
            >
              <span className="max-w-40 truncate">
                {machineId === "local"
                  ? t`This desktop`
                  : (remoteServers.find((server) => remoteConnectionKey(server) === machineId)
                      ?.label ?? t`This desktop`)}
              </span>
              <ChevronDown className="size-3.5" />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom start">
              <Dropdown.Menu
                aria-label={t`Schedule machine`}
                selectedKeys={[machineId]}
                selectionMode="single"
                onAction={(key) => {
                  if (typeof key !== "string" || key === machineId) return;
                  // Reset before switching so a slow or failing load never
                  // paints the previous machine's rows under the new label.
                  setTasks([]);
                  setSelectedRun(null);
                  automation.resetPages();
                  setError("");
                  setSelectedMachineId(key);
                }}
              >
                <Dropdown.Item id="local" textValue={t`This desktop`}>
                  <Label>
                    <Trans>This desktop</Trans>
                  </Label>
                </Dropdown.Item>
                {remoteServers.map((server) => (
                  <Dropdown.Item
                    key={remoteConnectionKey(server)}
                    id={remoteConnectionKey(server)}
                    textValue={server.label}
                  >
                    <Label>{server.label}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        ) : null}
        {!compact && section === "schedules" ? (
          <TextField
            aria-label={t`Search scheduled tasks`}
            className="min-w-56 flex-1"
            value={query}
            onChange={setQuery}
          >
            <Input placeholder={t`Search scheduled tasks`} />
          </TextField>
        ) : null}
        {section === "schedules" ? (
          <LightballTabs<FilterMode>
            tabs={[
              { id: "all", label: t`All` },
              { id: "active", label: t`Active` },
              { id: "paused", label: t`Paused` },
            ]}
            active={filter}
            onChange={setFilter}
            ariaLabel={t`Schedule status`}
          />
        ) : null}
      </div>

      {compact ? (
        <>
          {props.remoteDesktopId && props.onRemoteDesktopChange ? (
            <MobileMachineToolbar
              desktopId={props.remoteDesktopId}
              onDesktopChange={props.onRemoteDesktopChange}
              leading={
                <MobileCircleButton
                  aria-label={t`Search scheduled tasks`}
                  onPress={() => setSearchOpen(true)}
                >
                  <Search className="size-5" />
                </MobileCircleButton>
              }
              trailing={
                <div {...createLongPressHandlers}>
                  <MobileCircleButton
                    aria-label={t`New schedule`}
                    onPress={() => void createWithAgent()}
                  >
                    <Plus className="size-5" />
                  </MobileCircleButton>
                </div>
              }
            />
          ) : null}
          {searchOpen ? (
            <BottomSheet label={t`Search scheduled tasks`} onClose={() => setSearchOpen(false)}>
              <div className="px-1 pb-2 pt-1">
                <TextField aria-label={t`Search scheduled tasks`} value={query} onChange={setQuery}>
                  <Input placeholder={t`Search scheduled tasks`} />
                </TextField>
              </div>
            </BottomSheet>
          ) : null}
          {createActionsOpen ? (
            <BottomSheet label={t`Create schedule`} onClose={() => setCreateActionsOpen(false)}>
              <div className="m-sheet-list">
                <button
                  type="button"
                  className="m-sheet-action"
                  disabled={agents.length === 0}
                  onClick={() => {
                    setCreateActionsOpen(false);
                    setDraft(newScheduleDraft(agents[0]));
                  }}
                >
                  <CalendarClock className="size-4 text-muted" />
                  <Trans>Create schedule</Trans>
                </button>
                <button
                  type="button"
                  className="m-sheet-action"
                  onClick={() => {
                    setCreateActionsOpen(false);
                    void createWithAgent();
                  }}
                >
                  <Bot className="size-4 text-muted" />
                  <Trans>Create with Agent</Trans>
                </button>
              </div>
            </BottomSheet>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm whitespace-pre-wrap text-danger">
          {error}
        </p>
      ) : null}
      {loadError ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-danger">
          <p className="flex-1 whitespace-pre-wrap">{loadError}</p>
          <Button variant="ghost" size="sm" onPress={() => void refresh().catch(() => undefined)}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {section === "results" ? (
        <TriagePanel
          tasks={tasks}
          runs={loading && runs.length === 0 && !loadError ? null : runs}
          filter={resultFilter}
          query={resultQuery}
          onQueryChange={(value) => {
            setResultQuery(value);
            automation.resetPages();
          }}
          onFilterChange={(value) => {
            setResultFilter(value);
            automation.resetPages();
          }}
          onRefresh={refresh}
          onError={setError}
          onOpenResult={openResult}
          formatDateTime={(iso) => dateTimeFormatter.format(new Date(iso))}
          updateState={resultOps.update}
          cancelRun={resultOps.cancel}
          hasMore={automation.hasMore}
          loadingMore={loading}
          onLoadMore={automation.loadMore}
        />
      ) : null}

      {section === "schedules" ? (
        loading && tasks.length === 0 ? (
          <div className="flex justify-center py-12 text-muted">
            <Loader2 className="size-5 animate-spin" aria-label={t`Loading scheduled tasks`} />
          </div>
        ) : (
          <>
            {workspaceTasks.length === 0 ? (
              <div className="py-4 text-center">
                <Sparkles className="mx-auto mb-3 size-8 text-muted" />
                <p className="text-sm font-medium text-foreground">
                  <Trans>Start with a schedule</Trans>
                </p>
                <p className="mt-1 text-xs text-muted">
                  <Trans>Create a useful routine with one click, then adjust it anytime.</Trans>
                </p>
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center text-muted">
                <CalendarClock className="size-9" />
                <p className="text-sm">
                  <Trans>No matching schedules.</Trans>
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
                {visibleTasks.map((task) => (
                  <ScheduleRow
                    key={task.id}
                    task={task}
                    recurrenceLabel={describeRecurrence(task)}
                    nextRunLabel={formatNextRun(task)}
                    onRunNow={runNow}
                    onToggleEnabled={toggleEnabled}
                    onEdit={(target) => setDraft(taskScheduleDraft(target))}
                    onDelete={setDeleteTask}
                    onShowRuns={(target) => setRunsTaskId(target.id)}
                  />
                ))}
              </div>
            )}

            {hiddenByWorkspaceCount > 0 ? (
              <p className="text-center text-xs text-muted">
                <Plural
                  value={hiddenByWorkspaceCount}
                  one="# schedule belongs to a project in another workspace."
                  other="# schedules belong to projects in another workspace."
                />
              </p>
            ) : null}

            {suggestions}

            {agents.length === 0 ? (
              <p className="text-center text-xs text-muted">
                <Trans>Connect an agent to create schedules.</Trans>
              </p>
            ) : null}
          </>
        )
      ) : null}

      <ScheduleRunDetails
        run={runDetails.run}
        loadError={runDetails.loadError}
        scheduleName={
          tasks.find((scheduled) => scheduled.id === selectedRun?.scheduleId)?.name ?? t`Run result`
        }
        resolveThreadId={resolveRunThreadId}
        formatDateTime={(iso) => dateTimeFormatter.format(new Date(iso))}
        onClose={() => setSelectedRun(null)}
        onOpenThread={openRunThread}
        onRetry={(id) => {
          const retryTask = tasks.find((scheduled) => scheduled.id === id);
          if (retryTask) runNow(retryTask);
        }}
        canRetry={Boolean(
          selectedRun &&
          tasks.some(
            (task) =>
              task.id === selectedRun.scheduleId &&
              task.lastStatus !== "running" &&
              task.lastStatus !== "waiting-for-approval",
          ),
        )}
      />

      {draft ? (
        <ScheduleEditor
          {...(isRemoteMachine ? { remoteMachineId: machineId } : {})}
          agents={agents}
          busy={busy}
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void saveDraft()}
        />
      ) : null}

      <PreviousRunsModal
        task={runsTask}
        formatDateTime={(iso) => dateTimeFormatter.format(new Date(iso))}
        onViewRun={openResult}
        onOpenRunThread={openRunThread}
        onClose={() => setRunsTaskId(null)}
        fetchRuns={fetchRuns}
        resolveThreadId={machineId === "local" ? undefined : resolveRunThreadId}
      />

      <ConfirmDialog
        isOpen={deleteTask !== null}
        title={t`Delete schedule?`}
        body={<Trans>This removes the schedule and all its saved run results.</Trans>}
        confirmLabel={t`Delete`}
        onClose={() => setDeleteTask(null)}
        onConfirm={() => {
          if (!deleteTask) return;
          const id = deleteTask.id;
          const opMachine = machineId;
          setDeleteTask(null);
          void scheduleOps
            .remove(id)
            .then(() => {
              if (stillOnMachine(opMachine)) {
                setTasks((current) => current.filter((task) => task.id !== id));
                void refresh().catch(() => undefined);
              }
            })
            .catch((deleteError: unknown) => {
              if (stillOnMachine(opMachine)) setError(toErrorMessage(deleteError));
            });
        }}
      />
    </SettingsPage>
  );
}
