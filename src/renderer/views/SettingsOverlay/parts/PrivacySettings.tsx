import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { PORACODE_TELEMETRY_DOC_URL } from "@/shared/communityLinks";
import { readBridge } from "@/renderer/bridge";
import { ToggleSwitch } from "@/renderer/components/common";
import { isTelemetryHardDisabled } from "@/renderer/analytics/telemetryConsentState";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingRow, SettingsPage } from "./SettingsForm";

const PRIVACY_POLICY_URL = "https://poracode.com/privacy";

export function PrivacySettings() {
  const { t } = useLingui();
  const productAnalytics = useSharedSettings((s) => s.privacy?.productAnalytics ?? false);
  const crashReports = useSharedSettings((s) => s.privacy?.crashReports ?? false);
  const nativeCrashDumps = useSharedSettings((s) => s.privacy?.nativeCrashDumps ?? false);
  const setPrivacySetting = useSharedSettings((s) => s.setPrivacySetting);
  const hardDisabled = isTelemetryHardDisabled();

  return (
    <SettingsPage
      title={t`Privacy`}
      description={<Trans>Choose what the desktop app sends.</Trans>}
    >
      {hardDisabled ? (
        <p className="text-xs text-muted">
          <Trans>An environment variable on this machine keeps telemetry off.</Trans>
        </p>
      ) : null}
      <SettingRow
        anchorId="privacy.productAnalytics"
        title={t`Product analytics`}
        description={t`Send feature-use events and a random installation ID to PostHog.`}
      >
        <ToggleSwitch
          aria-label={t`Product analytics`}
          isSelected={productAnalytics}
          isDisabled={hardDisabled}
          onChange={(selected) => setPrivacySetting("productAnalytics", selected)}
        />
      </SettingRow>
      <SettingRow
        anchorId="privacy.crashReports"
        title={t`Crash reports`}
        description={t`Send scrubbed crash diagnostics to Sentry.`}
      >
        <ToggleSwitch
          aria-label={t`Crash reports`}
          isSelected={crashReports}
          isDisabled={hardDisabled}
          onChange={(selected) => setPrivacySetting("crashReports", selected)}
        />
      </SettingRow>
      <SettingRow
        anchorId="privacy.nativeCrashDumps"
        title={t`Include native crash dumps`}
        description={
          <span id="privacy-native-crash-dumps-description">
            {crashReports
              ? t`Sends memory snapshots to Sentry that may contain sensitive data.`
              : t`Turn on crash reports to include native dumps.`}
          </span>
        }
      >
        <ToggleSwitch
          aria-describedby="privacy-native-crash-dumps-description"
          aria-label={t`Include native crash dumps`}
          isSelected={nativeCrashDumps}
          isDisabled={hardDisabled || !crashReports}
          onChange={(selected) => setPrivacySetting("nativeCrashDumps", selected)}
        />
      </SettingRow>
      <SettingRow
        title={t`Telemetry details`}
        description={t`Exactly what is collected, and how to turn it off.`}
      >
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void readBridge().openExternal(PORACODE_TELEMETRY_DOC_URL)}
          >
            {t`Telemetry doc`}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void readBridge().openExternal(PRIVACY_POLICY_URL)}
          >
            {t`Privacy Policy`}
          </Button>
        </div>
      </SettingRow>
    </SettingsPage>
  );
}
