import { Button, Tooltip } from "@heroui/react";
import { Radar, X } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { createPortal } from "react-dom";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import {
  cancelAgentDiscovery,
  useRemoteAgentRefreshes,
} from "@/renderer/actions/agentDiscoveryActions";
import { countDiscoveredAgentGroups } from "./agentDiscoveryGroups";
import { AgentDiscoveryScreen } from "./AgentDiscoveryScreen";

/** One owner for discovery, including its background indicator across pages. */
export function AgentDiscoveryOverlay() {
  const { t } = useLingui();
  const active = useAgentStatusesStore((s) => s.inFirstLaunchDiscovery);
  const hidden = useAgentStatusesStore((s) => s.discoveryHidden);
  const remoteRefreshes = useRemoteAgentRefreshes();
  // Profiles and extra environments nest in their agent's card, so the pill
  // counts cards (agents), matching the discovery screen's status line.
  const foundCount = useAgentStatusesStore((s) => countDiscoveredAgentGroups(s.discoveredAgents));
  const setHidden = useAgentStatusesStore((s) => s.setDiscoveryHidden);
  if (!active && remoteRefreshes.size === 0) return null;
  if (active && !hidden)
    return (
      <AgentDiscoveryScreen
        onHide={() => {
          // A running scan hides into the background pill; a finished scan
          // dismisses outright (its rows live only for this session).
          const state = useAgentStatusesStore.getState();
          if (state.discoveryScanning) state.setDiscoveryHidden(true);
          else state.resetDiscoveredAgents();
        }}
        onCancel={cancelAgentDiscovery}
      />
    );
  return createPortal(
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2">
      {[...remoteRefreshes].map(([id, label]) => (
        <div
          key={id}
          role="status"
          className="agent-discovery-indicator agent-discovery-indicator--remote max-w-[calc(100vw-2.5rem)] text-sm"
        >
          <Radar aria-hidden="true" className="size-4 shrink-0 text-accent" />
          <span aria-hidden="true" className="agent-discovery-screen__activity shrink-0" />
          <span className="truncate">
            <Trans>Discovering agents…</Trans>
          </span>
          <span className="truncate text-muted">{label}</span>
        </div>
      ))}
      {active ? (
        <div className="agent-discovery-indicator" data-agent-discovery-indicator="">
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
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
