import { msg } from "@lingui/core/macro";

export const MOBILE_SETTINGS_SECTION_LABELS = {
  general: msg`General`,
  appearance: msg`Appearance`,
  notifications: msg`Notifications`,
  terminal: msg`Terminal`,
  threads: msg`Threads`,
  git: msg`Git`,
  browser: msg`Browser`,
  usage: msg`Usage`,
  ai: msg`AI`,
  models: msg`Agents`,
  archived: msg`Archived Threads`,
} as const;

export function getSettingsSectionLabel(sectionId: string | null) {
  if (!sectionId) return null;
  return (
    MOBILE_SETTINGS_SECTION_LABELS[sectionId as keyof typeof MOBILE_SETTINGS_SECTION_LABELS] ?? null
  );
}
