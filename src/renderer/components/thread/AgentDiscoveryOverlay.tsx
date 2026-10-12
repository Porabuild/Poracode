import { Button, Tooltip } from "@heroui/react";
import { Radar, X } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { createPortal } from "react-dom";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { cancelAgentDiscovery } from "@/renderer/actions/agentDiscoveryActions";
import { AgentDiscoveryScreen } from "./AgentDiscoveryScreen";

/** One owner for discovery, including its background indicator across pages. */
export function AgentDiscoveryOverlay() {
  const { t } = useLingui();
  const active = useAgentStatusesStore((s) => s.inFirstLaunchDiscovery);
  const hidden = useAgentStatusesStore((s) => s.discoveryHidden);
  const foundCount = useAgentStatusesStore(
    (s) => s.discoveredAgents.filter((agent) => agent.installed).length,
  );
  const setHidden = useAgentStatusesStore((s) => s.setDiscoveryHidden);
  if (!active) return null;
  if (!hidden)
    return <AgentDiscoveryScreen onHide={() => setHidden(true)} onCancel={cancelAgentDiscovery} />;
  return createPortal(
    <div
      className="agent-discovery-indicator fixed bottom-5 right-5 z-[60]"
      data-agent-discovery-indicator=""
    >
      <Button
        size="sm"
        variant="ghost"
        onPress={() => setHidden(false)}
        aria-label={t`Show agent discovery`}
      >
        <Radar className="size-4 text-accent" />
        <span aria-hidden="true" className="agent-discovery-screen__activity" />
        <span aria-live="polite">
          {foundCount > 0 ? (
            <Plural value={foundCount} one="# agent found" other="# agents found" />
          ) : (
            <Trans>Discovering agents…</Trans>
          )}
        </span>
      </Button>
      <Tooltip delay={150}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Cancel agent discovery`}
            onPress={cancelAgentDiscovery}
          >
            <X className="size-3.5" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>
          <Trans>Cancel agent discovery</Trans>
        </Tooltip.Content>
      </Tooltip>
    </div>,
    document.body,
  );
}
