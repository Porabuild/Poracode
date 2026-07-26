import { Button, Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  CheckCircle2,
  CircleDot,
  Clock3,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";
import {
  PR_CHECK_FAILURE_CONCLUSIONS,
  type GitHubActionsJob,
  type GitHubActionsRun,
} from "@/shared/contracts";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";

function runTone(run: Pick<GitHubActionsRun | GitHubActionsJob, "status" | "conclusion">) {
  const conclusion = run.conclusion.toUpperCase();
  if (conclusion === "SUCCESS") return "success";
  if (conclusion !== "CANCELLED" && PR_CHECK_FAILURE_CONCLUSIONS.has(conclusion)) {
    return "danger";
  }
  if (conclusion === "CANCELLED" || conclusion === "SKIPPED" || conclusion === "NEUTRAL") {
    return "muted";
  }
  return run.status.toLowerCase() === "in_progress" ? "accent" : "warning";
}

export function StatusIndicator(props: { status: string; conclusion: string }) {
  const { t } = useLingui();
  const tone = runTone(props);
  const normalizedConclusion = props.conclusion.toLowerCase();
  const normalizedStatus = props.status.toLowerCase();
  const label =
    normalizedConclusion === "success"
      ? t`Succeeded`
      : normalizedConclusion === "failure" ||
          normalizedConclusion === "startup_failure" ||
          normalizedConclusion === "action_required"
        ? t`Failed`
        : normalizedConclusion === "cancelled"
          ? t`Cancelled`
          : normalizedConclusion === "skipped"
            ? t`Skipped`
            : normalizedConclusion === "timed_out"
              ? t`Timed out`
              : normalizedStatus === "in_progress"
                ? t`In progress`
                : normalizedStatus === "queued" || normalizedStatus === "requested"
                  ? t`Queued`
                  : normalizedStatus === "waiting" || normalizedStatus === "pending"
                    ? t`Waiting`
                    : t`Unknown`;
  const iconClass = `size-4 shrink-0 ${
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : tone === "accent"
          ? "text-accent"
          : tone === "warning"
            ? "text-warning"
            : "text-muted"
  }`;
  const icon =
    tone === "success" ? (
      <CheckCircle2 className={iconClass} />
    ) : tone === "danger" ? (
      <XCircle className={iconClass} />
    ) : tone === "accent" ? (
      <LoaderCircle className={`${iconClass} animate-spin`} />
    ) : tone === "warning" ? (
      <Clock3 className={iconClass} />
    ) : (
      <CircleDot className={iconClass} />
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted">
      {icon}
      {label}
    </span>
  );
}

export function GitHubActionsRunList(props: {
  runs: GitHubActionsRun[];
  selectedRunId: number | null;
  loading: boolean;
  pendingRunId: number | null;
  onSelectRun: (runId: number | null) => void;
  onRerun: (run: GitHubActionsRun, failedOnly: boolean) => void;
  onDelete: (run: GitHubActionsRun) => void;
}) {
  const { t } = useLingui();
  if (props.runs.length === 0) {
    return props.loading ? (
      <div className="flex justify-center py-12 text-muted">
        <LoaderCircle className="size-5 animate-spin" aria-label={t`Loading workflow runs`} />
      </div>
    ) : (
      <div className="py-12 text-center text-muted">
        <Workflow className="mx-auto mb-3 size-8" />
        <p className="text-sm font-medium text-foreground">
          <Trans>No workflow runs found.</Trans>
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
      {props.runs.map((run) => (
        <div key={run.id} className="flex items-center gap-1 py-1">
          <Button
            variant="ghost"
            className="h-auto min-w-0 flex-1 justify-start rounded-md px-2 py-2 text-left"
            onPress={() => props.onSelectRun(props.selectedRunId === run.id ? null : run.id)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <StatusIndicator status={run.status} conclusion={run.conclusion} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {run.title || run.workflowName || run.name || t`Workflow run`}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                  <span>{run.workflowName || run.name}</span>
                  {run.headBranch ? <span className="font-mono">{run.headBranch}</span> : null}
                  <span>#{run.number}</span>
                  {run.createdAt ? <RelativeTime iso={run.createdAt} /> : null}
                </span>
              </span>
              {props.selectedRunId === run.id ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted" />
              )}
            </span>
          </Button>
          {run.url ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Open on GitHub`}
              onPress={() => openExternalWithFeedback(run.url)}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          ) : null}
          <Dropdown>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Run actions`}
              isDisabled={props.pendingRunId === run.id}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label={t`Run actions`}
                onAction={(key) => {
                  if (key === "rerun") props.onRerun(run, false);
                  if (key === "rerun-failed") props.onRerun(run, true);
                  if (key === "delete") props.onDelete(run);
                }}
              >
                <Dropdown.Item
                  id="rerun"
                  textValue={t`Re-run all jobs`}
                  isDisabled={run.status.toLowerCase() !== "completed"}
                >
                  <RotateCcw className="size-3.5" />
                  <Label>
                    <Trans>Re-run all jobs</Trans>
                  </Label>
                </Dropdown.Item>
                {run.conclusion.toLowerCase() === "failure" ? (
                  <Dropdown.Item id="rerun-failed" textValue={t`Re-run failed jobs`}>
                    <RotateCcw className="size-3.5" />
                    <Label>
                      <Trans>Re-run failed jobs</Trans>
                    </Label>
                  </Dropdown.Item>
                ) : null}
                <Dropdown.Item
                  id="delete"
                  textValue={t`Delete workflow run`}
                  variant="danger"
                  isDisabled={run.status.toLowerCase() !== "completed"}
                >
                  <Trash2 className="size-3.5" />
                  <Label>
                    <Trans>Delete workflow run</Trans>
                  </Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      ))}
    </div>
  );
}
