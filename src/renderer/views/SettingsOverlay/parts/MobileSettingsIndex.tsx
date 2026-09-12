import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Archive,
  Bell,
  Bot,
  CalendarClock,
  ChevronRight,
  CircleUserRound,
  Gauge,
  GitFork,
  LifeBuoy,
  MonitorCog,
  Palette,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import type { SettingsSection } from "./types";

function MobileSettingsRow(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const Icon = props.icon;

  return (
    <Button
      fullWidth
      variant="ghost"
      className="m-more-row"
      {...(props.disabled !== undefined ? { isDisabled: props.disabled } : {})}
      onPress={props.onPress}
    >
      <span className="m-more-row__icon">
        <Icon className="size-4" />
      </span>
      <span className="m-more-row__body">
        <strong>{props.label}</strong>
        {props.hint ? <span>{props.hint}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </Button>
  );
}

export function MobileSettingsIndex(props: {
  readonly screen: "device" | "desktop";
  readonly hasDesktop: boolean;
  readonly showArchived: boolean;
  readonly onOpenDesktop: () => void;
  readonly onOpenSchedules: () => void;
  readonly onOpenSection: (section: SettingsSection) => void;
}) {
  const { t } = useLingui();

  if (props.screen === "desktop") {
    const rows: Array<{
      key: string;
      icon: LucideIcon;
      label: string;
      hint: string;
      onPress: () => void;
    }> = [
      {
        key: "profile",
        icon: CircleUserRound,
        label: t`Profile`,
        hint: t`Identity and usage stats`,
        onPress: () => props.onOpenSection("profile"),
      },
      {
        key: "usage",
        icon: Gauge,
        label: t`Provider Usage`,
        hint: t`Tracking and display`,
        onPress: () => props.onOpenSection("usage"),
      },
      {
        key: "schedules",
        icon: CalendarClock,
        label: t`Schedules`,
        hint: t`Scheduled tasks on this desktop`,
        onPress: props.onOpenSchedules,
      },
      {
        key: "ai",
        icon: Sparkles,
        label: t`AI Helpers`,
        hint: t`Title, commit, and conflict models`,
        onPress: () => props.onOpenSection("ai"),
      },
      {
        key: "agentsGeneral",
        icon: Bot,
        label: t`Agents`,
        hint: t`Enabled agents, model visibility and order`,
        onPress: () => props.onOpenSection("agentsGeneral"),
      },
    ];

    if (props.showArchived) {
      rows.push({
        key: "archived",
        icon: Archive,
        label: t`Archived Threads`,
        hint: t`Restore or delete`,
        onPress: () => props.onOpenSection("archived"),
      });
    }

    return (
      <div className="m-page">
        <div className="m-settings-group">
          <div className="m-settings-group__head">
            <span>{t`Edits the paired desktop and syncs back to it.`}</span>
          </div>
          <div className="m-more-list">
            {rows.map((row) => (
              <MobileSettingsRow
                key={row.key}
                icon={row.icon}
                label={row.label}
                hint={row.hint}
                onPress={row.onPress}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const sections: Array<{
    section: SettingsSection;
    icon: LucideIcon;
    label: string;
    hint: string;
  }> = [
    {
      section: "general",
      icon: Settings2,
      label: t`General`,
      hint: t`Thread defaults and home scope`,
    },
    {
      section: "appearance",
      icon: Palette,
      label: t`Appearance`,
      hint: t`Theme and chat font size`,
    },
    {
      section: "notifications",
      icon: Bell,
      label: t`Notifications`,
      hint: t`Alerts when threads need you`,
    },
    {
      section: "terminal",
      icon: TerminalSquare,
      label: t`Terminal`,
      hint: t`Fonts and scrolling`,
    },
    {
      section: "git",
      icon: GitFork,
      label: t`Git`,
      hint: t`Review presentation`,
    },
  ];

  return (
    <div className="m-page">
      <div className="m-settings-group">
        <div className="m-settings-group__head">
          <span>{t`Stored on this device; the desktop keeps its own values.`}</span>
        </div>
        <div className="m-more-list">
          {sections.map((section) => (
            <MobileSettingsRow
              key={section.section}
              icon={section.icon}
              label={section.label}
              hint={section.hint}
              onPress={() => props.onOpenSection(section.section)}
            />
          ))}
          <MobileSettingsRow
            icon={MonitorCog}
            label={t`Desktop Settings`}
            hint={t`Schedules, AI, agents, and archived threads on the paired desktop`}
            disabled={!props.hasDesktop}
            onPress={props.onOpenDesktop}
          />
          <MobileSettingsRow
            icon={ShieldCheck}
            label={t`Privacy Policy`}
            onPress={() => void readBridge().openExternal("https://poracode.com/privacy")}
          />
          <MobileSettingsRow
            icon={LifeBuoy}
            label={t`Support`}
            onPress={() => void readBridge().openExternal("https://poracode.com/support")}
          />
        </div>
      </div>
    </div>
  );
}
