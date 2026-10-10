import { startTransition } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ToggleSwitch } from "@/renderer/components/common";
import { usageProvidersForAgentInstances } from "@/renderer/components/providers/usageProviders";
import { UsageSidebarVisibility } from "@/renderer/components/providers/settings/UsageProviderRow";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingRow } from "./SettingsForm";

/** Uses the existing settings owner, never the independently selected usage host.
 * Managed desktop persists locally; browser/attached sessions sync to their bridge owner.
 * Writes only display fields and preserves the owner's collection policy. */
export function UsageDisplaySettings(props: { showProviderVisibility?: boolean }) {
  const { t } = useLingui();
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const providers = usageProvidersForAgentInstances(agentInstances);
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);
  const showEstimatedCost = useSharedSettings((s) => s.usage.showEstimatedCost);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  return (
    <>
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
        <ToggleSwitch
          aria-label={t`Show circles in sidebar`}
          isSelected={showInSidebar}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showInSidebar", selected);
            });
          }}
        />
      </SettingRow>

      <SettingRow
        anchorId="usage.showEstimatedCost"
        title={t`Show estimated cost`}
        description={
          <Trans>
            Reconstructed from local logs at public API rates — it does not reflect your real bill
            on subscription plans.
          </Trans>
        }
      >
        <ToggleSwitch
          aria-label={t`Show estimated cost`}
          isSelected={showEstimatedCost}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showEstimatedCost", selected);
            });
          }}
        />
      </SettingRow>

      {props.showProviderVisibility ? (
        <>
          <p className="text-xs text-muted">
            <Trans>
              Display preferences follow this app's settings, independently of the selected usage
              host.
            </Trans>
          </p>
          {providers.map((provider) => (
            <SettingRow key={provider.id} title={provider.label} description={null}>
              <UsageSidebarVisibility id={provider.id} label={provider.label} />
            </SettingRow>
          ))}
        </>
      ) : null}
    </>
  );
}
