import { Trans, useLingui } from "@lingui/react/macro";
import { FolderGit2, Globe, MonitorCog } from "lucide-react";
import { MoreRow } from "../components";
import { DEVICE_SETTINGS_SECTIONS } from "../settingsSections";

export type MoreDestination = "browser" | "projects" | "desktop-settings";

/** The "More" tab: entry points that don't warrant their own tab-bar slot,
 * plus this device's settings sections flattened in (the desktop-syncing
 * sections stay behind the Desktop Settings subscreen). */
export function MoreView(props: {
  readonly onOpen: (destination: MoreDestination) => void;
  readonly onOpenSettingsSection: (sectionId: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="m-page">
      <div className="m-more-list">
        <MoreRow
          icon={<FolderGit2 className="size-4" />}
          label={<Trans>Projects</Trans>}
          hint={<Trans>Add, clone, or remove projects on this server</Trans>}
          onPress={() => props.onOpen("projects")}
        />
        <MoreRow
          icon={<Globe className="size-4" />}
          label={<Trans>Browser</Trans>}
          hint={<Trans>The desktop's built-in browser</Trans>}
          onPress={() => props.onOpen("browser")}
        />
      </div>
      <div className="m-settings-group">
        <div className="m-settings-group__head">
          <strong>
            <Trans>Settings</Trans>
          </strong>
          <span>
            <Trans>Stored on this phone; the desktop keeps its own values.</Trans>
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
            hint={<Trans>AI, agents, and archived threads on the paired desktop</Trans>}
            onPress={() => props.onOpen("desktop-settings")}
          />
        </div>
      </div>
    </div>
  );
}
