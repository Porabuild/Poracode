import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@heroui/react";
import { ArrowUpCircle, Clock, GripVertical, RotateCcw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { PixelLoader, ToggleSwitch } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { getProviderModelPickerRank } from "@/renderer/components/providers/providerManifest";
import { useProviderUpdates, type ProviderUpdateEntry } from "./useProviderUpdates";
import { machineIdForStatus, useMachines, useSelectedMachine } from "@/renderer/state/machines";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { effectiveProviderOrder } from "@/shared/machineSettings";

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
          className="flex h-5 min-w-[6.5rem] max-w-[45%] shrink-0 items-center gap-1.5 text-[10px] text-muted"
          {...(isBulkUpdating && update.updatePhase !== "queued"
            ? { "aria-hidden": true }
            : isBulkUpdating
              ? {
                  role: "status",
                  "aria-label": t`${agent.label} queued for update to v${update.targetVersion}`,
                }
              : {
                  role: "status",
                  "aria-label":
                    update.updatePhase === "probing"
                      ? t`Probing ${agent.label} v${update.targetVersion}`
                      : t`Updating ${agent.label} to v${update.targetVersion}`,
                })}
        >
          {update.updatePhase === "queued" ? (
            <Clock className="size-3 shrink-0 text-muted/70" aria-hidden="true" />
          ) : (
            <span aria-hidden="true" className="inline-flex shrink-0 items-center">
              <PixelLoader size="xxs" />
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
          className="h-5 min-h-5 shrink-0 gap-1.5 px-1.5 py-0 text-[10px] text-muted hover:text-foreground"
          aria-label={t`Update ${agent.label} to ${updateLabel}`}
          isDisabled={isBulkUpdating}
          onPress={() => onUpdate(agent.kind)}
        >
          <ArrowUpCircle className="size-3 shrink-0" />
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
  const machineScopeModes = useSharedSettings((s) => s.machineScopeModes);
  const machineSettings = useSharedSettings((s) => s.machineSettings);
  const setProviderOrder = useSharedSettings((s) => s.setProviderOrder);
  const setMachineScopeMode = useSharedSettings((s) => s.setMachineScopeMode);
  const setMachineProviderOrder = useSharedSettings((s) => s.setMachineProviderOrder);
  const lockProviderOrderToMachine = useSharedSettings((s) => s.lockProviderOrderToMachine);

  const machines = useMachines();
  const selectedMachine = useSelectedMachine();
  const isRemoteMachine = selectedMachine.ref.host === "remote";
  const remoteRuntime = useRemoteServersStore((s) =>
    selectedMachine.desktopId ? s.runtime[selectedMachine.desktopId] : undefined,
  );
  const orderLocked = machineScopeModes.providerOrder === "synced";
  const activeOrder = effectiveProviderOrder(
    { machineScopeModes, machineSettings, providerOrder },
    selectedMachine.id,
  );

  // The list shows the selected machine's providers: local machines filter the
  // local status stores by machine; remote machines read the paired host's
  // already-collected statuses.
  const installedAgents = isRemoteMachine
    ? getSettingsInstalledAgents(
        selectedMachine.ref.env.kind === "native"
          ? (remoteRuntime?.agentStatuses?.windows ?? [])
          : [],
        (remoteRuntime?.agentStatuses?.wsl ?? []).filter(
          (a) => a.envDistro === selectedMachine.wslDistro,
        ),
      )
    : getSettingsInstalledAgents(
        agentStatuses.filter((a) => machineIdForStatus(a) === selectedMachine.id),
        wslAgentStatuses.filter((a) => machineIdForStatus(a) === selectedMachine.id),
      );
  const displayedKinds = resolveDisplayedKinds(installedAgents, activeOrder);
  const byKind = new Map(installedAgents.map((a) => [a.kind, a]));
  const orderedAgents = displayedKinds
    .map((kind) => byKind.get(kind))
    .filter((a): a is AgentStatus => a !== undefined);

  const isCustomized = orderLocked
    ? providerOrder.length > 0
    : (machineSettings[selectedMachine.id]?.providerOrder?.length ?? 0) > 0;
  const applyOrder = (next: string[]) => {
    if (orderLocked) setProviderOrder(next);
    else setMachineProviderOrder(selectedMachine.id, next);
  };
  // Update actions run on the local supervisor only.
  const updates = useProviderUpdates(isRemoteMachine ? [] : orderedAgents, selectedMachine.id);
  const outdatedCount = updates.outdatedKinds.length;
  const updateAllProgress = updates.updateAllProgress;
  const updateAllProgressAriaLabel = updateAllProgress
    ? updateAllProgress.phase === "probing"
      ? t`Probing ${updateAllProgress.agentLabel} (${updateAllProgress.current} of ${updateAllProgress.total})`
      : t`Updating ${updateAllProgress.agentLabel} (${updateAllProgress.current} of ${updateAllProgress.total})`
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
    applyOrder(next);
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
            onClick={() => applyOrder([])}
            aria-label={t`Reset model order`}
            className="flex size-5 items-center justify-center rounded text-muted/70 transition-colors hover:bg-surface hover:text-foreground"
          >
            <RotateCcw className="size-3" />
          </button>
        ) : null}
        {updateAllProgress || outdatedCount > 0 ? (
          <div
            className="ml-auto flex min-w-0 justify-end"
            {...(updateAllProgress
              ? {
                  role: "status",
                  "aria-live": "polite" as const,
                  "aria-label": updateAllProgressAriaLabel,
                }
              : {})}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-6 max-w-full gap-1.5 px-2 text-[11px]"
              aria-label={
                updateAllProgress ? updateAllProgressAriaLabel : t`Update all (${outdatedCount})`
              }
              {...(updates.isUpdatingAll
                ? { "aria-disabled": true }
                : { onPress: updates.updateAll })}
            >
              {updateAllProgress ? (
                <>
                  <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                    <PixelLoader size="xxs" />
                  </span>
                  <span className="truncate">
                    <Trans>
                      Updating ({updateAllProgress.current}/{updateAllProgress.total})
                    </Trans>
                  </span>
                </>
              ) : (
                <>
                  <ArrowUpCircle className="size-3 shrink-0" />
                  <Trans>Update all ({outdatedCount})</Trans>
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {orderLocked || machines.length <= 1 ? (
          <Trans>Drag to reorder how providers appear in the model picker.</Trans>
        ) : (
          <Trans>Drag to reorder providers on {selectedMachine.label}.</Trans>
        )}
      </p>
      {machines.length > 1 ? (
        <div
          id="agentsGeneral.providerOrderLock"
          data-settings-anchor="agentsGeneral.providerOrderLock"
          className="flex scroll-mt-4 items-center justify-between gap-4 py-1"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              <Trans>Same provider order on all machines</Trans>
            </p>
            <p className="text-[11px] text-muted">
              {orderLocked ? (
                <Trans>Keep one provider order everywhere. Turn off to arrange per machine.</Trans>
              ) : (
                <Trans>Locking keeps this machine's order and applies it everywhere.</Trans>
              )}
            </p>
          </div>
          <ToggleSwitch
            size="sm"
            aria-label={t`Same provider order on all machines`}
            isSelected={orderLocked}
            onChange={(selected) => {
              if (selected) lockProviderOrderToMachine(selectedMachine.id);
              else setMachineScopeMode("providerOrder", "per-machine");
            }}
          />
        </div>
      ) : null}
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
