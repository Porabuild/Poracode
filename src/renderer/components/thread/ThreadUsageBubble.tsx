import { useEffect } from "react";
import { useLingui } from "@lingui/react/macro";
import { baseAgentKind, type Thread } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { openUsagePanelForProvider } from "@/renderer/actions/panelActions";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import {
  resolveDisplayedProviders,
  USAGE_PROVIDERS,
} from "@/renderer/components/providers/usageProviders";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

function resolveThreadUsageProviderId(
  thread: { readonly agentKind: string; readonly agentInstanceId?: string | undefined },
  availableIds: readonly string[],
): string {
  const ids = new Set(availableIds);
  const base = baseAgentKind(thread.agentKind);
  const candidates = thread.agentInstanceId
    ? [thread.agentKind, `${base}:${thread.agentInstanceId}`]
    : [thread.agentKind];
  for (const candidate of candidates) {
    if (ids.has(candidate)) return candidate;
  }
  return availableIds.find((id) => baseAgentKind(id) === base) ?? thread.agentKind;
}

/** Compact provider usage pill that travels with the floating thread composer. */
export function ThreadUsageBubble(props: { readonly thread: Thread }) {
  const { t } = useLingui();
  const snapshots = useProviderUsageStore((state) => state.snapshots);
  const agentInstances = useSharedSettings((state) => state.agentInstances);
  const selectedRingGroups = useSharedSettings((state) => state.usage.selectedRingGroups);

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getProviderUsage({})
      .then((result) => {
        if (cancelled || !result) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of result.snapshots) store.mergeSnapshot(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [props.thread.id]);

  const providerId = resolveThreadUsageProviderId(props.thread, Object.keys(snapshots));
  const snapshot = snapshots[providerId];
  const label =
    resolveDisplayedProviders([], [], agentInstances).find((provider) => provider.id === providerId)
      ?.label ??
    USAGE_PROVIDERS.find((provider) => provider.id === baseAgentKind(providerId))?.label ??
    baseAgentKind(providerId);
  const selectedRingGroup = selectedRingGroups[providerId];

  return (
    <button
      type="button"
      className="m-chip m-chip--usage"
      aria-label={t`${label} usage`}
      title={t`${label} usage`}
      onClick={() => openUsagePanelForProvider(providerId)}
    >
      <ProviderUsageCircle
        kind={providerId}
        windows={snapshot?.windows}
        size={18}
        ringGroup={selectedRingGroup}
      />
    </button>
  );
}
