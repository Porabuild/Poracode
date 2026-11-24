import { useLingui } from "@lingui/react/macro";
import { isRemoteSession } from "@/renderer/bridge";
import { isHomeProject } from "@/shared/homeScope";
import { SkillsManager } from "@/renderer/components/skills/SkillsManager";
import { useAppStore } from "@/renderer/state/appStore";
import { useReachableProjectFilter } from "@/renderer/state/remoteServers/reachability";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useSettingsHostServer } from "@/renderer/state/settingsHostStore";
import { SettingsPage } from "./SettingsForm";

export function SkillsSettings(props: { connectionKey?: string; hostPlatform?: string }) {
  const { t } = useLingui();
  const isReachable = useReachableProjectFilter();
  const settingsHost = useSettingsHostServer();
  const hostKey =
    props.connectionKey ??
    (isRemoteSession() && settingsHost ? remoteConnectionKey(settingsHost) : undefined);
  const projects = useAppStore((state) => state.projects)
    .filter(
      (project) =>
        !isHomeProject(project) &&
        isReachable(project) &&
        (hostKey ? project.remoteServerId === hostKey : !project.remoteServerId),
    )
    .map(({ id, name, location, icon }) => ({ id, name, location, ...(icon ? { icon } : {}) }));

  return (
    <SettingsPage
      title={t`Skills`}
      description={t`Manage shared skills across global and project scopes.`}
      bodyClassName="space-y-5"
    >
      <div data-settings-anchor="skills.manage">
        <SkillsManager
          projects={projects}
          {...(props.connectionKey ? { connectionKey: props.connectionKey } : {})}
          {...(props.hostPlatform ? { hostPlatform: props.hostPlatform } : {})}
        />
      </div>
    </SettingsPage>
  );
}
