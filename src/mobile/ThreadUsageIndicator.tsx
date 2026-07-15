import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trans, useLingui } from "@lingui/react/macro";
import { Gauge, RefreshCw } from "lucide-react";
import { baseAgentKind, type Thread } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { useProviderUsageRefresh } from "@/renderer/components/providers/useProviderUsageRefresh";
import { usageStatusText } from "@/renderer/components/providers/usageFormat";
import {
  resolveDisplayedProviders,
  USAGE_PROVIDERS,
} from "@/renderer/components/providers/usageProviders";
import { useProviderUsage, useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { BottomSheet, useSheet } from "./components";

/**
 * Best-match usage provider id for a thread, given the snapshots currently in
 * the store. A plain provider's id is its `agentKind` ("claude", "codex"); a
 * Claude profile's is an instance-scoped kind ("claude:<id>"). We try the
 * thread's own kind, then a `<base>:<instance>` composite, then any snapshot
 * that shares the base provider, and finally fall back to the raw kind so the
 * ring still renders (empty) with the correct provider icon.
 */
export function resolveThreadUsageProviderId(
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

/**
 * A per-provider usage ring for the current thread's provider, shown in the
 * thread header. Tapping it opens a drawer with the detailed per-window bars,
 * plan, reset countdowns, and a refresh. Mirrors the desktop's usage rail, but
 * scoped to the one provider the thread runs on.
 */
export function ThreadUsageIndicator(props: { readonly thread: Thread }) {
  const { thread } = props;
  const { t } = useLingui();
  const sheet = useSheet<true>();
  const snapshots = useProviderUsageStore((s) => s.snapshots);
  const agentInstances = useSharedSettings((s) => s.agentInstances);

  // The mobile shell doesn't mount the desktop usage rail, so nothing else
  // fetches usage here — hydrate the store when a thread opens. Best-effort: a
  // missing or failing usage endpoint must never break the thread view.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await readBridge().getProviderUsage({});
        if (cancelled || !res) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of res.snapshots) store.mergeSnapshot(snapshot);
      } catch {
        // usage is best-effort; ignore fetch/availability errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thread.id]);

  const providerId = resolveThreadUsageProviderId(thread, Object.keys(snapshots));
  const snapshot = snapshots[providerId];
  const label =
    resolveDisplayedProviders([], [], agentInstances).find((p) => p.id === providerId)?.label ??
    USAGE_PROVIDERS.find((p) => p.id === baseAgentKind(providerId))?.label ??
    baseAgentKind(providerId);

  return (
    <>
      <button
        type="button"
        className="m-usage-chip"
        aria-label={t`${label} usage`}
        onClick={() => sheet.open(true)}
      >
        <ProviderUsageCircle kind={providerId} windows={snapshot?.windows} size={26} />
      </button>
      {sheet.target !== null ? (
        <UsageDrawer
          providerId={providerId}
          label={label}
          closing={sheet.closing}
          onClose={sheet.close}
        />
      ) : null}
    </>
  );
}

function UsageDrawer(props: {
  readonly providerId: string;
  readonly label: string;
  readonly closing: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const snapshot = useProviderUsage(props.providerId);
  const { refreshing, refresh } = useProviderUsageRefresh(props.providerId);
  const hasWindows = snapshot?.status === "ok" && snapshot.windows.length > 0;

  return (
    <BottomSheet label={t`Usage`} closing={props.closing} onClose={props.onClose}>
      <div className="m-sheet-head">
        <span className="flex min-w-0 items-center gap-2">
          <ProviderIcon
            kind={props.providerId}
            fallbackLabel={props.label}
            className="size-4 shrink-0"
          />
          <span className="truncate">{props.label}</span>
          {snapshot?.plan ? (
            <span className="shrink-0 text-xs font-normal text-muted">{snapshot.plan}</span>
          ) : null}
        </span>
        <button
          type="button"
          className="m-sheet-head-action"
          aria-label={t`Refresh`}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className={`size-4 ${refreshing ? "m-spin" : ""}`} />
        </button>
      </div>
      <div className="m-usage-detail">
        {hasWindows && snapshot ? (
          <UsageWindowBars windows={snapshot.windows} />
        ) : (
          <p className="m-files-empty">{usageStatusText(snapshot, props.label)}</p>
        )}
      </div>
      <button
        type="button"
        className="m-sheet-action"
        onClick={() => {
          props.onClose();
          void navigate({ to: "/usage" });
        }}
      >
        <Gauge className="size-4" />
        <span className="flex-1">
          <Trans>Open full usage</Trans>
        </span>
      </button>
    </BottomSheet>
  );
}
