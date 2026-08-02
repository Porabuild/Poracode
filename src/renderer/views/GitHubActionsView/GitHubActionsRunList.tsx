import { Button, Dropdown, Label, Link } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  CheckCircle2,
  CircleStop,
  CircleDot,
  Clock3,
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

export function StatusIndicator(props: {
  status: string;
  conclusion: string;
  showLabel?: boolean;
}) {
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
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted"
      title={label}
    >
      {icon}
      {props.showLabel === false ? <span className="sr-only">{label}</span> : label}
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
  onCancel: (run: GitHubActionsRun) => void;
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
        <div
          key={run.id}
          className={`relative grid min-h-14 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-2 transition-colors @4xl:grid-cols-[24px_minmax(220px,2fr)_minmax(140px,1fr)_minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(90px,0.7fr)_auto] ${
            props.selectedRunId === run.id ? "bg-surface-secondary" : "hover:bg-[var(--row-hover)]"
          }`}
        >
          {props.selectedRunId === run.id ? (
            <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
          ) : null}

          <StatusIndicator status={run.status} conclusion={run.conclusion} showLabel={false} />

          <div className="min-w-0">
            <Link
              className="block max-w-full truncate text-xs font-medium text-foreground underline-offset-2"
              onPress={() => props.onSelectRun(run.id)}
            >
              {run.title || run.workflowName || run.name || t`Workflow run`}
            </Link>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-[11px] text-muted @4xl:hidden">
              {run.headBranch ? <span className="truncate font-mono">{run.headBranch}</span> : null}
              {run.event ? <span className="truncate">{run.event}</span> : null}
              <span className="shrink-0">#{run.number}</span>
              {run.createdAt ? <RelativeTime iso={run.createdAt} className="shrink-0" /> : null}
            </div>
          </div>

          <div className="hidden min-w-0 @4xl:block">
            <p className="truncate text-[11px] text-muted">
              {(run.workflowName || run.name) ===
              (run.title || run.workflowName || run.name || t`Workflow run`)
                ? "—"
                : run.workflowName || run.name}
            </p>
          </div>
          <div className="hidden min-w-0 @4xl:block">
            <p className="truncate font-mono text-[11px] text-muted">{run.headBranch || "—"}</p>
          </div>
          <div className="hidden min-w-0 @4xl:block">
            <p className="truncate text-[11px] text-muted">{run.event || "—"}</p>
          </div>
          <div className="hidden min-w-0 flex-col text-[11px] text-muted @4xl:flex">
            <span>#{run.number}</span>
            {run.createdAt ? <RelativeTime iso={run.createdAt} /> : null}
          </div>

          <div className="flex items-center justify-end gap-0.5">
            {run.url ? (
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-7 min-w-0"
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
                className="size-7 min-w-0"
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
                    if (key === "cancel") props.onCancel(run);
                    if (key === "delete") props.onDelete(run);
                  }}
                >
                  <Dropdown.Item
                    id="cancel"
                    textValue={t`Cancel workflow`}
                    isDisabled={run.status.toLowerCase() === "completed"}
                  >
                    <CircleStop className="size-3.5" />
                    <Label>
                      <Trans>Cancel workflow</Trans>
                    </Label>
                  </Dropdown.Item>
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
        </div>
      ))}
    </div>
  );
}
