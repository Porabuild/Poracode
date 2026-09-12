import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Box, Cable, ChevronRight, GitFork, Play, Search, Settings2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProjectSettingsSection } from "./types";

function MobileProjectSettingsRow(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const Icon = props.icon;

  return (
    <Button fullWidth variant="ghost" className="m-more-row" onPress={props.onPress}>
      <span className="m-more-row__icon">
        <Icon className="size-4" />
      </span>
      <span className="m-more-row__body">
        <strong>{props.label}</strong>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </Button>
  );
}

export function MobileProjectSettingsIndex(props: {
  readonly onOpenSection: (section: ProjectSettingsSection) => void;
}) {
  const { t } = useLingui();
  const sections: Array<{
    id: ProjectSettingsSection;
    icon: LucideIcon;
    label: string;
  }> = [
    { id: "general", icon: Settings2, label: t`General` },
    { id: "worktrees", icon: GitFork, label: t`Worktrees` },
    { id: "actions", icon: Play, label: t`Actions` },
    { id: "skills", icon: Box, label: t`Skills` },
    { id: "mcp", icon: Cable, label: t`MCP Servers` },
    { id: "search", icon: Search, label: t`Search` },
  ];

  return (
    <div className="m-page">
      <div className="m-settings-group">
        <div className="m-more-list">
          {sections.map((section) => (
            <MobileProjectSettingsRow
              key={section.id}
              icon={section.icon}
              label={section.label}
              onPress={() => props.onOpenSection(section.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
