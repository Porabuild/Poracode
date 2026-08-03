import { Button } from "@heroui/react";
import { Plural, useLingui } from "@lingui/react/macro";
import { Pause } from "lucide-react";
import { isRemoteSession } from "@/renderer/bridge";
import { statusToMenuProvider } from "@/renderer/components/common/ProviderModelMenu";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { AgentStatus } from "@/shared/contracts";
import type { CrossagentRoutingSnapshotEntry } from "@/shared/crossagentRanking";
import {
  globalVisibleCrossagentCapabilities,
  presentedCrossagentCapabilities,
  type CrossagentVisibilitySettings,
} from "@/shared/crossagentVisibility";
import { formatReasoningLabel } from "@/shared/modelLabels";
import { CrossagentModelFilterDropdown } from "./CrossagentModelFilterDropdown";

/** One ranked provider row: rank, selection detail, learned tags, and the
 *  Crossagents-only controls (model filter + pause). */
export function CrossagentRankedRow(props: {
  entry: CrossagentRoutingSnapshotEntry;
  status: AgentStatus | undefined;
  visibility: CrossagentVisibilitySettings;
}) {
  const { t } = useLingui();
  const { entry, status, visibility } = props;
  const setCrossagentProviderPaused = useSharedSettings((s) => s.setCrossagentProviderPaused);

  const preferenceSourceLabels = {
    "manual-override": t`Manual override`,
    "tag-affinity": t`Task match`,
    "crossagent-usage": t`Crossagents usage`,
    favorite: t`Favorite`,
    "agent-usage": t`Agent usage`,
    "built-in": t`Built-in order`,
  } as const;

  const detail = [
    entry.model.label,
    ...(entry.reasoning ? [formatReasoningLabel(entry.reasoning)] : []),
    ...(entry.fast ? [t`Fast`] : []),
  ].join(" · ");

  const menuProvider = status
    ? {
        ...statusToMenuProvider(status),
        capabilities: globalVisibleCrossagentCapabilities(
          status.kind,
          entry.execution,
          presentedCrossagentCapabilities(status.kind, entry.execution, status.capabilities),
          visibility,
        ),
      }
    : undefined;
  const hasFilterableModels =
    menuProvider?.capabilities.models.some((model) => model.id !== "auto") ?? false;

  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
      <span className="w-7 shrink-0 text-xs font-medium tabular-nums text-muted">
        #{entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{entry.label}</p>
        <p className="truncate text-xs text-muted">{detail}</p>
        {entry.learnedTags.length > 0 ? (
          <p className="truncate text-xs text-muted">
            {entry.learnedTags
              .slice(0, 5)
              .map(({ tag, count }) => `#${tag} (${count})`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {hasFilterableModels && menuProvider ? (
          <CrossagentModelFilterDropdown provider={menuProvider} />
        ) : null}
        {!isRemoteSession() ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Pause ${entry.label}`}
            onPress={() => setCrossagentProviderPaused(entry.provider, true)}
          >
            <Pause className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="w-24 shrink-0 text-right text-xs text-muted">
        <p>{preferenceSourceLabels[entry.source]}</p>
        {entry.usageCount > 0 ? (
          <p>
            <Plural value={entry.usageCount} one="# use" other="# uses" />
          </p>
        ) : null}
      </div>
    </div>
  );
}
