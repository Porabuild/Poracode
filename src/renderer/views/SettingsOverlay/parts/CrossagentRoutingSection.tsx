import { useEffect, useState } from "react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import { Trash2 } from "lucide-react";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button, TextArea } from "@/renderer/components/common";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { CrossagentRoutingSnapshotEntry } from "@/shared/crossagentRanking";
import { formatReasoningLabel } from "@/shared/modelLabels";

/**
 * Free-text routing guidance for cross-provider subagents. The text is appended
 * to the Crossagents MCP server `instructions` so an agent that spawns subagents
 * knows which connected agent/model to prefer for a given kind of task. Stored
 * globally on `sharedSettings.crossagentRoutingGuide`; committed on blur (matching
 * the other free-text settings) to avoid a disk write per keystroke.
 */
export function CrossagentRoutingSection() {
  const { t } = useLingui();
  const crossagentRoutingGuide = useSharedSettings((s) => s.crossagentRoutingGuide);
  const crossagentSelectionUsage = useSharedSettings((s) => s.crossagentSelectionUsage);
  const crossagentRoutingOverrides = useSharedSettings((s) => s.crossagentRoutingOverrides);
  const agentSelectionUsage = useSharedSettings((s) => s.agentSelectionUsage);
  const favoriteModels = useSharedSettings((s) => s.favoriteModels);
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const statuses = useAgentStatusesStore((s) => s.agentStatuses);
  const setCrossagentRoutingGuide = useSharedSettings((s) => s.setCrossagentRoutingGuide);
  const [draft, setDraft] = useState(crossagentRoutingGuide);
  const [ranked, setRanked] = useState<CrossagentRoutingSnapshotEntry[]>([]);
  const [removingRoute, setRemovingRoute] = useState<string | null>(null);
  const preferenceSourceLabels = {
    "manual-override": t`Manual override`,
    "tag-affinity": t`Task match`,
    "crossagent-usage": t`Crossagents usage`,
    favorite: t`Favorite`,
    "agent-usage": t`Agent usage`,
    "built-in": t`Built-in order`,
  } as const;
  useEffect(() => {
    let active = true;
    void readBridge()
      .getCrossagentRouting()
      .then((entries) => {
        if (active) setRanked(entries);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    statuses,
    disabledAgents,
    hiddenModels,
    crossagentSelectionUsage,
    crossagentRoutingOverrides,
    agentSelectionUsage,
    favoriteModels,
  ]);

  async function removePinnedRoute(tags: string[]) {
    const key = tags.join("\u0000");
    setRemovingRoute(key);
    try {
      const nextOverrides = await readBridge().removeCrossagentRoutingOverride({
        tags,
      });
      useSharedSettings.setState({ crossagentRoutingOverrides: nextOverrides });
    } catch {
      toast.danger(t`Unable to remove pinned route.`);
    } finally {
      setRemovingRoute(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          <Trans>Preferred routing order</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>
            Agents classify delegated work with task tags. Manual task routes rank first, followed
            by matching learned routes, global Crossagents usage, favorites, normal agent usage, and
            built-in order.
          </Trans>
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          {ranked.map((entry) => {
            const detail = [
              entry.model.label,
              ...(entry.reasoning ? [formatReasoningLabel(entry.reasoning)] : []),
              ...(entry.fast ? [t`Fast`] : []),
            ].join(" · ");
            return (
              <div
                key={entry.provider}
                className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
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
                <div className="shrink-0 text-right text-xs text-muted">
                  <p>{preferenceSourceLabels[entry.source]}</p>
                  {entry.usageCount > 0 ? (
                    <p>
                      <Plural value={entry.usageCount} one="# use" other="# uses" />
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          <Trans>
            Unavailable providers, models, reasoning levels, and Fast modes are skipped
            automatically.
          </Trans>
        </p>
        {crossagentRoutingOverrides.length > 0 ? (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                <Trans>Pinned task routes</Trans>
              </p>
              <p className="text-xs text-muted">
                <Trans>
                  Manual routes override learned routing whenever all of their task tags match.
                </Trans>
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              {crossagentRoutingOverrides.map((override) => {
                const key = override.tags.join("\u0000");
                const routeDetail = [
                  override.agentKind,
                  override.modelId,
                  ...(override.effort ? [formatReasoningLabel(override.effort)] : []),
                  ...(override.fast === true ? [t`Fast`] : []),
                ]
                  .filter(Boolean)
                  .join(" · ");
                const providerAvailable = ranked.some(
                  (entry) => entry.provider === override.agentKind,
                );
                const tagLabel = override.tags.map((tag) => `#${tag}`).join(" + ");
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground">{tagLabel}</p>
                      <p className="truncate text-xs text-muted">
                        {routeDetail}
                        {!providerAvailable ? ` · ${t`Unavailable provider`}` : null}
                      </p>
                    </div>
                    {!isRemoteSession() ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={t`Remove pinned route for ${tagLabel}`}
                        isPending={removingRoute === key}
                        onPress={() => void removePinnedRoute(override.tags)}
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
      <section className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          <Trans>Crossagent routing guide</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>
            Instructions agents follow when choosing which agent or model to delegate to.
          </Trans>
        </p>
        <TextArea
          aria-label={t`Crossagent routing guide`}
          className="w-full text-xs"
          rows={4}
          placeholder={t`e.g. Codex GPT-5.5 fast for quick lookups, OpenCode GLM for bulk refactors, Claude Opus for anything subtle.`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setCrossagentRoutingGuide(draft.trim())}
        />
      </section>
    </div>
  );
}
