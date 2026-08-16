import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ExternalLink, Gauge, X } from "lucide-react";
import { baseAgentKind, type Thread } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { openUsagePanelForProvider } from "@/renderer/actions/panelActions";
import { Button } from "@/renderer/components/common/Button";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import {
  resolveDisplayedProviders,
  USAGE_PROVIDERS,
} from "@/renderer/components/providers/usageProviders";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { usageStatusText } from "@/renderer/components/providers/usageFormat";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadDockHeader, ThreadDockIconButton, ThreadDockSection } from "./ThreadDockUI";
import type { ThreadContextUsageSummary } from "./threadContextUsage";

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

function useThreadUsagePresentation(thread: Thread) {
  const snapshots = useProviderUsageStore((state) => state.snapshots);
  const agentInstances = useSharedSettings((state) => state.agentInstances);
  const selectedRingGroups = useSharedSettings((state) => state.usage.selectedRingGroups);

  const providerId = resolveThreadUsageProviderId(thread, Object.keys(snapshots));
  const snapshot = snapshots[providerId];
  const label =
    resolveDisplayedProviders([], [], agentInstances).find((provider) => provider.id === providerId)
      ?.label ??
    USAGE_PROVIDERS.find((provider) => provider.id === baseAgentKind(providerId))?.label ??
    baseAgentKind(providerId);

  return {
    providerId,
    snapshot,
    label,
    selectedRingGroup: selectedRingGroups[providerId],
  };
}

/** Thread context and provider quota windows that travel with the mobile composer. */
export function ThreadUsageBubble(props: {
  readonly thread: Thread;
  readonly contextSummary?: ThreadContextUsageSummary | null;
  readonly contextOpen?: boolean;
  readonly usageOpen?: boolean;
  readonly onContextToggle?: (() => void) | undefined;
  readonly onUsageToggle: () => void;
}) {
  const { t } = useLingui();
  const { providerId, snapshot, label, selectedRingGroup } = useThreadUsagePresentation(
    props.thread,
  );

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getProviderUsage({})
      .then((result) => {
        if (cancelled || !result) return;
        const store = useProviderUsageStore.getState();
        for (const incomingSnapshot of result.snapshots) store.mergeSnapshot(incomingSnapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [props.thread.id]);

  return (
    <>
      {props.contextSummary && props.onContextToggle ? (
        <button
          type="button"
          className="m-chip m-chip--resource-meter m-chip--context-meter"
          data-open={props.contextOpen || undefined}
          aria-expanded={props.contextOpen}
          aria-label={
            props.contextOpen ? t`Hide context usage details` : t`Show context usage details`
          }
          title={`${props.contextSummary.headline}: ${props.contextSummary.detail}`}
          onClick={props.onContextToggle}
        >
          {props.contextSummary.percentLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="m-chip m-chip--resource-meter"
        data-open={props.usageOpen || undefined}
        aria-expanded={props.usageOpen}
        aria-label={t`${label} usage`}
        title={t`${label} usage`}
        onClick={props.onUsageToggle}
      >
        <ProviderUsageCircle
          kind={providerId}
          windows={snapshot?.windows}
          size={18}
          showProviderIcon={false}
          ringGroup={selectedRingGroup}
        />
      </button>
    </>
  );
}

/** Provider quota preview rendered inside the shared mobile chip panel surface. */
export function ThreadUsageDock(props: { readonly thread: Thread; readonly onClose: () => void }) {
  const { t } = useLingui();
  const { providerId, snapshot, label } = useThreadUsagePresentation(props.thread);

  const openFullUsage = () => {
    props.onClose();
    openUsagePanelForProvider(providerId);
  };

  return (
    <ThreadDockSection ariaLabel={t`${label} usage`} placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={Gauge}
        title={t`Usage`}
        countLabel={label}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-w-0 items-center gap-1.5 px-2 text-xs leading-none text-foreground"
              aria-label={t`${label} usage — open usage panel`}
              onPress={openFullUsage}
            >
              <ExternalLink className="size-3.5" />
              <Trans>Open</Trans>
            </Button>
            <ThreadDockIconButton label={t`Close usage details`} danger onPress={props.onClose}>
              <X className="size-3.5" />
            </ThreadDockIconButton>
          </div>
        }
      />
      <div className="px-3 pb-2 pt-1 text-xs">
        {snapshot?.status === "ok" && snapshot.windows.length > 0 ? (
          <UsageWindowBars
            windows={snapshot.windows}
            className="space-y-2.5"
            showReset={false}
            showPace={false}
          />
        ) : (
          <p className="text-foreground-muted">{usageStatusText(snapshot, label, providerId)}</p>
        )}
      </div>
    </ThreadDockSection>
  );
}
