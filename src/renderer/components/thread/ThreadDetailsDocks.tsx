import { useEffect, useRef, useState } from "react";
import { Check, Copy, FolderGit2, GitBranch } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { getProjectFsPath } from "@/shared/wsl";
import { useProject, useThread } from "@/renderer/state/useThread";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { HostUsageStatus } from "@/renderer/components/providers/HostUsageView";
import { useHostProviderUsage } from "@/renderer/components/providers/useHostProviderUsage";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { UsageCostLine } from "@/renderer/components/providers/UsageCostLine";
import {
  UsageCreditsRow,
  summarizeUsageSnapshot,
} from "@/renderer/components/providers/UsageProviderCardView";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  formatCreditBalance,
  formatMoney,
  formatTokens,
  formatWindowValue,
  usageWindowDisplayLabel,
} from "@/renderer/components/providers/usageFormat";
import { pickUsageRings } from "@/renderer/components/providers/usageProviders";
import { usageToneColor } from "@/renderer/components/providers/usageTone";
import {
  THREAD_DOCK_SUMMARY_RING_SIZE,
  ThreadDockBody,
  ThreadDockCollapseButton,
  ThreadDockHeader,
  ThreadDockSection,
} from "./ThreadDockUI";

function CopyValueButton({ value }: { value: string }) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return (
    <button
      type="button"
      aria-label={copied ? t`Copied` : t`Copy`}
      title={copied ? t`Copied` : t`Copy`}
      onClick={() => {
        const clipboard = navigator.clipboard;
        if (!clipboard?.writeText) return;
        void Promise.resolve(clipboard.writeText(value))
          .then(() => {
            setCopied(true);
            window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
      className={`inline-flex h-5 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-muted/70 transition-[width,opacity,margin] duration-150 hover:bg-foreground/5 hover:text-foreground focus-visible:ml-1 focus-visible:w-5 focus-visible:opacity-100 ${
        copied
          ? "ml-1 w-5 opacity-100 text-foreground"
          : "w-0 opacity-0 group-hover/row:ml-1 group-hover/row:w-5 group-hover/row:opacity-100"
      }`}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

export function ThreadWorkspaceDock({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(true);
  const selectedThread = useThread(threadId);
  const project = useProject(selectedThread?.projectId);
  const projectId = selectedThread?.projectId;
  const projectName = project?.name;
  const projectPath = project?.location ? getProjectFsPath(project.location) : undefined;
  const worktreePath = selectedThread?.worktreePath;
  const worktreeBranch = selectedThread?.worktreeBranch;
  const sessionId = selectedThread?.sessionRef?.providerSessionId;
  const branch =
    useGitStore((state) =>
      worktreePath
        ? state.worktreeStatuses[worktreePath]?.branch
        : projectId
          ? state.statuses[projectId]?.branch
          : undefined,
    ) ?? worktreeBranch;
  if (!selectedThread || !projectId) return null;
  const rows = [
    { label: t`Workspace`, value: projectName, mono: false, stacked: false, copyable: false },
    { label: t`Branch`, value: branch, mono: true, stacked: false, copyable: true },
    { label: t`Session ID`, value: sessionId, mono: true, stacked: false, copyable: true },
    { label: t`Path`, value: projectPath, mono: true, stacked: true, copyable: true },
    { label: t`Worktree`, value: worktreePath, mono: true, stacked: true, copyable: true },
  ].filter(
    (
      row,
    ): row is {
      label: string;
      value: string;
      mono: boolean;
      stacked: boolean;
      copyable: boolean;
    } => Boolean(row.value),
  );
  const collapsedSummary = branch || projectName;
  return (
    <ThreadDockSection placement="right" collapsed={collapsed} ariaLabel={t`Thread info`}>
      <ThreadDockHeader
        icon={FolderGit2}
        title={t`Thread info`}
        collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
        actions={
          <ThreadDockCollapseButton
            collapsed={collapsed}
            label={collapsed ? t`Expand thread info` : t`Collapse thread info`}
            onPress={() => setCollapsed(!collapsed)}
          />
        }
      >
        {collapsed && collapsedSummary ? (
          <span
            className="ml-auto inline-flex min-w-0 max-w-[11rem] items-center gap-1 rounded-2xl border border-[var(--hairline-soft)] bg-foreground/[0.04] px-1.5 py-0.5 text-[11px] leading-tight text-muted"
            title={collapsedSummary}
          >
            {branch ? (
              <GitBranch className="size-3 shrink-0 text-muted/80" aria-hidden="true" />
            ) : null}
            <span className={`truncate ${branch ? "font-mono" : ""}`}>{collapsedSummary}</span>
          </span>
        ) : null}
      </ThreadDockHeader>
      {!collapsed ? (
        <ThreadDockBody>
          <dl className="divide-y divide-[var(--hairline-soft)]">
            {rows.map((row) =>
              row.stacked ? (
                <div key={row.label} className="group/row min-w-0 py-1.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[11px] text-muted">{row.label}</dt>
                    {row.copyable ? <CopyValueButton value={row.value} /> : null}
                  </div>
                  <dd className="mt-0.5 select-text break-words font-mono text-[11px] leading-4 text-foreground/90 [overflow-wrap:anywhere]">
                    {row.value}
                  </dd>
                </div>
              ) : (
                <div
                  key={row.label}
                  className="group/row flex min-w-0 items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0"
                >
                  <dt className="shrink-0 text-[11px] text-muted">{row.label}</dt>
                  <dd className="flex min-w-0 items-center text-right">
                    <span
                      className={`select-text truncate text-foreground ${
                        row.mono ? "font-mono text-[11px]" : "font-medium"
                      }`}
                      title={row.value}
                    >
                      {row.value}
                    </span>
                    {row.copyable ? <CopyValueButton value={row.value} /> : null}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </ThreadDockBody>
      ) : null}
    </ThreadDockSection>
  );
}

export function useThreadAgentUsage(threadId: string) {
  const thread = useThread(threadId);
  const project = useProject(thread?.projectId);
  const remoteServerId = thread?.remoteServerId ?? project?.remoteServerId;
  const {
    snapshot,
    label,
    view: host,
  } = useHostProviderUsage(
    remoteServerId,
    thread ? { kind: thread.agentKind, instanceId: thread.agentInstanceId } : undefined,
  );
  const reported = snapshot?.status === "ok" ? snapshot : undefined;
  const showEstimatedCost = useSharedSettings((state) => state.usage.showEstimatedCost);
  const selectedRingGroup = useSharedSettings((state) =>
    reported ? state.usage.selectedRingGroups[reported.providerId] : undefined,
  );
  const { showCost, credits, hasWindows } = summarizeUsageSnapshot(reported, showEstimatedCost);
  if (!thread || (!hasWindows && !showCost && !reported?.tokens && !credits)) {
    return null;
  }
  return { remoteServerId, reported, showCost, credits, label, host, selectedRingGroup };
}

export function ThreadAgentUsageDock({ usage }: { usage: ReturnType<typeof useThreadAgentUsage> }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(true);
  if (!usage?.reported) return null;
  const { remoteServerId, reported, showCost, credits, label, host, selectedRingGroup } = usage;
  const hasWindows = reported.windows.length > 0;
  const { outer, inner } = hasWindows
    ? pickUsageRings(reported.providerId, reported.windows, selectedRingGroup)
    : { outer: undefined, inner: undefined };
  const ringWindows = [outer, inner].filter((w): w is NonNullable<typeof w> => w !== undefined);
  const highestRingPercent =
    ringWindows.length > 0
      ? Math.max(...ringWindows.map((window) => window.usedPercent))
      : undefined;
  const ringPercentSummary =
    ringWindows.length > 0
      ? ringWindows.map((window) => formatWindowValue(window)).join(" · ")
      : undefined;
  const windowSummaryText = hasWindows
    ? reported.windows
        .map((window) => `${usageWindowDisplayLabel(window)} ${formatWindowValue(window)}`)
        .join(" · ")
    : undefined;
  const nonWindowSummary =
    showCost && reported.cost
      ? `${reported.cost.estimated ? "~" : ""}${formatMoney(reported.cost.amount, reported.cost.currency)}`
      : credits
        ? credits.unlimited
          ? t`Unlimited`
          : formatCreditBalance(credits)
        : reported.tokens?.total !== undefined
          ? t`${formatTokens(reported.tokens.total)} tokens`
          : undefined;
  const hasFooterContent =
    (reported.tokens?.total !== undefined && (!showCost || reported.tokens.total === 0)) ||
    showCost ||
    Boolean(remoteServerId);
  return (
    <ThreadDockSection placement="right" collapsed={collapsed} ariaLabel={t`Agent usage`}>
      <ThreadDockHeader
        icon={
          <span
            role="img"
            aria-label={label}
            className="inline-flex size-4 shrink-0 items-center justify-center"
          >
            <ProviderIcon
              kind={reported.providerId}
              tone="active"
              fallbackLabel={label}
              className="size-3.5 shrink-0"
            />
          </span>
        }
        title={t`Usage`}
        collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
        actions={
          <ThreadDockCollapseButton
            collapsed={collapsed}
            label={collapsed ? t`Expand agent usage` : t`Collapse agent usage`}
            onPress={() => setCollapsed(!collapsed)}
          />
        }
      >
        {collapsed ? (
          hasWindows ? (
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums"
              title={windowSummaryText}
            >
              <ProviderUsageCircle
                kind={reported.providerId}
                windows={reported.windows}
                size={THREAD_DOCK_SUMMARY_RING_SIZE}
                showProviderIcon={false}
                ringGroup={selectedRingGroup}
              />
              {ringPercentSummary ? (
                <span style={{ color: usageToneColor(highestRingPercent) }}>
                  {ringPercentSummary}
                </span>
              ) : null}
              {windowSummaryText ? <span className="sr-only">{windowSummaryText}</span> : null}
            </span>
          ) : nonWindowSummary ? (
            <span className="ml-auto min-w-0 truncate text-right text-[11px] tabular-nums text-muted">
              {nonWindowSummary}
            </span>
          ) : null
        ) : null}
      </ThreadDockHeader>
      {!collapsed ? (
        <ThreadDockBody className="min-w-0 space-y-2.5">
          {label || reported.plan ? (
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate font-medium text-foreground">{label}</span>
              {reported.plan ? (
                <span className="shrink-0 truncate text-muted">{reported.plan}</span>
              ) : null}
            </div>
          ) : null}
          {hasWindows ? <UsageWindowBars windows={reported.windows} /> : null}
          {credits ? <UsageCreditsRow credits={credits} showSeparator={hasWindows} /> : null}
          {hasFooterContent ? (
            <div
              className={`space-y-1.5 ${hasWindows || credits ? "border-t border-[var(--hairline-soft)] pt-2" : ""}`}
            >
              {reported.tokens?.total !== undefined &&
              (!showCost || reported.tokens.total === 0) ? (
                <p className="tabular-nums text-xs text-muted">
                  <Trans>{formatTokens(reported.tokens.total)} tokens</Trans>
                  {reported.tokens.period ? ` · ${reported.tokens.period}` : null}
                </p>
              ) : null}
              {showCost ? (
                <UsageCostLine snapshot={reported} className="break-words text-xs text-muted" />
              ) : null}
              {remoteServerId ? (
                <HostUsageStatus view={host} className="text-xs text-muted" />
              ) : null}
            </div>
          ) : null}
        </ThreadDockBody>
      ) : null}
    </ThreadDockSection>
  );
}
