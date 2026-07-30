import { useState } from "react";
import { Button, Chip, Input, TextField, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Archive,
  ArchiveRestore,
  CircleAlert,
  Clock3,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Search,
  Square,
} from "lucide-react";
import type {
  ScheduledTask,
  ScheduledTaskRun,
  ScheduleRunInboxQuery,
  UpdateScheduleRunStatePayload,
} from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";
import { readBridge } from "@/renderer/bridge";
import { LightballTabs } from "@/renderer/components/common/LightballTabs";

type TriageFilter = ScheduleRunInboxQuery["filter"];

interface TriagePanelProps {
  tasks: ScheduledTask[];
  runs: ScheduledTaskRun[] | null;
  filter: TriageFilter;
  formatDateTime: (iso: string) => string;
  onOpenRunThread: (threadId: string) => void;
  onFilterChange: (filter: TriageFilter) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

function resultSummary(run: ScheduledTaskRun): string | null {
  return run.error ?? run.result?.summary ?? run.summary;
}

function TriageRunRow(props: {
  run: ScheduledTaskRun;
  scheduleName: string;
  formatDateTime: (iso: string) => string;
  busy: boolean;
  onOpen: () => void;
  onToggleRead: () => void;
  onToggleArchived: () => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const { run } = props;
  const unread = run.result?.unread === true;
  const archived = run.result?.archivedAt != null;
  const canCancel = run.status === "running";
  const severity = run.result?.severity ?? (run.error ? "error" : "info");
  const severityLabel =
    severity === "error" ? t`Critical` : severity === "warning" ? t`Warning` : t`Info`;
  const summary = resultSummary(run);
  const statusLabel =
    run.status === "running"
      ? t`Running`
      : run.status === "waiting-for-approval"
        ? t`Waiting for approval`
        : null;
  const readLabel = unread ? t`Mark as read` : t`Mark as unread`;
  const archiveLabel = archived ? t`Restore finding` : t`Archive finding`;

  return (
    <div
      className={`flex items-start gap-2 border-b border-[var(--hairline)] px-3 py-3 last:border-b-0 ${unread ? "bg-default-100/40" : ""}`}
    >
      <button
        type="button"
        aria-label={t`Open conversation for ${props.scheduleName}`}
        onClick={props.onOpen}
        className="group min-w-0 flex-1 text-left outline-none focus-visible:focus-ring"
      >
        <div className="flex items-center gap-2">
          <span
            className={`size-1.5 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`}
            aria-hidden
          />
          <p
            className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}
          >
            {props.scheduleName}
          </p>
          <Chip
            size="sm"
            variant="soft"
            color={severity === "error" ? "danger" : severity === "warning" ? "warning" : "default"}
          >
            {severityLabel}
          </Chip>
        </div>
        <div className="ml-3.5 mt-1 space-y-1">
          <p
            className={`line-clamp-2 text-xs whitespace-pre-wrap ${run.error ? "text-danger" : "text-foreground/80"}`}
          >
            {summary ?? <Trans>No summary was provided.</Trans>}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            {statusLabel ? (
              <>
                {run.status === "running" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Clock3 className="size-3" />
                )}
                <span>{statusLabel}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span>{props.formatDateTime(run.startedAt)}</span>
          </p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        {canCancel ? (
          <Tooltip delay={0}>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              className="text-muted hover:text-danger"
              aria-label={t`Cancel run`}
              isDisabled={props.busy}
              onPress={props.onCancel}
            >
              <Square className="size-3.5 fill-current" />
            </Button>
            <Tooltip.Content>{t`Cancel run`}</Tooltip.Content>
          </Tooltip>
        ) : null}
        {run.result ? (
          <>
            <Tooltip delay={0}>
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={readLabel}
                isDisabled={props.busy}
                onPress={props.onToggleRead}
              >
                {unread ? <MailOpen className="size-4" /> : <Mail className="size-4" />}
              </Button>
              <Tooltip.Content>{readLabel}</Tooltip.Content>
            </Tooltip>
            <Tooltip delay={0}>
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={archiveLabel}
                isDisabled={props.busy}
                onPress={props.onToggleArchived}
              >
                {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              </Button>
              <Tooltip.Content>{archiveLabel}</Tooltip.Content>
            </Tooltip>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function TriagePanel(props: TriagePanelProps) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const { filter, runs } = props;

  async function updateRunState(
    run: ScheduledTaskRun,
    patch: Omit<UpdateScheduleRunStatePayload, "id">,
  ) {
    setBusyRunId(run.id);
    try {
      const updated = await readBridge().updateScheduleRunState({ id: run.id, ...patch });
      if (!updated) throw new Error(t`The finding is no longer available.`);
      await props.onRefresh();
    } catch (error) {
      props.onError(toErrorMessage(error));
    } finally {
      setBusyRunId(null);
    }
  }

  async function cancelRun(run: ScheduledTaskRun) {
    setBusyRunId(run.id);
    try {
      const cancelled = await readBridge().cancelScheduleRun({ id: run.id });
      if (!cancelled) throw new Error(t`The run could not be cancelled.`);
      await props.onRefresh();
    } catch (error) {
      props.onError(toErrorMessage(error));
    } finally {
      setBusyRunId(null);
    }
  }

  function openRun(run: ScheduledTaskRun) {
    if (run.result?.unread) {
      void updateRunState(run, { unread: false });
    }
    props.onOpenRunThread(run.threadId);
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRuns = (runs ?? []).filter((run) => {
    const taskName = props.tasks.find((task) => task.id === run.scheduleId)?.name ?? "";
    return (
      normalizedQuery === "" ||
      taskName.toLocaleLowerCase().includes(normalizedQuery) ||
      (resultSummary(run)?.toLocaleLowerCase().includes(normalizedQuery) ?? false)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <TextField
          aria-label={t`Search findings`}
          className="min-w-56 flex-1"
          value={query}
          onChange={setQuery}
        >
          <Input placeholder={t`Search findings`} />
        </TextField>
        <LightballTabs<TriageFilter>
          tabs={[
            { id: "unread", label: t`Unread` },
            { id: "all", label: t`All` },
            { id: "archived", label: t`Archived` },
          ]}
          active={filter}
          onChange={props.onFilterChange}
          ariaLabel={t`Finding status`}
        />
      </div>

      {runs === null ? (
        <div className="flex justify-center py-12 text-muted">
          <Loader2 className="size-5 animate-spin" aria-label={t`Loading findings`} />
        </div>
      ) : visibleRuns.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
          {visibleRuns.map((run) => (
            <TriageRunRow
              key={run.id}
              run={run}
              scheduleName={
                props.tasks.find((task) => task.id === run.scheduleId)?.name ?? t`Deleted schedule`
              }
              formatDateTime={props.formatDateTime}
              busy={busyRunId === run.id}
              onOpen={() => openRun(run)}
              onToggleRead={() => void updateRunState(run, { unread: !run.result?.unread })}
              onToggleArchived={() =>
                void updateRunState(run, {
                  archived: run.result?.archivedAt == null,
                })
              }
              onCancel={() => void cancelRun(run)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-muted">
          {filter === "unread" ? (
            <Inbox className="size-9" />
          ) : filter === "archived" ? (
            <Archive className="size-9" />
          ) : normalizedQuery ? (
            <Search className="size-9" />
          ) : (
            <CircleAlert className="size-9" />
          )}
          <p className="text-sm font-medium text-foreground">
            {normalizedQuery ? (
              <Trans>No matching findings.</Trans>
            ) : filter === "unread" ? (
              <Trans>You’re all caught up.</Trans>
            ) : filter === "archived" ? (
              <Trans>No archived findings.</Trans>
            ) : (
              <Trans>No findings yet.</Trans>
            )}
          </p>
          {!normalizedQuery && filter === "all" ? (
            <p className="text-xs">
              <Trans>Runs that need attention will appear here.</Trans>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
