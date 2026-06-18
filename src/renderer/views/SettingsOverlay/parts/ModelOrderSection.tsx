import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, RotateCcw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentStatus } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";

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
  for (const kind of installedKinds) {
    if (!seen.has(kind)) {
      ordered.push(kind);
      seen.add(kind);
    }
  }
  return ordered;
}

function SortableProviderRow(props: { agent: AgentStatus; index: number }) {
  const { agent, index } = props;
  const { t } = useLingui();
  const { ref, handleRef, isDragging } = useSortable({
    id: `provider-order:${agent.kind}`,
    index,
    type: "provider-order",
    accept: ["provider-order"],
    group: "provider-order",
    data: { kind: agent.kind },
  });

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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">
          <Trans>Model order</Trans>
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
      </div>
      <p className="text-xs text-muted">
        <Trans>Drag to reorder how providers appear in the model picker.</Trans>
      </p>
      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-1">
          {orderedAgents.map((agent, index) => (
            <SortableProviderRow key={agent.kind} agent={agent} index={index} />
          ))}
        </div>
      </DragDropProvider>
    </div>
  );
}
