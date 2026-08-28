import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@heroui/react";
import { ArrowUpCircle, GripVertical, RotateCcw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { PixelLoader } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { getProviderModelPickerRank } from "@/renderer/components/providers/providerManifest";
import { useProviderUpdates, type ProviderUpdateEntry } from "./useProviderUpdates";

function resolveDisplayedKinds(
  installed: readonly AgentStatus[],
  providerOrder: readonly string[],
): string[] {
  const installedKinds = installed.map((a) => a.kind);
  const installedSet = new Set(installedKinds);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const kind of providerOrder) {
    if (installedSet.has(kind) && !seen.has(kind)) {
      ordered.push(kind);
      seen.add(kind);
    }
  }
  const missingKinds = installedKinds
    .filter((kind) => !seen.has(kind))
    .toSorted(
      (left, right) => getProviderModelPickerRank(left) - getProviderModelPickerRank(right),
    );
  for (const kind of missingKinds) {
    if (!seen.has(kind)) {
      ordered.push(kind);
      seen.add(kind);
    }
  }
  return ordered;
}

function SortableProviderRow(props: {
  agent: AgentStatus;
  index: number;
  update: ProviderUpdateEntry;
  isBulkUpdating: boolean;
  onUpdate: (kind: string) => void;
}) {
  const { agent, index, update, isBulkUpdating, onUpdate } = props;
  const { t } = useLingui();
  const { ref, handleRef, isDragging } = useSortable({
    id: `provider-order:${agent.kind}`,
    index,
    type: "provider-order",
    accept: ["provider-order"],
    group: "provider-order",
    data: { kind: agent.kind },
  });
  const updateLabel = update.targetVersion ? `v${update.targetVersion}` : "";

  return (
    <div
      ref={ref}
      className={`flex items-center gap-2 rounded border border-border bg-surface px-2 py-1 text-xs ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={t`Reorder ${agent.label}`}
        className="flex size-4 shrink-0 cursor-grab items-center justify-center text-muted/60 transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <ProviderIcon
        kind={agent.kind}
        {...(agent.icon ? { icon: agent.icon } : {})}
        fallbackLabel={agent.label}
        className="size-3.5 shrink-0"
      />
      <span className="truncate text-foreground">{agent.label}</span>
      <span className="ml-auto min-w-0 max-w-[45%] truncate tabular-nums text-muted/60">
        {update.environments.length > 0
          ? update.environments
              .map((env) => `${env.label} ${env.version ? `v${env.version}` : "—"}`.trim())
              .join(" · ")
          : update.installedVersion
            ? `v${update.installedVersion}`
            : "—"}
      </span>
      {update.updatePhase ? (
        <div
          className="flex h-5 min-w-[6.5rem] max-w-[45%] shrink-0 items-center gap-1 text-[10px] text-muted"
          {...(isBulkUpdating && update.updatePhase !== "queued"
            ? { "aria-hidden": true }
            : isBulkUpdating
              ? {}
              : {
                  role: "status",
                  "aria-label":
                    update.updatePhase === "probing"
                      ? t`Probing ${agent.label} v${update.targetVersion}`
                      : t`Updating ${agent.label} to v${update.targetVersion}`,
                })}
        >
          {update.updatePhase === "queued" ? null : (
            <span aria-hidden="true">
              <PixelLoader size="xs" />
            </span>
          )}
          {update.targetVersion ? (
            <span className="truncate">
              {update.updatePhase === "queued" ? (
                <Trans>Queued for v{update.targetVersion}</Trans>
              ) : update.updatePhase === "probing" ? (
                <Trans>Probing v{update.targetVersion}</Trans>
              ) : (
                <Trans>Updating to v{update.targetVersion}</Trans>
              )}
            </span>
          ) : null}
        </div>
      ) : update.targetVersion ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 min-h-5 shrink-0 gap-1 px-1.5 py-0 text-[10px] text-muted hover:text-foreground"
          aria-label={t`Update ${agent.label} to ${updateLabel}`}
          isDisabled={isBulkUpdating}
          onPress={() => onUpdate(agent.kind)}
        >
          <ArrowUpCircle className="size-3" />
          <Trans>Update to v{update.targetVersion}</Trans>
        </Button>
      ) : null}
    </div>
  );
}

export function ModelOrderSection() {
  const { t } = useLingui();
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const providerOrder = useSharedSettings((s) => s.providerOrder);
  const setProviderOrder = useSharedSettings((s) => s.setProviderOrder);

  const installedAgents = getSettingsInstalledAgents(agentStatuses, wslAgentStatuses);
  const displayedKinds = resolveDisplayedKinds(installedAgents, providerOrder);
  const byKind = new Map(installedAgents.map((a) => [a.kind, a]));
  const orderedAgents = displayedKinds
    .map((kind) => byKind.get(kind))
    .filter((a): a is AgentStatus => a !== undefined);

  const isCustomized = providerOrder.length > 0;
  const updates = useProviderUpdates(orderedAgents);
  const updateAllProgress = updates.updateAllProgress;
  const updateAllProgressLabel = updateAllProgress
    ? updateAllProgress.phase === "probing"
      ? t`Probing ${updateAllProgress.agentLabel} v${updateAllProgress.targetVersion}`
      : t`Updating ${updateAllProgress.agentLabel} to v${updateAllProgress.targetVersion}`
    : "";

  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const src = event.operation.source;
    if (!src || !isSortable(src)) return;
    const fromIndex = src.initialIndex;
    const toIndex = src.index;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...displayedKinds];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    setProviderOrder(next);
  }

  if (orderedAgents.length === 0) return null;

  return (
    <div
      id="agentsGeneral.modelOrder"
      data-settings-anchor="agentsGeneral.modelOrder"
      className="scroll-mt-4 space-y-2"
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">
          <Trans>Providers</Trans>
        </p>
        {isCustomized ? (
          <button
            type="button"
            onClick={() => setProviderOrder([])}
            aria-label={t`Reset model order`}
            className="flex size-5 items-center justify-center rounded text-muted/70 transition-colors hover:bg-surface hover:text-foreground"
          >
            <RotateCcw className="size-3" />
          </button>
        ) : null}
        {updateAllProgress || updates.outdatedKinds.length > 0 ? (
          <div
            className="ml-auto flex min-w-0 justify-end"
            {...(updateAllProgress
              ? {
                  role: "status",
                  "aria-live": "polite" as const,
                  "aria-label": updateAllProgressLabel,
                }
              : {})}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-6 max-w-full gap-1 px-2 text-[11px]"
              aria-label={updateAllProgress ? updateAllProgressLabel : t`Update all`}
              {...(updates.isUpdatingAll
                ? { "aria-disabled": true }
                : { onPress: updates.updateAll })}
            >
              {updateAllProgress ? (
                <>
                  <span aria-hidden="true">
                    <PixelLoader size="xs" />
                  </span>
                  <span className="truncate">{updateAllProgressLabel}</span>
                </>
              ) : (
                <>
                  <ArrowUpCircle className="size-3" />
                  <Trans>Update all</Trans>
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        <Trans>Drag to reorder how providers appear in the model picker.</Trans>
      </p>
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-1">
          {orderedAgents.map((agent, index) => (
            <SortableProviderRow
              key={agent.kind}
              agent={agent}
              index={index}
              update={updates.entryFor(agent.kind)}
              isBulkUpdating={updates.isUpdatingAll}
              onUpdate={updates.updateKind}
            />
          ))}
        </div>
      </DragDropProvider>
    </div>
  );
}
