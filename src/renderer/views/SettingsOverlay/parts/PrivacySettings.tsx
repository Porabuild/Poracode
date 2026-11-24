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
  const setPrivacySetting = useSharedSettings((s) => s.setPrivacySetting);
  const hardDisabled = isTelemetryHardDisabled();

  return (
    <SettingsPage
      title={t`Privacy`}
      description={
        <Trans>
          Poracode sends nothing unless you turn it on. No prompts, code, or file names — ever.
        </Trans>
      }
    >
      {hardDisabled ? (
        <p className="text-xs text-muted">
          <Trans>An environment variable on this machine keeps both options off.</Trans>
        </p>
      ) : null}
      <SettingRow
        anchorId="privacy.productAnalytics"
        title={t`Anonymous product analytics`}
        description={t`Anonymous feature-use events. No prompts, code, or location.`}
      >
        <ToggleSwitch
          aria-label={t`Anonymous product analytics`}
          isSelected={productAnalytics}
          isDisabled={hardDisabled}
          onChange={(selected) => setPrivacySetting("productAnalytics", selected)}
        />
      </SettingRow>
      <SettingRow
        anchorId="privacy.crashReports"
        title={t`Crash reports`}
        description={t`Crash diagnostics with personal data removed.`}
      >
        <ToggleSwitch
          aria-label={t`Crash reports`}
          isSelected={crashReports}
          isDisabled={hardDisabled}
          onChange={(selected) => setPrivacySetting("crashReports", selected)}
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
