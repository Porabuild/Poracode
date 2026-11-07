import { useState } from "react";
import { Gauge } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { useAppStore } from "@/renderer/state/appStore";
import { useThread } from "@/renderer/state/useThread";
import { ThreadContextUsageDetails } from "./ThreadContextDock";
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
  const context = useAppStore((state) => state.runtimeContextByThread[threadId]);
  if (!thread) return null;
  const summary = resolveThreadContextUsageSummary({
    thread,
    agentStatus: undefined,
    reportedUsage: context,
  });
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
          <span className="ml-auto min-w-0 truncate text-right text-[0.85em] tabular-nums text-muted">
            {summary.detail}
          </span>
        ) : null}
      </ThreadDockHeader>
      {!collapsed ? <ThreadContextUsageDetails summary={summary} /> : null}
    </ThreadDockSection>
  );
}
