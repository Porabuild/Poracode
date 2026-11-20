import { useState } from "react";
import { Gauge } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useHostAgentStatuses } from "@/renderer/hooks/useHostAgentStatuses";
import { useAppStore } from "@/renderer/state/appStore";
import { useProject, useThread } from "@/renderer/state/useThread";
import { ThreadContextUsageDetails } from "./ThreadContextDock";
import { ContextUsageRing, resolveContextTone } from "./ThreadContextIndicator";
import { resolveThreadContextUsageSummary } from "./threadContextUsage";
import { ThreadDockCollapseButton, ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

/**
 * Right-panel "Context window" section: the thread's reported token usage
 * with its breakdown, independent of the workspace metadata in Thread info.
 * The section stays mounted even before the provider reports usage so the
 * empty state explains what will appear.
 */
export function ThreadContextWindowDock({ threadId }: { threadId: string }) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(true);
  const thread = useThread(threadId);
  const project = useProject(thread?.projectId);
  const hostAgentStatuses = useHostAgentStatuses(
    thread?.remoteServerId ?? project?.remoteServerId,
    project?.location,
  );
  const context = useAppStore((state) => state.runtimeContextByThread[threadId]);
  if (!thread) return null;
  const agentStatus = hostAgentStatuses.find((status) => status.kind === thread.agentKind);
  const summary = resolveThreadContextUsageSummary({
    thread,
    agentStatus,
    reportedUsage: context,
  });
  const tone = resolveContextTone(summary.percent);
  const percentClassName =
    tone === "danger"
      ? "font-medium text-danger"
      : tone === "warning"
        ? "font-medium text-warning"
        : "text-foreground";
  return (
    <ThreadDockSection placement="right" collapsed={collapsed} ariaLabel={t`Context window`}>
      <ThreadDockHeader
        icon={Gauge}
        title={t`Context window`}
        collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
        actions={
          <ThreadDockCollapseButton
            collapsed={collapsed}
            label={collapsed ? t`Expand context window` : t`Collapse context window`}
            onPress={() => setCollapsed(!collapsed)}
          />
        }
      >
        {collapsed ? (
          summary.percent !== undefined ? (
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums"
              title={summary.detail}
            >
              <ContextUsageRing percent={summary.percent} size={16} />
              <span className={percentClassName}>{summary.percent}%</span>
              <span className="sr-only">{summary.detail}</span>
            </span>
          ) : summary.usedTokens !== undefined ? (
            <span
              className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-[11px] tabular-nums text-muted"
              title={summary.detail}
            >
              <ContextUsageRing percent={undefined} size={16} />
              <span className="truncate">{summary.detail}</span>
            </span>
          ) : (
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted"
              title={summary.detail}
            >
              <ContextUsageRing percent={undefined} size={16} />
              <span aria-hidden="true">—</span>
              <span className="sr-only">{summary.detail}</span>
            </span>
          )
        ) : null}
      </ThreadDockHeader>
      {!collapsed ? <ThreadContextUsageDetails summary={summary} /> : null}
    </ThreadDockSection>
  );
}
