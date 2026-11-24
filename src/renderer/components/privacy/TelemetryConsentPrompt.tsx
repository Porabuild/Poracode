import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { PORACODE_TELEMETRY_DOC_URL } from "@/shared/communityLinks";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { ToggleSwitch } from "@/renderer/components/common";
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
 */
export function TelemetryConsentPrompt() {
  const { t } = useLingui();
  const hydrated = useSharedSettings((s) => s.sharedSettingsHydrated);
  const consentDecided = useSharedSettings((s) => s.privacy?.consentDecided ?? false);
  const setTelemetryConsent = useSharedSettings((s) => s.setTelemetryConsent);
  const [dismissed, setDismissed] = useState(false);
  // First-launch users answer on the welcome screen instead; this prompt is
  // for installs that already saw it (welcome seen at mount).
  const [welcomeGone] = useState(isWelcomeSeen);
  const [productAnalytics, setProductAnalytics] = useState(false);
  const [crashReports, setCrashReports] = useState(false);
  const seeded = useRef(false);

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

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && setDismissed(true)}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[480px]">
          <Modal.CloseTrigger aria-label={t`Close`} />
          <Modal.Header>
            <Modal.Heading>{t`Help improve Poracode?`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className="space-y-4">
              <p className="text-sm text-muted">
                <Trans>
                  Poracode can send anonymous usage analytics and crash reports. No prompts, code,
                  file names, or terminal output.
                </Trans>
              </p>
              <ConsentChoices
                productAnalytics={productAnalytics}
                crashReports={crashReports}
                onProductAnalyticsChange={setProductAnalytics}
                onCrashReportsChange={setCrashReports}
              />
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => void readBridge().openExternal(PORACODE_TELEMETRY_DOC_URL)}
              >
                <Trans>See exactly what is collected</Trans>
              </button>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="ghost"
              onPress={() => setTelemetryConsent({ productAnalytics: false, crashReports: false })}
            >
              {t`No thanks`}
            </Button>
            <Button
              variant="secondary"
              onPress={() => setTelemetryConsent({ productAnalytics, crashReports })}
            >
              {t`Save choices`}
            </Button>
            <Button
              variant="primary"
              onPress={() => setTelemetryConsent({ productAnalytics: true, crashReports: true })}
            >
              {t`Accept all`}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
