import { Button, ButtonGroup, Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronDown,
  CircleStop,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { GitHubActionsRun } from "@/shared/contracts";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { StatusIndicator } from "./GitHubActionsRunList";

function MetaItem(props: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted">{props.label}</dt>
      <dd className="mt-0.5 truncate text-xs text-foreground">{props.children}</dd>
    </div>
  );
}

export function GitHubActionsRunDetail(props: {
  run: GitHubActionsRun;
  loading: boolean;
  isPending: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onRerun: (failedOnly: boolean) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const completed = props.run.status.toLowerCase() === "completed";
  const failed = props.run.conclusion.toLowerCase() === "failure";

  return (
    <section className="h-full min-w-0 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="flex min-h-[76px] items-center gap-3 border-b border-[var(--hairline)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusIndicator
              status={props.run.status}
              conclusion={props.run.conclusion}
              showLabel={false}
            />
            <h2 className="truncate text-sm font-semibold text-foreground">
              {props.run.title || props.run.workflowName || t`Workflow run`}
            </h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted">
            {props.run.workflowName} #{props.run.number}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={completed || props.isPending}
            onPress={props.onCancel}
          >
            <CircleStop className="size-3.5" />
            <Trans>Cancel workflow</Trans>
          </Button>
          <ButtonGroup size="sm" variant="secondary">
            <Button isDisabled={!completed || props.isPending} onPress={() => props.onRerun(false)}>
              <RotateCcw className="size-3.5" />
              <Trans>Re-run all jobs</Trans>
            </Button>
            {failed ? (
              <Dropdown>
                <Button
                  isIconOnly
                  aria-label={t`Run actions`}
                  isDisabled={!completed || props.isPending}
                >
                  <ButtonGroup.Separator />
                  <ChevronDown className="size-3.5" />
                </Button>
                <Dropdown.Popover placement="bottom end">
                  <Dropdown.Menu aria-label={t`Run actions`} onAction={() => props.onRerun(true)}>
                    <Dropdown.Item id="rerun-failed" textValue={t`Re-run failed jobs`}>
                      <RotateCcw className="size-3.5" />
                      <Label>
                        <Trans>Re-run failed jobs</Trans>
                      </Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            ) : null}
          </ButtonGroup>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Refresh run`}
            isDisabled={props.loading}
            onPress={props.onRefresh}
          >
            <RefreshCw className={`size-3.5 ${props.loading ? "animate-spin" : ""}`} />
          </Button>
          {props.run.url ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Open on GitHub`}
              onPress={() => openExternalWithFeedback(props.run.url)}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          ) : null}
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="text-danger"
            aria-label={t`Delete workflow run`}
            isDisabled={!completed || props.isPending}
            onPress={props.onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Close run details`}
            onPress={props.onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-b border-[var(--hairline)] px-4 py-4 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        <MetaItem label={<Trans>Status</Trans>}>
          <StatusIndicator status={props.run.status} conclusion={props.run.conclusion} />
        </MetaItem>
        <MetaItem label={<Trans>Event</Trans>}>{props.run.event || "—"}</MetaItem>
        <MetaItem label={<Trans>Attempt</Trans>}>{props.run.attempt}</MetaItem>
        <MetaItem label={<Trans>Branch</Trans>}>
          <span className="inline-flex items-center gap-1">
            <GitBranch className="size-3" />
            {props.run.headBranch || "—"}
          </span>
        </MetaItem>
        <MetaItem label={<Trans>Commit</Trans>}>
          <span className="inline-flex items-center gap-1 font-mono">
            <GitCommitHorizontal className="size-3" />
            {props.run.headSha ? props.run.headSha.slice(0, 7) : "—"}
          </span>
        </MetaItem>
        <MetaItem label={<Trans>Updated</Trans>}>
          {props.run.updatedAt ? <RelativeTime iso={props.run.updatedAt} /> : "—"}
        </MetaItem>
      </dl>

      <div className="px-4 py-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          <Trans>Jobs</Trans>
        </h3>
        {props.loading && props.run.jobs.length === 0 ? (
          <div className="flex items-center gap-2 py-5 text-xs text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            <Trans>Loading jobs</Trans>
          </div>
        ) : props.run.jobs.length === 0 ? (
          <p className="py-4 text-xs text-muted">
            <Trans>No jobs reported for this run.</Trans>
          </p>
        ) : (
          <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {props.run.jobs.map((job) => {
              const hasSteps = job.steps.length > 0;
              const jobHeader = (
                <>
                  <StatusIndicator
                    status={job.status}
                    conclusion={job.conclusion}
                    showLabel={false}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-xs font-medium text-foreground ${
                      hasSteps ? "link cursor-default underline-offset-2" : ""
                    }`}
                  >
                    {job.name}
                  </span>
                  {hasSteps ? (
                    <span className="shrink-0 text-[11px] text-muted">
                      {t`${job.steps.filter((step) => step.status === "completed").length} of ${job.steps.length} steps`}
                    </span>
                  ) : null}
                  {job.url ? (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className="size-7 min-w-0"
                      aria-label={t`Open job on GitHub`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onPress={() => openExternalWithFeedback(job.url!)}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  ) : null}
                </>
              );

              return !hasSteps ? (
                <div key={job.id} className="flex min-h-14 items-center gap-3 px-1 py-2">
                  {jobHeader}
                </div>
              ) : (
                <details key={job.id} className="group">
                  <summary className="flex min-h-14 list-none items-center gap-3 px-1 py-2">
                    {jobHeader}
                  </summary>
                  <div className="space-y-1 pb-3 pl-7 pr-2">
                    {job.steps.map((step) => (
                      <div key={step.number} className="flex items-center gap-3 py-1 text-xs">
                        <StatusIndicator status={step.status} conclusion={step.conclusion} />
                        <span className="min-w-0 flex-1 truncate text-muted">{step.name}</span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
