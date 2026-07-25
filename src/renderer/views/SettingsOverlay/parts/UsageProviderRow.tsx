import { startTransition, useState, type FormEvent } from "react";
import { Tooltip } from "@heroui/react";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button, ToggleSwitch } from "@/renderer/components/common";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import { usageStatusText } from "@/renderer/components/providers/usageFormat";
import { useUsageProviderLogin } from "@/renderer/components/providers/useUsageProviderLogin";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { clampRefreshMinutes, MIN_REFRESH_MINUTES } from "./usageRefreshBounds";

/**
 * Per-provider auto-refresh cadence as bare inline text: no border, no fill, no
 * stepper — just the number, editable in place. Empty inherits the global
 * default, which the dimmer placeholder shows. Typing is buffered so a
 * half-typed value never round-trips through settings; the draft commits on
 * blur or Enter and reverts on Escape.
 */
function UsageCadenceField(props: { id: string; label: string }) {
  const { id, label } = props;
  const { t } = useLingui();
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const providerRefreshIntervals = useSharedSettings((s) => s.usage.providerRefreshIntervals);
  const defaultIntervalMinutes = useSharedSettings((s) => s.usage.refreshIntervalMinutes);
  const [draft, setDraft] = useState<string | null>(null);

  const override = providerRefreshIntervals[id];
  const text = draft ?? String(override ?? "");

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    // `draft` only ever holds digits (the change handler strips the rest), so
    // empty is the only non-numeric case to handle.
    const next = { ...providerRefreshIntervals };
    if (draft === "") delete next[id];
    else next[id] = clampRefreshMinutes(Number(draft), MIN_REFRESH_MINUTES);
    startTransition(() => setUsageSetting("providerRefreshIntervals", next));
  };

  return (
    // The ring lives on the wrapper: `input:focus-visible` is stripped of
    // box-shadow app-wide (styles.css), so a ring utility on the input itself
    // would render nothing and leave this borderless field with no focus state.
    <span className="flex shrink-0 items-baseline gap-1 rounded-md py-1 text-xs text-muted focus-within:focus-ring">
      <input
        type="text"
        inputMode="numeric"
        aria-label={t`${label} auto-refresh interval in minutes`}
        value={text}
        placeholder={String(defaultIntervalMinutes)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setDraft(null);
        }}
        className="w-[28px] shrink-0 bg-transparent p-0 text-right text-xs tabular-nums text-muted outline-none transition-colors hover:text-foreground focus:text-foreground placeholder:text-muted/40"
      />
      <Trans comment="Unit suffix: minutes">min</Trans>
    </span>
  );
}

/**
 * Controls for a tracked provider. This is a component rather than inline JSX
 * because it owns `useUsageProviderLogin`, and the row mounts it only while
 * tracking is on — a hook can't be called conditionally.
 */
function UsageProviderControls(props: { id: string; label: string }) {
  const { id, label } = props;
  const { t } = useLingui();
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const sidebarHiddenProviders = useSharedSettings((s) => s.usage.sidebarHiddenProviders);
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);

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

  const circleHidden = sidebarHiddenProviders.includes(id);
  const circleAction = circleHidden
    ? t`Show ${label} circle in sidebar`
    : t`Hide ${label} circle in sidebar`;
  const toggleCircle = () => {
    const next = circleHidden
      ? sidebarHiddenProviders.filter((x) => x !== id)
      : [...new Set([...sidebarHiddenProviders, id])];
    startTransition(() => setUsageSetting("sidebarHiddenProviders", next));
  };

  const onSubmitApiKey = (event: FormEvent) => {
    event.preventDefault();
    void handleSubmitApiKey();
  };

  // Sign-in is the widest thing in a row, so rather than squeezing the provider
  // name to an ellipsis it drops below: the key form always (it needs a text
  // field), the button only while the container is too narrow to seat it.
  const browserSignIn = canBrowserSignIn ? (
    <div className="order-last flex basis-full items-center @xl:order-none @xl:basis-auto">
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 text-foreground"
        isDisabled={signingIn}
        onPress={() => void handleSignIn()}
      >
        {signingIn ? <Trans>Signing in…</Trans> : <Trans>Browser sign-in</Trans>}
      </Button>
    </div>
  ) : null;

  const apiKeySignIn = canApiKeySignIn ? (
    <form
      onSubmit={onSubmitApiKey}
      className="order-last flex min-w-0 basis-full items-center gap-1.5"
    >
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={t`Paste ${label} API key`}
        aria-label={t`${label} API key`}
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 rounded-lg border border-[color:var(--separator)] bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:focus-ring @xl:max-w-[240px]"
      />
      <Button
        size="sm"
        variant="ghost"
        type="submit"
        className="shrink-0 text-foreground"
        isDisabled={signingIn || apiKey.trim().length === 0}
      >
        {signingIn ? <Trans>Signing in…</Trans> : <Trans>Sign in</Trans>}
      </Button>
    </form>
  ) : null;

  return (
    <>
      {browserSignIn}
      {apiKeySignIn}
      {/* Pinned to the right of the first line; the sign-in block above wraps
          below them when the container is narrow. */}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-pressed={!circleHidden}
              aria-label={circleAction}
              className={`shrink-0 ${circleHidden ? "text-muted/50" : "text-foreground"}`}
              onPress={toggleCircle}
            >
              {circleHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {showInSidebar ? circleAction : t`Sidebar circles are turned off globally above`}
          </Tooltip.Content>
        </Tooltip>
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
                <LogOut className="size-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <Trans>Sign out</Trans>
            </Tooltip.Content>
          </Tooltip>
        ) : null}
        <UsageCadenceField id={id} label={label} />
      </span>
    </>
  );
}

/**
 * One provider, one line: the usage ring in the title carries the numbers — this
 * page draws no bars, those live in the docked usage panel — followed by that
 * provider's settings and the tracking switch. Everything is on the surface, so
 * there is nothing to expand.
 *
 * Carries the shared `settings-row` classes so the phone shell reflows it with
 * every other settings row (see src/mobile/styles.css).
 */
export function UsageProviderRow(props: { id: string; label: string }) {
  const { id, label } = props;
  const { t } = useLingui();
  const snapshot = useProviderUsage(id);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const enabled = !disabledProviders.includes(id);
  const hasWindows = enabled && snapshot?.status === "ok" && snapshot.windows.length > 0;

  return (
    // A container (not viewport) query: the settings page is also rendered in
    // narrow hosts — a resized window, the docked overlay, the phone shell — so
    // the row collapses against its own width. `min-h` keeps it a finger-sized
    // target on the phone.
    <div className="settings-row @container flex min-h-[44px] flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-[color:var(--separator)] py-2 first:border-t-0">
      <ProviderUsageCircle kind={id} windows={enabled ? snapshot?.windows : undefined} size={22} />
      {/* Floors the name/status at a readable width so the controls wrap away
          instead of crushing it to an ellipsis. */}
      <div className="settings-row__text flex min-w-[8rem] flex-1 items-baseline gap-2">
        {/* The name is the row's identity, so the plan/status gives up its
            characters first: capped at 60% it keeps a long name readable
            without ever pushing the controls off the line. */}
        <p className="max-w-[60%] shrink-0 truncate text-sm font-medium text-foreground">{label}</p>
        {snapshot?.plan ? (
          <span className="truncate text-xs text-muted">{snapshot.plan}</span>
        ) : null}
        {/* With windows present the ring says it all; otherwise the row needs
            words — "Not signed in", "Tracking off", or a credits balance that
            usageStatusText folds in. */}
        {hasWindows ? null : (
          <span className="truncate text-xs text-muted">
            {enabled
              ? usageStatusText(snapshot, label, id)
              : t({
                  message: "Tracking off",
                  comment: "Usage status when provider tracking is disabled",
                })}
          </span>
        )}
      </div>
      {enabled ? <UsageProviderControls id={id} label={label} /> : null}
      <span className={enabled ? "shrink-0" : "ml-auto shrink-0"}>
        <ToggleSwitch
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
        />
      </span>
    </div>
  );
}
