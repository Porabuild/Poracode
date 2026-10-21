import { useState } from "react";
import { FolderGit2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { baseAgentKind } from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";
import { useAppStore } from "@/renderer/state/appStore";
import { useProject, useThread } from "@/renderer/state/useThread";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { HostUsageStatus, useHostUsageView } from "@/renderer/components/providers/HostUsageView";
import {
  resolveDisplayedProviders,
  usageProviderIdForAgent,
} from "@/renderer/components/providers/usageProviders";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { UsageCostLine } from "@/renderer/components/providers/UsageCostLine";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  formatMoney,
  formatTokens,
  formatWindowValue,
  usageWindowDisplayLabel,
} from "@/renderer/components/providers/usageFormat";
import { ThreadContextUsageDetails } from "./ThreadContextDock";
import { resolveThreadContextUsageSummary } from "./threadContextUsage";
import { ThreadDockCollapseButton, ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

export function ThreadWorkspaceDock({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(true);
  const selectedThread = useThread(threadId);
  const context = useAppStore((state) => state.runtimeContextByThread[threadId]);
  const projectId = useAppStore(
    (state) => state.threads.find((thread) => thread.id === threadId)?.projectId,
  );
  const projectName = useAppStore(
    (state) => state.projects.find((project) => project.id === projectId)?.name,
  );
  const projectPath = useAppStore((state) => {
    const location = state.projects.find((project) => project.id === projectId)?.location;
    return location ? getProjectFsPath(location) : undefined;
  });
  const worktreePath = useAppStore(
    (state) => state.threads.find((thread) => thread.id === threadId)?.worktreePath,
  );
  const worktreeBranch = useAppStore(
    (state) => state.threads.find((thread) => thread.id === threadId)?.worktreeBranch,
  );
  const sessionId = useAppStore(
    (state) =>
      state.threads.find((thread) => thread.id === threadId)?.sessionRef?.providerSessionId,
  );
  const branch =
    useGitStore((state) =>
      worktreePath
        ? state.worktreeStatuses[worktreePath]?.branch
        : projectId
          ? state.statuses[projectId]?.branch
          : undefined,
    ) ?? worktreeBranch;
  if (!selectedThread || !projectId) return null;
  const hasContext =
    context?.usedTokens !== undefined ||
    context?.maxTokens !== undefined ||
    Boolean(context?.breakdown?.length);
  const contextSummary = resolveThreadContextUsageSummary({
    thread: selectedThread,
    agentStatus: undefined,
    reportedUsage: context,
  });
  const rows = [
    { label: t`Workspace`, value: projectName },
    { label: t`Path`, value: projectPath },
    { label: t`Worktree`, value: worktreePath },
    { label: t`Branch`, value: branch },
    { label: t`Session ID`, value: sessionId },
  ].filter((row) => row.value !== undefined && row.value !== null);
  return (
    <ThreadDockSection placement="right" collapsed={collapsed} ariaLabel={t`Thread context`}>
      <ThreadDockHeader
        icon={FolderGit2}
        title={t`Thread context`}
        collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
        actions={
          <ThreadDockCollapseButton
            collapsed={collapsed}
            label={collapsed ? t`Expand thread context` : t`Collapse thread context`}
            onPress={() => setCollapsed(!collapsed)}
          />
        }
      >
        {collapsed ? (
          <span className="ml-auto min-w-0 truncate text-right text-[0.85em] tabular-nums text-muted">
            {hasContext ? contextSummary.detail : (branch ?? projectName)}
          </span>
        ) : null}
      </ThreadDockHeader>
      {!collapsed ? (
        <>
          {hasContext ? <ThreadContextUsageDetails summary={contextSummary} /> : null}
          <dl className="space-y-2 px-3 pb-3">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[0.6875rem] text-muted">{row.label}</dt>
                <dd className="select-text break-all leading-5 text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </ThreadDockSection>
  );
}

export function useThreadAgentUsage(threadId: string) {
  const thread = useThread(threadId);
  const project = useProject(thread?.projectId);
  const remoteServerId = thread?.remoteServerId ?? project?.remoteServerId;
  const agentInstances = useSharedSettings((state) => state.agentInstances);
  const providerId = thread
    ? usageProviderIdForAgent(
        thread.agentKind,
        thread.agentInstanceId,
        remoteServerId ? undefined : agentInstances,
      )
    : "";
  const localSnapshot = useProviderUsage(providerId);
  const host = useHostUsageView(remoteServerId ?? "");
  const snapshot = remoteServerId
    ? host.canRead
      ? host.usage.snapshots.find((entry) => entry.providerId === providerId)
      : undefined
    : localSnapshot;
  const reported = snapshot?.status === "ok" ? snapshot : undefined;
  const showEstimatedCost = useSharedSettings((state) => state.usage.showEstimatedCost);
  const showCost = Boolean(reported?.cost && (!reported.cost.estimated || showEstimatedCost));
  if (!thread || (!reported?.windows.length && !showCost && !reported?.tokens)) return null;
  const label =
    resolveDisplayedProviders([], [], remoteServerId ? undefined : agentInstances).find(
      (provider) => provider.id === providerId,
    )?.label ?? baseAgentKind(providerId);
  return { remoteServerId, reported, showCost, label, host };
}

export function ThreadAgentUsageDock({ usage }: { usage: ReturnType<typeof useThreadAgentUsage> }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(true);
  if (!usage?.reported) return null;
  const { remoteServerId, reported, showCost, label, host } = usage;
  const primaryWindow = reported.windows[0];
  const summary = primaryWindow
    ? `${usageWindowDisplayLabel(primaryWindow)} ${formatWindowValue(primaryWindow)}`
    : showCost && reported.cost
      ? `${reported.cost.estimated ? "~" : ""}${formatMoney(reported.cost.amount, reported.cost.currency)}`
      : reported.tokens?.total !== undefined
        ? t`${formatTokens(reported.tokens.total)} tokens`
        : undefined;
  return (
    <ThreadDockSection placement="right" collapsed={collapsed} ariaLabel={t`Agent usage`}>
      <ThreadDockHeader
        icon={
          <span role="img" aria-label={label}>
            <ProviderIcon
              kind={reported.providerId}
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
          <span className="ml-auto min-w-0 truncate text-right text-[0.85em] tabular-nums text-muted">
            {summary}
          </span>
        ) : null}
      </ThreadDockHeader>
      {!collapsed ? (
        <div className="min-w-0 space-y-2 px-3 pb-3">
          {reported.windows.length > 0 ? (
            <UsageWindowBars windows={reported.windows} showPace={false} showReset={false} />
          ) : null}
          {reported.tokens?.total !== undefined && (!showCost || reported.tokens.total === 0) ? (
            <p className="tabular-nums">
              <Trans>{formatTokens(reported.tokens.total)} tokens</Trans>
              {reported.tokens.period ? ` · ${reported.tokens.period}` : null}
            </p>
          ) : null}
          {showCost ? (
            <UsageCostLine snapshot={reported} className="break-words text-xs text-muted" />
          ) : null}
          {remoteServerId ? <HostUsageStatus view={host} className="text-xs text-muted" /> : null}
        </div>
      ) : null}
    </ThreadDockSection>
  );
}
