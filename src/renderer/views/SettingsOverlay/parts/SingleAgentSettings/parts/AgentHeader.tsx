import { startTransition } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowUpCircle } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { ToggleSwitch } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import type { AgentStatus } from "@/shared/contracts";

/** Page header of an agent's settings: identity, registry update, enable toggle. */
export function AgentHeader(props: {
  agent: AgentStatus;
  isDisabled: boolean;
  updateAvailable: boolean;
  updatePending: boolean;
  latestRegistryVersion: string | undefined;
  toggleDisabled: boolean;
  wslDistros: readonly string[];
  onPerformUpdate: () => void;
  onSetAgentDisabled: (agentKind: string, disabled: boolean) => void;
}) {
  const { t } = useLingui();
  const { agent } = props;
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <ProviderIcon
          kind={agent.kind}
          icon={agent.icon}
          fallbackLabel={agent.label}
          className="size-8"
        />
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold text-foreground leading-tight">{agent.label}</h1>
          <p className="text-[11px] text-muted">
            {props.isDisabled ? t`Agent is currently disabled` : t`Agent is active and ready`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {props.updateAvailable && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 min-h-7 gap-1 px-2 text-[11px]"
            isPending={props.updatePending}
            onPress={props.onPerformUpdate}
          >
            <ArrowUpCircle className="size-3" />
            <Trans>Update to v{props.latestRegistryVersion}</Trans>
          </Button>
        )}
        <ToggleSwitch
          isSelected={!props.isDisabled}
          isDisabled={props.toggleDisabled}
          size="sm"
          aria-label={t`Enabled`}
          onChange={(selected) => {
            startTransition(() => {
              props.onSetAgentDisabled(agent.kind, !selected);
            });
            if (selected) {
              void readBridge()
                .refreshAgentStatuses([...props.wslDistros], { agentKinds: [agent.kind] })
                .catch(() => undefined);
            }
          }}
        />
      </div>
    </div>
  );
}
