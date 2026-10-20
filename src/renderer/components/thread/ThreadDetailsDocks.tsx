import { useState } from "react";
import { FolderGit2, Gauge } from "lucide-react";
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
import { formatTokens } from "@/renderer/components/providers/usageFormat";
import { ThreadDockCollapseButton, ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

export function ThreadWorkspaceDock({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(true);
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
  if (!projectId) return null;
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
        actions={
          <ThreadDockCollapseButton
            collapsed={collapsed}
            label={collapsed ? t`Expand thread context` : t`Collapse thread context`}
            onPress={() => setCollapsed(!collapsed)}
          />
        }
      />
      {!collapsed ? (
        <dl className="space-y-2 px-3 pb-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[0.6875rem] text-muted">{row.label}</dt>
              <dd className="select-text break-all leading-5 text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
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
  const context = useAppStore((state) => state.runtimeContextByThread[threadId]);
  const reported = snapshot?.status === "ok" ? snapshot : undefined;
  const showEstimatedCost = useSharedSettings((state) => state.usage.showEstimatedCost);
  const showCost = Boolean(reported?.cost && (!reported.cost.estimated || showEstimatedCost));
  const hasContext = context?.usedTokens !== undefined || context?.maxTokens !== undefined;
  if (!thread || (!hasContext && !reported?.windows.length && !showCost && !reported?.tokens))
    return null;
  const label =
    resolveDisplayedProviders([], [], remoteServerId ? undefined : agentInstances).find(
      (provider) => provider.id === providerId,
    )?.label ?? baseAgentKind(providerId);
  return { remoteServerId, context, reported, hasContext, showCost, label, host };
}

export function ThreadAgentUsageDock({ usage }: { usage: ReturnType<typeof useThreadAgentUsage> }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(false);
  if (!usage) return null;
  const { remoteServerId, context, reported, hasContext, showCost, label, host } = usage;
  return (
    <ThreadDockSection placement="right" collapsed={collapsed} ariaLabel={t`Agent usage`}>
      <ThreadDockHeader
        icon={Gauge}
        title={t`Usage`}
        actions={
          <ThreadDockCollapseButton
            collapsed={collapsed}
            label={collapsed ? t`Expand agent usage` : t`Collapse agent usage`}
            onPress={() => setCollapsed(!collapsed)}
          />
        }
      />
      {!collapsed ? (
        <div className="space-y-3 px-3 pb-3">
          {hasContext && context ? (
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="text-muted">
                <Trans>Thread context</Trans>
              </span>
              <span className="text-right tabular-nums text-foreground">
                {context.usedTokens !== undefined ? formatTokens(context.usedTokens) : null}
                {context.usedTokens !== undefined && context.maxTokens !== undefined ? " / " : null}
                {context.maxTokens !== undefined
                  ? t`${formatTokens(context.maxTokens)} limit`
                  : null}
              </span>
            </div>
          ) : null}
          {reported && (reported.windows.length > 0 || reported.tokens || showCost) ? (
            <div className="min-w-0 space-y-2">
              <p className="break-words text-muted">
                <Trans>{label} account usage</Trans>
              </p>
              {reported.windows.length > 0 ? (
                <UsageWindowBars windows={reported.windows} showPace={false} showReset={false} />
              ) : null}
              {reported.tokens?.total !== undefined &&
              (!showCost || reported.tokens.total === 0) ? (
                <p className="tabular-nums">
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
        </div>
      ) : null}
    </ThreadDockSection>
  );
}
