import { Trans } from "@lingui/react/macro";
import { FolderGit2, Globe, Settings } from "lucide-react";
import { MoreRow } from "../components";

export type MoreDestination = "browser" | "projects" | "settings";

/** The "More" tab: entry points that don't warrant their own tab-bar slot. */
export function MoreView(props: { readonly onOpen: (destination: MoreDestination) => void }) {
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
        <MoreRow
          icon={<Settings className="size-4" />}
          label={<Trans>Settings</Trans>}
          hint={<Trans>App preferences</Trans>}
          onPress={() => props.onOpen("settings")}
        />
      </div>
    </div>
  );
}
