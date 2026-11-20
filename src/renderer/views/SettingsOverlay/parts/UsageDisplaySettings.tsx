import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { startTransition } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ToggleSwitch } from "@/renderer/components/common";
import { usageProvidersForAgentInstances } from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingRow } from "./SettingsForm";
import { SidebarUsageVisibilityPopover } from "./SidebarUsageVisibilityPopover";

/**
 * Uses the existing settings owner, never the independently selected usage host.
 * Managed desktop persists locally; browser/attached sessions sync to their bridge owner.
 * Writes only display fields and preserves the owner's collection policy.
 */
export function UsageDisplaySettings(props: { showHostNote?: boolean }) {
  const { t } = useLingui();
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const providers = usageProvidersForAgentInstances(agentInstances);
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);
  const sidebarHiddenProviders = useSharedSettings((s) => s.usage.sidebarHiddenProviders);
  const showEstimatedCost = useSharedSettings((s) => s.usage.showEstimatedCost);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);

  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-xs font-semibold text-foreground/80">
          <Trans>Display</Trans>
        </h3>
        {props.showHostNote ? (
          <p className="text-xs text-muted">
            <Trans>
              Display preferences follow this app's settings, independently of the selected usage
              host.
            </Trans>
          </p>
        ) : null}
      </div>

      <ContentSurface variant="group">
        <SettingRow
          anchorId="usage.showInSidebar"
          className="px-4 py-3"
          title={t`Show circles in sidebar`}
          description={<Trans>Show compact per-provider usage rings in the sidebar.</Trans>}
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
          anchorId="usage.sidebarVisibility"
          className={`px-4 py-3 transition-opacity ${showInSidebar ? "" : "opacity-60"}`}
          title={t`Visible in sidebar`}
          description={<Trans>Choose which providers show usage rings in the sidebar.</Trans>}
        >
          <SidebarUsageVisibilityPopover
            providers={providers}
            hiddenIds={sidebarHiddenProviders}
            showInSidebar={showInSidebar}
            onChange={(next) => {
              startTransition(() => {
                setUsageSetting("sidebarHiddenProviders", next);
              });
            }}
          />
        </SettingRow>

        <SettingRow
          anchorId="usage.showEstimatedCost"
          className="px-4 py-3"
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
      </ContentSurface>
    </section>
  );
}
