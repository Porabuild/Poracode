import { Gauge, Globe, Settings } from "lucide-react";
import { MoreRow } from "../components";

export type MoreDestination = "usage" | "browser" | "settings";

/** The "More" tab: entry points that don't warrant their own tab-bar slot. */
export function MoreView(props: { readonly onOpen: (destination: MoreDestination) => void }) {
  return (
    <div className="m-page">
      <div className="m-more-list">
        <MoreRow
          icon={<Gauge className="size-4" />}
          label="Usage"
          hint="Provider limits and spend"
          onPress={() => props.onOpen("usage")}
        />
        <MoreRow
          icon={<Globe className="size-4" />}
          label="Browser"
          hint="The desktop's built-in browser"
          onPress={() => props.onOpen("browser")}
        />
        <MoreRow
          icon={<Settings className="size-4" />}
          label="Settings"
          hint="App preferences"
          onPress={() => props.onOpen("settings")}
        />
      </div>
    </div>
  );
}
