import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { startTransition, useState, type FormEvent } from "react";
import { Tooltip } from "@heroui/react";
import { ChevronDown, ChevronRight, LogIn, LogOut, RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { allUsageProviderDescriptors } from "@poracode/agents-usage/providers";
import { Button, ToggleSwitch } from "@/renderer/components/common";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import { UsageCostLine } from "@/renderer/components/providers/UsageCostLine";
import {
  summarizeUsageSnapshot,
  UsageCreditsRow,
  UsageRefreshWarning,
  WindowChips,
} from "@/renderer/components/providers/UsageProviderCardView";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { usageStatusText } from "@/renderer/components/providers/usageFormat";
import {
  browserSessionAddsDetails,
  usesSharedWindowReset,
} from "@/renderer/components/providers/usageProviders";
import { useProviderUsageRefresh } from "@/renderer/components/providers/useProviderUsageRefresh";
import { useUsageProviderLogin } from "@/renderer/components/providers/useUsageProviderLogin";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  clampRefreshMinutes,
  MIN_REFRESH_MINUTES,
} from "../../../views/SettingsOverlay/parts/usageRefreshBounds";

/**
 * Per-provider auto-refresh cadence as bare inline text: no border, no fill, no
 * stepper — just the number, editable in place. Empty inherits the slower global/provider
 * default, which the dimmer placeholder shows. Typing is buffered so a
 * half-typed value never round-trips through settings; the draft commits on
 * blur or Enter and reverts on Escape.
 */
function UsageCadenceField(props: { id: string; label: string }) {
  const { id, label } = props;
  const { t } = useLingui();
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const providerRefreshIntervals = useSharedSettings((s) => s.usage.providerRefreshIntervals);
  const autoRefresh = useSharedSettings((s) => s.usage.autoRefresh);
  const defaultIntervalMinutes = useSharedSettings((s) => s.usage.refreshIntervalMinutes);
  const [draft, setDraft] = useState<string | null>(null);

  const override = providerRefreshIntervals[id];
  const text = draft ?? String(override ?? "");
  const defaultMinutes = Math.max(
    defaultIntervalMinutes,
    allUsageProviderDescriptors().find((provider) => provider.id === id)?.refreshPolicy
      ?.defaultIntervalMinutes ?? 0,
  );

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = { ...providerRefreshIntervals };
    if (draft === "") delete next[id];
    else next[id] = clampRefreshMinutes(Number(draft), MIN_REFRESH_MINUTES);
    startTransition(() => setUsageSetting("providerRefreshIntervals", next));
  };

  return (
    <span
      title={t`Custom auto-refresh interval in minutes. Clear to use default.`}
      className="flex shrink-0 items-baseline gap-1 rounded-md px-1 py-1 text-xs text-muted focus-within:focus-ring"
    >
      <input
        type="text"
        inputMode="numeric"
        aria-label={t`${label} auto-refresh interval in minutes`}
        value={text}
        placeholder={autoRefresh ? String(defaultMinutes) : "—"}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setDraft(null);
        }}
        className="poracode-borderless-field w-[28px] shrink-0 bg-transparent p-0 text-right text-xs tabular-nums text-muted outline-none transition-colors hover:text-foreground focus:text-foreground placeholder:text-field-placeholder"
      />
      <Trans comment="Unit suffix: minutes">min</Trans>
    </span>
  );
}

/** Credential strip rendered below the card header when sign-in is required. */
function UsageProviderCredentialStrip(props: {
  label: string;
  canBrowserSignIn: boolean;
  optionalBrowserSignIn: boolean;
  canApiKeySignIn: boolean;
  signingIn: boolean;
  apiKey: string;
  setApiKey: (value: string) => void;
  handleSignIn: () => Promise<void>;
  handleSubmitApiKey: () => Promise<void>;
}) {
  const {
    label,
    canBrowserSignIn,
    optionalBrowserSignIn,
    canApiKeySignIn,
    signingIn,
    apiKey,
    setApiKey,
    handleSignIn,
    handleSubmitApiKey,
  } = props;
  const { t } = useLingui();

  if (!(canBrowserSignIn && !optionalBrowserSignIn) && !canApiKeySignIn) return null;

  const onSubmitApiKey = (event: FormEvent) => {
    event.preventDefault();
    void handleSubmitApiKey();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline-soft)] px-3.5 py-2">
      {canBrowserSignIn && !optionalBrowserSignIn ? (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          isDisabled={signingIn}
          onPress={() => void handleSignIn()}
        >
          {signingIn ? <Trans>Signing in…</Trans> : <Trans>Browser sign-in</Trans>}
        </Button>
      ) : null}
      {canApiKeySignIn ? (
        <form onSubmit={onSubmitApiKey} className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t`Paste ${label} API key`}
            aria-label={t`${label} API key`}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg form-field px-2.5 py-1 placeholder:text-field-placeholder text-xs text-foreground outline-none @xl:max-w-[260px]"
          />
          <Button
            size="sm"
            variant="secondary"
            type="submit"
            className="shrink-0"
            isDisabled={signingIn || apiKey.trim().length === 0}
          >
            {signingIn ? <Trans>Signing in…</Trans> : <Trans>Sign in</Trans>}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** One tracked provider card in Settings -> Provider Usage for the current host. */
export function UsageProviderRow(props: { id: string; label: string }) {
  const { id, label } = props;
  const { t, i18n } = useLingui();
  const snapshot = useProviderUsage(id);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const showEstimatedCost = useSharedSettings((s) => s.usage.showEstimatedCost);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const { refreshing, refresh } = useProviderUsageRefresh(id);
  const [expanded, setExpanded] = useState(false);

  const {
    canBrowserSignIn,
    canApiKeySignIn,
    canSignOut,
    signingIn,
    signingOut,
    apiKey,
    setApiKey,
    handleSignIn,
    handleSubmitApiKey,
    handleSignOut,
  } = useUsageProviderLogin(id);
  const optionalBrowserSignIn = canBrowserSignIn && browserSessionAddsDetails(id);

  const { showCost, credits, hasWindows, hasUsage, refreshFailed } = summarizeUsageSnapshot(
    snapshot,
    showEstimatedCost,
  );
  const fetchedAt = snapshot
    ? i18n.date(snapshot.fetchedAt, { dateStyle: "short", timeStyle: "short" })
    : "";
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const accountLabel =
    snapshot?.authenticatedAs && snapshot.authenticatedAs !== snapshot.plan
      ? snapshot.authenticatedAs
      : undefined;

  return (
    <ContentSurface>
      <div className="settings-row @container flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-2 px-3.5 py-2.5">
        <div className="settings-row__text flex min-w-[10rem] flex-1 items-center gap-2.5">
          <ProviderUsageCircle kind={id} windows={snapshot?.windows} size={26} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{label}</p>
              {snapshot?.plan ? (
                <span className="truncate text-xs text-muted">{snapshot.plan}</span>
              ) : null}
              {accountLabel ? (
                <span className="hidden truncate text-xs text-muted/70 @md:inline">
                  · {accountLabel}
                </span>
              ) : null}
            </div>
            {hasWindows && snapshot ? (
              expanded ? null : (
                <WindowChips windows={snapshot.windows} {...(credits ? { credits } : {})} />
              )
            ) : showCost && snapshot ? (
              expanded ? null : (
                <UsageCostLine snapshot={snapshot} className="mt-0.5" />
              )
            ) : (
              <p className="truncate text-xs text-muted">{usageStatusText(snapshot, label, id)}</p>
            )}
          </div>
        </div>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {refreshFailed && snapshot ? (
            <UsageRefreshWarning
              id={id}
              label={label}
              snapshot={snapshot}
              hasUsage={hasUsage}
              buttonClassName="min-w-0 text-warning hover:bg-transparent"
            />
          ) : null}

          {optionalBrowserSignIn ? (
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={signingIn ? t`Signing in…` : t`Browser sign-in`}
                  className="shrink-0 text-muted"
                  isDisabled={signingIn}
                  onPress={() => void handleSignIn()}
                >
                  <LogIn className="size-3.5" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                {signingIn ? <Trans>Signing in…</Trans> : <Trans>Browser sign-in</Trans>}
              </Tooltip.Content>
            </Tooltip>
          ) : null}

          {canSignOut ? (
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Sign out ${label}`}
                  className="shrink-0 text-muted"
                  isDisabled={signingOut}
                  onPress={() => void handleSignOut()}
                >
                  <LogOut className="size-3.5" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <Trans>Sign out</Trans>
              </Tooltip.Content>
            </Tooltip>
          ) : null}

          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t`Refresh ${label}`}
                className="shrink-0 text-muted"
                isDisabled={refreshing}
                onPress={() => void refresh()}
              >
                <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Trans>Refresh</Trans>
            </Tooltip.Content>
          </Tooltip>

          <UsageCadenceField id={id} label={label} />

          {hasUsage ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-expanded={expanded}
              aria-label={expanded ? t`Collapse ${label}` : t`Expand ${label}`}
              className="shrink-0 text-muted"
              onPress={() => setExpanded((prev) => !prev)}
            >
              <Chevron className="size-4" />
            </Button>
          ) : null}

          <span className="pl-1">
            <ToggleSwitch
              aria-label={t`Track ${label} usage`}
              isSelected
              onChange={(selected) => {
                if (selected) return;
                const next = [...new Set([...disabledProviders, id])];
                startTransition(() => {
                  setUsageSetting("disabledProviders", next);
                });
              }}
            />
          </span>
        </span>
      </div>

      {hasUsage && expanded && snapshot ? (
        <div className="space-y-2 border-t border-[var(--hairline-soft)] px-3.5 py-2.5">
          {snapshot.windows.length > 0 ? (
            <UsageWindowBars windows={snapshot.windows} showReset={!usesSharedWindowReset(id)} />
          ) : null}
          {credits ? (
            <UsageCreditsRow credits={credits} showSeparator={snapshot.windows.length > 0} />
          ) : null}
          {showCost ? <UsageCostLine snapshot={snapshot} /> : null}
          <p className="pt-0.5 text-[11px] text-muted/70">
            <Trans>Last updated: {fetchedAt}</Trans>
          </p>
        </div>
      ) : null}

      <UsageProviderCredentialStrip
        label={label}
        canBrowserSignIn={canBrowserSignIn}
        optionalBrowserSignIn={optionalBrowserSignIn}
        canApiKeySignIn={canApiKeySignIn}
        signingIn={signingIn}
        apiKey={apiKey}
        setApiKey={setApiKey}
        handleSignIn={handleSignIn}
        handleSubmitApiKey={handleSubmitApiKey}
      />
    </ContentSurface>
  );
}
