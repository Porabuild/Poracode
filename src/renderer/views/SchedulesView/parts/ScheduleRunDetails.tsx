import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ScheduledTaskRun } from "@/shared/contracts";
import { scheduleRunStatusMessages } from "./scheduleRunStatus";
import { useThread } from "@/renderer/state/useThread";

export function ScheduleRunDetails(props: {
  run: ScheduledTaskRun | null;
  loadError?: string;
  scheduleName: string;
  resolveThreadId: (id: string) => string;
  formatDateTime: (iso: string) => string;
  onClose: () => void;
  onOpenThread: (id: string) => void;
  onRetry: (scheduleId: string) => void;
  canRetry: boolean;
}) {
  const { t, i18n } = useLingui();
  const { run } = props;
  const thread = useThread(run ? props.resolveThreadId(run.threadId) : "");
  const evaluation = run?.result?.completionEvaluation;
  const summary = run?.result?.summary ?? run?.summary;
  const status = run?.status;
  const statusLabel = i18n._(scheduleRunStatusMessages[status ?? "succeeded"]);
  const reason = run?.result?.stopReason;
  const reasonLabel =
    reason === "retry-pending"
      ? t`Retry scheduled`
      : reason === "retry-cancelled"
        ? t`Retry cancelled`
        : reason === "completion-condition"
          ? t`Completion condition reached`
          : reason === "completion-evaluation-error"
            ? t`The completion check failed; the schedule was paused.`
            : reason === "time-limit"
              ? t`Time limit reached`
              : reason === "approval-required" || reason === "reply-required"
                ? t`Open the conversation to continue this run.`
                : reason === "supervisor-reset" ||
                    reason === "host-shutdown" ||
                    reason === "thread-exited" ||
                    reason === "interrupted"
                  ? t`The run was interrupted.`
                  : reason === "target-busy"
                    ? t`The conversation was already working.`
                    : reason === "misfire-policy"
                      ? t`A missed run was skipped.`
                      : null;

  return (
    <Modal.Backdrop isOpen={run !== null} onOpenChange={(open) => !open && props.onClose()}>
      <Modal.Container size="md">
        <Modal.Dialog className="sm:max-w-[560px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{props.scheduleName || <Trans>Run result</Trans>}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-4 p-4">
            {props.loadError ? (
              <p role="alert" className="text-sm text-danger">
                {props.loadError}
              </p>
            ) : null}
            {run ? (
              <>
                <div className="space-y-1 text-xs text-muted">
                  <p className="font-medium text-foreground">
                    {statusLabel} · {props.formatDateTime(run.startedAt)}
                  </p>
                  <p>
                    <Trans>
                      Attempt {run.attempt ?? 1} · Iteration {run.iteration ?? 1}
                    </Trans>
                  </p>
                  {reasonLabel ? <p>{reasonLabel}</p> : null}
                </div>
                {run.error ? (
                  <p role="alert" className="text-sm whitespace-pre-wrap text-danger">
                    {run.error}
                  </p>
                ) : null}
                <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {summary ??
                    (status === "running" || status === "waiting-for-approval"
                      ? t`The result will appear when this run finishes.`
                      : t`No summary was provided.`)}
                </p>
                {run.result?.changedFiles.length ? (
                  <section className="space-y-2">
                    <h3 className="text-xs font-medium">
                      <Trans>Changed files</Trans>
                    </h3>
                    <ul className="space-y-1 text-xs text-muted">
                      {run.result.changedFiles.map((path) => (
                        <li key={path} className="font-mono [overflow-wrap:anywhere]">
                          {path}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {evaluation ? (
                  <section className="space-y-2 rounded-lg bg-default-100/50 p-3 text-xs">
                    <h3 className="font-medium">
                      <Trans>AI completion check</Trans>
                    </h3>
                    <p>{evaluation.condition}</p>
                    <p className="font-medium">
                      {reason === "completion-condition"
                        ? t`Completion condition reached`
                        : t`Completion condition not confirmed`}
                    </p>
                    <p className="text-muted">{evaluation.reason}</p>
                    <p className="text-muted">
                      <Trans>
                        Confidence:{" "}
                        {new Intl.NumberFormat(i18n.locale, { style: "percent" }).format(
                          evaluation.confidence,
                        )}
                      </Trans>
                    </p>
                  </section>
                ) : null}
                {!thread ? (
                  <p className="text-xs text-muted">
                    <Trans>
                      The conversation is no longer available. This saved result is still
                      accessible.
                    </Trans>
                  </p>
                ) : null}
              </>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="flex-wrap">
            <Button variant="ghost" className="text-muted" onPress={props.onClose}>
              <Trans>Close</Trans>
            </Button>
            {run && props.canRetry ? (
              <Button
                variant="ghost"
                onPress={() => {
                  props.onClose();
                  props.onRetry(run.scheduleId);
                }}
              >
                <Trans>Run again</Trans>
              </Button>
            ) : null}
            <Button
              variant="tertiary"
              isDisabled={!thread}
              onPress={() => {
                if (run && thread) {
                  props.onClose();
                  props.onOpenThread(run.threadId);
                }
              }}
            >
              <Trans>Open conversation</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
