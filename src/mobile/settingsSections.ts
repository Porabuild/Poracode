import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Bell,
  CalendarClock,
  Bot,
  CircleUserRound,
  Gauge,
  GitFork,
  Palette,
  Settings2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

import type { MobileSettingsSectionId } from "./settingsSectionIds";

export { isDesktopSettingsSection, type MobileSettingsSectionId } from "./settingsSectionIds";

export const MOBILE_SETTINGS_SECTION_LABELS: Record<MobileSettingsSectionId, MessageDescriptor> = {
  profile: msg`Profile`,
  general: msg`General`,
  appearance: msg`Appearance`,
  notifications: msg`Notifications`,
  schedules: msg`Automations`,
  terminal: msg`Terminal`,
  git: msg`Git`,
  usage: msg`Usage`,
  ai: msg`AI`,
  models: msg`Agents`,
  archived: msg`Archived Threads`,
};

export interface MobileSettingsSection {
  readonly id: MobileSettingsSectionId;
  readonly label: MessageDescriptor;
  readonly hint: MessageDescriptor;
  readonly icon: LucideIcon;
}

/**
 * Split by where a setting lives. "This device" keys persist in this
 * browser's storage and shape the PWA itself (the desktop has its own copies);
 * they're listed flat on the More tab. "Desktop" sections edit the paired
 * desktop — AI helper choices sync over the remote API, thread management
 * round-trips through thread commands, and profile identity/usage stats are
 * read from and written to the desktop's local SQLite store — and live behind
 * the Desktop Settings subscreen. Sections that cannot function remotely
 * (search indexing, remote-access server, agent installs/auth, app updates)
 * are omitted entirely.
 */
export const DEVICE_SETTINGS_SECTIONS: readonly MobileSettingsSection[] = [
  {
    id: "general",
    label: MOBILE_SETTINGS_SECTION_LABELS.general,
    hint: msg`Thread defaults and home scope`,
    icon: Settings2,
  },
  {
    id: "appearance",
    label: MOBILE_SETTINGS_SECTION_LABELS.appearance,
    hint: msg`Theme and chat font size`,
    icon: Palette,
  },
  {
    id: "notifications",
    label: MOBILE_SETTINGS_SECTION_LABELS.notifications,
    hint: msg`Alerts when threads need you`,
    icon: Bell,
  },
  {
    id: "terminal",
    label: MOBILE_SETTINGS_SECTION_LABELS.terminal,
    hint: msg`Fonts and scrolling`,
    icon: TerminalSquare,
  },
  {
    id: "git",
    label: MOBILE_SETTINGS_SECTION_LABELS.git,
    hint: msg`Review presentation`,
    icon: GitFork,
  },
  {
    id: "usage",
    label: MOBILE_SETTINGS_SECTION_LABELS.usage,
    hint: msg`Tracking and display`,
    icon: Gauge,
  },
];

export const DESKTOP_SETTINGS_SECTIONS: readonly MobileSettingsSection[] = [
  {
    id: "profile",
    label: MOBILE_SETTINGS_SECTION_LABELS.profile,
    hint: msg`Identity and usage stats`,
    icon: CircleUserRound,
  },
  {
    id: "schedules",
    label: MOBILE_SETTINGS_SECTION_LABELS.schedules,
    hint: msg`Scheduled work and triage on this desktop`,
    icon: CalendarClock,
  },
  {
    id: "ai",
    label: MOBILE_SETTINGS_SECTION_LABELS.ai,
    hint: msg`Title, commit, and conflict models`,
    icon: Sparkles,
  },
  {
    id: "models",
    label: MOBILE_SETTINGS_SECTION_LABELS.models,
    hint: msg`Enabled agents, model visibility and order`,
    icon: Bot,
  },
  {
    id: "archived",
    label: MOBILE_SETTINGS_SECTION_LABELS.archived,
    hint: msg`Restore or delete`,
    icon: Archive,
  },
];

export function getSettingsSectionLabel(sectionId: string | null) {
  if (!sectionId) return null;
  return (
    MOBILE_SETTINGS_SECTION_LABELS[sectionId as keyof typeof MOBILE_SETTINGS_SECTION_LABELS] ?? null
  );
}
