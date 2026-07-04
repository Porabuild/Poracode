import { startTransition, useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, LogOut, RefreshCw } from "lucide-react";
import { NumberField, Switch } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  formatMoney,
  formatTokens,
  usageStatusText,
} from "@/renderer/components/providers/usageFormat";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { usageProvidersForAgentInstances } from "@/renderer/components/providers/usageProviders";
import { useProviderUsageRefresh } from "@/renderer/components/providers/useProviderUsageRefresh";
import { useUsageProviderLogin } from "@/renderer/components/providers/useUsageProviderLogin";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProviderUsage, useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { SettingRow, SettingsPage } from "./SettingsForm";

/**
 * Per-provider controls beneath each provider row: sign in / out, a manual
 * single-provider refresh, a sidebar-circle visibility toggle, and a
 * per-provider auto-refresh cadence override. Only rendered while the provider
 * is tracked (the master Switch is on).
 */
function UsageProviderControls(props: { id: string; label: string }) {
  const { id, label } = props;
  const { t } = useLingui();
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const sidebarHiddenProviders = useSharedSettings((s) => s.usage.sidebarHiddenProviders);
  const providerRefreshIntervals = useSharedSettings((s) => s.usage.providerRefreshIntervals);
  const defaultIntervalMinutes = useSharedSettings((s) => s.usage.refreshIntervalMinutes);
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);

  const {
    isApiKeyLogin,
    canSignIn,
    canSignOut,
    signingIn,
    signingOut,
    apiKey,
    setApiKey,
    handleSignIn,
    handleSubmitApiKey,
    handleSignOut,
  } = useUsageProviderLogin(id);
  const { refreshing, refresh } = useProviderUsageRefresh(id);

  const circleHidden = sidebarHiddenProviders.includes(id);
  const toggleCircle = () => {
    const next = circleHidden
      ? sidebarHiddenProviders.filter((x) => x !== id)
      : [...new Set([...sidebarHiddenProviders, id])];
    startTransition(() => setUsageSetting("sidebarHiddenProviders", next));
  };

  // The field shows the effective cadence (override or the global default).
  // Setting it back to the default value removes the override so the provider
  // follows the global cadence again.
  const intervalValue = providerRefreshIntervals[id] ?? defaultIntervalMinutes;
  const setIntervalMinutes = (minutes: number) => {
    const clamped = Math.min(120, Math.max(2, Math.floor(minutes)));
    const next = { ...providerRefreshIntervals };
    if (clamped === defaultIntervalMinutes) delete next[id];
    else next[id] = clamped;
    startTransition(() => setUsageSetting("providerRefreshIntervals", next));
  };

  const onSubmitApiKey = (event: FormEvent) => {
    event.preventDefault();
    void handleSubmitApiKey();
  };

  const signInForm =
    canSignIn && isApiKeyLogin ? (
      <form onSubmit={onSubmitApiKey} className="flex items-center gap-1.5">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t`Paste ${label} API key`}
          aria-label={t`${label} API key`}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--separator)] bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:focus-ring sm:w-[200px] sm:flex-none"
        />
        <Button
          size="sm"
          variant="ghost"
          type="submit"
          className="text-foreground"
          isDisabled={signingIn || apiKey.trim().length === 0}
        >
          {signingIn ? <Trans>Signing in…</Trans> : <Trans>Sign in</Trans>}
        </Button>
      </form>
    ) : canSignIn ? (
      <Button
        size="sm"
        variant="ghost"
        className="text-foreground"
        isDisabled={signingIn}
        onPress={() => void handleSignIn()}
      >
        {signingIn ? <Trans>Signing in…</Trans> : <Trans>Sign in</Trans>}
      </Button>
    ) : canSignOut ? (
      <Button
        size="sm"
        variant="ghost"
        className="text-foreground"
        isDisabled={signingOut}
        onPress={() => void handleSignOut()}
      >
        <LogOut className="size-3.5" />
        <Trans>Sign out</Trans>
      </Button>
    ) : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      {signInForm}
      <Button
        size="sm"
        variant="ghost"
        className="text-foreground"
        isDisabled={refreshing}
        onPress={() => void refresh()}
      >
        <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
        <Trans comment="Button: re-fetch one provider's usage now">Refresh</Trans>
      </Button>
      <button
        type="button"
        onClick={toggleCircle}
        aria-pressed={!circleHidden}
        aria-label={
          circleHidden ? t`Show ${label} circle in sidebar` : t`Hide ${label} circle in sidebar`
        }
        title={showInSidebar ? undefined : t`Sidebar circles are turned off globally above`}
        className={`flex items-center gap-1.5 rounded-lg border border-[color:var(--separator)] px-2 py-1 text-xs transition-colors hover:bg-muted/10 ${
          circleHidden ? "text-muted/60" : "text-foreground"
        }`}
      >
        {circleHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        <Trans comment="Toggle: show this provider's usage ring in the sidebar">Sidebar</Trans>
      </button>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden="true">
          <Trans comment="Label for the per-provider auto-refresh cadence field">
            Auto-refresh
          </Trans>
        </span>
        <NumberField
          aria-label={t`${label} auto-refresh interval in minutes`}
          className="w-[116px] shrink-0"
          minValue={2}
          maxValue={120}
          step={1}
          value={intervalValue}
          onChange={(value) => {
            if (value === undefined || Number.isNaN(value)) return;
            setIntervalMinutes(value);
          }}
        >
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <span aria-hidden="true">
          <Trans comment="Unit suffix: minutes">min</Trans>
        </span>
      </div>
    </div>
  );
}

function UsageProviderRow(props: { id: string; label: string }) {
  const { id, label } = props;
  const { t } = useLingui();
  const snapshot = useProviderUsage(id);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const enabled = !disabledProviders.includes(id);
  const showBars = enabled && snapshot?.status === "ok" && snapshot.windows.length > 0;
  const reserveBars = !enabled && snapshot?.status === "ok" && snapshot.windows.length > 0;
  const message = enabled
    ? usageStatusText(snapshot, label, id)
    : t({ message: "Tracking off", comment: "Usage status when provider tracking is disabled" });
  // The credits line below already shows the balance, and usageStatusText folds
  // it into the status string for a windowless "ok" snapshot — so skip the
  // standalone message there to avoid rendering "Zen balance: $X" twice.
  const messageDuplicatesCredits =
    enabled &&
    snapshot?.status === "ok" &&
    snapshot.windows.length === 0 &&
    !!snapshot.credits &&
    !snapshot.credits.unlimited;
  const tokens =
    snapshot?.cost && snapshot.tokens?.total
      ? ` · ${t`${formatTokens(snapshot.tokens.total)} tokens`}`
      : "";
  const money = snapshot?.cost ? formatMoney(snapshot.cost.amount, snapshot.cost.currency) : "";

  return (
    <div className="border-t border-[color:var(--separator)] py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <ProviderIcon kind={id} fallbackLabel={label} className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">{label}</p>
              {snapshot?.plan ? (
                <span className="truncate text-xs text-muted">{snapshot.plan}</span>
              ) : null}
            </div>
            {showBars && snapshot ? (
              <UsageWindowBars windows={snapshot.windows} className="mt-1.5 max-w-[360px]" />
            ) : reserveBars && snapshot ? (
              <div className="relative mt-1.5 max-w-[360px]">
                <div className="invisible" aria-hidden="true">
                  <UsageWindowBars windows={snapshot.windows} />
                </div>
                <p className="absolute inset-0 text-xs text-muted">{message}</p>
              </div>
            ) : messageDuplicatesCredits ? null : (
              <p className="mt-0.5 text-xs text-muted">{message}</p>
            )}
            {snapshot?.cost ? (
              <p className="mt-1.5 text-xs text-muted">
                {t`~${money}${tokens} · ${snapshot.cost.period} · est.`}
              </p>
            ) : null}
            {snapshot?.credits && !snapshot.credits.unlimited ? (
              <p className="mt-1.5 text-xs text-muted">
                {snapshot.credits.label ?? t`Credits`}:{" "}
                {formatMoney(snapshot.credits.balance, snapshot.credits.currency)}
              </p>
            ) : null}
          </div>
        </div>
        <Switch
          aria-label={t`Track ${label} usage`}
          isSelected={enabled}
          onChange={(selected) => {
            const next = selected
              ? disabledProviders.filter((x) => x !== id)
              : [...new Set([...disabledProviders, id])];
            startTransition(() => {
              setUsageSetting("disabledProviders", next);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </div>
      {enabled ? <UsageProviderControls id={id} label={label} /> : null}
    </div>
  );
}

export function UsageSettings() {
  const { t } = useLingui();
  const autoRefresh = useSharedSettings((s) => s.usage.autoRefresh);
  const refreshIntervalMinutes = useSharedSettings((s) => s.usage.refreshIntervalMinutes);
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);
  const showEstimatedCost = useSharedSettings((s) => s.usage.showEstimatedCost);
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const usageProviders = usageProvidersForAgentInstances(agentInstances);

  // Hydrate the store from the supervisor cache on open (and let the cache's
  // staleness trigger a background refresh whose events update the rows live).
  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getProviderUsage({})
      .then((res) => {
        if (cancelled) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of res.snapshots) store.mergeSnapshot(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshNow = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void readBridge()
      .refreshProviderUsage({})
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  };

  return (
    <SettingsPage
      title={t`Usage`}
      description={t`Track per-provider session, weekly, and monthly usage. Windows are reported by each provider; estimated cost is reconstructed from local logs.`}
      actions={
        <Button
          size="sm"
          variant="ghost"
          className="text-foreground"
          isDisabled={isRefreshing}
          onPress={refreshNow}
        >
          <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <Trans comment="Button: re-fetch provider usage now">Refresh</Trans>
        </Button>
      }
    >
      {/* The background refresher runs on the desktop; a remote session's
          interval is never read, so hide the row there. */}
      {!isRemoteSession() && (
        <SettingRow
          anchorId="usage.autoRefreshMinutes"
          title={t`Default auto-refresh (minutes)`}
          description={
            <Trans>
              The default background refresh cadence, used for any provider without its own interval
              set below. Set to 0 to turn off (manual only). The 2-minute floor respects provider
              rate limits.
            </Trans>
          }
        >
          <NumberField
            aria-label={t`Auto-refresh interval in minutes, 0 to turn off`}
            className="w-[140px] shrink-0"
            minValue={0}
            maxValue={120}
            step={1}
            value={autoRefresh ? refreshIntervalMinutes : 0}
            onChange={(value) => {
              if (value === undefined || Number.isNaN(value)) return;
              const minutes = Math.floor(value);
              startTransition(() => {
                if (minutes <= 0) {
                  setUsageSetting("autoRefresh", false);
                  return;
                }
                setUsageSetting("autoRefresh", true);
                setUsageSetting("refreshIntervalMinutes", Math.min(120, Math.max(2, minutes)));
              });
            }}
          >
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
        </SettingRow>
      )}

      <SettingRow
        anchorId="usage.showInSidebar"
        title={t`Show circles in sidebar`}
        description={
          <Trans>
            Show compact per-provider usage rings in the sidebar. Hide individual providers&apos;
            circles in the list below.
          </Trans>
        }
      >
        <Switch
          isSelected={showInSidebar}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showInSidebar", selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <SettingRow
        anchorId="usage.showEstimatedCost"
        title={t`Show estimated cost`}
        description={
          <Trans>
            Reconstructed from local logs at public API rates — it does not reflect your real bill
            on subscription plans. Shown only in the usage panel.
          </Trans>
        }
      >
        <Switch
          isSelected={showEstimatedCost}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showEstimatedCost", selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <div className="pt-2">
        <p className="mb-1 text-sm font-medium text-foreground">
          <Trans>Providers</Trans>
        </p>
        <p className="mb-2 text-xs text-muted">
          <Trans>
            Turn tracking on or off per provider. Disabled providers are skipped by the
            auto-refresh.
          </Trans>
        </p>
        <div>
          {usageProviders.map((p) => (
            <UsageProviderRow key={p.id} id={p.id} label={p.label} />
          ))}
        </div>
      </div>
    </SettingsPage>
  );
}
