import { Trans, useLingui } from "@lingui/react/macro";
import { MonitorCog } from "lucide-react";
import { MoreRow } from "../components";
import { DEVICE_SETTINGS_SECTIONS } from "../settingsSections";

/** The Settings page (the home header's quick menu links here as its last
 * entry): this device's settings sections flattened in, with the
 * desktop-syncing sections behind the Desktop Settings subscreen. */
export function MoreView(props: {
  readonly hasDesktop: boolean;
  readonly onOpen: () => void;
  readonly onOpenSettingsSection: (sectionId: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="m-page">
      <div className="m-settings-group">
        <div className="m-settings-group__head">
          <span>
            <Trans>Stored on this device; the desktop keeps its own values.</Trans>
          </span>
        </div>
        <div className="m-more-list">
          {DEVICE_SETTINGS_SECTIONS.map((section) => (
            <MoreRow
              key={section.id}
              icon={<section.icon className="size-4" />}
              label={t(section.label)}
              hint={t(section.hint)}
              onPress={() => props.onOpenSettingsSection(section.id)}
            />
          ))}
          <MoreRow
            icon={<MonitorCog className="size-4" />}
            label={<Trans>Desktop Settings</Trans>}
            hint={<Trans>Schedules, AI, agents, and archived threads on the paired desktop</Trans>}
            disabled={!props.hasDesktop}
            onPress={props.onOpen}
          />
        </div>
      </div>
    </div>
  );
}
