import { AppWindow, GitPullRequest, Globe, Mail, Monitor, Network, Puzzle } from "lucide-react";

export function PluginIcon(props: { pluginId: string; className?: string }) {
  const className = props.className ?? "size-5";
  switch (props.pluginId) {
    case "browser-tools":
      return <Globe className={className} />;
    case "chrome-tools":
      return <AppWindow className={className} />;
    case "computer-use":
      return <Monitor className={className} />;
    case "subagent-delegation":
      return <Network className={className} />;
    case "github":
      return <GitPullRequest className={className} />;
    case "outlook":
      return <Mail className={className} />;
    default:
      return <Puzzle className={className} />;
  }
}
