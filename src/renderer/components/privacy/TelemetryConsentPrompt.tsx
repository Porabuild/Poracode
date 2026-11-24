import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { PORACODE_TELEMETRY_DOC_URL } from "@/shared/communityLinks";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { ToggleSwitch } from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { isWelcomeSeen } from "@/renderer/state/welcomeGateStore";
import { isTelemetryHardDisabled } from "@/renderer/analytics/telemetryConsentState";

function ConsentChoices(props: {
  productAnalytics: boolean;
  crashReports: boolean;
  onProductAnalyticsChange: (value: boolean) => void;
  onCrashReportsChange: (value: boolean) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t`Anonymous product analytics`}</p>
          <p className="text-xs text-muted" id="consent-analytics-description">
            <Trans>Anonymous feature-use events. No prompts, code, or location.</Trans>
          </p>
        </div>
        <ToggleSwitch
          aria-describedby="consent-analytics-description"
          aria-label={t`Anonymous product analytics`}
          isSelected={props.productAnalytics}
          onChange={props.onProductAnalyticsChange}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t`Crash reports`}</p>
          <p className="text-xs text-muted" id="consent-crash-description">
            <Trans>Crash diagnostics with personal data removed.</Trans>
          </p>
        </div>
        <ToggleSwitch
          aria-describedby="consent-crash-description"
          aria-label={t`Crash reports`}
          isSelected={props.crashReports}
          onChange={props.onCrashReportsChange}
        />
      </div>
    </div>
  );
}

/** Inline consent controls shown on the first-launch welcome screen. */
export function WelcomeTelemetryChoices(props: {
  productAnalytics: boolean;
  crashReports: boolean;
  onProductAnalyticsChange: (value: boolean) => void;
  onCrashReportsChange: (value: boolean) => void;
}) {
  return (
    <div className="w-full max-w-[460px] space-y-3 text-left">
      <p className="text-xs text-muted">
        <Trans>
          Optional and off by default. Poracode sends no telemetry unless you turn it on here or in
          Settings → Privacy.
        </Trans>
      </p>
      <ConsentChoices {...props} />
    </div>
  );
}

/**
 * One-time opt-in ask, shown after the first-launch welcome (or at startup for
 * installs that predate consent). Accept all turns both streams on, Save
 * choices keeps the switch states, No thanks keeps both off; closing without
 * choosing asks again next launch, and any button records the decision.
 *
 * The prompt is a non-modal card pinned to the bottom-right rather than a
 * full-window dialog, so it never blocks navigation while undecided.
 */
export function TelemetryConsentPrompt() {
  const { t } = useLingui();
  const hydrated = useSharedSettings((s) => s.sharedSettingsHydrated);
  const consentDecided = useSharedSettings((s) => s.privacy?.consentDecided ?? false);
  const setTelemetryConsent = useSharedSettings((s) => s.setTelemetryConsent);
  // When a thread or draft is open, its bottom-docked composer owns the
  // bottom-right; lift the card so the composer's send row stays usable.
  const viewHasComposer = useAppStore(
    (s) => s.view.kind === "draft" || s.view.kind === "thread" || s.view.kind === "experiment",
  );
  const [dismissed, setDismissed] = useState(false);
  // First-launch users answer on the welcome screen instead; this prompt is
  // for installs that already saw it (welcome seen at mount).
  const [welcomeGone] = useState(isWelcomeSeen);
  const [productAnalytics, setProductAnalytics] = useState(false);
  const [crashReports, setCrashReports] = useState(false);
  const seeded = useRef(false);
  const promptRef = useRef<HTMLDivElement>(null);

  const open =
    welcomeGone &&
    !isBrowserClientRuntime() &&
    !isRemoteSession() &&
    !isTelemetryHardDisabled() &&
    hydrated &&
    !consentDecided &&
    !dismissed;

  // Seed the switches from the stored choice the first time the prompt
  // opens, so a stream that is already on never displays as off.
  useEffect(() => {
    if (!open || seeded.current) return;
    seeded.current = true;
    const stored = useSharedSettings.getState().privacy;
    setProductAnalytics(stored?.productAnalytics ?? false);
    setCrashReports(stored?.crashReports ?? false);
  }, [open]);

  // Escape dismisses only while keyboard focus is inside the card. A global
  // handler would swallow the app's own Escape commands while the passive
  // prompt is visible.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!promptRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      setDismissed(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={promptRef}
      role="dialog"
      aria-labelledby="telemetry-consent-heading"
      aria-describedby="telemetry-consent-description"
      aria-modal="false"
      // A passive ask must not steal focus from the user's work; announce it
      // politely instead. Settings -> Privacy remains the explicit path.
      aria-live="polite"
      className={`m-page-edge-action fixed right-4 ${
        viewHasComposer
          ? "bottom-[calc(10rem+env(safe-area-inset-bottom))]"
          : "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
      } z-40 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-4xl border border-[var(--hairline)] bg-overlay p-4 shadow-overlay`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="telemetry-consent-heading" className="text-sm font-medium text-foreground">
            {t`Help improve Poracode?`}
          </h2>
          <p id="telemetry-consent-description" className="text-xs text-muted">
            <Trans>
              Poracode can send anonymous usage analytics and crash reports. No prompts, code, file
              names, or terminal output.
            </Trans>
          </p>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t`Close`}
          className="-mt-1 -mr-1 shrink-0"
          onPress={() => setDismissed(true)}
        >
          <X className="size-4" />
        </Button>
      </div>
      <ConsentChoices
        productAnalytics={productAnalytics}
        crashReports={crashReports}
        onProductAnalyticsChange={setProductAnalytics}
        onCrashReportsChange={setCrashReports}
      />
      <button
        type="button"
        className="self-start text-xs text-primary hover:underline"
        onClick={() => void readBridge().openExternal(PORACODE_TELEMETRY_DOC_URL)}
      >
        <Trans>See exactly what is collected</Trans>
      </button>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => setTelemetryConsent({ productAnalytics: false, crashReports: false })}
        >
          {t`No thanks`}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => setTelemetryConsent({ productAnalytics, crashReports })}
        >
          {t`Save choices`}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onPress={() => setTelemetryConsent({ productAnalytics: true, crashReports: true })}
        >
          {t`Accept all`}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
