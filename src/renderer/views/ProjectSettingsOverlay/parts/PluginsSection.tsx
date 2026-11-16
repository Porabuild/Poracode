import { Trans, useLingui } from "@lingui/react/macro";
import { isHomeProject } from "@/shared/homeScope";
import {
  isAlwaysEnabledPlugin,
  isBuiltInToolPlugin,
  resolveInstalledPluginState,
} from "@/shared/plugins/catalog";
import {
  setProjectPluginOverrideEverywhere,
  setProjectPluginOverridesEverywhere,
} from "@/renderer/actions/projectGroupActions";
import { Select } from "@/renderer/components/common";
import { PluginIcon } from "@/renderer/components/plugins/PluginIcon";
import { useLocalizedPluginCatalog } from "@/renderer/components/plugins/pluginCopy";
import { projectHostRunsOnThisMachine } from "@/renderer/state/hostLocality";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProject } from "@/renderer/state/useThread";
import { SettingsPage } from "@/renderer/views/SettingsOverlay/parts/SettingsForm";
import {
  PROJECT_SETTINGS_SCROLL_CLASS,
  ProjectScopeHeading,
  SharedValueDiff,
} from "./ProjectEnvironmentScope";

type PluginChoice = "inherit" | "on" | "off";

/**
 * Per-project switches for installed Agent Plugins. Built-in tool plugins keep
 * their per-thread composer toggles, and always-on plugins have no switch.
 */
export function PluginsSection(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useProject(props.projectId);
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const catalog = useLocalizedPluginCatalog(
    // The installed plugins are this machine's: only its own host's projects use them.
    projectHostRunsOnThisMachine(project) && project && !isHomeProject(project)
      ? project.location
      : undefined,
  );

  if (!project || isHomeProject(project)) return null;

  const description = t`Turn installed plugins on or off for threads in this project. A thread's own plugin choices still win; running threads apply changes on their next launch.`;
  if (!projectHostRunsOnThisMachine(project)) {
    return (
      <div className={PROJECT_SETTINGS_SCROLL_CLASS}>
        <SettingsPage title={t`Plugins`} description={description}>
          <p className="text-xs text-muted">
            <Trans>Manage this project's plugins from a Poracode client on its host.</Trans>
          </p>
        </SettingsPage>
      </div>
    );
  }

  const overrides = project.pluginOverrides ?? {};
  const rows = catalog.flatMap((entry) => {
    const state = resolveInstalledPluginState(entry.plugin, installedPlugins);
    if (!state || isAlwaysEnabledPlugin(entry.plugin) || isBuiltInToolPlugin(entry.plugin)) {
      return [];
    }
    return [{ entry, globalEnabled: state.enabled }];
  });

  return (
    <div className={PROJECT_SETTINGS_SCROLL_CLASS}>
      <SettingsPage title={t`Plugins`} description={description} bodyClassName="space-y-5">
        <div>
          <ProjectScopeHeading projectId={project.id} scope="shared" />
          <SharedValueDiff
            projectId={project.id}
            setting={t`Plugins`}
            read={(row) => row.pluginOverrides ?? {}}
            onApplyEverywhere={() => setProjectPluginOverridesEverywhere(project.id, overrides)}
          />
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">
            <Trans>
              No installed plugins can be switched per project. Install plugins from Settings, then
              choose them here.
            </Trans>
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
            {rows.map(({ entry, globalEnabled }) => {
              const name = entry.plugin.name;
              const choice: PluginChoice = Object.hasOwn(overrides, name)
                ? overrides[name]
                  ? "on"
                  : "off"
                : "inherit";
              return (
                <div
                  key={name}
                  className="settings-row flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-b-0"
                >
                  <PluginIcon
                    pluginId={name}
                    pluginRoot={entry.plugin.root}
                    className="size-8 shrink-0"
                  />
                  <div className="settings-row__text min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                    <p className="line-clamp-2 text-xs text-muted">{entry.description}</p>
                  </div>
                  <Select
                    aria-label={t`${entry.name} in this project`}
                    className="w-[180px] shrink-0"
                    options={[
                      {
                        id: "inherit",
                        label: globalEnabled ? t`Use global (on)` : t`Use global (off)`,
                      },
                      { id: "on", label: t`On` },
                      { id: "off", label: t`Off` },
                    ]}
                    value={choice}
                    onChange={(value) =>
                      setProjectPluginOverrideEverywhere(
                        project.id,
                        name,
                        value === "inherit" ? null : value === "on",
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </SettingsPage>
    </div>
  );
}
