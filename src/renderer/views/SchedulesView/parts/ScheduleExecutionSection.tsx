import type { ReactNode } from "react";
import { Input, TextArea, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Thread } from "@/shared/contracts";
import { Select, ToggleSwitch } from "@/renderer/components/common";
import {
  isHeartbeatTargetThread,
  type ScheduleAutomationMode,
  type ScheduleCompletionKind,
  type ScheduleDraft,
  type ScheduleRetryKind,
} from "../scheduleDraft";

const CONTROL_WIDTH = "w-[280px] max-w-[60%] shrink-0";

function ExecutionRow(props: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.label}</p>
        {props.description ? <p className="text-xs text-muted">{props.description}</p> : null}
      </div>
      <div className="flex shrink-0 justify-end">{props.children}</div>
    </div>
  );
}

/** A numeric input paired with a fixed unit suffix (minutes / seconds / %). */
function NumberWithSuffix(props: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  step?: string;
  suffix: ReactNode;
}) {
  return (
    <div className={`${CONTROL_WIDTH} flex items-center gap-2`}>
      <TextField
        aria-label={props.ariaLabel}
        className="min-w-0 flex-1"
        type="number"
        value={props.value}
        onChange={props.onChange}
      >
        <Input min={props.min} max={props.max} {...(props.step ? { step: props.step } : {})} />
      </TextField>
      <span className="w-16 shrink-0 text-xs text-muted">{props.suffix}</span>
    </div>
  );
}

export function ScheduleExecutionSection(props: {
  draft: ScheduleDraft;
  threads: Thread[];
  onChange: (patch: Partial<ScheduleDraft>) => void;
}) {
  const { t } = useLingui();
  const { draft } = props;
  const conversationOptions = props.threads
    .filter((thread) => isHeartbeatTargetThread(thread, draft))
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((thread) => ({ id: thread.id, label: thread.title }));
  const targetIsUnavailable =
    draft.heartbeatTargetThreadId !== "" &&
    !conversationOptions.some((option) => option.id === draft.heartbeatTargetThreadId);
  const targetOptions = targetIsUnavailable
    ? [
        ...conversationOptions,
        { id: draft.heartbeatTargetThreadId, label: t`Unavailable conversation` },
      ]
    : conversationOptions;
  const heartbeat = draft.automationMode === "heartbeat";

  return (
    <section className="space-y-1">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          <Trans>Execution</Trans>
        </h3>
        <p className="text-xs text-muted">
          {heartbeat ? (
            <Trans>
              Heartbeats can continue making changes while you're away. Set hard limits below.
            </Trans>
          ) : (
            <Trans>Control how each scheduled run continues and stops.</Trans>
          )}
        </p>
      </div>
      <div className="divide-y divide-[var(--hairline)]">
        <ExecutionRow
          label={<Trans>Execution mode</Trans>}
          description={
            heartbeat
              ? t`Continue one conversation until a stop condition or limit is reached.`
              : t`Start a new conversation for each run.`
          }
        >
          <Select
            aria-label={t`Execution mode`}
            className={CONTROL_WIDTH}
            options={[
              { id: "new-thread", label: t`Single pass` },
              { id: "heartbeat", label: t`Heartbeat` },
            ]}
            value={draft.automationMode}
            onChange={(automationMode) =>
              props.onChange({
                automationMode: automationMode as ScheduleAutomationMode,
                ...(automationMode === "heartbeat"
                  ? {
                      heartbeatTargetThreadId: conversationOptions.some(
                        (option) => option.id === draft.heartbeatTargetThreadId,
                      )
                        ? draft.heartbeatTargetThreadId
                        : (conversationOptions[0]?.id ?? ""),
                    }
                  : {}),
              })
            }
          />
        </ExecutionRow>

        {heartbeat ? (
          <ExecutionRow
            label={<Trans>Conversation</Trans>}
            description={
              <Trans>Heartbeat continues this conversation in the selected project.</Trans>
            }
          >
            {targetOptions.length > 0 ? (
              <Select
                aria-label={t`Conversation`}
                className={CONTROL_WIDTH}
                options={targetOptions}
                value={draft.heartbeatTargetThreadId}
                onChange={(heartbeatTargetThreadId) => props.onChange({ heartbeatTargetThreadId })}
              />
            ) : (
              <p className="max-w-[280px] text-right text-xs text-danger">
                <Trans>No eligible conversations in this project.</Trans>
              </p>
            )}
          </ExecutionRow>
        ) : null}

        <ExecutionRow
          label={<Trans>Time limit</Trans>}
          description={<Trans>Stop the run when this total time is reached.</Trans>}
        >
          <NumberWithSuffix
            ariaLabel={t`Time limit in minutes`}
            value={draft.maxRuntimeMinutes}
            onChange={(maxRuntimeMinutes) => props.onChange({ maxRuntimeMinutes })}
            min="1"
            max="1440"
            step="any"
            suffix={<Trans>minutes</Trans>}
          />
        </ExecutionRow>

        <ExecutionRow
          label={<Trans>Missed runs</Trans>}
          description={<Trans>Choose what happens after a scheduled time was missed.</Trans>}
        >
          <Select
            aria-label={t`Missed runs`}
            className={CONTROL_WIDTH}
            options={[
              { id: "skip", label: t`Skip missed runs` },
              { id: "coalesce", label: t`Run once after reopening` },
              { id: "run-latest", label: t`Run the latest missed run` },
            ]}
            value={draft.misfirePolicy}
            onChange={(misfirePolicy) =>
              props.onChange({
                misfirePolicy: misfirePolicy as ScheduleDraft["misfirePolicy"],
              })
            }
          />
        </ExecutionRow>

        <ExecutionRow
          label={<Trans>Retry policy</Trans>}
          description={<Trans>Retry when a run fails before it completes.</Trans>}
        >
          <Select
            aria-label={t`Retry policy`}
            className={CONTROL_WIDTH}
            options={[
              { id: "none", label: t`No retries` },
              { id: "fixed", label: t`Fixed delay` },
              { id: "exponential", label: t`Exponential backoff` },
            ]}
            value={draft.retryKind}
            onChange={(retryKind) => props.onChange({ retryKind: retryKind as ScheduleRetryKind })}
          />
        </ExecutionRow>

        {draft.retryKind !== "none" ? (
          <ExecutionRow
            label={<Trans>Maximum attempts</Trans>}
            description={<Trans>Includes the first attempt.</Trans>}
          >
            <TextField
              aria-label={t`Maximum attempts`}
              className={CONTROL_WIDTH}
              type="number"
              value={draft.retryMaxAttempts}
              onChange={(retryMaxAttempts) => props.onChange({ retryMaxAttempts })}
            >
              <Input min="2" max="6" />
            </TextField>
          </ExecutionRow>
        ) : null}

        {draft.retryKind === "fixed" ? (
          <ExecutionRow label={<Trans>Retry delay</Trans>}>
            <NumberWithSuffix
              ariaLabel={t`Retry delay in seconds`}
              value={draft.retryDelaySeconds}
              onChange={(retryDelaySeconds) => props.onChange({ retryDelaySeconds })}
              min="1"
              max="3600"
              suffix={<Trans>seconds</Trans>}
            />
          </ExecutionRow>
        ) : draft.retryKind === "exponential" ? (
          <>
            <ExecutionRow label={<Trans>Initial retry delay</Trans>}>
              <NumberWithSuffix
                ariaLabel={t`Initial retry delay in seconds`}
                value={draft.retryInitialDelaySeconds}
                onChange={(retryInitialDelaySeconds) =>
                  props.onChange({ retryInitialDelaySeconds })
                }
                min="1"
                max="3600"
                suffix={<Trans>seconds</Trans>}
              />
            </ExecutionRow>
            <ExecutionRow label={<Trans>Maximum retry delay</Trans>}>
              <NumberWithSuffix
                ariaLabel={t`Maximum retry delay in seconds`}
                value={draft.retryMaxDelaySeconds}
                onChange={(retryMaxDelaySeconds) => props.onChange({ retryMaxDelaySeconds })}
                min="1"
                max="3600"
                suffix={<Trans>seconds</Trans>}
              />
            </ExecutionRow>
          </>
        ) : null}

        <ExecutionRow
          label={<Trans>Maximum iterations</Trans>}
          description={<Trans>Leave blank for no run limit.</Trans>}
        >
          <TextField
            aria-label={t`Maximum iterations`}
            className={CONTROL_WIDTH}
            type="number"
            value={draft.maxIterations}
            onChange={(maxIterations) => props.onChange({ maxIterations })}
          >
            <Input min="1" max="100" placeholder={t`No limit`} />
          </TextField>
        </ExecutionRow>
        <ExecutionRow
          label={<Trans>Stop on error</Trans>}
          description={<Trans>Disable the automation after retries are exhausted.</Trans>}
        >
          <ToggleSwitch
            aria-label={t`Stop on error`}
            isSelected={draft.stopOnError}
            onChange={(stopOnError) => props.onChange({ stopOnError })}
          />
        </ExecutionRow>

        {heartbeat ? (
          <>
            <ExecutionRow
              label={<Trans>AI stop condition</Trans>}
              description={<Trans>Evaluate the result after every iteration.</Trans>}
            >
              <ToggleSwitch
                aria-label={t`AI stop condition`}
                isSelected={draft.completionKind === "ai-evaluated"}
                onChange={(selected) =>
                  props.onChange({
                    completionKind: (selected ? "ai-evaluated" : "none") as ScheduleCompletionKind,
                  })
                }
              />
            </ExecutionRow>
            {draft.completionKind === "ai-evaluated" ? (
              <>
                <ExecutionRow
                  label={<Trans>Stop when</Trans>}
                  description={<Trans>Describe the result that completes this heartbeat.</Trans>}
                >
                  <TextField
                    aria-label={t`Stop when`}
                    className={CONTROL_WIDTH}
                    value={draft.stopWhen}
                    onChange={(stopWhen) => props.onChange({ stopWhen })}
                  >
                    <TextArea rows={3} maxLength={2000} />
                  </TextField>
                </ExecutionRow>
                <ExecutionRow
                  label={<Trans>Confidence</Trans>}
                  description={<Trans>Required confidence before stopping.</Trans>}
                >
                  <NumberWithSuffix
                    ariaLabel={t`Confidence percent`}
                    value={draft.completionConfidencePercent}
                    onChange={(completionConfidencePercent) =>
                      props.onChange({ completionConfidencePercent })
                    }
                    min="0"
                    max="100"
                    suffix="%"
                  />
                </ExecutionRow>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
