import { Trans, useLingui } from "@lingui/react/macro";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { baseAgentKind, type AgentStatus } from "@/shared/contracts";
import {
  buildProviderVisibilityCatalog,
  resolveEffectiveHiddenIdsByKey,
} from "../../modelVisibilityCatalog";
import type { NativeAgentRuntimeSlots } from "../../nativeAgentRuntimes";
import { ProviderModelVisibilityPopover } from "../../ProviderModelVisibilityPopover";

export function ModelVisibilityDropdown(props: {
  agent: AgentStatus;
  runtimeSlots?: NativeAgentRuntimeSlots;
}) {
  const { t } = useLingui();
  const hiddenModels = useSharedSettings((state) => state.hiddenModels);
  const setHiddenModels = useSharedSettings((state) => state.setHiddenModels);
  const { groups, surfaceProviders } = buildProviderVisibilityCatalog({
    agents: [props.agent],
    ...(props.runtimeSlots
      ? {
          runtimeSlotsByBaseKind: new Map([[baseAgentKind(props.agent.kind), props.runtimeSlots]]),
        }
      : {}),
  });
  if (groups.length === 0) return null;
  const hiddenIdsByKey = resolveEffectiveHiddenIdsByKey(surfaceProviders, hiddenModels);

  return (
    <div className="group mt-6 flex items-center justify-between gap-4 border-b border-border/10 py-2 last:border-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-medium text-foreground">
          <Trans>Visible models</Trans>
        </p>
        <p className="line-clamp-1 text-[11px] text-muted transition-all group-hover:line-clamp-none">
          <Trans>Toggle models off to hide them from the selector.</Trans>
        </p>
      </div>
      <ProviderModelVisibilityPopover
        groups={groups}
        hiddenIdsByKey={hiddenIdsByKey}
        onHiddenIdsChange={(updates) => {
          for (const [key, next] of updates) setHiddenModels(key, next);
        }}
        listAriaLabel={t`Visible models`}
        triggerClassName="min-w-[4.5rem] tabular-nums"
      />
    </div>
  );
}
