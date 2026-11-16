import { baseAgentKind } from "@/shared/contracts";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useHostUsageView } from "./HostUsageView";
import { resolveDisplayedProviders, usageProviderIdForAgent } from "./usageProviders";

/**
 * One agent's usage snapshot on its owning host, whichever host that is.
 *
 * Both hosts answer the same `getProviderUsage` procedure, but they deliver it
 * differently, so the delivery stays keyed on the host: the managed host's
 * supervisor pushes live snapshots into `useProviderUsageStore` (hydrated once
 * per activation), while a paired host is read on demand through its own
 * connection into the connection-scoped host usage store, which also carries
 * the read permission, freshness and failure state its status line shows.
 * Agent instance ids are configured per host, so only the managed host's
 * configured instances resolve a provider id here.
 */
export function useHostProviderUsage(
  connectionKey: string | undefined,
  agent: { readonly kind: string; readonly instanceId: string | undefined } | undefined,
) {
  const configuredInstances = useSharedSettings((state) => state.agentInstances);
  const agentInstances = connectionKey === undefined ? configuredInstances : undefined;
  const providerId = agent
    ? usageProviderIdForAgent(agent.kind, agent.instanceId, agentInstances)
    : "";
  const managedSnapshot = useProviderUsage(connectionKey === undefined ? providerId : "");
  const view = useHostUsageView(connectionKey ?? "");
  const snapshot =
    connectionKey === undefined
      ? managedSnapshot
      : view.canRead
        ? view.usage.snapshots.find((entry) => entry.providerId === providerId)
        : undefined;
  const label =
    resolveDisplayedProviders([], [], agentInstances).find((provider) => provider.id === providerId)
      ?.label ?? baseAgentKind(providerId);
  return { providerId, snapshot, label, view };
}
