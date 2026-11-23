import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { baseAgentKind, type AgentStatus } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import {
  useAgentSettingsHost,
  useHostHiddenModels,
  useHostSettingsReady,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";
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
  const settingsHost = useAgentSettingsHost();
  const hiddenModels = useHostHiddenModels();
  const ready = useHostSettingsReady();
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
        isDisabled={!ready}
        onHiddenIdsChange={(updates) => {
          const pending = settingsHost.setHiddenModels(updates);
          if (pending) {
            void pending.catch((error) => toast.danger(friendlyError(error)));
          }
        }}
        listAriaLabel={t`Visible models`}
        triggerClassName="min-w-[4.5rem] tabular-nums"
      />
    </div>
  );
}
