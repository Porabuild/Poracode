import { useEffect, useState } from "react";
import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react";
import type { ScheduledTask, ScheduledTaskRun } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useThread } from "@/renderer/state/useThread";

interface PreviousRunsModalProps {
  /** The schedule whose runs are shown; `null` keeps the modal closed. */
  task: ScheduledTask | null;
  formatDateTime: (iso: string) => string;
  onOpenRunThread: (threadId: string) => void;
  onClose: () => void;
}

function RunStatusIcon({ status, label }: { status: ScheduledTaskRun["status"]; label: string }) {
  if (status === "running") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" aria-label={label} />;
  }
  if (status === "succeeded") {
    return <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label={label} />;
  }
  if (status === "failed") {
    return <XCircle className="size-3.5 shrink-0 text-danger" aria-label={label} />;
  }
  return <CircleSlash className="size-3.5 shrink-0 text-muted" aria-label={label} />;
}

function RunRow({
  run,
  statusLabel,
  formatDateTime,
  onOpen,
}: {
  run: ScheduledTaskRun;
  statusLabel: string;
  formatDateTime: (iso: string) => string;
  onOpen: (threadId: string) => void;
}) {
  // Reactive lookup so the row's provider icon and title track live thread
  // state (e.g. renames) while the modal stays open.
  const thread = useThread(run.threadId);
  const agentStatuses = useAgentStatusesStore((state) => state.agentStatuses);
  const agent = thread ? agentStatuses.find((status) => status.kind === thread.agentKind) : null;
  const model = thread?.config.model;
  const modelLabel = model
    ? (agent?.capabilities.models.find((candidate) => candidate.id === model)?.label ?? model)
    : null;
  const runMeta = [
    modelLabel,
    thread?.config.effort ? formatEffortLabel(thread.config.effort) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const trailing = (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
      <RunStatusIcon status={run.status} label={statusLabel} />
      {formatDateTime(run.startedAt)}
    </span>
  );
  const errorLine = run.error ? (
    <p className="line-clamp-2 text-xs whitespace-pre-wrap text-danger">{run.error}</p>
  ) : null;

  if (!thread) {
    // The linked thread was deleted: nothing to navigate to (openRunThread
    // guards anyway), so render a muted, non-interactive row.
    return (
      <div className="w-full border-b border-[var(--hairline)] px-3 py-2.5 text-left opacity-60 last:border-b-0">
        <div className="flex items-center justify-between gap-2.5">{trailing}</div>
        {errorLine}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(run.threadId)}
      className="w-full border-b border-[var(--hairline)] px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-default-100/60 focus-visible:bg-default-100/60"
    >
      <div className="flex items-center gap-2.5">
        <ThreadProviderIcon thread={thread} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{runMeta}</span>
        {trailing}
      </div>
      {errorLine}
    </button>
  );
}

export function PreviousRunsModal({
  task,
  formatDateTime,
  onOpenRunThread,
  onClose,
}: PreviousRunsModalProps) {
  const { t } = useLingui();
  const [runs, setRuns] = useState<ScheduledTaskRun[] | null>(null);
  const [runsError, setRunsError] = useState("");

  const taskId = task?.id ?? null;
  const isRunning = task?.lastStatus === "running";

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setRuns(null);
    setRunsError("");
    const load = () => {
      void readBridge()
        .getScheduleRuns({ id: taskId })
        .then((next) => {
          if (cancelled) return;
          setRuns(next);
          setRunsError("");
        })
        .catch((loadError: unknown) => {
          if (cancelled) return;
          setRunsError(loadError instanceof Error ? loadError.message : String(loadError));
        });
    };
    load();
    if (!isRunning) {
      return () => {
        cancelled = true;
      };
    }
    // Keep the list live while the schedule is running (matches the 2s cadence
    // the list itself polls at).
    const timer = window.setInterval(load, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskId, isRunning]);

  function statusLabel(status: ScheduledTaskRun["status"]): string {
    switch (status) {
      case "running":
        return t`Running`;
      case "succeeded":
        return t`Succeeded`;
      case "failed":
        return t`Failed`;
      default:
        return t`Interrupted`;
    }
  }

  function openRun(threadId: string) {
    // Close before navigating: opening the thread routes away from this page.
    onClose();
    onOpenRunThread(threadId);
  }

  return (
    <Modal.Backdrop isOpen={task !== null} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="md">
        <Modal.Dialog className="sm:max-w-[560px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{task?.name ?? <Trans>Previous runs</Trans>}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {runsError ? (
              <p className="text-xs whitespace-pre-wrap text-danger">{runsError}</p>
            ) : runs === null ? (
              <div className="flex justify-center py-6 text-muted">
                <Loader2 className="size-5 animate-spin" aria-label={t`Loading previous runs`} />
              </div>
            ) : runs.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">
                <Trans>No runs yet.</Trans>
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
                {runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    statusLabel={statusLabel(run.status)}
                    formatDateTime={formatDateTime}
                    onOpen={openRun}
                  />
                ))}
              </div>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
